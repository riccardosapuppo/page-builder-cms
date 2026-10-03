// Each widget's accessibility test (src/widgets/<widget>/a11y.ts), in
// Chromium: its cases saved to the run's CMS and published; on the page the
// CMS serves, each case exposes what its test says (role, name, level, how
// many), a hidden one exposes nothing, and axe finds nothing serious or
// critical in the widget; on the editor's canvas, the same blocks pass axe
// too.
import { WIDGET_A11Y } from "../src/widgets/a11y-all.ts";
import { axe } from "./helpers/axe.ts";
import { cms, column, expect, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

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
      for (const exposed of c.exposes) {
        const found = root.getByRole(exposed.role, {
          ...(exposed.name === undefined ? {} : { name: exposed.name, exact: true }),
          ...(exposed.level === undefined ? {} : { level: exposed.level }),
        });
        await expect(found, `${c.name}: ${exposed.role}${exposed.name ? ` "${exposed.name}"` : ""}`).toHaveCount(exposed.count ?? 1);
      }
    }
    const published = await axe(page, { include: `[data-block-type="${widgetTest.type}"]` });
    // axe looked: at least one of its rules applied and passed (a hidden
    // widget has nothing a rule applies to).
    if (!widgetTest.cases.every((c) => c.hidden)) expect(published.passes, "axe ran its rules on the published widget").toBeGreaterThan(0);
    expect(published.serious, "the published page").toEqual([]);

    // The editor's canvas.
    await open(page, made.id);
    const canvas = await axe(page, { include: `.canvas [data-block-type="${widgetTest.type}"]` });
    if (!widgetTest.cases.every((c) => c.hidden)) expect(canvas.passes, "axe ran its rules on the canvas").toBeGreaterThan(0);
    expect(canvas.serious, "the editor's canvas").toEqual([]);
  });
}
