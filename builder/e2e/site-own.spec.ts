// What a site adds of its own, in Chromium against the run's CMS: a class
// and an anchor given in a block's Advanced group, which the canvas carries
// with its prefix, so the editor's own .btn never reaches a block named btn,
// and the published page carries as written; the site's custom CSS, which
// styles the canvas and the published page alike and never the editor's own
// keys on the canvas; and Sticky header, which keeps the published header
// at the top of the window while the page scrolls under it. Nothing
// serious or critical for axe with the Custom CSS panel open. The tests of
// a run share one CMS, so the site style and the header are put back.
import type { APIRequestContext } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

type Style = { palette: Record<string, string>; typeScale: string; customCss: string };
async function siteStyle(request: APIRequestContext): Promise<Style> {
  return (await (await request.get(`${cms()}/api/site-style`)).json()) as Style;
}
async function publish(request: APIRequestContext, id: number): Promise<void> {
  const answer = await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} });
  expect(answer.status(), await answer.text()).toBe(200);
}

test("a class and an anchor from Advanced: the canvas carries the class with its prefix, untouched by the editor's .btn; the published page as written", async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Own classes", [section("s", "Story", [column("c", [heading("h", "Prices")])])]);
  await open(page, id);
  await block(page, "h").focus();
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Block" }).click();
  const drawn = () => block(page, "h").evaluate((element) => ({ display: getComputedStyle(element).display, height: getComputedStyle(element).height }));
  const before = await drawn();
  const group = sidebar.getByRole("button", { name: "Advanced" });
  if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
  const classes = sidebar.getByLabel("CSS classes");
  await classes.fill(".btn, lede");
  await classes.press("Enter");
  await expect(block(page, "h")).toHaveClass(/(^| )own-btn own-lede$/);
  // The editor's .btn draws its keys inline and 32 high: none of it here.
  expect(await drawn()).toEqual(before);
  const anchor = sidebar.getByLabel("Anchor id");
  await anchor.fill("#prices");
  await anchor.press("Enter");
  await expect(block(page, "h")).toHaveAttribute("id", "prices");
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.props).toMatchObject({ className: "btn lede", anchor: "prices" });

  await publish(request, id);
  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  await expect(visitor.locator('[data-block-id="h"]')).toHaveClass(/(^| )btn lede$/);
  await expect(visitor.locator('[data-block-id="h"]')).toHaveAttribute("id", "prices");
  await visitor.close();
});

test("the site's custom CSS styles the canvas and the published page alike, and never the editor's keys on the canvas", { tag: "@a11y" }, async ({ page, request }) => {
  const before = await siteStyle(request);
  try {
    const { id, slug } = await makePage(request, "Own CSS", [section("s", "Story", [column("c", [{ ...heading("h", "Prices"), props: { level: 2, text: "Prices", className: "lede" } }])])]);
    await publish(request, id);
    await open(page, id);
    await page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name: "Custom CSS" }).click();
    const panel = page.getByRole("complementary", { name: "Custom CSS" });
    await panel.getByLabel("Rules").fill(".lede { color: rgb(1, 2, 3); }\nbutton { background-color: rgb(255, 0, 0); }");
    await expect(panel.getByRole("status")).toHaveText("Saved for every page");
    expect((await siteStyle(request)).customCss).toContain(".lede");
    expect((await axe(page)).serious).toEqual([]);
    await expect(block(page, "h")).toHaveCSS("color", "rgb(1, 2, 3)");
    // The selected block's keys, drawn inside the page: the rule for
    // button stops at them.
    await block(page, "h").focus();
    const key = page.locator(".canvas .clamp button").first();
    await expect(key).toBeVisible();
    expect(await key.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 0, 0)");

    // Rules for what is outside the site, kept: they reach nothing there.
    const field = panel.getByLabel("Rules");
    await field.fill(".lede { color: rgb(1, 2, 3); }\nbody, .topbar, .sidebar, [class~=\"chrome\"] { display: none; }");
    await field.blur();
    await expect.poll(async () => (await siteStyle(request)).customCss).toContain(".topbar");
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(panel).toBeVisible();
    // A stylesheet that would close the site's scope early, its address
    // named with an escape: refused, said, and kept nowhere.
    await field.fill("a { background: u\\72l({); } } [class~=\"chrome\"] { display: none; }");
    await field.blur();
    await expect(panel.getByText(/^Line 1: A url\( holds a brace/)).toBeVisible();
    expect((await siteStyle(request)).customCss).not.toContain("u\\72l");
    await expect(page.locator(".topbar")).toBeVisible();

    const visitor = await page.context().newPage();
    await visitor.goto(`${cms()}/${slug}`);
    await expect(visitor.locator('link[rel=stylesheet][href^="/custom.css?v="]')).toHaveCount(1);
    await expect(visitor.locator('[data-block-id="h"]')).toHaveCSS("color", "rgb(1, 2, 3)");
    await expect(visitor.locator("[style]")).toHaveCount(0);
    await visitor.close();
  } finally {
    const put = await request.put(`${cms()}/api/site-style`, { data: { palette: before.palette, typeScale: before.typeScale, customCss: before.customCss } });
    expect(put.status()).toBe(200);
  }
});

