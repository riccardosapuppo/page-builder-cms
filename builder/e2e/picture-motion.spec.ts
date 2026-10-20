// A section's picture and a block's motion, in Chromium (site.css): the
// picture chosen in the section's Background group from the library, with
// no alt text asked, under a dark veil at once, then set strong and kept at
// its top, and drawn so on the published page, behind the words, covering
// the section; a block's motion played on the published page and in Preview
// as the page scrolls it into view, by the scroll alone, and whole by the
// end of the page, never on the canvas, and never for a visitor who asked
// for less motion, nothing hidden then; a card's and a button's lift under
// the pointer.
import type { Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { publishPage } from "./helpers/collections.ts";
import { png } from "./helpers/images.ts";
import { cms, column, expect, heading, makePage, open, openGroup, saved, section, test, unique, widget } from "./helpers/site.ts";

const words = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const styled = <T extends object>(made: T, style: Record<string, unknown>): T => ({ ...made, style });

test("a section's picture is chosen in its Background group, no alt text asked, a dark veil with it; set strong and kept at its top, the published page draws it behind the words, covering the section", async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Gym picture", [
    section("hero", "Hero", [column("hero-1", [widget("hero-h", "heading", { level: 1, text: "Train stronger" }), widget("hero-t", "text", { doc: words("Strength, cardio and coaching under one roof.") })])]),
    section("next", "Next", [column("next-1", [heading("next-h", "What we offer")])]),
  ]);
  await open(page, id);
  // The section, by its edge.
  await block(page, "hero").click({ position: { x: 8, y: 8 } });
  await openGroup(page, "Background");
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("button", { name: "Choose a picture" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const name = `${unique("floor")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(160, 90, (_x, y) => (y < 30 ? [250, 250, 250] : [60, 70, 80])) });
  await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await expect(library.getByText("Behind a section the picture is decorative: it needs no alt text there.", { exact: false })).toBeVisible();
  await library.getByRole("button", { name: "Use picture" }).click();
  await expect(library).toHaveCount(0);
  const hero = block(page, "hero");
  await expect(hero.locator(":scope > picture.sw-picture > img")).toHaveAttribute("alt", "");
  await expect(hero).toHaveAttribute("data-veil", "dark");
  await sidebar.getByRole("radiogroup", { name: "Strength" }).getByRole("radio", { name: "Strong" }).click();
  await sidebar.getByRole("radiogroup", { name: "Focus" }).getByRole("radio", { name: "Top", exact: true }).click();
  await expect(hero).toHaveAttribute("data-focus", "top");
  // Black at .8 over a white picture, #333333: white words read on it.
  await expect(sidebar.getByRole("list", { name: "Veil: contrast" })).toHaveText("Words on the picture, where it is lightest: 12.6 to 1, easy to read");
  // The group, its picture, veil, strength, focus and their check, passes axe.
  expect((await axe(page, { include: ".sidebar" })).serious).toEqual([]);
  await saved(page);
  await publishPage(request, id);

  await page.goto(`${cms()}/${slug}`);
  const published = page.locator("main section[data-block-id=hero]");
  const img = published.locator(":scope > picture.sw-picture > img");
  await expect(img).toHaveAttribute("loading", "eager");
  await expect(img).toHaveJSProperty("complete", true);
  expect(await img.evaluate((picture: HTMLImageElement) => picture.naturalWidth)).toBe(160);
  await expect(page.locator("main section[data-block-id=next] img")).toHaveCount(0);
  const drawn = await published.evaluate((sectionElement) => {
    const picture = sectionElement.querySelector(".sw-picture")!;
    const veil = getComputedStyle(picture, "::after");
    const image = picture.querySelector("img")!;
    const box = sectionElement.getBoundingClientRect();
    const covers = picture.getBoundingClientRect();
    const title = sectionElement.querySelector("h1")!.getBoundingClientRect();
    const onTop = document.elementFromPoint(title.left + 4, title.top + title.height / 2)?.closest("h1") !== null;
    return {
      veil: veil.backgroundColor, opacity: veil.opacity, focus: getComputedStyle(image).objectPosition, fit: getComputedStyle(image).objectFit,
      covers: [covers.top - box.top, covers.left - box.left, covers.width - box.width, covers.height - box.height], words: getComputedStyle(sectionElement.querySelector("h1")!).color, onTop,
    };
  });
  expect(drawn).toEqual({ veil: "rgb(0, 0, 0)", opacity: "0.8", focus: "50% 0%", fit: "cover", covers: [0, 0, 0, 0], words: "rgb(255, 255, 255)", onTop: true });
});

// A page tall enough to scroll: an opening, six bands of space, then the
// band that comes into view, its heading fading in on a desktop and a
// tablet and simply there on a phone.
const tallPage = () => [
  section("open", "Open", [column("open-1", [widget("open-h", "heading", { level: 1, text: "A gym" })])]),
  ...[1, 2, 3, 4, 5, 6].map((n) => styled(section(`band-${n}`, `Band ${n}`, [column(`band-${n}-1`, [heading(`band-${n}-h`, `Band ${n}`)])]), { base: { spaceAbove: "section-l", spaceBelow: "section-l" } })),
  styled(section("last", "Last", [column("last-1", [styled(heading("last-h", "Come along"), { base: { motion: "fade" }, phone: { motion: "none" } })])]), { base: { motion: "rise" } }),
];

// How a block of the page draws now: its animation, and the two values it
// moves, a transform that moves nothing said as none (an animation ended
// holds its last frame, an identity matrix).
const motionOf = (page: Page, id: string, where = "main") => page.locator(`${where} [data-block-id="${id}"]`).first().evaluate((element) => {
  const style = getComputedStyle(element);
  return { name: style.animationName, opacity: style.opacity, transform: style.transform === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : style.transform };
});
const toTheEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

test("a block's motion plays on the published page and in Preview as the page scrolls it into view, by the scroll alone, whole at the end; nothing moves on the canvas", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { id, slug } = await makePage(request, "Gym motion", tallPage());
  await publishPage(request, id);
  await page.goto(`${cms()}/${slug}`);
  // Below the window: still to come, at its first frame.
  expect(await motionOf(page, "last")).toEqual({ name: "sw-rise", opacity: "0", transform: "matrix(1, 0, 0, 1, 0, 24)" });
  expect(await motionOf(page, "last-h")).toMatchObject({ name: "sw-fade", opacity: "0" });
  // The opening, in view as the page opens, never moves.
  expect(await motionOf(page, "open")).toEqual({ name: "none", opacity: "1", transform: "none" });
  await toTheEnd(page);
  await expect.poll(() => motionOf(page, "last")).toEqual({ name: "sw-rise", opacity: "1", transform: "none" });
  await expect.poll(() => motionOf(page, "last-h")).toEqual({ name: "sw-fade", opacity: "1", transform: "none" });

  // A phone's own: the heading is simply there.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${cms()}/${slug}`);
  expect(await motionOf(page, "last-h")).toMatchObject({ name: "none" });

  // Preview plays it as the page does.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${cms()}/preview/${id}`);
  expect(await motionOf(page, "last")).toMatchObject({ name: "sw-rise", opacity: "0" });

  // The canvas stands still: a block stays where it is put.
  await open(page, id);
  expect(await motionOf(page, "last", ".canvas")).toEqual({ name: "none", opacity: "1", transform: "none" });
  expect(await motionOf(page, "last-h", ".canvas")).toEqual({ name: "none", opacity: "1", transform: "none" });
});

