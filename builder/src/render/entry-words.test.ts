// An entry's values as a page writes them, the twin of EntryWords
// (cms/app/models/entry_words.rb), which the render contract holds to it:
// a day that exists, in the editor's words for one; a number as written,
// with its thousands grouped, nothing for what no number field keeps; a
// field by its key, the first one, of a type of the list.
import { expect, test } from "vitest";
import { dayOf, dayWords, fieldOf, numberWords, valueOf } from "./entry-words.ts";

test("a day is one that exists, written as the editor's lists write it: the day, the month's name, the year", () => {
  expect(["2026-10-15", "2024-02-29", "2026-02-29", "2026-13-01", "2026-1-5", "20261015", 20261015, null].map(dayOf)).toEqual(["2026-10-15", "2024-02-29", null, null, null, null, null, null]);
  expect(["2026-10-15", "2026-01-01", "2024-02-29", "2026-11-01", "0099-12-31"].map(dayWords)).toEqual(["15 October 2026", "1 January 2026", "29 February 2024", "1 November 2026", "31 December 99"]);
});

test("a number is written with its thousands grouped and no zero ending its decimals; one no number field keeps is not written", () => {
  expect([1250.5, 1_000_000_000, -1_000_000_000, -2.25, 0.05, 3, -0, 12.1, 999.99].map(numberWords)).toEqual(
    ["1,250.5", "1,000,000,000", "-1,000,000,000", "-2.25", "0.05", "3", "0", "12.1", "999.99"],
  );
  expect([0.125, 1_000_000_000.01, Number.POSITIVE_INFINITY, Number.NaN, "12", true, null].map(numberWords)).toEqual([null, null, null, null, null, null, null]);
});

test("a field is the first with its key, of a type of the list; a value is the entry's own", () => {
  const fields = [{ key: "day", label: "Day", type: "date" }, { key: "day", label: "Again", type: "text" }, { key: "odd", label: "Odd", type: "colour" }, "junk", { key: "bare", type: "toggle" }];
  expect(fieldOf(fields, "day")).toEqual({ key: "day", label: "Day", type: "date" });
  expect(fieldOf(fields, "odd")).toBeNull();
  expect(fieldOf(fields, "bare")).toEqual({ key: "bare", label: "", type: "toggle" });
  expect([fieldOf(fields, "gone"), fieldOf("not a list", "day"), fieldOf(fields, 7)]).toEqual([null, null, null]);
  expect([valueOf({ day: "2026-10-15" }, "day"), valueOf({ day: null }, "day"), valueOf({}, "day"), valueOf(["day"], "0")]).toEqual(["2026-10-15", null, undefined, undefined]);
});
