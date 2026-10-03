// What the tests of saving, publishing, the history and two tabs share:
// a page whose first widget is the heading "h", changed through its panel
// as a person would; its words on the canvas and in the CMS's draft; the
// top bar's save state; and whether closing the tab would ask first.
import type { Page } from "@playwright/test";
import { block } from "./canvas.ts";
import { draftOf } from "./site.ts";

// Types new words into the heading's Text field and leaves the field,
// which hands them over as a command.
export async function retitle(page: Page, words: string): Promise<void> {
  await block(page, "h").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill(words);
  await text.blur();
}

// The heading's words on the canvas, without the name the selection's
// bar adds beside them.
export const headingWords = (page: Page) => block(page, "h").getByRole("heading");

// The heading's words in the CMS's draft.
export const headingText = async (request: Parameters<typeof draftOf>[0], id: number) => (await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.props.text;

export const saveState = (page: Page) => page.locator(".topbar .save-state");

// Whether closing the tab now would ask first: the editor's beforeunload
// listener, asked the way the browser asks it.
export const asksBeforeClosing = (page: Page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});
