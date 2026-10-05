// Each widget's accessibility test (src/widgets/<widget>/a11y.ts), in
// Chromium: its cases saved to the run's CMS and published; on the page the
// CMS serves, each case exposes what its test says (role, name, level, how
// many, and for a form's field whether the accessibility tree says it is
// required), a hidden one exposes nothing, and axe finds nothing serious or
// critical in the widget; on the editor's canvas, each case that is not
// hidden exposes the same, and the same blocks pass axe too.
import type { Locator, Page } from "@playwright/test";
import { WIDGET_A11Y } from "../src/widgets/a11y-all.ts";
import type { A11yCase } from "../src/widgets/a11y.ts";
import { axProperties } from "./helpers/ax.ts";
import { axe } from "./helpers/axe.ts";
import { cms, column, expect, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// What the case says it exposes, found inside the block's root.
async function exposes(page: Page, root: Locator, c: A11yCase, where: string): Promise<void> {
  for (const exposed of c.exposes) {
    const found = root.getByRole(exposed.role, {
      ...(exposed.name === undefined ? {} : { name: exposed.name, exact: true }),
      ...(exposed.level === undefined ? {} : { level: exposed.level }),
    });
    const what = `${where}, ${c.name}: ${exposed.role}${exposed.name ? ` "${exposed.name}"` : ""}`;
    await expect(found, what).toHaveCount(exposed.count ?? 1);
    if (exposed.required === undefined) continue;
    for (const one of await found.all()) expect((await axProperties(page, one)).get("required") ?? false, `${what} is required`).toBe(exposed.required);
  }
}

for (const widgetTest of WIDGET_A11Y) {
  test(`the ${widgetTest.type}'s accessibility test: ${widgetTest.cases.map((c) => c.name).join("; ")}`, { tag: "@a11y" }, async ({ page, request }) => {
    const id = (index: number) => `${widgetTest.type}-${index}`;
    const blocks = widgetTest.cases.map((c, index) => widget(id(index), widgetTest.type, c.props));
    const made = await makePage(request, `The ${widgetTest.type}`, [section("s", "Cases", [column("c", blocks)])]);
    expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);

    // The published page, as a visitor's browser has it.
    await page.goto(`${cms()}/${made.slug}`);
    for (const [index, c] of widgetTest.cases.entries()) {
      const root = page.locator(`[data-block-id="${id(index)}"]`);
      await expect(root, c.name).toHaveCount(1);
      if (c.hidden) {
        await expect(root, c.name).toHaveAttribute("aria-hidden", "true");
        // Nothing of it in the accessibility tree.
        expect((await root.ariaSnapshot()).trim(), c.name).toBe("");
      }
      await exposes(page, root, c, "the published page");
    }
    const published = await axe(page, { include: `[data-block-type="${widgetTest.type}"]` });
    // axe looked: at least one of its rules applied and passed (a hidden
    // widget has nothing a rule applies to).
    if (!widgetTest.cases.every((c) => c.hidden)) expect(published.passes, "axe ran its rules on the published widget").toBeGreaterThan(0);
    expect(published.serious, "the published page").toEqual([]);

    // The editor's canvas, where a hidden block stays drawn to be edited.
    await open(page, made.id);
    for (const [index, c] of widgetTest.cases.entries()) {
      if (!c.hidden) await exposes(page, page.locator(`.canvas [data-block-id="${id(index)}"]`), c, "the canvas");
    }
    const canvas = await axe(page, { include: `.canvas [data-block-type="${widgetTest.type}"]` });
    if (!widgetTest.cases.every((c) => c.hidden)) expect(canvas.passes, "axe ran its rules on the canvas").toBeGreaterThan(0);
    expect(canvas.serious, "the editor's canvas").toEqual([]);
  });
}
