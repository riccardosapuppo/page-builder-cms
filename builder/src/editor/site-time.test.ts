// The site's time, in London, where the clocks go forward at 1:00 AM on
// the last Sunday of March and back at 2:00 AM on the last Sunday of
// October; and in two zones far from it.
// @vitest-environment node
import { expect, test } from "vitest";
import { dateText, knownZone, offsetAt, offsetLabel, parseDate, parseTime, shortWhen, timeText, toInstant, wallClockAt } from "./site-time.ts";

const LONDON = "Europe/London";
const at = (iso: string) => Date.parse(iso);
const clock = (year: number, month: number, day: number, hour: number, minute: number, second = 0) => ({ year, month, day, hour, minute, second });

test("a time on an ordinary day is one instant, an hour behind in summer and none in winter", () => {
  expect(toInstant(LONDON, clock(2026, 10, 4, 6, 15))).toEqual({ kind: "one", instant: at("2026-10-04T05:15:00Z") });
  expect(toInstant(LONDON, clock(2026, 12, 1, 6, 15))).toEqual({ kind: "one", instant: at("2026-12-01T06:15:00Z") });
  expect(offsetLabel(offsetAt(LONDON, at("2026-10-04T05:15:00Z")))).toBe("UTC+1");
  expect(offsetLabel(offsetAt(LONDON, at("2026-12-01T06:15:00Z")))).toBe("UTC+0");
});

test("the hour the clocks skip never happens, and the hour they repeat happens twice", () => {
  expect(toInstant(LONDON, clock(2026, 3, 29, 1, 30))).toEqual({ kind: "never" });
  expect(toInstant(LONDON, clock(2026, 3, 29, 0, 59, 59))).toEqual({ kind: "one", instant: at("2026-03-29T00:59:59Z") });
  expect(toInstant(LONDON, clock(2026, 3, 29, 2, 0))).toEqual({ kind: "one", instant: at("2026-03-29T01:00:00Z") });
  expect(toInstant(LONDON, clock(2026, 10, 25, 1, 30))).toEqual({ kind: "twice", instant: at("2026-10-25T00:30:00Z"), later: at("2026-10-25T01:30:00Z") });
  expect(toInstant(LONDON, clock(2026, 10, 25, 2, 0))).toEqual({ kind: "one", instant: at("2026-10-25T02:00:00Z") });
  // Each of the two reads back as the time asked for, under its own offset.
  expect(wallClockAt(LONDON, at("2026-10-25T00:30:00Z"))).toEqual(clock(2026, 10, 25, 1, 30));
  expect(wallClockAt(LONDON, at("2026-10-25T01:30:00Z"))).toEqual(clock(2026, 10, 25, 1, 30));
  expect([offsetAt(LONDON, at("2026-10-25T00:30:00Z")), offsetAt(LONDON, at("2026-10-25T01:30:00Z"))]).toEqual([60, 0]);
});

test("zones far from the site's own: half hours, and behind UTC", () => {
  expect(offsetLabel(offsetAt("Asia/Kolkata", at("2026-10-04T05:15:00Z")))).toBe("UTC+5:30");
  expect(offsetLabel(offsetAt("America/New_York", at("2026-10-04T05:15:00Z")))).toBe("UTC-4");
  expect(toInstant("America/New_York", clock(2026, 11, 1, 1, 30))).toEqual({ kind: "twice", instant: at("2026-11-01T05:30:00Z"), later: at("2026-11-01T06:30:00Z") });
  expect(knownZone("Nowhere/Atlantis")).toBe(false);
  expect(knownZone(LONDON)).toBe(true);
});

test("the fields show the date and the time as the design writes them", () => {
  expect(dateText({ year: 2026, month: 10, day: 4 })).toBe("Sun, Oct 4, 2026");
  expect(timeText({ hour: 6, minute: 15, second: 0 })).toBe("6:15 AM");
  expect(timeText({ hour: 0, minute: 5, second: 30 })).toBe("12:05:30 AM");
  expect(timeText({ hour: 12, minute: 0, second: 0 })).toBe("12:00 PM");
  expect(shortWhen(clock(2026, 10, 4, 18, 15))).toBe("Oct 4 at 6:15 PM");
});

test("a date typed in any of the usual en-US ways is read; a date that does not exist, or a wrong weekday, is not", () => {
  const oct4 = { year: 2026, month: 10, day: 4 };
  for (const typed of ["Sun, Oct 4, 2026", "Oct 4, 2026", "October 4 2026", "sunday, october 4, 2026", "10/4/2026", "2026-10-04", "  Oct  4,  2026 "]) {
    expect(parseDate(typed), typed).toEqual(oct4);
  }
  for (const typed of ["Mon, Oct 4, 2026", "Feb 30, 2026", "2026-13-01", "13/1/2026", "Oc 4, 2026", "tomorrow", "", "Oct 4"]) {
    expect(parseDate(typed), typed).toBeNull();
  }
});

test("a time typed with or without AM and PM, with or without seconds, is read; anything else is not", () => {
  expect(parseTime("6:15 AM")).toEqual({ hour: 6, minute: 15, second: 0 });
  expect(parseTime("6:15pm")).toEqual({ hour: 18, minute: 15, second: 0 });
  expect(parseTime("12:00 AM")).toEqual({ hour: 0, minute: 0, second: 0 });
  expect(parseTime("12:30 p.m.")).toEqual({ hour: 12, minute: 30, second: 0 });
  expect(parseTime("6 PM")).toEqual({ hour: 18, minute: 0, second: 0 });
  expect(parseTime("18:15")).toEqual({ hour: 18, minute: 15, second: 0 });
  expect(parseTime("06:15:30")).toEqual({ hour: 6, minute: 15, second: 30 });
  for (const typed of ["13:00 PM", "0:30 AM", "24:00", "6:60", "6", "noon", "", "6:15:61 AM"]) {
    expect(parseTime(typed), typed).toBeNull();
  }
});
