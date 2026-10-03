// The history (design/shots/history.png), in the right tray in the
// navigator's place, opened from the top bar's History or by Ctrl+S:
//
// - This session: the commands of the store's history, newest first, each
//   with its label and its time; those undone, above, say so. Choosing one
//   undoes or redoes every step up to it, so the page is as it was right
//   after it; the focus stays on the list, and the canvas shows the block
//   the last step touched.
// - Versions: the draft, with how far it is from the live page, then the
//   versions the CMS keeps, newest first, each named by why it was made,
//   its name and its time, never by an author (../storage/adapter.ts,
//   Version); the live one marked. "Save version" asks for an optional
//   name; Restore copies a version back into the draft (./App.tsx says how
//   the editor takes it).
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Command } from "../document/commands.ts";
import type { FieldError } from "../storage/adapter.ts";
import type { HistoryEntry, StoreOutcome } from "../store/editor-store.ts";
import { describedBy, ErrorList } from "./controls.tsx";
import { useEditor, useEnv, useUi, type EditorEnv } from "./context.tsx";
import { draftLine, nameProblem, NAME_MAX, serverTime, stepTime, versionWords } from "./history-words.ts";
import { Icon } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, entryKeysText } from "./keymap.ts";
import { changesNotLive } from "./Publish.tsx";
import { useSaveSnapshot } from "./SaveStatus.tsx";
import { useSession } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import "./history.css";

// A step of this session, as the list shows it.
interface Step {
  entry: HistoryEntry;
  // Undone, waiting to be redone.
  undone: boolean;
  // The last step applied: the page is as it was right after it.
  now: boolean;
}

// The steps newest first: what was undone (the furthest from now on top),
// then what is applied, the latest first.
export function sessionSteps(past: readonly HistoryEntry[], future: readonly HistoryEntry[]): Step[] {
  return [
    ...future.map((entry) => ({ entry, undone: true, now: false })),
    ...past.toReversed().map((entry, index) => ({ entry, undone: false, now: index === 0 })),
  ];
}

// Undoes or redoes every step up to `target`, so the page is as it was
// right after it. The text still waiting in a field is handed over first,
// which, as a new command, ends what could be redone: a step undone then is
// gone, and nothing moves. Says what was done, or why not.
export function goToStep(env: Pick<EditorEnv, "store" | "ui">, target: Command): StoreOutcome | null {
  const { store, ui } = env;
  ui.getState().pending.deliver();
  const where = () => {
    const { past, future } = store.getState();
    if (past.at(-1)?.command === target) return "here";
    if (past.some((e) => e.command === target)) return "back";
    if (future.some((e) => e.command === target)) return "ahead";
    return "gone";
  };
  const first = where();
  if (first === "here") return null;
  if (first === "gone") {
    ui.getState().say("That step is gone: a newer change replaced what could be redone.");
    return null;
  }
  let outcome: StoreOutcome | null = null;
  let steps = 0;
  for (let at = first; at === "back" || at === "ahead"; at = where()) {
    outcome = at === "back" ? store.getState().undo() : store.getState().redo();
    if (!outcome.ok) break;
    steps += 1;
  }
  if (outcome && !outcome.ok) {
    ui.getState().say(steps === 0 ? outcome.error.message : `Stopped after ${steps} ${steps === 1 ? "step" : "steps"}: ${outcome.error.message}`);
  } else {
    ui.getState().say(`${first === "back" ? "Undid" : "Redid"} ${steps} ${steps === 1 ? "step" : "steps"}: the page is as it was right after “${target.label}”.`);
  }
  return outcome;
}

const afterRender = (run: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
};

// Each command keeps one key for the list, whichever stack it is on: an
// undo and a redo move it, and the focus stays on its row.
const keys = new WeakMap<Command, number>();
let nextKey = 0;
function keyOf(command: Command): number {
  let key = keys.get(command);
  if (key === undefined) {
    key = ++nextKey;
    keys.set(command, key);
  }
  return key;
}

