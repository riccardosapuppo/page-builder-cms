// The first-run note in Chromium, against the run's CMS: a browser that has
// never opened the editor finds, under the open page's title, what it is
// editing and where its changes go, the site's address a link, and beside
// the title where the page is; Got it closes the note for good in that
// browser. The other tests' browsers start as one that has seen it
// (harness/welcome.ts); this one starts with nothing stored.
import { axe } from "./helpers/axe.ts";
import { cms, column, expect, heading, makePage, open, section, test } from "./helpers/site.ts";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

test("a browser new to the editor is told what is open and where its changes go, and Got it closes the note for good", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "First visit", [section("s1", "Hero", [column("c1", [heading("h", "Swim at dawn")])])]);
  await open(page, id);
  const note = page.getByRole("region", { name: "What you are editing" });
  await expect(note).toBeVisible();
  await expect(note).toContainText(`The draft of “First visit”, at /${slug}.`);
  await expect(note).toContainText("Visitors see them only once you press Publish");
  await expect(note.getByRole("link", { name: new URL(cms()).host, exact: true })).toHaveAttribute("href", `${cms()}/`);
  await expect(page.locator(".topbar .tb-page-where")).toHaveText(`/${slug}`);
  const report = await axe(page, { include: ".pop-welcome" });
  expect(report.serious).toEqual([]);
  for (const line of report.other) console.log(`the first-run note: ${line}`);
  expect(report.passes).toBeGreaterThan(0);

  await note.getByRole("button", { name: "Got it" }).click();
  await expect(note).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();
  await expect(page.locator(".topbar .tb-page-where")).toHaveText(`/${slug}`);
  await expect(note, "not again in this browser").toBeHidden();
});
