// Where the page's edits are (design/shots/save-states.png), from the
// autosave's snapshot (../storage/autosave.ts), said in three places:
//
// - the top bar's save state: "Saved"; "Saving…", only once edits have
//   waited half a second, so a quick save does not flicker; "Not saved,
//   retrying in 8 s", counting down on the injected clock; "Changed in
//   another tab"; or why the server refused the save. Screen readers hear
//   "Saved" and "Not saved, retrying" once each, nothing while a save is on
//   its way, and not the countdown;
// - the conflict banner under the top bar, an alert, with Reload and Keep
//   mine: saving and publishing wait for the choice;
// - a toast while a save's outcome is unknown, saying why and offering
//   Retry now, which sends the very same save at once.
//
// The page's save is never mixed with publishing (./Publish.tsx) or with
// the site style's own save (./SiteStylePanel.tsx).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Failure } from "../storage/adapter.ts";
import type { SaveSnapshot } from "../storage/autosave.ts";
import { placeFocus } from "./act.ts";
import { useEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { useSession } from "./session.tsx";

// How long edits wait before "Saving…" shows.
export const SAVING_SHOWS_AFTER_MS = 500;

const NEVER: SaveSnapshot | null = null;
const noSubscription = () => () => {};

export function useSaveSnapshot(): SaveSnapshot | null {
  const { autosave } = useSession();
  return useSyncExternalStore(autosave ? autosave.subscribe : noSubscription, autosave ? autosave.getSnapshot : () => NEVER);
}

// "1 change", "6 changes".
export const changes = (n: number): string => `${n} ${n === 1 ? "change" : "changes"}`;

// "Sep 28 at 7:02 AM", in the editor's one locale.
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

// The clock's time, redrawn every `everyMs` while `active`: one timer at a
// time, each set by the one before, cleared when the drawing goes. The
// timers only ask for a drawing; the time drawn is read as it is drawn.
function useTicking(active: boolean, everyMs: number): number {
  const { clock } = useEnv();
  const [, setTicks] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let timer: ReturnType<typeof clock.setTimeout> | null = null;
    const tick = () => {
      setTicks((n) => n + 1);
      timer = clock.setTimeout(tick, everyMs);
    };
    timer = clock.setTimeout(tick, everyMs);
    return () => {
      if (timer !== null) clock.clearTimeout(timer);
    };
  }, [active, clock, everyMs]);
  return clock.now();
}

// Whether edits have been on their way for SAVING_SHOWS_AFTER_MS: each
// stretch of saving is an object of its own, and the timer marks the one
// it was set for, so a stretch that ended early marks nothing.
function useLongBusy(busy: boolean): boolean {
  const { clock } = useEnv();
  const stretch = useMemo(() => (busy ? {} : null), [busy]);
  const [long, setLong] = useState<object | null>(null);
  useEffect(() => {
    if (stretch === null) return undefined;
    const timer = clock.setTimeout(() => setLong(stretch), SAVING_SHOWS_AFTER_MS);
    return () => clock.clearTimeout(timer);
  }, [stretch, clock]);
  return stretch !== null && long === stretch;
}

interface Said {
  className: string;
  icon: "check" | "spinner" | "warning" | "error";
  // Heard by screen readers, or shown only.
  text: string;
  heard: boolean;
  // Shown after the text and never heard (the countdown).
  more?: string;
  title?: string;
}

// What a snapshot says once no save is on its way; while one is, before
// "Saving…" shows, the last such snapshot stays said (normally "Saved").
function describe(snapshot: SaveSnapshot, now: number): Said {
  switch (snapshot.phase) {
    case "saved":
    case "waiting":
    case "saving": {
      // The same save sent again after an unknown outcome is still a retry.
      if (snapshot.outcomeUnknown) return { className: "save-state save-warn", icon: "warning", text: "Not saved, retrying", heard: true, title: failureLine(snapshot.failure) };
      const all = snapshot.savedEdits > 0 ? `All ${changes(snapshot.savedEdits)}` : "All changes";
      return { className: "save-state", icon: "check", text: "Saved", heard: true, ...(snapshot.savedAt ? { title: `${all} saved at ${when(snapshot.savedAt)}` } : {}) };
    }
    case "retrying": {
      const seconds = snapshot.retryAt === null ? null : Math.max(1, Math.ceil((snapshot.retryAt - now) / 1000));
      return { className: "save-state save-warn", icon: "warning", text: "Not saved, retrying", heard: true, ...(seconds === null ? {} : { more: ` in ${seconds} s` }), title: failureLine(snapshot.failure) };
    }
    case "conflict":
      // The banner is the alert; the top bar only shows it.
      return { className: "save-state save-warn", icon: "warning", text: "Changed in another tab", heard: false };
    case "invalid":
      return { className: "save-state save-err", icon: "error", text: "Not saved: a value was refused", heard: true, title: "The server refused a value: it is marked in the navigator and in the panel." };
    case "refused":
      return { className: "save-state save-err", icon: "error", text: "Not saved", heard: true, ...(snapshot.failure ? { title: snapshot.failure.message } : {}) };
  }
}

