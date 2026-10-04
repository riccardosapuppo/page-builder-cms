// Undo, redo, the History drawer and the page's versions, in Chromium,
// against the run's CMS (design/layout/shots/history.png):
// - the top bar's undo and redo, the focus on the block the step touched;
//   a step chosen in the history brings the page back to right after it,
//   and the CMS saves that page;
// - every power over versions exercised from the screen (the delivery
//   list's item 24): Save version with a name, Restore (the draft before it
//   kept, the canvas showing the restored page, undo starting again, the
//   next edit saved with no conflict), a restore undone by restoring the
//   version kept before it, and a publish listed as the live version;
// - axe on the open history.
import type { Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { headingText, headingWords as words, retitle } from "./helpers/heading.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [section("s", "Story", [column("c", [heading("h", "First words"), widget("d", "divider", {})])])];

const history = (page: Page) => page.getByRole("complementary", { name: "History" });
const steps = (page: Page) => history(page).getByRole("list", { name: "This session" }).getByRole("button");
const versionRows = (page: Page) => history(page).getByRole("list", { name: "Versions" }).getByRole("listitem");

interface ListedVersion {
  number: number;
  reason: string;
  name: string | null;
  restoredFrom: number | null;
  published: boolean;
}

async function versionsOf(page: Page, id: number): Promise<ListedVersion[]> {
  return ((await (await page.request.get(`${cms()}/api/pages/${id}/versions`)).json()) as { versions: ListedVersion[] }).versions;
}

test("undo and redo from the top bar, and a step chosen in the history, bring the page back, and the CMS saves it", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Steps back", fixture());
  await open(page, id);
  // Exact: a step undone in the history is a button whose name holds
  // "Undone".
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toHaveAttribute("aria-disabled", "true");

  await block(page, "d").click();
  await page.keyboard.press("Delete");
  await expect(block(page, "d")).toHaveCount(0);
  await retitle(page, "Second words");
  await expect(undo).toHaveAttribute("title", "Undo “Changed Heading in Story” (Ctrl+Z)");

  await undo.click();
  await expect(words(page)).toHaveText("First words");
  // The focus is on the block the undo touched.
  await expect(block(page, "h")).toBeFocused();
  await redo.click();
  await expect(words(page)).toHaveText("Second words");
  await expect(redo).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(history(page)).toBeVisible();
  // One drawer at a time; it takes the focus, on Save version.
  await expect(page.locator(".drawer")).toHaveCount(1);
  await expect(history(page).getByRole("button", { name: "Save version" })).toBeFocused();
  await expect(steps(page).locator(".hist-what")).toHaveText(["Changed Heading in Story", "Deleted Divider in Story"]);
  await expect(steps(page).first()).toHaveAttribute("aria-current", "step");
  await expect(steps(page).first().locator(".hist-when")).toHaveText(/^Today, \d{1,2}:\d{2} [AP]M$/);

  // Back to right after the delete: the heading's words come back, the
  // divider stays gone, and the step undone says so.
  const deleted = steps(page).nth(1);
  await deleted.click();
  await expect(words(page)).toHaveText("First words");
  await expect(block(page, "d")).toHaveCount(0);
  await expect(deleted).toBeFocused();
  await expect(deleted).toHaveAttribute("aria-current", "step");
  await expect(steps(page).first().locator(".hist-when")).toHaveText("Undone");
  await expect(page.locator(".notice")).toHaveText("Undid 1 step: the page is as it was right after “Deleted Divider in Story”.");
  await saved(page);
  expect(await headingText(request, id)).toBe("First words");
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["h"]);

  const report = await axe(page, { include: ".drawer-history" });
  expect(report.serious, "the history drawer").toEqual([]);
  expect(report.passes).toBeGreaterThan(5);

  // Closing it gives the focus back to where it was when it opened: the
  // History key; Esc does the same.
  await history(page).getByRole("button", { name: "Close History" }).click();
  await expect(history(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(history(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
});

test("versions from the screen: Save version with a name, Restore, a restore undone by the version kept before it, and the live version marked", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Versions", fixture());
  await open(page, id);
  await page.getByRole("button", { name: "History", exact: true }).click();
  // The page's first save kept an automatic version.
  await expect(versionRows(page).locator(".ver-kind")).toHaveText(["Current draft", "Autosaved"]);
  await expect(versionRows(page).first()).toContainText("Not published yet");

  await retitle(page, "Before the change");
  await history(page).getByRole("button", { name: "Save version" }).click();
  const name = history(page).getByRole("textbox", { name: /^Name/ });
  await expect(name).toBeFocused();
  await name.fill("Before the change");
  await name.press("Enter");
  await expect(page.locator(".notice")).toHaveText("Kept as a version: “Before the change”.");
  // The field goes, the focus back on the button that opened it.
  await expect(name).toHaveCount(0);
  await expect(history(page).getByRole("button", { name: "Save version" })).toBeFocused();
  await expect(versionRows(page).nth(1).locator(".ver-kind")).toHaveText("Saved");
  await expect(versionRows(page).nth(1).locator(".ver-name")).toHaveText("Before the change");
  const named = (await versionsOf(page, id))[0]!;
  expect(named).toMatchObject({ reason: "manual", name: "Before the change" });

  await retitle(page, "After the change");
  await saved(page);
  expect(await headingText(request, id)).toBe("After the change");

  await history(page).getByRole("button", { name: /^Restore: Saved, Before the change, Today, / }).click();
  await expect(words(page)).toHaveText("Before the change");
  await expect(page.locator(".notice")).toHaveText(/^Restored “Before the change”, saved today at \d{1,2}:\d{2} [AP]M\. The draft it replaced is kept in Versions, as “Before restoring”\. Undo starts again from here: its steps belonged to the page that was replaced\.$/);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(history(page).getByText("No changes yet.", { exact: false })).toBeVisible();
  await expect(versionRows(page).locator(".ver-kind")).toHaveText(["Current draft", "Restored", "Before restoring", "Saved", "Autosaved"]);
  await expect(versionRows(page).nth(1).locator(".ver-name")).toHaveText(/^From “Before the change”, Today, /);
  expect(await headingText(request, id)).toBe("Before the change");
  const [restore, kept] = await versionsOf(page, id);
  expect(restore).toMatchObject({ reason: "restore", restoredFrom: named.number });
  expect(kept).toMatchObject({ reason: "before-restore" });
  const keptDocument = (await (await page.request.get(`${cms()}/api/pages/${id}/versions/${kept!.number}`)).json()) as { document: { sections: Array<{ children: Array<{ children: Array<{ props: { text: string } }> }> }> } };
  expect(keptDocument.document.sections[0]!.children[0]!.children[0]!.props.text).toBe("After the change");

  // The restored draft is this tab's: an edit is saved with no conflict.
  await retitle(page, "Restored, then edited");
  await saved(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await headingText(request, id)).toBe("Restored, then edited");

  // The restore undone: the version kept before it, restored in turn.
  await history(page).getByRole("button", { name: /^Restore: Before restoring, / }).click();
  await expect(words(page)).toHaveText("After the change");
  await expect(page.locator(".notice")).toHaveText(/^Restored the version kept before a restore today at /);
  expect(await headingText(request, id)).toBe("After the change");

  // A publish is a version, the live one, marked so.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");
  await expect(versionRows(page).nth(1).locator(".ver-kind")).toHaveText("Published, live now");
  await expect(versionRows(page).nth(1).locator(".dot-live")).toHaveCount(1);
  await expect(versionRows(page).first()).toContainText("The same as the live page");
  expect((await versionsOf(page, id))[0]).toMatchObject({ reason: "publish", published: true });

  const report = await axe(page, { include: ".drawer-history" });
  expect(report.serious, "the history drawer with versions").toEqual([]);
  expect(report.passes).toBeGreaterThan(5);
});

test("at 1280 wide, with a published page's long line under its title, a save moves nothing in the top bar, and the drawers' keys and Preview keep their words", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { id } = await makePage(request, "Slack Water", fixture());
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  await open(page, id);
  for (let n = 1; n <= 7; n += 1) {
    await retitle(page, `Words ${n}`);
    await saved(page);
  }
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published, 7 changes not live");
  // The title in the middle, beside the save state's side: where it stands.
  const title = page.locator(".topbar .tb-title");
  const where = () => title.evaluate((e) => Math.round(e.getBoundingClientRect().x));
  const words = () => page.locator(".topbar .tb-word").evaluateAll((e) => e.map((w) => w.getBoundingClientRect().width > 10));
  const before = await where();
  expect(await words()).toEqual([true, true, true, true]);
  // The next save held a moment on its way: Saving… then Saved.
  await page.route("**/api/pages/*/draft", async (route) => {
    if (route.request().method() === "PUT") await new Promise((done) => setTimeout(done, 1500));
    await route.fallback();
  });
  await retitle(page, "Words 8");
  await expect(page.locator(".topbar .save-state")).toHaveText("Saving…");
  expect(await where()).toBe(before);
  expect(await words()).toEqual([true, true, true, true]);
  await saved(page);
  expect(await where()).toBe(before);
});
