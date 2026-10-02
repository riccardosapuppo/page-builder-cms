// Saves the page being edited, on its own, through the storage adapter.
// The store hands it every new document (edit), and the interface reads
// where the edits are (getSnapshot, subscribe); it imports neither.
//
// - Debounce on an injected clock: a save leaves when edits pause for
//   debounceMs, and at the latest maxWaitMs after the first edit it
//   carries, so a long run of typing is still saved as it goes.
// - One request in flight. Edits made while it travels wait, and leave
//   with the revision its answer gave, never with the one before: two saves
//   of one tab never race each other into a false conflict.
// - Three outcomes, kept apart (and apart from publishing, which this
//   module knows nothing about):
//   - saved: the server has every edit;
//   - conflict: the draft moved on the server (another tab, a restore).
//     Saving stops until the person chooses: reload() takes the server's
//     draft, overwrite() saves this tab's on top of it;
//   - unknown: no answer said what happened (no network, the time ran out,
//     a 5xx). The very same request, same saveId, revision and document,
//     is sent again after a growing delay, and the server answers a save
//     it already stored as saved. warnOnClose stays up all along.
//   Two more ways a save ends, both from the server: invalid (422, the
//   document is refused, with its fields) and refused (403, 404, 415...).
//   Neither is retried by itself; the next edit, or retryNow(), sends again.
// - The state that asks for a person (conflict, an unknown outcome) is
//   never cleared by a later attempt: only a definite answer about that
//   save, or the person's choice, clears it.
import { isStorageError, type Conflict, type Draft, type DraftSaved, type Failure, type FieldError, type Invalid, type Outcome, type StorageAdapter, type Time } from "./adapter.ts";
import { systemClock, type Clock, type ClockTimer } from "./clock.ts";
import type { PageDocument } from "../shared/document.ts";

export type SavePhase =
  // Every edit is on the server.
  | "saved"
  // Edits not sent yet: the debounce has not run out.
  | "waiting"
  // A save is in flight.
  | "saving"
  // The last save's outcome is unknown; it is sent again at retryAt.
  | "retrying"
  // The draft moved on the server; saving waits for reload() or overwrite().
  | "conflict"
  // The server refused the document (errors); saving waits for an edit.
  | "invalid"
  // The server refused the save for another reason (failure); saving waits
  // for an edit or retryNow().
  | "refused";

export interface SaveSnapshot {
  phase: SavePhase;
  // The draft revision the next save starts from: the one the server last
  // gave this tab (or, after overwrite(), the one the conflict named).
  revision: number;
  // The server's time of the last save it confirmed.
  savedAt: Time | null;
  // Edits the server has not confirmed: they are only in this tab.
  unsavedEdits: number;
  // Edits the server has confirmed since this tab opened the page.
  savedEdits: number;
  // Whether closing the tab now would lose edits: the interface asks first.
  warnOnClose: boolean;
  // A save was sent and no answer said whether it was stored; it is the
  // one being sent again.
  outcomeUnknown: boolean;
  // How many times the save in flight, or about to be sent again, has
  // been sent.
  attempt: number;
  // When (on the clock) the save in flight left.
  sentAt: number | null;
  // When (on the clock) the next automatic try leaves.
  retryAt: number | null;
  conflict: { currentRevision: number; lastSaveId: string | null } | null;
  // Phase invalid: what the server found wrong, pointers under /document.
  errors: FieldError[];
  // Why the last try did not save (phases retrying and refused).
  failure: Failure | null;
}

export interface AutosaveOptions {
  adapter: Pick<StorageAdapter, "getDraft" | "saveDraft">;
  pageId: number;
  // The draft as the editor loaded it.
  revision: number;
  document: PageDocument;
  savedAt?: Time | null;
  clock?: Clock;
  // A new id for each save, [A-Za-z0-9_-]{1,64}, never repeated.
  newSaveId?: () => string;
  debounceMs?: number;
  maxWaitMs?: number;
  // How long a save may take before its outcome counts as unknown.
  timeoutMs?: number;
  // The waits before each automatic retry; the last repeats.
  retryDelaysMs?: readonly number[];
}

export const AUTOSAVE_DEFAULTS = {
  debounceMs: 1_000,
  maxWaitMs: 5_000,
  timeoutMs: 15_000,
  retryDelaysMs: [2_000, 4_000, 8_000, 16_000, 30_000],
} as const;

export interface Autosave {
  // A new document from the store. The same object again is no edit.
  edit(document: PageDocument): void;
  getSnapshot(): SaveSnapshot;
  subscribe(listener: (snapshot: SaveSnapshot) => void): () => void;
  // Sends what waits now, without the debounce, and resolves once nothing
  // is waiting or in flight: on saved, or on the phase that stopped it.
  // Publishing goes ahead only on saved.
  flush(): Promise<SaveSnapshot>;
  // Sends at once the save that is retrying or was refused.
  retryNow(): void;
  // Conflict: takes the server's draft, dropping this tab's unsaved edits,
  // and gives it to the caller to put in the store.
  reload(): Promise<Draft>;
  // Conflict: saves this tab's document over the server's draft.
  overwrite(): void;
  // Stops the timers and ignores any answer still to come. A save in
  // flight is not abandoned: check warnOnClose first.
  dispose(): void;
}

