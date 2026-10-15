// What Chromium's accessibility tree holds for one element, read through
// the DevTools protocol: the tree a screen reader is given, not the DOM.
// A field's required state is the case at hand: the DOM's required
// attribute is what the page writes, the tree's "required" is what a
// screen reader announces. So is the text the stylesheet draws, a
// counter before a list's item, which the DOM's own text leaves out.
import type { CDPSession, Locator, Page } from "@playwright/test";

// Reads the element's accessibility node through `read`, given the
// element as the protocol's runtime holds it.
async function withNode<T>(page: Page, element: Locator, read: (cdp: CDPSession, objectId: string) => Promise<T>): Promise<T> {
  const cdp = await page.context().newCDPSession(page);
  const mark = `ax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    await element.evaluate((node, value) => node.setAttribute("data-ax-probe", value), mark);
    const found = await cdp.send("Runtime.evaluate", { expression: `document.querySelector('[data-ax-probe="${mark}"]')` });
    const objectId = found.result.objectId;
    if (!objectId) throw new Error("the element went away before its accessibility node was read");
    return await read(cdp, objectId);
  } finally {
    await element.evaluate((node) => node.removeAttribute("data-ax-probe")).catch(() => undefined);
    await cdp.detach();
  }
}

// The element's accessibility properties by name ("required", "invalid",
// "readonly"...), each with its value; an empty map for an element the
// tree leaves out.
export async function axProperties(page: Page, element: Locator): Promise<Map<string, unknown>> {
  return withNode(page, element, async (cdp, objectId) => {
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { objectId, fetchRelatives: false });
    const node = nodes[0];
    if (!node || node.ignored) return new Map();
    return new Map((node.properties ?? []).map((property) => [property.name, property.value.value]));
  });
}

// The text the tree reads inside the element, piece by piece in its order:
// the page's text and the stylesheet's (a ::before's counter) alike.
export async function axTexts(page: Page, element: Locator): Promise<string[]> {
  return withNode(page, element, async (cdp, objectId) => {
    const { nodes } = await cdp.send("Accessibility.queryAXTree", { objectId, role: "StaticText" });
    return nodes.map((node) => String(node.name?.value ?? ""));
  });
}
