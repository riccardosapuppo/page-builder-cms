// A form's whole way, in Chromium against the run's CMS: a page with a
// form published from the editor; a visitor sends it twice from the served
// page, once with markup and a javascript: link in the answers; Form
// responses, from the mark's menu, finds the form by its page, lists both
// newest first with the time and the version, opens one whole with the
// visitor's text as text, passes axe, is driven from the keyboard, and
// deletes one after asking, the focus going to the response that took its
// place and the CMS keeping only the other.
import { axe } from "./helpers/axe.ts";
import { keptAnswers } from "./helpers/cms-store.ts";
import { cms, column, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const FIELDS = [
  { name: "name", kind: "text", label: "Name", required: true, maxLength: 200 },
  { name: "email", kind: "email", label: "Email", required: true },
  { name: "notes", kind: "textarea", label: "Anything we should know?", required: false, maxLength: 1000 },
  { name: "news", kind: "checkbox", label: "Send me the swim calendar", required: false },
];
const MARKUP = '<img src="x" onerror="document.title=\'taken\'">Ann <b>Diver</b>';
const LINK = '<a href="javascript:document.title=\'taken\'">Claim a free swim</a> or javascript:alert(1)';
const TIME = /^Today, \d{1,2}:\d{2} (AM|PM)$/;

async function send(tab: Page, address: string, answers: { name: string; email: string; notes?: string; news?: boolean }): Promise<void> {
  await tab.goto(address);
  await tab.getByRole("textbox", { name: "Name (required)" }).fill(answers.name);
  await tab.getByRole("textbox", { name: "Email (required)" }).fill(answers.email);
  if (answers.notes) await tab.getByRole("textbox", { name: "Anything we should know?" }).fill(answers.notes);
  if (answers.news) await tab.getByRole("checkbox", { name: "Send me the swim calendar" }).check();
  await tab.getByRole("button", { name: "Send request" }).click();
  await expect(tab.getByRole("heading", { name: "Form sent", level: 1 })).toBeVisible();
}

test("a form published from the editor and sent from the served page is read in Form responses, opened whole as text, and deleted after asking", { tag: "@a11y" }, async ({ page, request, browser }) => {
  const title = `Trial swims ${Date.now().toString(36)}`;
  const made = await makePage(request, title, [
    section("s", "Join", [column("c", [heading("h", "Join a trial swim"), widget("join-form", "form", { items: FIELDS, submitLabel: "Send request", confirmation: "Thank you." })])]),
  ]);
  await open(page, made.id);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");
  const live = ((await (await request.get(`${cms()}/api/pages/${made.id}`)).json()) as { published: { versionNumber: number } }).published.versionNumber;

  const reader = await visitor(browser, { from: "198.51.100.41" });
  try {
    const address = `${cms()}/${made.slug}`;
    await send(reader.tab, address, { name: "Bo Swimmer", email: "bo@example.org" });
    await send(reader.tab, address, { name: MARKUP, email: "ann@example.org", notes: `${LINK}\nsecond line`, news: true });
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
  expect((await keptAnswers(made.id)).map((kept) => kept.answers.email)).toEqual(["bo@example.org", "ann@example.org"]);

  // From the mark's menu.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Form responses" }).click();
  const screen = page.getByRole("dialog", { name: "Form responses" });
  const form = screen.getByRole("list", { name: "Forms" }).getByRole("button", { name: `Form in Join, ${title}, ` });
  await expect(form).toHaveAccessibleName(`Form in Join, ${title}, 2 responses`);
  await form.click();
  await expect(form).toHaveAttribute("aria-current", "true");
  const table = screen.getByRole("table", { name: `Form in Join on ${title}` });
  await expect(table.getByRole("columnheader")).toHaveText(["Sent, newest first", "Version", "First written answer"]);
  const rows = table.getByRole("row").filter({ has: page.getByRole("rowheader") });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole("rowheader")).toHaveText(TIME);
  await expect(rows.nth(0).getByRole("cell")).toHaveText([String(live), `Name: ${MARKUP}`]);
  await expect(rows.nth(1).getByRole("cell")).toHaveText([String(live), "Name: Bo Swimmer"]);

  // The newest, opened from the keyboard: the table is one Tab stop.
  const newest = rows.nth(0).getByRole("button");
  await newest.focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1).getByRole("button")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(newest).toBeFocused();
  await page.keyboard.press("Enter");
  const details = screen.getByRole("region", { name: /^Sent Today, / });
  await expect(details.getByText(`Version ${live} of ${title}, the version live now`)).toBeVisible();
  await expect(details.locator("dt")).toHaveText(["Name", "Email", "Anything we should know?", "Send me the swim calendar"]);
  await expect(details.locator("dd")).toHaveText([MARKUP, "ann@example.org", `${LINK}\nsecond line`, "Ticked"], { useInnerText: true });
  // What the visitor wrote made nothing: no image, no link, no script ran.
  await expect(screen.locator("img, a, [onerror], [href]")).toHaveCount(0);
  expect(await page.title()).not.toBe("taken");

  const report = await axe(page, { include: ".dlg-responses" });
  for (const line of report.other) console.log(`Form responses: ${line}`);
  expect(report.passes).toBeGreaterThan(10);
  expect(report.serious).toEqual([]);

  // Delete asks first; Esc in the question keeps it.
  await details.getByRole("button", { name: "Delete response" }).click();
  const question = details.getByRole("group", { name: /^Delete the response sent Today, / });
  await expect(question.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(details.getByRole("button", { name: "Delete response" })).toBeFocused();
  await expect(screen).toBeVisible();
  expect(await keptAnswers(made.id)).toHaveLength(2);

  await page.keyboard.press("Enter");
  await question.getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("cell")).toHaveText([String(live), "Name: Bo Swimmer"]);
  await expect(rows.nth(0).getByRole("button"), "the focus is on the response that took its place").toBeFocused();
  await expect(screen.getByRole("status").filter({ hasText: /^The response sent Today, .* was deleted\.$/ })).toBeVisible();
  await expect(form).toHaveAccessibleName(`Form in Join, ${title}, 1 response`);
  expect((await keptAnswers(made.id)).map((kept) => kept.answers.email)).toEqual(["bo@example.org"]);

  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Page Builder CMS menu" })).toBeFocused();
});