test("Sticky header, published, keeps the header at the top of the window while the page scrolls under it", async ({ page, request }) => {
  const listed = (await (await request.get(`${cms()}/api/pages`)).json()) as { parts: Array<{ id: number; kind: string; published: { versionNumber: number } | null }> };
  const header = listed.parts.find((part) => part.kind === "header")!;
  const draft = (await draftOf(request, header.id)).document;
  const live = header.published
    ? ((await (await request.get(`${cms()}/api/pages/${header.id}/versions/${header.published.versionNumber}`)).json()) as { document: unknown }).document
    : draft;
  const saveDraft = async (document: unknown, saveId: string) => {
    const { revision } = await draftOf(request, header.id);
    const put = await request.put(`${cms()}/api/pages/${header.id}/draft`, { data: { revision, saveId, document } });
    expect(put.status(), await put.text()).toBe(200);
  };
  try {
    // Six bands, the second heading with an anchor a link may name, with
    // the page enough below it to scroll it to the top.
    const bands = Array.from({ length: 6 }, (_, k) => section(`s${k}`, `Band ${k}`, [column(`c${k}`, [k === 1 ? { ...heading(`h${k}`, `Band ${k}`), props: { level: 2, text: `Band ${k}`, anchor: "band-one" } } : heading(`h${k}`, `Band ${k}`)])]));
    const { id, slug } = await makePage(request, "Long page", bands);
    await publish(request, id);
    await open(page, header.id);
    // The switch from the keyboard, as its group's other switches are.
    const sticky = page.getByRole("switch", { name: "Sticky header" });
    await sticky.focus();
    await page.keyboard.press("Space");
    await expect(sticky).toBeChecked();
    await expect.poll(async () => (await draftOf(request, header.id)).document).toMatchObject({ sticky: true });
    await publish(request, header.id);

    const visitor = await page.context().newPage();
    await visitor.setViewportSize({ width: 1024, height: 600 });
    await visitor.goto(`${cms()}/${slug}`);
    await visitor.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => visitor.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect.poll(() => visitor.locator("header.sw-header").evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);

    // A taller header: a second section, its first column of two blocks,
    // its two columns one under the other on a tablet and a phone. A link
    // to an anchor of the page stops the block below it, on a desktop and
    // on a phone.
    const kept = (await draftOf(request, header.id)).document as { sections: unknown[] };
    await saveDraft({ ...kept, sections: [...kept.sections, section("tall", "Tides", [column("tall-1", [heading("tall-a", "High water 06:12"), widget("tall-c", "button", { label: "Tide table", href: "/tides" })]), column("tall-2", [heading("tall-b", "Low water 12:30")])])] }, "tall-header");
    await publish(request, header.id);
    for (const size of [{ width: 1024, height: 600 }, { width: 390, height: 844 }]) {
      await visitor.setViewportSize(size);
      // A page loaded anew: the same address with another anchor would only
      // scroll the page already there.
      await visitor.goto("about:blank");
      await visitor.goto(`${cms()}/${slug}#band-one`);
      await expect(visitor.locator("header.sw-header")).toHaveAttribute("data-sticky", "3 4 4");
      await expect.poll(() => visitor.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const { headerBottom, targetTop } = await visitor.evaluate(() => ({
        headerBottom: document.querySelector("header.sw-header")!.getBoundingClientRect().bottom,
        targetTop: document.getElementById("band-one")!.getBoundingClientRect().top,
      }));
      expect(targetTop, `${size.width} wide`).toBeGreaterThanOrEqual(headerBottom);
      expect(targetTop - headerBottom, `${size.width} wide`).toBeLessThan(80);
    }

    // The header's row with space of its own above and below it (64 on
    // every device, over the header's own 20, 12 on a phone), and its first
    // column with 48 inside it: the block an anchor names still stops below
    // it.
    const spaced = kept.sections.map((each, index) => {
      if (index > 0) return each;
      const own = each as { style?: { base?: Record<string, unknown> }; children?: unknown[] };
      const columns = (own.children ?? []).map((column, at) => {
        if (at > 0) return column;
        const first = column as { style?: { base?: Record<string, unknown> } };
        return { ...first, style: { ...first.style, base: { ...first.style?.base, spaceInside: "xxl" } } };
      });
      return { ...own, children: columns, style: { ...own.style, base: { ...own.style?.base, spaceAbove: "section-s", spaceBelow: "section-s" } } };
    });
    await saveDraft({ ...kept, sections: spaced }, "spaced-header");
    await publish(request, header.id);
    for (const size of [{ width: 1024, height: 600 }, { width: 390, height: 844 }]) {
      await visitor.setViewportSize(size);
      await visitor.goto("about:blank");
      await visitor.goto(`${cms()}/${slug}#band-one`);
      await expect.poll(() => visitor.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const { headerBottom, targetTop } = await visitor.evaluate(() => ({
        headerBottom: document.querySelector("header.sw-header")!.getBoundingClientRect().bottom,
        targetTop: document.getElementById("band-one")!.getBoundingClientRect().top,
      }));
      expect(targetTop, `spaced, ${size.width} wide`).toBeGreaterThanOrEqual(headerBottom);
      expect(targetTop - headerBottom, `spaced, ${size.width} wide`).toBeLessThan(80);
    }

    // A form under the sticky header: a link to a field (the list above a
    // refused form) leaves room for the field's label and message below
    // the header, as without one (site.css, .sw-field's 8rem).
    const formed = await makePage(request, "Form under a sticky header", [section("fs", "Join", [column("fc", [{ ...heading("fh", "Join"), props: { level: 2, text: "Join", anchor: "join" } }, widget("ff", "form", { items: [{ name: "name", kind: "text", label: "Name", required: true, maxLength: 100 }, { name: "distance", kind: "checkbox", label: "I can swim 200 meters", required: true }], submitLabel: "Send", confirmation: "Thank you." })])])]);
    await publish(request, formed.id);
    for (const size of [{ width: 1024, height: 600 }, { width: 390, height: 844 }]) {
      await visitor.setViewportSize(size);
      await visitor.goto(`${cms()}/${formed.slug}`);
      const margins = await visitor.evaluate(() => {
        const top = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).scrollMarginTop);
        return { anchor: top("#join"), field: top(".sw-field input"), box: top(".sw-check input"), rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(margins.anchor, `${size.width} wide`).toBeGreaterThan(80);
      expect([margins.field, margins.box], `${size.width} wide`).toEqual([margins.anchor + 8 * margins.rem, margins.anchor + margins.rem]);
    }

    // A heading of the header at Display, on one line: the block an anchor
    // names stops below it too.
    await saveDraft({ ...kept, sections: [...kept.sections, section("big", "Big", [column("big-1", [{ ...heading("big-a", "Tides"), style: { base: { textSize: "display" } } }])])] }, "display-header");
    await publish(request, header.id);
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await visitor.setViewportSize(size);
      await visitor.goto("about:blank");
      await visitor.goto(`${cms()}/${slug}#band-one`);
      await expect.poll(() => visitor.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const { headerBottom, targetTop } = await visitor.evaluate(() => ({
        headerBottom: document.querySelector("header.sw-header")!.getBoundingClientRect().bottom,
        targetTop: document.getElementById("band-one")!.getBoundingClientRect().top,
      }));
      expect(targetTop, `display, ${size.width} wide`).toBeGreaterThanOrEqual(headerBottom);
    }
    await visitor.close();
  } finally {
    // What every page drew, published again, then the draft as it was.
    await saveDraft(live, "put-back-live-header");
    await publish(request, header.id);
    await saveDraft(draft, "put-back-header");
  }
});
