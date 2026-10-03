// The words the history, the media library and the keymap's notes share:
// a day against the clock's day, in a time zone the test names, and a
// list inside a sentence.
import { expect, test } from "vitest";
import { dayWords, listed } from "./plain-words.ts";

const NOW = Date.UTC(2026, 9, 2, 12, 0);
const at = (iso: string) => Date.parse(iso);

test("a day reads as today, yesterday, a date, and a date with its year when it is not this one", () => {
  expect(dayWords(at("2026-10-02T00:05:00Z"), NOW, "UTC")).toBe("Today");
  expect(dayWords(at("2026-10-01T23:59:00Z"), NOW, "UTC")).toBe("Yesterday");
  expect(dayWords(at("2026-09-30T23:59:00Z"), NOW, "UTC")).toBe("Sep 30");
  expect(dayWords(at("2026-01-01T00:00:00Z"), NOW, "UTC")).toBe("Jan 1");
  expect(dayWords(at("2025-12-31T23:59:00Z"), NOW, "UTC")).toBe("Dec 31, 2025");
  // The day is the time zone's: late on the 1st in UTC is the 2nd in
  // Tokyo, and early on the 2nd in UTC is the 1st in Los Angeles.
  expect(dayWords(at("2026-10-01T21:15:00Z"), NOW, "Asia/Tokyo")).toBe("Today");
  expect(dayWords(at("2026-10-02T00:05:00Z"), NOW, "America/Los_Angeles")).toBe("Yesterday");
});

test("lists read as a sentence", () => {
  expect([listed([]), listed(["A"]), listed(["A", "B"]), listed(["A", "B", "C"])]).toEqual(["", "A", "A and B", "A, B and C"]);
});
