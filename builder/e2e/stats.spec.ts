// The stats block in Chromium, in the editor and on the published page:
// its tile in Insert's Content group and in the "+"'s picker, each adding
// three figures that read as they come; a figure written in the block's
// Figures group, drawn on the canvas and kept by the CMS; and published,
// plain HTML with no script, one description list, each value above the
// label that says what it counts, the value in the theme's primary and the
// label muted, four figures to a row on a desktop and two on a phone.
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, drawer, expect, heading, makePage, open, openGroup, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const FIGURES = [
  { value: "12", label: "Years on the water" },
  { value: "300+", label: "Swimmers each season" },
  { value: "98%", label: "Who would come back" },
];

test("the stats' tile is in Insert's Content group and in the picker, and each adds three figures", async ({ page, request }) => {
  const { id } = await makePage(request, "Stats tiles", [section("s", "Club", [column("c1", [heading("h", "The club in numbers")])])]);
  await open(page, id);
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Content" }).getByRole("button", { name: "Stats", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Close Insert" }).click();

  await block(page, "h").click();
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await picker.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await saved(page);

  const widgets = (await draftOf(request, id)).document.sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "stats", "stats"]);
  for (const stats of widgets.slice(1)) expect(stats.props).toEqual({ items: FIGURES });
});

test("a figure written in the Figures group is drawn on the canvas and kept by the CMS", async ({ page, request }) => {
  const { id } = await makePage(request, "Stats figures", [section("s", "Club", [column("c", [widget("st", "stats", { items: FIGURES })])])]);
  await open(page, id);
  await block(page, "st").click();
  await openGroup(page, "Figures");
  const settings = page.getByRole("complementary", { name: "Settings" });
  const value = settings.getByRole("textbox", { name: "Value 2", exact: true });
  await value.fill("350+");
  await value.blur();
  const label = settings.getByRole("textbox", { name: "Label 2", exact: true });
  await label.fill("Swimmers last season");
  await label.blur();
  await expect(block(page, "st").locator("dd")).toHaveText(["12", "350+", "98%"]);
  await expect(block(page, "st").locator("dt")).toHaveText(["Years on the water", "Swimmers last season", "Who would come back"]);
  await saved(page);

  const stats = (await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!;
  expect(stats.props).toEqual({ items: [FIGURES[0], { value: "350+", label: "Swimmers last season" }, FIGURES[2]] });
  await drawer(page, "History");
  await expect(page.getByRole("complementary", { name: "History" }).getByRole("listitem").filter({ hasText: "Changed figure 2 in Stats in Club" }).first()).toBeVisible();
});

test("published, the figures are a description list the CMS serves with no script, each value above its label, four to a row on a desktop and two on a phone", async ({ page, request }) => {
  const items = [...FIGURES, { value: "1,200 m", label: "From the slipway to the buoy line" }, { value: "6", label: "Coaches" }];
  const made = await makePage(request, "Stats served", [section("s", "Club", [column("c", [widget("club-stats", "stats", { items })])])]);
  expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);
  await page.goto(`${cms()}/${made.slug}`);
  await expect(page.locator("script")).toHaveCount(0);

  const root = page.locator('[data-block-id="club-stats"]');
  // A term, the label, then its definition, the value, for each figure.
  await expect(root.locator("dl > div > dt")).toHaveText(items.map((item) => item.label));
  await expect(root.locator("dl > div > dd")).toHaveText(items.map((item) => item.value));
  const figures = await root.locator("dl > div").evaluateAll((divs) => divs.map((div) => {
    const value = div.querySelector("dd")!.getBoundingClientRect();
    const label = div.querySelector("dt")!.getBoundingClientRect();
    return { top: Math.round(div.getBoundingClientRect().top), valueBottom: value.bottom, labelTop: label.top, valueSize: parseFloat(getComputedStyle(div.querySelector("dd")!).fontSize), labelSize: parseFloat(getComputedStyle(div.querySelector("dt")!).fontSize) };
  }));
  for (const figure of figures) {
    expect(figure.valueBottom).toBeLessThanOrEqual(figure.labelTop + 0.5);
    expect(figure.valueSize).toBeGreaterThan(figure.labelSize);
  }
  // Four to a row, the fifth below them.
  const rows = (list: typeof figures) => list.map((figure) => figure.top - list[0]!.top);
  expect(rows(figures).slice(0, 4)).toEqual([0, 0, 0, 0]);
  expect(rows(figures)[4]).toBeGreaterThan(0);

  // The value in the theme's primary, the label in its muted text.
  const colors = await root.evaluate((element) => {
    const probe = (color: string) => {
      const span = element.appendChild(document.createElement("span"));
      span.style.color = color;
      const computed = getComputedStyle(span).color;
      span.remove();
      return computed;
    };
    return {
      value: getComputedStyle(element.querySelector("dd")!).color,
      label: getComputedStyle(element.querySelector("dt")!).color,
      primary: probe("var(--sw-primary)"),
      muted: probe("var(--sw-muted)"),
    };
  });
  expect(colors.value).toBe(colors.primary);
  expect(colors.label).toBe(colors.muted);

  // On a phone, two to a row.
  await page.setViewportSize({ width: 390, height: 844 });
  const tops = await root.locator("dl > div").evaluateAll((divs) => divs.map((div) => Math.round(div.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[1]);
  expect(tops[2]).toBe(tops[3]);
  expect(tops[2]).toBeGreaterThan(tops[1]!);
  expect(tops[4]).toBeGreaterThan(tops[3]!);
});