const SAVING: Said = { className: "save-state", icon: "spinner", text: "Saving…", heard: false };

// The top bar's save state.
export function SaveState() {
  const snapshot = useSaveSnapshot();
  const busy = snapshot !== null && (snapshot.phase === "waiting" || snapshot.phase === "saving");
  const long = useLongBusy(busy);
  const now = useTicking(snapshot?.phase === "retrying" && snapshot.retryAt !== null, 1_000);
  // The last snapshot with no save on its way, kept from render to render.
  const [settled, setSettled] = useState<SaveSnapshot | null>(snapshot);
  if (!busy && snapshot !== settled) setSettled(snapshot);
  if (!snapshot) return null;
  const said = long
    ? { ...SAVING, title: `Saving your ${changes(Math.max(1, snapshot.unsavedEdits))}. Keep editing.` }
    : describe(busy && !snapshot.outcomeUnknown && settled ? settled : snapshot, now);
  return (
    <span className={said.className} role="status" title={said.title}>
      <Icon name={said.icon} className={said.icon === "spinner" ? "i spin" : "i"} />
      {said.heard ? said.text : <span aria-hidden="true">{said.text}</span>}
      {said.more && <span aria-hidden="true">{said.more}</span>}
    </span>
  );
}

// Why a save's outcome is unknown, as its first words, and when it will be
// saved, from what the adapter says happened.
function failureWords(failure: Failure | null): { lead: string; until: string } {
  if (failure?.kind !== "unknown") return { lead: "Not saved yet.", until: "the CMS answers" };
  switch (failure.cause) {
    case "network":
      return { lead: "Connection lost.", until: "the connection is back" };
    case "timeout":
      return { lead: "The CMS did not answer in time.", until: "it answers" };
    case "server":
      return { lead: `The CMS failed to save${failure.status === null ? "" : ` (error ${failure.status})`}.`, until: "it can" };
    case "unreadable":
      return { lead: "The CMS's answer could not be read.", until: "it answers" };
  }
}

function failureLine(failure: Failure | null): string {
  const { lead, until } = failureWords(failure);
  return `${lead} The editor sends the same save again until ${until}.`;
}

// While a save's outcome is unknown: why, what is kept, and Retry now.
export function SaveToast() {
  const session = useSession();
  const snapshot = useSaveSnapshot();
  if (!snapshot?.outcomeUnknown || !session.autosave) return null;
  const { lead, until } = failureWords(snapshot.failure);
  const kept = snapshot.unsavedEdits === 1 ? "Your change is" : snapshot.unsavedEdits > 1 ? `Your ${changes(snapshot.unsavedEdits)} are` : "Your changes are";
  const autosave = session.autosave;
  return (
    <div className="toast toast-save chrome" role="group" aria-label="Not saved">
      <p><strong>{lead}</strong> {kept} kept in this tab and saved when {until}.</p>
      {snapshot.phase === "retrying"
        ? <button className="btn btn-small btn-secondary" type="button" onClick={() => autosave.retryNow()}>Retry now</button>
        : <span className="toast-busy" role="status">Trying again…</span>}
    </div>
  );
}

// Under the top bar, across the window, while the draft has moved on the
// server since this tab last saved it.
export function ConflictBanner() {
  const session = useSession();
  const snapshot = useSaveSnapshot();
  const [choosing, setChoosing] = useState(false);
  if (snapshot?.phase !== "conflict") return null;
  const choose = async (choice: () => Promise<void> | void) => {
    setChoosing(true);
    try {
      await choice();
    } finally {
      setChoosing(false);
      // The banner and its buttons go: the focus goes back to the page.
      placeFocus(null, "canvas");
    }
  };
  return (
    <div className="banner-inplace chrome" role="alert">
      <Icon name="warning" />
      <p><strong>Changed in another tab.</strong> This page was saved in another tab after you opened it. Saving is paused until you choose.</p>
      <div className="banner-actions">
        <button className="btn btn-small btn-dark" type="button" disabled={choosing} title="Take the page as it is on the server; this tab's unsaved changes are dropped" onClick={() => void choose(session.reload)}>Reload</button>
        <button className="btn btn-small btn-secondary" type="button" disabled={choosing} title="Save this tab's page over the one on the server" onClick={() => void choose(session.keepMine)}>Keep mine</button>
      </div>
    </div>
  );
}
