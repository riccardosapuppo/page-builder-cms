// The words of the history panel (./HistoryPanel.tsx), in the editor's one
// locale, en-US: when a step or a version happened, as a person reads a
// time ("Today, 10:46 AM"), and what a version is, from what the CMS keeps
// of it: why it was made, when, and the name given to it (PIANO, the
// model). No author: the CMS has no people, so nothing is "by you".
//
// Plain functions of their arguments, the clock's time among them, so the
// tests give the time and the time zone they mean.
import type { Version } from "../storage/adapter.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// The calendar day of a time in a time zone, as "2026-10-02".
function dayOf(at: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function yearOf(at: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(at);
}

// "Today, 10:46 AM", "Yesterday, 9:58 PM", "Sep 28, 7:02 AM", and with the
// year when it is not this one: "Dec 30, 2025, 4:10 PM". `at` and `now` are
// times on the clock (ms since 1970); `timeZone` is the browser's unless a
// test names one.
export function stepTime(at: number, now: number, timeZone?: string): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  const day = dayOf(at, timeZone);
  if (day === dayOf(now, timeZone)) return `Today, ${time}`;
  if (day === dayOf(now - DAY_MS, timeZone)) return `Yesterday, ${time}`;
  const sameYear = yearOf(at, timeZone) === yearOf(now, timeZone);
  const date = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at);
  return `${date}, ${time}`;
}

// The same for a time the CMS wrote (ISO 8601); a string that is no time
// is shown as it came.
export function serverTime(iso: string, now: number, timeZone?: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? iso : stepTime(at, now, timeZone);
}

// The same time inside a sentence: "today at 10:46 AM", "yesterday at
// 9:58 PM", "on Sep 28 at 7:02 AM".
export function timeInSentence(iso: string, now: number, timeZone?: string): string {
  const shown = serverTime(iso, now, timeZone);
  const comma = shown.lastIndexOf(", ");
  if (comma === -1) return shown;
  const day = shown.slice(0, comma);
  const time = shown.slice(comma + 2);
  if (day === "Today" || day === "Yesterday") return `${day.toLowerCase()} at ${time}`;
  return `on ${day} at ${time}`;
}

const MADE: Readonly<Record<Version["reason"], string>> = {
  publish: "published",
  manual: "saved",
  auto: "autosaved",
  restore: "restored",
  "before-restore": "kept before a restore",
};

// A version inside a sentence, by its name or else by how it was made, and
// when: "“First draft”, saved on Sep 27 at 9:15 PM", "the version
// autosaved today at 9:58 AM".
export function versionInSentence(version: Version, now: number, timeZone?: string): string {
  const at = timeInSentence(version.createdAt, now, timeZone);
  return version.name === null ? `the version ${MADE[version.reason]} ${at}` : `“${version.name}”, ${MADE[version.reason]} ${at}`;
}

export interface VersionWords {
  // Why it was made: "Published", "Saved", "Autosaved", "Restored",
  // "Before restoring".
  kind: string;
  // The name given to it, quoted as given; or, for a restore, what it was
  // restored from; null when there is nothing more to say.
  name: string | null;
  when: string;
  // The version visitors see now.
  live: boolean;
  // The whole row in one sentence, for the Restore button's name.
  sentence: string;
}

// What a version is, in words. `all` is the page's list, newest first, in
// which a restore finds the version it copied back.
export function versionWords(version: Version, all: readonly Version[], now: number, timeZone?: string): VersionWords {
  const when = serverTime(version.createdAt, now, timeZone);
  const live = version.published;
  let kind: string;
  let name: string | null = version.name;
  switch (version.reason) {
    case "publish":
      kind = "Published";
      break;
    case "manual":
      kind = "Saved";
      break;
    case "auto":
      kind = "Autosaved";
      break;
    case "restore": {
      kind = "Restored";
      const source = version.restoredFrom === null ? undefined : all.find((v) => v.number === version.restoredFrom);
      if (source) name = `From ${source.name === null ? "" : `“${source.name}”, `}${serverTime(source.createdAt, now, timeZone)}`;
      else if (version.restoredFrom !== null) name = `From version ${version.restoredFrom}`;
      break;
    }
    case "before-restore":
      kind = "Before restoring";
      break;
  }
  const sentence = `${kind}${name === null ? "" : `, ${name}`}, ${when}${live ? ", live now" : ""}`;
  return { kind, name, when, live, sentence };
}

// The line under "Current draft": how far the draft is from what is live.
export function draftLine(published: boolean, changesNotLive: number): string {
  if (!published) return "Not published yet";
  if (changesNotLive === 0) return "The same as the live page";
  return `${changesNotLive} ${changesNotLive === 1 ? "change" : "changes"} not published yet`;
}

// A version name as the CMS takes it: one line, something visible in it,
// at most NAME_MAX characters. The empty name is no name.
export const NAME_MAX = 80;

export function nameProblem(name: string): string | null {
  if (name.trim() === "") return null;
  if (/[\r\n]/.test(name)) return "A name is one line.";
  if ([...name].length > NAME_MAX) return `A name has at most ${NAME_MAX} characters.`;
  return null;
}
