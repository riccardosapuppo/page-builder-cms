// "Schedule…" from the Publish menu (design/layout/shots-extra/
// schedule.png): a small dialog of its own, a date and a time in the
// site's time zone (Site.timeZone), the offset that date has, what happens
// to edits made in between, Cancel and "Schedule for Oct 4 at 6:15 AM".
//
// The fields take what a person types (./site-time.ts reads it); the
// button says the time it will send, and the offset beside the zone
// follows the date, summer time or not. A time the clocks skip is refused
// at the field; a time they repeat is the first of the two, and the dialog
// says so. The CMS has the last word: a time it refuses comes back under
// the Time field.
//
// "Change" beside the zone opens a line on where the site's zone is set:
// the editor cannot change it (it is the CMS's, config/site.yml).
import { useId, useState, type FormEvent } from "react";
import type { FieldError } from "../storage/adapter.ts";
import { describedBy, ErrorList } from "./controls.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Dialog } from "./dialog.tsx";
import { Icon } from "./icons.tsx";
import { changesNotLive } from "./Publish.tsx";
import { changes, useSaveSnapshot } from "./SaveStatus.tsx";
import { useSession } from "./session.tsx";
import { dateText, monthDay, offsetAt, offsetLabel, parseDate, parseTime, shortWhen, siteWhen, timeText, toInstant, wallClockAt, type WallClock } from "./site-time.ts";
import "./schedule.css";

// How far ahead the CMS takes a publish (ScheduledPublication::FURTHEST):
// a year, counted the way the CMS counts it, by the calendar.
function aYearFrom(now: number): number {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.getTime();
}

// The time the dialog offers first: an hour from now, on the next quarter
// hour.
export function firstOffer(now: number): number {
  const quarter = 15 * 60_000;
  return Math.ceil((now + 60 * 60_000) / quarter) * quarter;
}

export type Plan =
  | { kind: "ok"; instant: number; clock: WallClock; offset: number; twice: boolean }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "never"; clock: WallClock }
  | { kind: "past" }
  | { kind: "far" };

// What the two fields say, in the site's zone, at `now`.
export function planFrom(zone: string, date: string, time: string, now: number): Plan {
  const day = parseDate(date);
  if (!day) return { kind: "date" };
  const hour = parseTime(time);
  if (!hour) return { kind: "time" };
  const clock = { ...day, ...hour };
  const found = toInstant(zone, clock);
  if (found.kind === "never") return { kind: "never", clock };
  if (found.instant <= now) return { kind: "past" };
  if (found.instant > aYearFrom(now)) return { kind: "far" };
  return { kind: "ok", instant: found.instant, clock, offset: offsetAt(zone, found.instant), twice: found.kind === "twice" };
}

