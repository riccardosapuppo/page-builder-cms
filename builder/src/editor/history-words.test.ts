// The history panel's words: a step's or a version's time as a person reads
// it, relative to the clock's day in the time zone named; a version's kind,
// name and live mark from what the CMS keeps of it, with no author; the
// draft's line; what a version's name may be.
// @vitest-environment node
import { expect, test } from "vitest";
import type { Version } from "../storage/adapter.ts";
import { draftLine, nameProblem, serverTime, stepTime, timeInSentence, versionInSentence, versionWords } from "./history-words.ts";

// 2 October 2026, 10:46 in UTC.
const NOW = Date.UTC(2026, 9, 2, 10, 46);
const at = (iso: string) => Date.parse(iso);

test("a time reads Today or Yesterday by the day it falls on where the person is, else its date, with the year only when it is not this one", () => {
  expect(stepTime(at("2026-10-02T10:46:00Z"), NOW, "UTC")).toBe("Today, 10:46 AM");
  expect(stepTime(at("2026-10-02T00:05:00Z"), NOW, "UTC")).toBe("Today, 12:05 AM");
  expect(stepTime(at("2026-10-01T21:15:00Z"), NOW, "UTC")).toBe("Yesterday, 9:15 PM");
  expect(stepTime(at("2026-09-28T07:02:00Z"), NOW, "UTC")).toBe("Sep 28, 7:02 AM");
  expect(stepTime(at("2025-12-30T16:10:00Z"), NOW, "UTC")).toBe("Dec 30, 2025, 4:10 PM");
  // The same moments, where the day had already turned: 21:15 UTC on the
  // 1st is 6:15 the next morning in Tokyo, the day the clock is on there.
  expect(stepTime(at("2026-10-01T21:15:00Z"), NOW, "Asia/Tokyo")).toBe("Today, 6:15 AM");
  expect(stepTime(at("2026-10-02T00:05:00Z"), NOW, "America/Los_Angeles")).toBe("Yesterday, 5:05 PM");
  expect(serverTime("2026-10-02T09:58:00.000Z", NOW, "UTC")).toBe("Today, 9:58 AM");
  expect(serverTime("not a time", NOW, "UTC")).toBe("not a time");
  expect(timeInSentence("2026-10-02T09:58:00.000Z", NOW, "UTC")).toBe("today at 9:58 AM");
  expect(timeInSentence("2026-10-01T21:15:00Z", NOW, "UTC")).toBe("yesterday at 9:15 PM");
  expect(timeInSentence("2026-09-28T07:02:00Z", NOW, "UTC")).toBe("on Sep 28 at 7:02 AM");
  expect(timeInSentence("2025-12-30T16:10:00Z", NOW, "UTC")).toBe("on Dec 30, 2025 at 4:10 PM");
});

test("a version inside a sentence goes by its name, else by how and when it was made", () => {
  const named = { number: 4, reason: "manual", name: "Before the winter series", restoredFrom: null, createdAt: "2026-10-02T10:20:00Z", published: false } as const;
  expect(versionInSentence(named, NOW, "UTC")).toBe("“Before the winter series”, saved today at 10:20 AM");
  expect(versionInSentence({ ...named, name: null, reason: "auto", createdAt: "2026-10-02T09:58:00Z" }, NOW, "UTC")).toBe("the version autosaved today at 9:58 AM");
  expect(versionInSentence({ ...named, name: null, reason: "publish", createdAt: "2026-09-28T07:02:00Z" }, NOW, "UTC")).toBe("the version published on Sep 28 at 7:02 AM");
  expect(versionInSentence({ ...named, name: null, reason: "before-restore" }, NOW, "UTC")).toBe("the version kept before a restore today at 10:20 AM");
  expect(versionInSentence({ ...named, name: null, reason: "scheduled" }, NOW, "UTC")).toBe("the version kept for a scheduled publish today at 10:20 AM");
  expect(versionWords({ ...named, name: null, reason: "scheduled" }, [], NOW, "UTC")).toMatchObject({ kind: "Kept for a scheduled publish", name: null, when: "Today, 10:20 AM" });
});

const version = (number: number, reason: Version["reason"], createdAt: string, extra: Partial<Version> = {}): Version => ({
  number, reason, name: null, restoredFrom: null, createdAt, published: false, ...extra,
});

test("a version is named by why it was made, its name and its time, and the live one says so; nobody is its author", () => {
  const list: Version[] = [
    version(7, "restore", "2026-10-02T10:50:00Z", { restoredFrom: 2 }),
    version(6, "before-restore", "2026-10-02T10:50:00Z"),
    version(5, "restore", "2026-10-02T10:30:00Z", { restoredFrom: 1 }),
    version(4, "manual", "2026-10-02T10:20:00Z", { name: "Before the winter series" }),
    version(3, "auto", "2026-10-02T09:58:00Z"),
    version(2, "publish", "2026-09-28T07:02:00Z", { published: true }),
    version(1, "manual", "2026-09-27T21:15:00Z"),
  ];
  const words = (v: Version) => versionWords(v, list, NOW, "UTC");
  expect(words(list[3]!)).toEqual({ kind: "Saved", name: "Before the winter series", when: "Today, 10:20 AM", live: false, sentence: "Saved, Before the winter series, Today, 10:20 AM" });
  expect(words(list[4]!)).toMatchObject({ kind: "Autosaved", name: null, when: "Today, 9:58 AM", sentence: "Autosaved, Today, 9:58 AM" });
  expect(words(list[5]!)).toMatchObject({ kind: "Published", name: null, live: true, sentence: "Published, Sep 28, 7:02 AM, live now" });
  expect(words(list[6]!)).toMatchObject({ kind: "Saved", name: null, when: "Sep 27, 9:15 PM" });
  expect(words(list[1]!)).toMatchObject({ kind: "Before restoring", name: null, when: "Today, 10:50 AM" });
  // A restore says what it copied back, by that version's own words.
  expect(words(list[0]!).name).toBe("From Sep 28, 7:02 AM");
  expect(words(list[2]!).name).toBe("From Sep 27, 9:15 PM");
  const named = versionWords(version(9, "restore", "2026-10-02T10:55:00Z", { restoredFrom: 4 }), list, NOW, "UTC");
  expect(named.name).toBe("From “Before the winter series”, Today, 10:20 AM");
  // A source no longer kept is named by its number.
  expect(versionWords(version(9, "restore", "2026-10-02T10:55:00Z", { restoredFrom: 40 }), list, NOW, "UTC").name).toBe("From version 40");
  for (const v of list) expect(words(v).sentence).not.toMatch(/\bby\b|\byou\b/i);
});

test("the draft's line says how far it is from the live page", () => {
  expect(draftLine(false, 0)).toBe("Not published yet");
  expect(draftLine(true, 0)).toBe("The same as the live page");
  expect(draftLine(true, 1)).toBe("1 change not published yet");
  expect(draftLine(true, 6)).toBe("6 changes not published yet");
});

test("a version's name is one line of at most 80 characters, counted as characters; an empty one is no name", () => {
  expect(nameProblem("")).toBeNull();
  expect(nameProblem("   ")).toBeNull();
  expect(nameProblem("Before the winter series")).toBeNull();
  expect(nameProblem("Two\nlines")).toBe("A name is one line.");
  expect(nameProblem("x".repeat(80))).toBeNull();
  expect(nameProblem("x".repeat(81))).toBe("A name has at most 80 characters.");
  // 80 characters that are two UTF-16 units each still fit.
  expect(nameProblem("🌊".repeat(80))).toBeNull();
});
