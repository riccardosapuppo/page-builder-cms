// What Chromium's accessibility tree holds for one element, read through
// the DevTools protocol: the tree a screen reader is given, not the DOM.
// A field's required state is the case at hand: the DOM's required
// attribute is what the page writes, the tree's "required" is what a
// screen reader announces.
import type { Locator, Page } from "@playwright/test";

// The element's accessibility properties by name ("required", "invalid",
// "readonly"...), each with its value; an empty map for an element the
// tree leaves out.
export async function axProperties(page: Page, element: Locator): Promise<Map<string, unknown>> {
  const cdp = await page.context().newCDPSession(page);
  const mark = `ax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    await element.evaluate((node, value) => node.setAttribute("data-ax-probe", value), mark);
    const found = await cdp.send("Runtime.evaluate", { expression: `document.querySelector('[data-ax-probe="${mark}"]')` });
    const objectId = found.result.objectId;
    if (!objectId) throw new Error("the element went away before its accessibility node was read");
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { objectId, fetchRelatives: false });
    const node = nodes[0];
    if (!node || node.ignored) return new Map();
    return new Map((node.properties ?? []).map((property) => [property.name, property.value.value]));
  } finally {
    await element.evaluate((node) => node.removeAttribute("data-ax-probe")).catch(() => undefined);
    await cdp.detach();
  }
}
