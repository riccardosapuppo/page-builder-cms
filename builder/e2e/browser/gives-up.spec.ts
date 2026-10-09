// When the browser's storage gives up, the editor says why, in a sentence
// on screen, and each way of giving up has its test:
// - IndexedDB missing, or refused as some private windows refuse it: the
//   editor cannot start, and says it keeps nothing here;
// - the browser's storage full (a quota set small through Chromium's own
//   protocol, so the browser itself refuses the write): the image is not
//   added, and the library says the browser has no room;
// - another tab still open on an older version of the database, holding
//   on to it: the next build cannot upgrade it, says which tab to close,
//   and starts once it is closed;
// - an older tab of the editor, open while the next build upgrades the
//   database, lets go of it at once and says, on its next save, to reload;
// - the database deleted from another tab: this tab lets go of it, its
//   next save says so, and Reload this tab reloads it;
// - a database made by a newer build than this one: it cannot be opened, and
//   the editor says to reload, and offers Reload this tab;
// - the browser refusing the open for want of room.
// What a save is refused for is said in words on the page (an alert), not
// only in the top bar's tooltip, which a keyboard, a touch screen and most
// screen readers never reach.
import type { Page } from "@playwright/test";
import { remoteAdapter, storagePage } from "./remote.ts";
import { expect, seedPage, test } from "./fixtures.ts";
import { png } from "../helpers/images.ts";
import { column, heading, open, section } from "../helpers/site.ts";
import { retitle, saveState } from "../helpers/heading.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const SAID = {
  unavailable: "This browser keeps nothing for the editor here: its storage (IndexedDB) is missing or refused, as in some private windows. Open the editor in a normal window.",
  quota: "This browser has no room left for the editor's pages and images: delete images from the library, or let this site keep more in the browser's settings.",
  blocked: "Another tab has the editor open on an older version of its storage and holds on to it: close that tab, then try again.",
  upgraded: "A newer version of the editor, open in another tab, has upgraded this browser's storage: reload this tab to go on.",
  deleted: "This browser's storage for the editor was deleted in another tab: reload this tab.",
  newer: "This browser's storage was made by a newer version of the editor: reload this tab to get it.",
};

const story = [section("s", "Story", [column("c", [heading("h", "First words")])])];
const cannotStart = (why: string) => `The editor could not start: ${why}`;

test("with no IndexedDB at all, the editor says it keeps nothing here, and why", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }));
  await page.goto("/");
  await expect(page.getByRole("alert").getByText(cannotStart(SAID.unavailable))).toBeVisible();
});

test("with IndexedDB refused, as some private windows refuse it, the editor says the same", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("The user denied permission to access the database.", "SecurityError");
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert").getByText(cannotStart(SAID.unavailable))).toBeVisible();
});

test("with the browser's storage full, an image is not added, and the library says the browser has no room", async ({ page, baseURL }) => {
  // A quota of 200 kB, room for a page but not for the image below: the
  // browser itself refuses the image's bytes. Set before the site keeps
  // anything, since Chromium holds a quota it has already looked up.
  await storagePage(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Storage.overrideQuotaForOrigin", { origin: new URL(baseURL!).origin, quotaSize: 200_000 });
  const id = await seedPage(page, "Full storage", story);
  await open(page, id);

  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  // 400 by 400 of noise, the high bits of a 32-bit generator: about half a
  // megabyte that does not compress.
  let seed = 7;
  const noise = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
  await dialog.getByLabel("Images to upload").setInputFiles({ name: "noise.png", mimeType: "image/png", buffer: png(400, 400, () => [noise(), noise(), noise()]) });
  await expect(dialog.getByText(`Not uploaded: ${SAID.quota}`)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("radio", { name: /^noise\.png/ })).toHaveCount(0);
});

test("a tab holding the database open on an older version holds up the next build's upgrade: it says which tab to close, and starts once it is closed", async ({ page, context }) => {
  // The database as this build makes it, then held open, from another
  // tab, by a connection that does not let go when asked.
  const older = await storagePage(await context.newPage());
  await remoteAdapter(older, await older.evaluate(() => window.storagePage!.open("first"))).listPages();
  await older.evaluate(() => new Promise<void>((done, failed) => {
    const opening = indexedDB.open("page-builder-cms");
    opening.onsuccess = () => {
      (window as unknown as { held: IDBDatabase }).held = opening.result;
      done();
    };
    opening.onerror = () => failed(opening.error);
  }));

  await page.goto("/e2e/browser/next-editor.html");
  const alert = page.getByRole("alert");
  await expect(alert.getByText(cannotStart(SAID.blocked))).toBeVisible();
  // Its words say try again once that tab is closed, and Try again is what
  // it offers.
  await expect(alert.getByRole("button", { name: "Reload this tab" })).toHaveCount(0);

  await older.evaluate(() => (window as unknown as { held: IDBDatabase }).held.close());
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("No pages yet", { exact: false }).first()).toBeVisible();
});

