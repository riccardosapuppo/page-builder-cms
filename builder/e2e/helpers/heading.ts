// What the tests of saving, publishing, the history and two tabs share:
// a page whose first widget is the heading "h", changed through its panel
// as a person would; its words on the canvas and in the CMS's draft; the
// top bar's save state; whether closing the tab would ask first; and the
// save the toast holds, sent again.
import type { Page } from "@playwright/test";
import { block } from "./canvas.ts";
import { draftOf, expect } from "./site.ts";

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

// The save the toast holds, sent again once the connection is back, and
// `then`, what sending it leads to. Retry now sends it, but the editor
// sends the very same save by itself too, each time its countdown ends,
// and under load its own send can come between the connection's return
// and the click and take the button away: the click is only for a button
// still there, and either way `then` is waited for.
export async function sendAgain(page: Page, then: () => Promise<void>): Promise<void> {
  const retry = page.getByRole("group", { name: "Not saved" }).getByRole("button", { name: "Retry now" });
  await expect(async () => {
    if (await retry.isVisible()) await retry.click({ timeout: 1_000 });
    await then();
  }).toPass({ timeout: 30_000 });
}
