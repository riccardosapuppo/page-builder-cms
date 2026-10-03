// The save states in Chromium, against the run's CMS (design/shots/
// save-states.png):
// - a slowed network: "Saving…" while the save travels, and closing the
//   tab asks first; "Saved" once the CMS has it;
// - an unknown outcome: the network fails, the top bar counts down to the
//   next try, the toast says why, and Retry now sends the very same save
//   (same saveId), which the CMS then keeps;
// - an answer lost after the CMS stored the save: the same save goes again
//   on its own and is answered as saved, one revision, no conflict;
// - a conflict made by a second writer through the API while the editor
//   is open: the banner, Publish paused, Reload taking the other writer's
//   page, Keep mine saving this tab's over it;
// - words typed and not handed over yet when the tab is asked to close;
// - a 422 whose fix was typed while the refused save travelled;
// - an edit made on the page being left while the next page loads.
import type { Page, Request } from "@playwright/test";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, type DraftBlock } from "./helpers/site.ts";

test.use({
  viewport: { width: 1440, height: 900 },
  // The browser's own lines for the failures these tests make: a request
  // the network drops, the CMS's 409 to a save made on an old revision,
  // and the 422 a test answers in the CMS's place.
  allowConsole: /net::ERR_INTERNET_DISCONNECTED|net::ERR_CONNECTION_RESET|status of 409 \(Conflict\)|status of 422 \(Unprocessable (Content|Entity)\)/,
});

const fixture = () => [section("s", "Story", [column("c", [heading("h", "First words")])])];

const DRAFT = "**/api/pages/*/draft";

// Types new words into the heading's Text field and leaves the field, which
// hands the text over as a command.
async function retitle(page: Page, words: string) {
  await block(page, "h").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill(words);
  await text.blur();
}

const saveState = (page: Page) => page.locator(".topbar .save-state");
const headingText = async (request: Parameters<typeof draftOf>[0], id: number) => (await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.props.text;

// Whether closing the tab now would ask first: the editor's beforeunload
// listener, asked the way the browser asks it.
const asksBeforeClosing = (page: Page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

const saveIdOf = (request: Request) => (JSON.parse(request.postData() ?? "{}") as { saveId?: string }).saveId;

test("on a slowed network the save shows Saving… while it travels, closing the tab asks first, and Saved comes with the CMS's answer", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Slow save", fixture());
  await open(page, id);
  // Every save takes three seconds on its way to the CMS.
  await page.route(DRAFT, async (route) => {
    if (route.request().method() === "PUT") await new Promise((done) => setTimeout(done, 3_000));
    await route.fallback();
  });
  await retitle(page, "Slow words");
  await expect(saveState(page)).toHaveText("Saving…");
  expect(await asksBeforeClosing(page)).toBe(true);

  // The browser's own question, answered "stay".
  const asked = page.waitForEvent("dialog");
  void page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);

  await saved(page);
  expect(await asksBeforeClosing(page)).toBe(false);
  expect(await headingText(request, id)).toBe("Slow words");
});

test("words typed in a field and not handed over yet: closing the tab asks first, and the words are saved", async ({ page, request }) => {
  const { id } = await makePage(request, "Closing while typing", fixture());
  await open(page, id);
  await block(page, "h").click();
  const field = await page.getByRole("textbox", { name: "Text" }).elementHandle();
  // The words are typed and the tab is asked to close in one go, inside
  // the field's pause: nothing has handed them over yet.
  const asked = await page.evaluate((element) => {
    const text = element as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(text, "Typed just before closing");
    text.dispatchEvent(new Event("input", { bubbles: true }));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, field);
  expect(asked).toBe(true);
  // Asking handed the words over: they are saved like any edit.
  await saved(page);
  expect(await headingText(request, id)).toBe("Typed just before closing");
});

test("a save answered 422 while the fix was typed: the fix is sent once the refusal lands, and saved", async ({ page, request }) => {
  const { id } = await makePage(request, "Fixed while refused", fixture());
  await open(page, id);
  const sent: string[] = [];
  await page.route(DRAFT, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as { document: { sections: DraftBlock[] } };
    sent.push(String(body.document.sections[0]!.children[0]!.children[0]!.props.text));
    if (sent.length > 1) return route.fallback();
    // The first save is refused, three seconds later, as a value the
    // editor could not foresee.
    await new Promise((done) => setTimeout(done, 3_000));
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid_document", message: "The document is not valid.", errors: [{ pointer: "/document/sections/0/children/0/children/0/props/text", keyword: "pattern", blockPointer: "/document/sections/0/children/0/children/0", message: "is refused by the server" }] }),
    });
  });
  await retitle(page, "Refused words");
  await expect.poll(() => sent.length).toBe(1);
  // While the refused save travels, the words change again.
  await retitle(page, "Fixed words");
  await saved(page);
  expect(sent).toEqual(["Refused words", "Fixed words"]);
  expect(await headingText(request, id)).toBe("Fixed words");
  await block(page, "h").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await expect(text).toHaveValue("Fixed words");
  await expect(text).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).not.toHaveAttribute("aria-disabled", "true");
});

