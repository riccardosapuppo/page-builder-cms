// The Schedule dialog (design/layout/shots-extra/schedule.png): its words,
// the date and time in the site's zone with that date's offset, what it
// sends, and what it refuses before sending: a time the clocks skip, a
// time gone, a date a year away; and the CMS's own refusal, at the field.
// The kit's clock stands at Fri Oct 2, 2026, 9:00 UTC: 10:00 AM in London.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { FieldError, Published, Schedule } from "../storage/adapter.ts";
import { firstOffer, planFrom, ScheduleDialog } from "./ScheduleDialog.tsx";
import type { OpenPage, Session } from "./session.tsx";

const LONDON = "Europe/London";
const NOW = Date.UTC(2026, 9, 2, 9);
const live: Published = { slug: "winter-series", versionNumber: 4, draftRevision: 3, publishedAt: "2026-09-28T07:02:00.000Z" };
const open = (changes: Partial<OpenPage> = {}): OpenPage => ({ id: 7, slug: "winter-series", home: false, published: live, revision: 9, links: { preview: "/preview/7", live: "/winter-series" }, ...changes });

function draw(session: Partial<Session> = {}) {
  const closed: number[] = [];
  const kit = editorKit({ document: page(), session: { current: open(), capabilities: { publish: true, schedule: true, responses: false, imageVariants: false, livePages: true }, ...session } });
  kit.ui.getState().setSite({ name: "Slack Water", menu: [], action: null, footer: { lead: "", text: "" }, timeZone: LONDON });
  kit.render(<ScheduleDialog onClose={() => closed.push(1)} />);
  return { kit, closed };
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

test("what the fields say becomes one instant in the site's zone, or the reason it cannot", () => {
  expect(planFrom(LONDON, "Sun, Oct 4, 2026", "6:15 AM", NOW)).toEqual({ kind: "ok", instant: Date.parse("2026-10-04T05:15:00Z"), clock: { year: 2026, month: 10, day: 4, hour: 6, minute: 15, second: 0 }, offset: 60, twice: false });
  expect(planFrom(LONDON, "Oct 25, 2026", "1:30 AM", NOW)).toMatchObject({ kind: "ok", instant: Date.parse("2026-10-25T00:30:00Z"), offset: 60, twice: true });
  expect(planFrom(LONDON, "Mar 29, 2027", "1:30 AM", NOW)).toMatchObject({ kind: "ok" });
  expect(planFrom(LONDON, "Mar 28, 2027", "1:30 AM", NOW)).toMatchObject({ kind: "never" });
  expect(planFrom(LONDON, "Oct 2, 2026", "10:00 AM", NOW)).toEqual({ kind: "past" });
  expect(planFrom(LONDON, "Oct 2, 2026", "10:00:01 AM", NOW)).toMatchObject({ kind: "ok" });
  expect(planFrom(LONDON, "Oct 2, 2027", "10:00 AM", NOW)).toMatchObject({ kind: "ok" });
  expect(planFrom(LONDON, "Oct 2, 2027", "10:00:01 AM", NOW)).toEqual({ kind: "far" });
  expect(planFrom(LONDON, "someday", "10:00 AM", NOW)).toEqual({ kind: "date" });
  expect(planFrom(LONDON, "Oct 4, 2026", "breakfast", NOW)).toEqual({ kind: "time" });
  // An hour on, on the next quarter hour.
  expect(new Date(firstOffer(NOW)).toISOString()).toBe("2026-10-02T10:00:00.000Z");
  expect(new Date(firstOffer(NOW + 60_000)).toISOString()).toBe("2026-10-02T10:15:00.000Z");
});

test("the dialog says what the design says, in the site's time, with the date's own offset", () => {
  draw();
  const dialog = screen.getByRole("dialog", { name: "Schedule your changes" });
  expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent)
    .toBe("Visitors see your 6 changes from the day and time you choose. Until then the live page stays as it is, and you can go on editing.");
  expect([field("Date").value, field("Time").value]).toEqual(["Fri, Oct 2, 2026", "11:00 AM"]);
  expect(document.activeElement).toBe(field("Date"));
  expect(dialog.querySelector(".tz")!.textContent).toBe("In your site’s time (UTC+1), the same for every visitor.Change");
  expect(screen.getByText("Changes you make after scheduling wait for the next publish.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Schedule for Oct 2 at 11:00 AM" })).toBeTruthy();

  type("Date", "Dec 1, 2026");
  type("Time", "6:15 pm");
  expect(dialog.querySelector(".tz strong")!.textContent).toBe("(UTC+0)");
  expect(screen.getByRole("button", { name: "Schedule for Dec 1 at 6:15 PM" })).toBeTruthy();
});

