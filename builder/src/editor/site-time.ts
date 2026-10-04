// The site's time: a scheduled publish is set and shown in the site's time
// zone (the CMS's config.time_zone, an IANA name the CMS gives as
// Site.timeZone), the same for every visitor and whatever the browser's own
// zone, while the CMS takes and gives the time in UTC.
//
// A wall-clock time in a zone with summer time is not always one instant:
// the hour the clocks go forward does not happen at all, and the hour they
// go back happens twice. toInstant says which, so the dialog can ask for
// another time, or say which of the two it took.
//
// Plain functions of their arguments; the zone and the time come from the
// caller, so the tests give the ones they mean. Intl is the only source of
// the zones' rules: the browser's, kept up to date with it.

export interface WallClock {
  year: number;
  // 1 to 12.
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function formatIn(zone: string): Intl.DateTimeFormat {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formats.set(zone, format);
  }
  return format;
}

// Whether the browser knows the zone by that name.
export function knownZone(zone: string): boolean {
  try {
    formatIn(zone);
    return true;
  } catch {
    return false;
  }
}

// The wall clock in `zone` at an instant (ms since 1970, UTC).
export function wallClockAt(zone: string, instant: number): WallClock {
  const parts = Object.fromEntries(formatIn(zone).formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

const asUtc = (clock: WallClock): number => Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);

// How far ahead of UTC the zone's clocks are at an instant, in minutes:
// 60 in London in summer, 0 in winter.
export function offsetAt(zone: string, instant: number): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc(wallClockAt(zone, whole)) - whole) / 60_000);
}

// "UTC+1", "UTC-5", "UTC+5:30", "UTC+0".
export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${rest === 0 ? "" : `:${String(rest).padStart(2, "0")}`}`;
}

export type Instant =
  | { kind: "one"; instant: number }
  // The clocks went back: the time happened twice. `instant` is the first,
  // `later` the second.
  | { kind: "twice"; instant: number; later: number }
  // The clocks went forward over it: it never happened in this zone.
  | { kind: "never" };

// The instant, or instants, the wall clock shows in `zone`. A zone's
// offset is tried as it is a day either side of the time, which covers
// every change of the clocks there is.
export function toInstant(zone: string, clock: WallClock): Instant {
  const naive = asUtc(clock);
  const day = 86_400_000;
  const offsets = new Set([offsetAt(zone, naive - day), offsetAt(zone, naive), offsetAt(zone, naive + day)]);
  const found = [...offsets]
    .map((offset) => naive - offset * 60_000)
    .filter((instant) => asUtc(wallClockAt(zone, instant)) === naive)
    .sort((a, b) => a - b);
  const [first, second] = found;
  if (first === undefined) return { kind: "never" };
  if (second === undefined || second === first) return { kind: "one", instant: first };
  return { kind: "twice", instant: first, later: second };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const weekday = (clock: Pick<WallClock, "year" | "month" | "day">): string => DAYS[new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay()]!;

// "Sun, Oct 4, 2026", as the dialog's Date field shows it.
export function dateText(clock: Pick<WallClock, "year" | "month" | "day">): string {
  return `${weekday(clock)}, ${MONTHS[clock.month - 1]} ${clock.day}, ${clock.year}`;
}

// "6:15 AM", or "6:15:30 AM" when the seconds are not zero.
export function timeText(clock: Pick<WallClock, "hour" | "minute" | "second">): string {
  const hour = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
  const seconds = clock.second === 0 ? "" : `:${String(clock.second).padStart(2, "0")}`;
  return `${hour}:${String(clock.minute).padStart(2, "0")}${seconds} ${clock.hour < 12 ? "AM" : "PM"}`;
}

// "Oct 4".
export function monthDay(clock: Pick<WallClock, "month" | "day">): string {
  return `${MONTHS[clock.month - 1]} ${clock.day}`;
}

// "Oct 4 at 6:15 AM", for the Schedule button and the sentences around it.
export function shortWhen(clock: WallClock): string {
  return `${monthDay(clock)} at ${timeText(clock)}`;
}

// A time the CMS gave (ISO 8601, UTC) as the site's clock shows it, with
// its offset: "Oct 5 at 7:15 AM (UTC+1)". A string that is no time is
// shown as it came.
export function siteWhen(zone: string, iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return iso;
  return `${shortWhen(wallClockAt(zone, instant))} (${offsetLabel(offsetAt(zone, instant))})`;
}

const realDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// A date as a person types it in en-US: "Sun, Oct 4, 2026", "Oct 4, 2026",
// "October 4 2026", "10/4/2026" (month first), or "2026-10-04". The
// weekday, when given, must be the date's. null for anything else, a date
// that does not exist included.
export function parseDate(text: string): Pick<WallClock, "year" | "month" | "day"> | null {
  const typed = text.trim().replace(/\s+/g, " ");
  let year: number;
  let month: number;
  let day: number;
  let iso: RegExpMatchArray | null;
  let slashed: RegExpMatchArray | null;
  let named: RegExpMatchArray | null;
  if ((iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typed))) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if ((slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(typed))) {
    [month, day, year] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])];
  } else if ((named = /^(?:([A-Za-z]+),? )?([A-Za-z]+)\.? (\d{1,2}),? (\d{4})$/.exec(typed))) {
    const month0 = startOf(FULL_MONTHS, named[2]!);
    if (month0 === -1) return null;
    [year, month, day] = [Number(named[4]), month0 + 1, Number(named[3])];
    if (named[1] !== undefined && (!realDate(year, month, day) || startOf(FULL_DAYS, named[1]) !== DAYS.indexOf(weekday({ year, month, day })))) return null;
  } else {
    return null;
  }
  return realDate(year, month, day) ? { year, month, day } : null;
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The name a word begins, three letters at least ("Oct", "octob",
// "October"), as its index; -1 for none.
function startOf(names: readonly string[], word: string): number {
  if (word.length < 3) return -1;
  return names.findIndex((name) => name.toLowerCase().startsWith(word.toLowerCase()));
}

// A time as a person types it: "6:15 AM", "6:15am", "6 PM", "18:15",
// "06:15", with seconds if wanted ("6:15:30 AM"). null for anything else.
export function parseTime(text: string): Pick<WallClock, "hour" | "minute" | "second"> | null {
  const typed = text.trim().replace(/\s+/g, " ");
  const match = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))? ?([AaPp]\.?[Mm]\.?)?$/.exec(typed);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const half = match[4]?.[0]?.toLowerCase();
  if (match[2] === undefined && half === undefined) return null;
  if (minute > 59 || second > 59) return null;
  if (half !== undefined) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute, second };
}