test("an edit made on the open page while the next page loads is saved before the next page opens", async ({ page, request }) => {
  const alpha = await makePage(request, "Alpha leaving", [section("sa", "Story", [column("ca", [heading("ha", "Alpha words")])])]);
  const beta = await makePage(request, "Beta arriving", [section("sb", "Story", [column("cb", [heading("hb", "Beta words")])])]);
  await open(page, alpha.id);
  // The next page arrives only once the edit below is made: its save is
  // then still waiting for its pause.
  let arrive = () => {};
  const edited = new Promise<void>((done) => {
    arrive = done;
  });
  await page.route(`**/api/pages/${beta.id}`, async (route) => {
    if (route.request().method() === "GET") await edited;
    await route.fallback();
  });
  await page.getByRole("button", { name: /^Switch page/ }).click();
  await page.getByRole("menu", { name: "Pages" }).getByRole("menuitem", { name: /Beta arriving/ }).click();
  // Alpha is still on the canvas, and takes an edit.
  await block(page, "ha").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill("Alpha, edited while Beta was on its way");
  await text.blur();
  arrive();
  await expect(block(page, "hb")).toBeVisible({ timeout: 15_000 });
  const alphaText = (await draftOf(request, alpha.id)).document.sections[0]!.children[0]!.children[0]!.props.text;
  expect(alphaText).toBe("Alpha, edited while Beta was on its way");
  await saved(page);
});

test("a save the network loses is retried with the same saveId: the countdown, the toast, Retry now, then Saved", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Lost save", fixture());
  await open(page, id);
  const before = (await draftOf(request, id)).revision;
  const sent: string[] = [];
  let down = true;
  await page.route(DRAFT, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    sent.push(saveIdOf(route.request()) ?? "");
    if (down) return route.abort("internetdisconnected");
    return route.fallback();
  });
  await retitle(page, "Words kept in the tab");
  await expect(saveState(page)).toHaveText(/^Not saved, retrying in \d+ s$/);
  const toast = page.getByRole("group", { name: "Not saved" });
  await expect(toast.locator("p")).toHaveText("Connection lost. Your change is kept in this tab and saved when the connection is back.");
  expect(await asksBeforeClosing(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveAttribute("aria-disabled", "true");

  // The connection is back; Retry now sends at once.
  down = false;
  const tries = sent.length;
  await toast.getByRole("button", { name: "Retry now" }).click();
  await saved(page);
  await expect(toast).toHaveCount(0);
  // Every try was the same save.
  expect(sent.length).toBeGreaterThan(tries);
  expect(new Set(sent).size).toBe(1);
  const draft = await draftOf(request, id);
  expect(draft.revision).toBe(before + 1);
  expect(draft.document.sections[0]!.children[0]!.children[0]!.props.text).toBe("Words kept in the tab");
});

test("an answer lost after the CMS kept the save: the same save goes again by itself and is answered as saved, one revision", async ({ page, request }) => {
  const { id } = await makePage(request, "Lost answer", fixture());
  await open(page, id);
  const before = (await draftOf(request, id)).revision;
  const sent: string[] = [];
  await page.route(DRAFT, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    sent.push(saveIdOf(route.request()) ?? "");
    if (sent.length > 1) return route.fallback();
    // The CMS stores it; its answer never reaches the editor.
    await route.fetch();
    return route.abort("connectionreset");
  });
  await retitle(page, "Stored once");
  await expect(saveState(page)).toHaveText(/^Not saved, retrying/);
  // The automatic try, two seconds later.
  await saved(page);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await draftOf(request, id)).revision).toBe(before + 1);
});

test("a second writer saves through the API: the banner pauses saving and Publish; Reload takes their page, Keep mine saves this one", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Two writers", fixture());
  await open(page, id);
  const writeElsewhere = async (words: string) => {
    const draft = await draftOf(request, id);
    const document = { schemaVersion: 1, title: "Two writers", sections: [section("s", "Story", [column("c", [heading("h", words)])])] };
    const answer = await request.put(`${cms()}/api/pages/${id}/draft`, { data: { revision: draft.revision, saveId: `elsewhere-${draft.revision}`, document } });
    expect(answer.status()).toBe(200);
  };

  await writeElsewhere("Their words");
  await retitle(page, "My words");
  const banner = page.getByRole("alert");
  await expect(banner).toContainText("Changed in another tab. This page was saved in another tab after you opened it. Saving is paused until you choose.");
  await expect(saveState(page)).toHaveText("Changed in another tab");
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  await expect(publish).toHaveAttribute("title", "Publish is paused until you choose Reload or Keep mine.");
  // Saving waits: the CMS still has theirs.
  expect(await headingText(request, id)).toBe("Their words");

  await banner.getByRole("button", { name: "Reload" }).click();
  await expect(banner).toHaveCount(0);
  await expect(block(page, "h")).toHaveText("Their words");
  await expect(page.locator(".canvas")).toBeFocused();
  await expect(saveState(page)).toHaveText("Saved");
  expect(await headingText(request, id)).toBe("Their words");

  // Again; this time this tab's page wins.
  await writeElsewhere("Their second words");
  await retitle(page, "My second words");
  await banner.getByRole("button", { name: "Keep mine" }).click();
  await expect(banner).toHaveCount(0);
  await saved(page);
  expect(await headingText(request, id)).toBe("My second words");
  await expect(publish).not.toHaveAttribute("aria-disabled", "true");
});