test("scheduling sends the instant in UTC through the session, and the dialog closes once it is set", async () => {
  const sent: string[] = [];
  const { closed } = draw({ schedulePublish: async (at) => { sent.push(at); return null; } });
  type("Date", "Sun, Oct 4, 2026");
  type("Time", "6:15 AM");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule for Oct 4 at 6:15 AM" })));
  expect(sent).toEqual(["2026-10-04T05:15:00.000Z"]);
  expect(closed).toEqual([1]);
});

test("a time the clocks skip, or one gone, is refused at the field and nothing is sent", async () => {
  const sent: string[] = [];
  const { closed } = draw({ schedulePublish: async (at) => { sent.push(at); return null; } });
  type("Date", "Mar 28, 2027");
  type("Time", "1:30 AM");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule" })));
  expect(field("Time").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("1:30 AM does not happen on Mar 28: the clocks go forward then. Choose another time.")).toBeTruthy();
  expect(document.activeElement).toBe(field("Time"));

  type("Date", "Oct 1, 2026");
  type("Time", "9:00 AM");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule" })));
  expect(screen.getByText("That time has passed. Choose a later one.")).toBeTruthy();

  type("Date", "next week");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule" })));
  expect(field("Date").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Write a date such as Oct 4, 2026.")).toBeTruthy();
  expect(sent).toEqual([]);
  expect(closed).toEqual([]);
});

test("a time the clocks repeat is the first of the two, and the dialog says so", () => {
  draw();
  type("Date", "Oct 25, 2026");
  type("Time", "1:30 AM");
  expect(screen.getByText("1:30 AM happens twice on Oct 25, as the clocks go back: this is the first, at UTC+1.")).toBeTruthy();
});

test("the CMS's refusal of the time shows under the Time field, and the dialog stays", async () => {
  const refusal: FieldError[] = [{ pointer: "/at", keyword: "inThePast", blockPointer: null, message: "must be later than now" }];
  const { closed } = draw({ schedulePublish: async () => refusal });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule for Oct 2 at 11:00 AM" })));
  expect(screen.getByText("The CMS refused this time: it must be later than now.")).toBeTruthy();
  expect(field("Time").getAttribute("aria-invalid")).toBe("true");
  expect(closed).toEqual([]);
});

test("a publish already waiting is offered again and said to be replaced; Change says where the zone is set", () => {
  const pending: Schedule = { id: 3, at: "2026-10-05T06:15:00.000Z", revision: 9, versionNumber: 12, state: "pending", createdAt: "2026-10-02T08:00:00.000Z", settledAt: null, publishedVersionNumber: null };
  draw({ current: open({ scheduled: pending }) });
  expect([field("Date").value, field("Time").value]).toEqual(["Mon, Oct 5, 2026", "7:15 AM"]);
  expect(screen.getByText("This replaces the publish scheduled for Oct 5 at 7:15 AM (UTC+1).")).toBeTruthy();

  const change = screen.getByRole("button", { name: "Change" });
  expect(change.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(change);
  expect(change.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById(change.getAttribute("aria-controls")!)!.textContent).toContain("The site’s time zone is Europe/London.");
});

test("a page never published is offered to go live; Cancel and Esc close the dialog sending nothing", () => {
  const sent: string[] = [];
  const { closed } = draw({ current: open({ published: null }), schedulePublish: async (at) => { sent.push(at); return null; } });
  expect(screen.getByText("Visitors see this page from the day and time you choose. Until then it stays unpublished, and you can go on editing.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.keyDown(field("Time"), { key: "Escape" });
  expect(closed).toEqual([1, 1]);
  expect(sent).toEqual([]);
});
