// Small words the editor's parts say alike, in its one locale, en-US: a
// day as a person names it, against the clock's day, and a list inside a
// sentence. The history (./history-words.ts), the media library
// (./library/words.ts) and the keymap's notes (./keymap.ts) take them from
// here, so a time or a list reads the same wherever it is shown.
//
// Plain functions of their arguments, the clock's time among them.

const DAY_MS = 24 * 60 * 60 * 1000;

// The calendar day of a time in a time zone, as "2026-10-02".
function dayOf(at: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

// "Today", "Yesterday", "Sep 28", and with the year when it is not this
// one, "Dec 30, 2025". `at` and `now` are times on the clock (ms since
// 1970); `timeZone` is the browser's unless a test names one.
export function dayWords(at: number, now: number, timeZone?: string): string {
  const day = dayOf(at, timeZone);
  const today = dayOf(now, timeZone);
  if (day === today) return "Today";
  if (day === dayOf(now - DAY_MS, timeZone)) return "Yesterday";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at);
}

// "A", "A and B", "A, B and C".
export function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)!}`;
}
