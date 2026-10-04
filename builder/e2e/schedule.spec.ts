// Scheduled publishing in Chromium, against the run's CMS, whose Solid
// Queue runs inside its server (cms/config/puma.rb): the Publish menu's
// Schedule… sets a time a few seconds ahead, in the site's time zone
// (Europe/London, while this browser runs in UTC), and the real job puts
// the page live then: the test watches the page a visitor gets until it
// changes. What goes live is the draft as it was when scheduled, not an
// edit made after. A schedule cancelled from the history does nothing at
// its time: a second page, scheduled for a little later, going live shows
// the queue has passed the cancelled one's time.
import type { APIRequestContext, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { retitle } from "./helpers/heading.ts";
import { cms, column, drawer, expect, heading, makePage, open, saved, section, test } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });
// Two publishes a few seconds ahead each, and the editor reading the page
// again after them.
test.setTimeout(120_000);

const ZONE = "Europe/London";
const fixture = (words: string) => [section("s", "Story", [column("c", [heading("h", words)])])];

// A whole second `ms` from now as the dialog's two fields take it, and as
// its button and the top bar say it, in the site's zone: "Oct 4, 2026",
// "4:25:13 PM", "Oct 4 at 4:25:13 PM" (no ":00" for a whole minute, as the
// editor writes it). The seconds are kept: the dialog reads them, and a
// schedule a few seconds ahead needs them.
function siteTime(ms: number): { instant: number; date: string; time: string; said: string } {
  const instant = Math.ceil((Date.now() + ms) / 1000) * 1000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  const day = `${parts.month} ${parts.day}`;
  const time = `${parts.hour}:${parts.minute}${parts.second === "00" ? "" : `:${parts.second}`} ${parts.dayPeriod}`;
  return { instant, date: `${day}, ${parts.year}`, time, said: `${day} at ${time}` };
}

async function schedule(page: Page, when: { date: string; time: string; said: string }): Promise<void> {
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menu", { name: "Publish options" }).getByRole("menuitem", { name: /^Schedule…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule your changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Date").fill(when.date);
  await dialog.getByLabel("Time").fill(when.time);
  await dialog.getByRole("button", { name: `Schedule for ${when.said}` }).click();
  await expect(dialog).toBeHidden();
}

const served = async (request: APIRequestContext, slug: string) => {
  const response = await request.get(`${cms()}/${slug}`);
  return { status: response.status(), body: await response.text() };
};

test("a publish scheduled a few seconds ahead goes live at its time, with the draft as it was then; the editor sees it happen", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Tide table", fixture("High water at seven"));
  await open(page, id);
  await expect(page.locator(".topbar .tb-status")).toHaveText("Not published yet");

  // The dialog, as the design draws it, with the site's zone named, and
  // nothing serious for axe.
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menuitem", { name: /^Schedule…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule your changes" });
  await expect(dialog.getByLabel("Date")).toBeFocused();
  await expect(dialog.locator(".tz")).toHaveText(/^In your site’s time \(UTC[+-]\d+\), the same for every visitor\.Change$/);
  const report = await axe(page, { include: ".dlg-schedule" });
  expect(report.serious).toEqual([]);
  expect(report.passes).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "More publish options" })).toBeFocused();

  const when = siteTime(8_000);
  await schedule(page, when);
  await expect(page.locator(".topbar .tb-status")).toHaveText(`Not published yet · scheduled for ${when.said}`);
  const history = await drawer(page, "History");
  await expect(history.getByRole("listitem").filter({ hasText: /^Scheduled publish/ })).toContainText(`Goes live ${when.said}`);

  // Edited after scheduling: saved, and not for this publish.
  await retitle(page, "Edited after scheduling");
  await saved(page);
  expect((await served(request, slug)).status).toBe(404);

  // The real job, at its time: the visitor's page changes.
  await expect.poll(async () => (await served(request, slug)).status, { timeout: 45_000, intervals: [500] }).toBe(200);
  const live = (await served(request, slug)).body;
  expect(live).toContain("High water at seven");
  expect(live).not.toContain("Edited after scheduling");

  // The editor reads the page again once the time has passed.
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published, 1 change not live", { timeout: 30_000 });
  const schedules = (await (await request.get(`${cms()}/api/pages/${id}/schedules`)).json()) as { schedules: Array<{ state: string }> };
  expect(schedules.schedules.map((s) => s.state)).toEqual(["published"]);
});

test("a scheduled publish cancelled from the history does nothing at its time", async ({ page, request }) => {
  const kept = await makePage(request, "Harbour notes", fixture("Old words"));
  expect((await request.post(`${cms()}/api/pages/${kept.id}/publish`, { data: {} })).status()).toBe(200);
  await open(page, kept.id);
  await retitle(page, "Words that never go live");
  await saved(page);
  const cancelledAt = siteTime(6_000);
  await schedule(page, cancelledAt);
  await expect(page.locator(".topbar .tb-status")).toHaveText(`Published, 1 change not live · scheduled for ${cancelledAt.said}`);

  const history = await drawer(page, "History");
  const cancel = history.getByRole("button", { name: /^Cancel the publish scheduled for / });
  await expect(cancel).toHaveAccessibleName(new RegExp(`^Cancel the publish scheduled for ${cancelledAt.said} \\(UTC[+-]\\d+\\)$`));
  await cancel.click();
  await expect(page.locator(".notice")).toHaveText(/^Scheduled publish cancelled: the live page stays as it is\./);
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published, 1 change not live");
  await expect(history.getByRole("listitem").filter({ hasText: /^Scheduled publish/ })).toHaveCount(0);

  // A second page, set for a little after the cancelled time, through the
  // API: once it is live, the queue has passed the cancelled one's time.
  const later = await makePage(request, "Sentinel", fixture("Later words"));
  const draft = (await (await request.get(`${cms()}/api/pages/${later.id}/draft`)).json()) as { revision: number };
  const at = new Date(Math.max(cancelledAt.instant, Date.now()) + 3_000).toISOString();
  const set = await request.post(`${cms()}/api/pages/${later.id}/schedules`, { data: { revision: draft.revision, at } });
  expect(set.status(), await set.text()).toBe(201);
  await expect.poll(async () => (await served(request, later.slug)).status, { timeout: 45_000, intervals: [500] }).toBe(200);

  const live = (await served(request, kept.slug)).body;
  expect(live).toContain("Old words");
  expect(live).not.toContain("Words that never go live");
  const schedules = (await (await request.get(`${cms()}/api/pages/${kept.id}/schedules`)).json()) as { schedules: Array<{ state: string }> };
  expect(schedules.schedules.map((s) => s.state)).toEqual(["cancelled"]);
});