test("for a visitor who asked for less motion nothing moves and nothing is hidden, wherever the block is", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { id, slug } = await makePage(request, "Gym still", tallPage());
  await publishPage(request, id);
  await page.goto(`${cms()}/${slug}`);
  expect(await motionOf(page, "last")).toEqual({ name: "none", opacity: "1", transform: "none" });
  expect(await motionOf(page, "last-h")).toEqual({ name: "none", opacity: "1", transform: "none" });
});

test("a card and a button lift a little under the pointer, and not for a visitor who asked for less motion", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const plan = { name: "Trial", price: "Free", period: "", text: "One session.", features: ["A coach"], button: { label: "Book", href: "#" }, featured: false, badge: "" };
  const { id, slug } = await makePage(request, "Gym lift", [
    section("cards", "Cards", [
      column("cards-1", [widget("plans", "pricing", { plans: [plan] })]),
      column("cards-2", [widget("point", "iconbox", { icon: "dumbbell", title: "Strength", text: "Free weights." }), widget("go", "button", { label: "Join", href: "#cards" })]),
    ]),
  ]);
  await publishPage(request, id);
  await page.goto(`${cms()}/${slug}`);
  const lift = (selector: string) => page.locator(`main ${selector}`).first().evaluate((element) => getComputedStyle(element).translate);
  await page.locator("main .sw-plan").hover();
  await expect.poll(() => lift(".sw-plan")).toBe("0px -3px");
  await page.locator("main .sw-iconbox").hover();
  await expect.poll(() => lift(".sw-iconbox")).toBe("0px -2px");
  await expect.poll(() => lift(".sw-plan")).toBe("none");
  await page.locator("main .w-button .sw-btn").hover();
  await expect.poll(() => lift(".w-button .sw-btn")).toBe("0px -2px");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("main .sw-plan").hover();
  await page.waitForTimeout(250);
  expect(await lift(".sw-plan")).toBe("none");
});