interface Outstanding {
  saveId: string;
  revision: number;
  document: PageDocument;
  // The edits it carries: every edit up to this count.
  edits: number;
  attempt: number;
}

export function defaultSaveId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const { adapter, pageId } = options;
  const clock = options.clock ?? systemClock;
  const newSaveId = options.newSaveId ?? defaultSaveId;
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEFAULTS.debounceMs;
  const maxWaitMs = options.maxWaitMs ?? AUTOSAVE_DEFAULTS.maxWaitMs;
  const timeoutMs = options.timeoutMs ?? AUTOSAVE_DEFAULTS.timeoutMs;
  const retryDelays = options.retryDelaysMs ?? AUTOSAVE_DEFAULTS.retryDelaysMs;
  if (retryDelays.length === 0) throw new Error("retryDelaysMs needs at least one delay");

  let revision = options.revision;
  let savedAt: Time | null = options.savedAt ?? null;
  let latest = options.document;
  // Edits counted as they come; those up to `settled` are on the server or
  // were dropped by a reload.
  let edits = 0;
  let settled = 0;
  let savedEdits = 0;
  // The save that was sent and not yet answered for: in flight, or waiting
  // to be sent again after an unknown outcome.
  let outstanding: Outstanding | null = null;
  let inFlight: { ticket: number; sentAt: number; controller: AbortController; timer: ClockTimer } | null = null;
  let tickets = 0;
  let outcomeUnknown = false;
  let retries = 0;
  let retryTimer: ClockTimer | null = null;
  let retryAt: number | null = null;
  let debounceTimer: ClockTimer | null = null;
  let maxWaitTimer: ClockTimer | null = null;
  let stop: { phase: "conflict"; conflict: Conflict } | { phase: "invalid"; problem: Invalid } | { phase: "refused" } | null = null;
  let failure: Failure | null = null;
  let disposed = false;

  const listeners = new Set<(snapshot: SaveSnapshot) => void>();
  let waiters: Array<(snapshot: SaveSnapshot) => void> = [];
  let snapshot = take();

  function phase(): SavePhase {
    if (stop !== null) return stop.phase;
    if (inFlight !== null) return "saving";
    if (outstanding !== null && outcomeUnknown) return "retrying";
    return edits > settled ? "waiting" : "saved";
  }

  function take(): SaveSnapshot {
    const unsaved = edits - settled;
    return {
      phase: phase(),
      revision,
      savedAt,
      unsavedEdits: unsaved,
      savedEdits,
      warnOnClose: unsaved > 0 || outcomeUnknown,
      outcomeUnknown,
      attempt: outstanding?.attempt ?? 0,
      sentAt: inFlight?.sentAt ?? null,
      retryAt,
      conflict: stop?.phase === "conflict" ? { currentRevision: stop.conflict.currentRevision, lastSaveId: stop.conflict.lastSaveId } : null,
      errors: stop?.phase === "invalid" ? stop.problem.errors : [],
      failure,
    };
  }

  function emit(): void {
    if (disposed) return;
    snapshot = take();
    for (const listener of listeners) listener(snapshot);
    if (snapshot.phase !== "waiting" && snapshot.phase !== "saving") {
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve(snapshot);
    }
  }

  function clear(timer: ClockTimer | null): null {
    if (timer !== null) clock.clearTimeout(timer);
    return null;
  }

  function clearEditTimers(): void {
    debounceTimer = clear(debounceTimer);
    maxWaitTimer = clear(maxWaitTimer);
  }

  // The edits are due: a save left waiting with no retry on its way (after
  // a refusal, an edit sends it again) goes first, unchanged.
  function due(): void {
    if (stop === null && outstanding !== null && retryTimer === null && inFlight === null) send();
    else pump();
  }

  // Starts the next save if one is due and nothing stands in the way.
  function pump(): void {
    if (disposed || stop !== null || inFlight !== null) return;
    // A save whose outcome is unknown goes again, unchanged, on its timer.
    if (outstanding !== null) return;
    if (edits === settled || debounceTimer !== null) return;
    maxWaitTimer = clear(maxWaitTimer);
    outstanding = { saveId: newSaveId(), revision, document: latest, edits, attempt: 0 };
    send();
  }

  function send(): void {
    const save = outstanding;
    if (save === null || inFlight !== null || disposed) return;
    retryTimer = clear(retryTimer);
    retryAt = null;
    save.attempt += 1;
    const ticket = ++tickets;
    const controller = new AbortController();
    // The clock decides the timeout, whether or not the adapter honours the
    // signal: past it, a late answer is ignored and the save is retried.
    const timer = clock.setTimeout(() => {
      if (inFlight?.ticket !== ticket) return;
      controller.abort();
      unknown({ kind: "unknown", cause: "timeout", status: null, message: `The save got no answer within ${timeoutMs / 1000} s.` });
    }, timeoutMs);
    inFlight = { ticket, sentAt: clock.now(), controller, timer };
    emit();

    let answer: Promise<Outcome<DraftSaved, Conflict | Invalid>>;
    try {
      answer = adapter.saveDraft(pageId, { revision: save.revision, document: save.document, saveId: save.saveId }, { signal: controller.signal });
    } catch (error) {
      answer = Promise.reject(error);
    }
    answer.then(
      (outcome) => {
        if (!landed(ticket)) return;
        if (outcome.ok) saved(save, outcome.value);
        else if (outcome.problem.kind === "conflict") stopped({ phase: "conflict", conflict: outcome.problem });
        else stopped({ phase: "invalid", problem: outcome.problem });
      },
      (error: unknown) => {
        if (!landed(ticket)) return;
        const failed = isStorageError(error) ? error.failure : null;
        if (failed === null || failed.kind === "unknown") {
          // Anything but a definite refusal, a bug of the adapter's
          // included, may have stored the save: send the same one again.
          unknown(failed ?? { kind: "unknown", cause: "unreadable", status: null, message: error instanceof Error ? error.message : String(error) });
        } else {
          refused(failed);
        }
      },
    );
  }

  // Whether this answer is for the request in flight, and clears it.
  function landed(ticket: number): boolean {
    if (disposed || inFlight?.ticket !== ticket) return false;
    clock.clearTimeout(inFlight.timer);
    inFlight = null;
    return true;
  }

  function saved(save: Outstanding, answer: DraftSaved): void {
    revision = answer.revision;
    savedAt = answer.updatedAt;
    savedEdits += save.edits - settled;
    settled = save.edits;
    outstanding = null;
    outcomeUnknown = false;
    failure = null;
    retries = 0;
    pump();
    emit();
  }

  // A definite answer that this save cannot go through as it is: nothing
  // of it is waiting for an outcome any more.
  function stopped(next: NonNullable<typeof stop>): void {
    stop = next;
    outstanding = null;
    outcomeUnknown = false;
    failure = null;
    retries = 0;
    clearEditTimers();
    emit();
  }

  function unknown(why: Failure): void {
    if (inFlight !== null) {
      clock.clearTimeout(inFlight.timer);
      inFlight = null;
    }
    outcomeUnknown = true;
    failure = why;
    const delay = retryDelays[Math.min(retries, retryDelays.length - 1)]!;
    retries += 1;
    retryAt = clock.now() + delay;
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      send();
    }, delay);
    emit();
  }

  function refused(why: Failure): void {
    stop = { phase: "refused" };
    failure = why;
    // Refused now, but an earlier send of the same save may have been
    // stored: it stays outstanding, to go again unchanged.
    if (!outcomeUnknown) outstanding = null;
    clearEditTimers();
    emit();
  }

  const autosave: Autosave = {
    edit(document) {
      if (disposed || document === latest) return;
      latest = document;
      edits += 1;
      if (stop?.phase === "conflict") {
        emit();
        return;
      }
      if (stop !== null) {
        // A new document is a new attempt at what was refused.
        stop = null;
        if (!outcomeUnknown) failure = null;
      }
      debounceTimer = clear(debounceTimer);
      debounceTimer = clock.setTimeout(() => {
        debounceTimer = null;
        maxWaitTimer = clear(maxWaitTimer);
        due();
      }, debounceMs);
      if (maxWaitTimer === null) {
        maxWaitTimer = clock.setTimeout(() => {
          maxWaitTimer = null;
          debounceTimer = clear(debounceTimer);
          due();
        }, maxWaitMs);
      }
      emit();
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    flush() {
      clearEditTimers();
      due();
      const now = take();
      if (now.phase !== "waiting" && now.phase !== "saving") return Promise.resolve(now);
      return new Promise((resolve) => waiters.push(resolve));
    },

    retryNow() {
      if (disposed || inFlight !== null || stop?.phase === "conflict" || stop?.phase === "invalid") return;
      if (stop?.phase === "refused") stop = null;
      clearEditTimers();
      if (outstanding !== null) send();
      else pump();
      emit();
    },

    async reload() {
      if (inFlight !== null) throw new Error("reload() waits for the save in flight to be answered");
      const draft = await adapter.getDraft(pageId);
      if (disposed) return draft;
      clearEditTimers();
      retryTimer = clear(retryTimer);
      retryAt = null;
      revision = draft.revision;
      savedAt = draft.updatedAt;
      latest = draft.document;
      // The edits this tab had not saved are dropped with its document.
      settled = edits;
      outstanding = null;
      outcomeUnknown = false;
      stop = null;
      failure = null;
      retries = 0;
      emit();
      return draft;
    },

    overwrite() {
      if (stop?.phase !== "conflict") return;
      revision = stop.conflict.currentRevision;
      stop = null;
      clearEditTimers();
      pump();
      emit();
    },

    dispose() {
      disposed = true;
      clearEditTimers();
      retryTimer = clear(retryTimer);
      if (inFlight !== null) clock.clearTimeout(inFlight.timer);
      listeners.clear();
      waiters = [];
    },
  };
  return autosave;
}