export function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const { clock } = useEnv();
  const zone = useUi((u) => u.site?.timeZone) ?? "UTC";
  const snapshot = useSaveSnapshot();
  const id = useId();
  const page = session.current;
  const pending = page?.scheduled ?? null;
  const [offered] = useState(() => wallClockAt(zone, pending ? Date.parse(pending.at) : firstOffer(clock.now())));
  const [date, setDate] = useState(() => dateText(offered));
  const [time, setTime] = useState(() => timeText(offered));
  const [shown, setShown] = useState<{ date: string[]; time: string[]; other: string[] }>({ date: [], time: [], other: [] });
  const [explaining, setExplaining] = useState(false);
  const busy = session.scheduling;
  if (!page) return null;

  const plan = planFrom(zone, date, time, clock.now());
  const notLive = changesNotLive(page, snapshot);
  const offset = offsetLabel(plan.kind === "ok" ? plan.offset : offsetAt(zone, clock.now()));
  const lead = page.published
    ? `Visitors see your ${changes(Math.max(1, notLive))} from the day and time you choose. Until then the live page stays as it is, and you can go on editing.`
    : "Visitors see this page from the day and time you choose. Until then it stays unpublished, and you can go on editing.";

  // The fields' own problems, said under the field they are about.
  const problems = (): typeof shown => {
    switch (plan.kind) {
      case "date":
        return { date: ["Write a date such as Oct 4, 2026."], time: [], other: [] };
      case "time":
        return { date: [], time: ["Write a time such as 6:15 AM."], other: [] };
      case "never":
        return { date: [], time: [`${timeText(plan.clock)} does not happen on ${monthDay(plan.clock)}: the clocks go forward then. Choose another time.`], other: [] };
      case "past":
        return { date: [], time: ["That time has passed. Choose a later one."], other: [] };
      case "far":
        return { date: ["Choose a day within a year from now."], time: [], other: [] };
      case "ok":
        return { date: [], time: [], other: [] };
    }
  };

  const fromServer = (errors: FieldError[]): typeof shown => ({
    date: [],
    time: errors.filter((e) => e.pointer === "/at").map((e) => `The CMS refused this time: it ${e.message}.`),
    other: errors.filter((e) => e.pointer !== "/at").map((e) => (e.pointer === "/revision" ? "Nothing to schedule: visitors already see this draft." : e.message)),
  });

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const own = problems();
    setShown(own);
    if (plan.kind !== "ok") {
      document.getElementById(own.date.length > 0 ? `${id}-date` : `${id}-time`)?.focus();
      return;
    }
    const refused = await session.schedulePublish(new Date(plan.instant).toISOString());
    if (refused) setShown(fromServer(refused));
    else onClose();
  };

  const label = plan.kind === "ok" ? `Schedule for ${shortWhen(plan.clock)}` : "Schedule";
  return (
    <Dialog
      title="Schedule your changes"
      onClose={onClose}
      className="dlg-schedule"
      bodyClassName="sch-body"
      describedBy={`${id}-lead`}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" aria-disabled={busy ? true : undefined} onClick={() => void submit()}>
            {busy ? "Scheduling…" : label}
          </button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <p id={`${id}-lead`}>{lead}</p>
        <div className="schedule-fields">
          <div className={`field${shown.date.length > 0 ? " field-error" : ""}`}>
            <label className="label" htmlFor={`${id}-date`}>Date</label>
            <div className="input input-icon">
              <Icon name="calendar" />
              <input
                id={`${id}-date`}
                type="text"
                data-autofocus
                autoComplete="off"
                spellCheck={false}
                value={date}
                aria-invalid={shown.date.length > 0 ? true : undefined}
                aria-describedby={describedBy(`${id}-date`, false, shown.date, true)}
                onChange={(event) => {
                  setDate(event.target.value);
                  setShown({ date: [], time: [], other: [] });
                }}
              />
            </div>
            <span className="visually-hidden" id={`${id}-date-note`}>For example Oct 4, 2026, in the site’s time zone.</span>
            <ErrorList id={`${id}-date-error`} errors={shown.date} />
          </div>
          <div className={`field${shown.time.length > 0 ? " field-error" : ""}`}>
            <label className="label" htmlFor={`${id}-time`}>Time</label>
            <div className="input input-icon">
              <Icon name="clock" />
              <input
                id={`${id}-time`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={time}
                aria-invalid={shown.time.length > 0 ? true : undefined}
                aria-describedby={describedBy(`${id}-time`, false, shown.time, true)}
                onChange={(event) => {
                  setTime(event.target.value);
                  setShown({ date: [], time: [], other: [] });
                }}
              />
            </div>
            <span className="visually-hidden" id={`${id}-time-note`}>For example 6:15 AM, in the site’s time zone, {offset}.</span>
            <ErrorList id={`${id}-time-error`} errors={shown.time} />
          </div>
        </div>
        <p className="tz">
          <Icon name="globe" />
          <span>In your site’s time <strong>({offset})</strong>, the same for every visitor.</span>
          <button className="link" type="button" aria-expanded={explaining} aria-controls={`${id}-zone`} onClick={() => setExplaining(!explaining)}>Change</button>
        </p>
        {explaining && (
          <p className="hint sch-zone" id={`${id}-zone`}>
            The site’s time zone is {zone}. It is set in the CMS’s config/site.yml (time_zone): the editor cannot change it.
          </p>
        )}
        {plan.kind === "ok" && plan.twice && (
          <p className="hint">{timeText(plan.clock)} happens twice on {monthDay(plan.clock)}, as the clocks go back: this is the first, at {offset}.</p>
        )}
        {pending && <p className="hint">This replaces the publish scheduled for {siteWhen(zone, pending.at)}.</p>}
        <p className="hint">Changes you make after scheduling wait for the next publish.</p>
        <ErrorList id={`${id}-other`} errors={shown.other} />
        {/* Enter in a field sends the form. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