test("an older tab of the editor lets go of the database when the next build opens it, and its next save says to reload", async ({ page, context }) => {
  const id = await seedPage(page, "Older tab", story);
  await open(page, id);

  const next = await context.newPage();
  await next.goto(`/e2e/browser/next-editor.html?page=${id}`);
  await expect(next.locator(".canvas .frame")).toBeVisible();

  await retitle(page, "Written in the older tab");
  await expect(saveState(page)).toHaveText("Not saved");
  await expectSaid(page, SAID.upgraded);
});

// The refusal of a save, in words on the page: an alert that says what
// happened and offers what can help. Here only a reload can: this tab has
// let go of the storage, so it offers Reload this tab, not a Try again
// that would be refused again. (The top bar keeps the reason as its
// tooltip as well; this is for those who do not hover.)
async function expectSaid(page: Page, why: string): Promise<void> {
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(`Not saved. ${why}Reload this tab`);
  await expect(alert.getByText(why)).toBeVisible();
  await expect(alert.getByRole("button", { name: "Reload this tab" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
}

test("the database deleted from another tab: this tab lets go of it, and its next save says so, in words", async ({ page, context }) => {
  const id = await seedPage(page, "Deleted under it", story);
  await open(page, id);

  const other = await storagePage(await context.newPage());
  await other.evaluate(() => new Promise<void>((done, failed) => {
    const deleting = indexedDB.deleteDatabase("page-builder-cms");
    deleting.onsuccess = () => done();
    deleting.onerror = () => failed(deleting.error);
    deleting.onblocked = () => failed(new Error("the delete waits for a tab that holds the database"));
  }));

  await retitle(page, "Written after the deletion");
  await expect(saveState(page)).toHaveText("Not saved");
  await expectSaid(page, SAID.deleted);
  // Not the sentence of an upgrade.
  await expect(page.getByRole("alert")).not.toContainText("upgraded");

  // Reload this tab reloads it; the edit this tab still holds makes the
  // browser ask first, and the reload goes ahead once that is accepted.
  const asked: string[] = [];
  page.once("dialog", (dialog) => {
    asked.push(dialog.type());
    void dialog.accept();
  });
  const reloaded = page.waitForEvent("load");
  await page.getByRole("alert").getByRole("button", { name: "Reload this tab" }).click();
  await reloaded;
  expect(asked).toEqual(["beforeunload"]);
  await expect(page.getByRole("alert").filter({ hasText: "Not saved." })).toHaveCount(0);
});

test("a database made by a newer build than this one cannot be opened, and the editor says to reload and offers Reload this tab", async ({ page, context }) => {
  // The next build opens the database and upgrades it a step further.
  const next = await context.newPage();
  await next.goto("/e2e/browser/next-editor.html");
  await expect(next.getByText("No pages yet", { exact: false }).first()).toBeVisible();

  await page.goto("/");
  const alert = page.getByRole("alert");
  await expect(alert.getByText(cannotStart(SAID.newer))).toBeVisible();
  // Only a reload gets past it, as the words say: Reload this tab, and no
  // Try again, which would only open the same storage and be refused again.
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  const reloaded = page.waitForEvent("load");
  await alert.getByRole("button", { name: "Reload this tab" }).click();
  await reloaded;
  // Served here, the reload brings this build again, so the same words; on
  // the site it brings the newer build.
  await expect(page.getByRole("alert").getByText(cannotStart(SAID.newer))).toBeVisible();
});

test("the browser refusing the open for want of room is said as such, not as a missing storage", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      const asked: { onerror: (() => void) | null; error: DOMException } = { onerror: null, error: new DOMException("The quota has been exceeded.", "QuotaExceededError") };
      setTimeout(() => asked.onerror?.(), 0);
      return asked as unknown as IDBOpenDBRequest;
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert").getByText(cannotStart(SAID.quota))).toBeVisible();
});