export function HistoryPanel() {
  const env = useEnv();
  const { ui, clock } = env;
  const session = useSession();
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const snapshot = useSaveSnapshot();
  const naming = useUi((u) => u.namingVersion);
  const steps = sessionSteps(past, future);
  const now = clock.now();
  const page = session.current;
  const { loadVersions } = session;
  const revision = snapshot?.revision ?? page?.revision ?? null;
  const saveButton = useRef<HTMLButtonElement>(null);

  // The versions are read when the history opens, for each page, and after
  // each save the CMS confirms: a save may keep an automatic version.
  const pageId = page?.id ?? null;
  useEffect(() => {
    if (pageId !== null && revision !== null) loadVersions();
  }, [pageId, revision, loadVersions]);

  const close = () => {
    ui.getState().setHistoryOpen(false);
    // The focus goes back to the button that opens it again.
    afterRender(() => document.querySelector<HTMLElement>(".topbar [data-history]")?.focus());
  };

  const choose = (target: Command) => {
    const outcome = goToStep(env, target);
    if (outcome?.ok && outcome.focus) {
      const id = outcome.focus.id;
      afterRender(() => document.querySelector(`.canvas [data-block-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" }));
    }
  };

  const undoKeys = entry("undo");
  const saveKeys = entry("saveVersion");
  const { versions, restoring } = session;
  const notLive = page ? changesNotLive(page, snapshot) : 0;

  return (
    <aside className="tray tray-right chrome" aria-label="History">
      <section className="view">
        <div className="tray-head tray-head-title">
          <h2 id="history_title"><Icon name="history" />History</h2>
          <button className="ibtn" type="button" aria-label="Close history" title="Close history" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="tray-body tray-body-tight hist-body">
          <h3 className="group-title group-title-pad" id="history_session">This session</h3>
          {steps.length === 0
            ? <p className="hint hint-pad">No changes yet. Each change you make shows here, and you can go back to any of them.</p>
            : (
              <ol className="hist" aria-labelledby="history_session">
                {steps.map((step) => (
                  <li key={keyOf(step.entry.command)} className={step.now ? "hist-now" : step.undone ? "hist-undone" : undefined}>
                    <button
                      type="button"
                      aria-current={step.now ? "step" : undefined}
                      title={step.now ? "The page is as it was right after this" : step.undone ? "Redo up to this" : "Go back to right after this"}
                      onClick={() => choose(step.entry.command)}
                    >
                      <span className="hist-what">{step.entry.command.label}</span>
                      <span className="visually-hidden">, </span>
                      <span className="hist-when">{step.undone ? "Undone" : stepTime(step.entry.at, now)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          <p className="hint hint-pad hint-keys">
            Select an action to go back to it.<br />
            <span className="keys-inline" aria-label={entryKeysText(undoKeys)}><KeyCaps caps={entryCaps(undoKeys)} small /></span> steps back one.
          </p>

          <div className="hist-versions-head">
            <h3 className="group-title" id="history_versions">Versions</h3>
            <button
              ref={saveButton}
              className="btn btn-small btn-secondary"
              type="button"
              data-save-version=""
              aria-expanded={naming}
              aria-keyshortcuts={ariaKeyShortcuts(saveKeys)}
              title={`Save version (${entryKeysText(saveKeys)})`}
              onClick={() => ui.getState().setNamingVersion(!naming)}
            >
              <Icon name="bookmark" />Save version
            </button>
          </div>
          {naming && <NameForm onDone={() => {
            ui.getState().setNamingVersion(false);
            saveButton.current?.focus();
          }} />}
          <ul className="versions" aria-labelledby="history_versions" aria-busy={versions.phase === "loading" ? true : undefined}>
            {page && (
              <li className="ver ver-draft">
                <span className="ver-kind">Current draft</span>
                <span className="ver-name">{draftLine(page.published !== null, notLive)}</span>
                {snapshot?.savedAt && <span className="ver-when">{serverTime(snapshot.savedAt, now)}</span>}
              </li>
            )}
            {versions.items.map((version) => {
              const words = versionWords(version, versions.items, now);
              const busy = restoring !== null;
              return (
                <li key={version.number} className={`ver${words.live ? " ver-live" : ""}`}>
                  <div>
                    <span className="ver-kind">{words.live && <i className="dot-live" aria-hidden="true" />}{words.kind}{words.live && <span className="visually-hidden">, live now</span>}</span>
                    {words.name !== null && <span className="ver-name">{words.name}</span>}
                    <span className="ver-when">{words.when}</span>
                  </div>
                  <button
                    className="btn btn-small btn-secondary"
                    type="button"
                    aria-label={`Restore: ${words.sentence}`}
                    aria-disabled={busy ? true : undefined}
                    onClick={() => {
                      if (!busy) void session.restoreVersion(version.number);
                    }}
                  >
                    {restoring === version.number ? "Restoring…" : "Restore"}
                  </button>
                </li>
              );
            })}
          </ul>
          {versions.phase === "loading" && versions.items.length === 0 && <p className="hint hint-pad" role="status">Reading the versions…</p>}
          {versions.phase === "ready" && versions.items.length === 0 && <p className="hint hint-pad">No versions yet. One is kept when you publish, when you save a version, and as you edit.</p>}
          {versions.phase === "failed" && (
            <div className="hist-failed hint-pad">
              <p className="error"><Icon name="error" />{versions.message}</p>
              <button className="btn btn-small btn-secondary" type="button" onClick={loadVersions}>Try again</button>
            </div>
          )}
          <p className="hint hint-pad">Restoring copies that version into your draft. Nothing goes live until you publish.</p>
        </div>
      </section>
    </aside>
  );
}

// The name a version is kept under, optional. Enter keeps it, Esc lets it
// go; the CMS's refusal of the name shows under the field.
function NameForm({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  // Whether the form is still on screen when the CMS answers. Set by the
  // effect itself, not only at first: React's strict mode runs it, undoes
  // it and runs it again.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // Opened by the button or by Ctrl+S: the field takes the focus.
  useLayoutEffect(() => {
    field.current?.focus();
  }, []);

  const own = nameProblem(name);
  const shown = [
    ...(own ? [own] : []),
    ...errors.map((e) => (e.pointer === "/name" ? `A name is one line of visible text, at most ${NAME_MAX} characters.` : e.message)),
  ];

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || own) return;
    setBusy(true);
    const problems = await session.saveVersion(name);
    if (!live.current) return;
    setBusy(false);
    if (problems) setErrors(problems);
    else onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onDone();
  };

  return (
    <form className={`ver-form${shown.length > 0 ? " field-error" : ""}`} onSubmit={(event) => void submit(event)}>
      <label className="label" htmlFor={`${id}-name`}>Name <span className="ver-optional">(optional)</span></label>
      <input
        ref={field}
        id={`${id}-name`}
        className="input"
        type="text"
        value={name}
        placeholder="Before the winter series"
        aria-invalid={shown.length > 0 ? true : undefined}
        aria-describedby={describedBy(`${id}-name`, "hint", shown)}
        onChange={(event) => {
          setName(event.target.value);
          setErrors([]);
        }}
        onKeyDown={onKeyDown}
      />
      <p className="hint" id={`${id}-name-hint`}>Keeps the page as it is now, saved first.</p>
      <ErrorList id={`${id}-name-error`} errors={shown} />
      <div className="ver-form-actions">
        <button className="btn btn-small btn-secondary" type="button" onClick={onDone}>Cancel</button>
        <button className="btn btn-small btn-dark" type="submit" aria-disabled={busy || own ? true : undefined}>{busy ? "Saving…" : "Save version"}</button>
      </div>
    </form>
  );
}
