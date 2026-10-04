// Publishing from end to end, as the person editing and a visitor meet it,
// on the run's CMS: the e2e environment, which caches in Solid Cache and
// runs Solid Queue inside its server, as production does with
// SOLID_QUEUE_IN_PUMA. The person edits and publishes; a visitor in a
// browser of its own (helpers/visitor.ts, its HTTP cache on) gets the
// page with an ETag, then a 304; one block changed and published, the
// visitor's next visit gets the new page, and the CMS has drawn again only
// that block and the column, the section and the page around it, the rest
// read back from Solid Cache (counted in its database,
// helpers/cms-store.ts). Then a publish set for a time goes live at that
// time, for the same visitor; and one cancelled from the Publish menu
// does nothing when its time comes, its job having run.
import type { APIRequestContext, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { fragments, publishJob } from "./helpers/cms-store.ts";
import { retitle } from "./helpers/heading.ts";
import { schedule, siteTime } from "./helpers/schedule.ts";
import { cms, column, expect, heading, makePage, open, saved, section, test, unique } from "./helpers/site.ts";
import { directives, visitor, type Visit } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// Three headings in two columns of one section: six blocks and the page.
// Their words are this test's own: Solid Cache shares a block between the
// pages that hold the same one, and the counts below must be this page's.
function tidePage(own: string) {
  return [section("s", "Tides", [
    column("c1", [heading("h", `High water ${own}`), heading("h2", `Low water ${own}`)]),
    column("c2", [heading("h3", `Slack water ${own}`)]),
  ])];
}

const status = (page: Page) => page.locator(".topbar .tb-status");

async function publish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(status(page)).toHaveText("Published");
}

interface Schedule {
  id: number;
  state: string;
}

async function schedulesOf(request: APIRequestContext, id: number): Promise<Schedule[]> {
  const answer = await request.get(`${cms()}/api/pages/${id}/schedules`);
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { schedules: Schedule[] }).schedules;
}

