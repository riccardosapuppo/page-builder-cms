// The editor's marks on the canvas (the hover outline, the selection's
// frame and bar) are drawn inside each block's root, after the block's own
// content. They must leave the page's layout as the published page draws
// it: a stylesheet rule that counts a block's children (:last-child) would
// count the marks too. The canvas's other parity checks draw the page with
// nothing hovered or selected, so they cannot see it; this one measures
// the real canvas with a block hovered and selected, against the page a
// visitor gets. A button's marks hug the pill it draws, as the approved
// design draws them, not the column-wide root around it.
import { cms, column, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// The rule under an accordion's last question, and the accordion's height.
const accordionShape = (root: Element) => {
  const questions = root.querySelectorAll("details");
  const last = questions[questions.length - 1]!;
  return { rule: getComputedStyle(last).borderBottomWidth, height: root.getBoundingClientRect().height };
};

test("an accordion hovered or selected keeps the rule under its last question, and its height, as the published page draws it", async ({ page, request }) => {
  const items = [{ question: "When do you swim?", answer: "At slack water, twice a day." }, { question: "Is it cold?", answer: "Bring a hat." }];
  const { id, slug } = await makePage(request, "Questions", [section("s", "Questions", [column("c", [widget("a", "accordion", { items }), heading("h", "Below")])])]);
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);

  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${slug}`);
  const published = await visitor.locator(".sw-accordion").evaluate(accordionShape);
  await visitor.close();
  expect(published.rule).toBe("1px");

  await open(page, id);
  const accordion = page.locator('.canvas [data-block-id="a"]');
  const below = page.locator('.canvas [data-block-id="h"]');
  await page.mouse.move(5, 895);
  const plain = { ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y };
  expect(plain.rule).toBe("1px");

  await accordion.hover();
  await expect(accordion.locator(":scope > .ov-hover")).toHaveCount(1);
  expect({ ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y }).toEqual(plain);

  await accordion.click();
  await expect(accordion.locator(":scope > .ov-sel")).toHaveCount(1);
  await page.mouse.move(5, 895);
  expect({ ...(await accordion.evaluate(accordionShape)), below: (await below.boundingBox())!.y }).toEqual(plain);
});

test("a button's hover outline and selection frame hug its pill, not its column", async ({ page, request }) => {
  const { id } = await makePage(request, "Pill", [section("s", "Join", [column("c", [widget("b", "button", { label: "Join a trial swim", href: "https://example.com/join" })])])]);
  await open(page, id);
  const button = page.locator('.canvas [data-block-id="b"]');
  const pill = (await button.locator(":scope > .sw-btn").boundingBox())!;
  const root = (await button.boundingBox())!;
  // The root is the column's width, as on the published page.
  expect(root.width).toBeGreaterThan(pill.width + 100);
  const around = async (selector: string, gap: number) => {
    const box = (await button.locator(selector).boundingBox())!;
    return [box.x - (pill.x - gap), box.y - (pill.y - gap), box.width - (pill.width + 2 * gap), box.height - (pill.height + 2 * gap)].map((d) => Math.abs(d) <= 1);
  };

  // The page's links take no pointer on the canvas: the pointer goes to
  // the middle of the pill, over the block.
  await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await expect(button.locator(":scope > .ov-hover")).toHaveCount(1);
  expect(await around(":scope > .ov-hover", 4)).toEqual([true, true, true, true]);
  // Its name sits beside the pill.
  const label = (await button.locator(":scope > .ov-hover .ov-label").boundingBox())!;
  expect(label.x).toBeGreaterThan(pill.x + pill.width);
  expect(label.x).toBeLessThan(pill.x + pill.width + 20);

  await button.click();
  await expect(button.locator(":scope > .ov-sel")).toHaveCount(1);
  expect(await around(":scope > .ov-sel", 6)).toEqual([true, true, true, true]);
});
