// Whether a scheduled publish is late: its time passed, and the page is
// still not live. The CMS's job normally runs within a second or two of the
// time, and the editor reads the page again then, so a schedule still
// pending after this much is one the job has not carried out (the CMS's
// database was busy, or its queue was down). The top bar and the history
// then say it should have gone live, instead of "scheduled for" a time
// that is behind.
import { useEffect, useReducer } from "react";
import { useEnv } from "./context.tsx";

export const LATE_AFTER_MS = 30_000;

// The longest wait a browser's setTimeout keeps: past 2^31 - 1 ms it fires
// at once.
const LONGEST_TIMER_MS = 2_147_483_647;

// at: the pending schedule's time (ISO 8601), or undefined with none.
export function useScheduleLate(at: string | undefined): boolean {
  const { clock } = useEnv();
  // Counts the timer's firings: one that came early (the longest wait) must
  // set the next one.
  const [fired, fire] = useReducer((count: number) => count + 1, 0);
  const lateAt = at === undefined ? null : Date.parse(at) + LATE_AFTER_MS;
  const late = lateAt !== null && clock.now() >= lateAt;
  useEffect(() => {
    if (lateAt === null || late) return undefined;
    const timer = clock.setTimeout(fire, Math.min(Math.max(0, lateAt - clock.now()), LONGEST_TIMER_MS));
    return () => clock.clearTimeout(timer);
  }, [clock, lateAt, late, fired]);
  return late;
}