test("edit, publish, visit, revisit, one block changed and published; a publish set for a time goes live, one cancelled does not", async ({ page, request, browser }) => {
  // Two publishes a few seconds ahead, each waited for.
  test.setTimeout(180_000);
  const own = unique("tides");
  const words = (stem: string) => `${stem} ${own}`;
  const { id, slug } = await makePage(request, "Tide table", tidePage(own));
  const live = `${cms()}/${slug}`;

  // Edit, publish.
  await open(page, id);
  await retitle(page, words("Spring tides"));
  await saved(page);
  await publish(page);

  const reader = await visitor(browser);
  const sees = async (stem: string) => expect(reader.tab.getByRole("heading", { name: words(stem), exact: true })).toBeVisible();
  try {
    // Visit: the page, kept by any cache and asked for again every time,
    // with an ETag; the CMS draws its six blocks and keeps each, and the
    // page whole.
    let before = await fragments();
    const first = await reader.visit(live);
    expect([first.status, first.sent]).toEqual([200, undefined]);
    expect(directives(first.cacheControl)).toEqual(["max-age=0", "must-revalidate", "public"]);
    expect(first.etag).toMatch(/^W\/"[0-9a-f]+"$/);
    await sees("Spring tides");
    expect(await fragments() - before, "the page and its six blocks kept").toBe(7);

    // Revisit: the browser sends its ETag back and keeps its copy; the
    // CMS reads nothing to say so.
    before = await fragments();
    const again = await reader.visit(live);
    expect([again.status, again.sent]).toEqual([304, first.etag]);
    await sees("Spring tides");
    expect(await fragments() - before).toBe(0);

    // One block changed and published: the next visit, still sending the
    // old ETag, gets the new page; of its six blocks the CMS draws again
    // the heading, its column and its section, and the page around them,
    // and reads the other three from the cache.
    await retitle(page, words("Neap tides"));
    await saved(page);
    await publish(page);
    before = await fragments();
    const changed = await reader.visit(live);
    expect([changed.status, changed.sent]).toEqual([200, first.etag]);
    expect(changed.etag).not.toBe(first.etag);
    await sees("Neap tides");
    await sees("Low water");
    await sees("Slack water");
    await expect(reader.tab.getByRole("heading", { name: words("Spring tides") })).toHaveCount(0);
    expect(await fragments() - before, "the heading, its column, its section and the page; the other column and heading reused").toBe(4);
    const kept = await reader.visit(live);
    expect([kept.status, kept.sent]).toEqual([304, changed.etag]);

    // A publish set a few seconds ahead from the Publish menu: the
    // visitor gets the page once its time has come, and not before.
    await retitle(page, words("Ebb tides"));
    await saved(page);
    const due = siteTime(8_000);
    await schedule(page, due);
    await expect(status(page)).toHaveText(`Published, 1 change not live · scheduled for ${due.said}`);
    const waiting = await reader.visit(live);
    expect(waiting.status).toBe(304);
    before = await fragments();
    let fired: Visit | undefined;
    await expect.poll(async () => {
      fired = await reader.visit(live);
      return fired.status;
    }, { timeout: 45_000, intervals: [1_000] }).toBe(200);
    expect(Date.now()).toBeGreaterThanOrEqual(due.instant);
    expect(fired!.sent).toBe(changed.etag);
    await sees("Ebb tides");
    expect(await fragments() - before, "a scheduled publish reuses the cache as one by hand does").toBe(4);
    await expect(status(page)).toHaveText("Published", { timeout: 30_000 });
    expect((await schedulesOf(request, id)).map((s) => s.state)).toEqual(["published"]);

    // Another, cancelled from the Publish menu before its time: its job
    // runs at that time and does nothing, and the visitor's copy stays
    // good.
    await retitle(page, words("Never live"));
    await saved(page);
    const cancelledAt = siteTime(6_000);
    await schedule(page, cancelledAt);
    await expect(status(page)).toHaveText(`Published, 1 change not live · scheduled for ${cancelledAt.said}`);
    await page.getByRole("button", { name: "More publish options" }).click();
    await page.getByRole("menu", { name: "Publish options" }).getByRole("menuitem", { name: /^Cancel scheduled publish/ }).click();
    await expect(page.locator(".notice")).toHaveText(/^Scheduled publish cancelled: the live page stays as it is\./);
    await expect(status(page)).toHaveText("Published, 1 change not live");
    const [cancelled, done] = await schedulesOf(request, id);
    expect([cancelled!.state, done!.state]).toEqual(["cancelled", "published"]);
    await expect.poll(async () => (await publishJob(cancelled!.id)).map((job) => job.finishedAt !== null), { timeout: 45_000, intervals: [1_000] }).toEqual([true]);
    const [job] = await publishJob(cancelled!.id);
    expect(Date.parse(`${job!.finishedAt!.replace(" ", "T")}Z`), "the job ran at its time, not before").toBeGreaterThanOrEqual(cancelledAt.instant);
    const after = await reader.visit(live);
    expect([after.status, after.sent]).toEqual([304, fired!.etag]);
    await sees("Ebb tides");
    await expect(reader.tab.getByRole("heading", { name: words("Never live") })).toHaveCount(0);
    expect(await (await request.get(live)).text()).not.toContain(words("Never live"));
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
});

test("the Publish menu with a publish waiting, and the Schedule dialog that moves it, have no serious axe finding", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Harbour notes", tidePage(unique("notes")));
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  await open(page, id);
  await retitle(page, "Harbour notes, revised");
  await saved(page);
  const later = siteTime(60 * 60_000);
  await schedule(page, later);

  // The menu with every item it can have: Publish now, Schedule… with the
  // time set, its cancel, and the live page.
  await page.getByRole("button", { name: "More publish options" }).click();
  const menu = page.getByRole("menu", { name: "Publish options" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Publish now/, new RegExp(`^Schedule…Set for ${later.said}`), /^Cancel scheduled publish/, /^View live page/]);
  for (const [state, part] of [["the Publish menu with a publish waiting", undefined], ["the menu alone", ".menu-publish"]] as const) {
    const report = await axe(page, part ? { include: part } : {});
    for (const line of report.other) console.log(`${state}: ${line}`);
    expect(report.passes, `${state}: axe ran its rules`).toBeGreaterThan(5);
    expect(report.serious, state).toEqual([]);
  }

  // Schedule… again: the dialog, holding the time already set.
  await menu.getByRole("menuitem", { name: /^Schedule…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule your changes" });
  await expect(dialog.getByLabel("Date")).toHaveValue(new RegExp(`^[A-Z][a-z]{2}, ${later.date}$`));
  await expect(dialog.getByLabel("Time")).toHaveValue(later.time);
  const report = await axe(page);
  expect(report.passes).toBeGreaterThan(10);
  expect(report.serious, "the Schedule dialog over a publish waiting").toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // And the cancel, by the keyboard alone.
  await page.getByRole("button", { name: "More publish options" }).focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  for (let i = 0; i < 4 && !(await menu.getByRole("menuitem", { name: /^Cancel scheduled publish/ }).evaluate((item) => item === document.activeElement)); i += 1) await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /^Cancel scheduled publish/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Published, 1 change not live");
  await expect(page.getByRole("button", { name: "More publish options" })).toBeFocused();
  expect((await schedulesOf(request, id)).map((s) => s.state)).toEqual(["cancelled"]);
});
