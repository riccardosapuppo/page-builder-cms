// Form responses, opened from the mark's menu beside the media library:
// what visitors sent with the forms of the site's published pages. On the
// left the forms that have responses, each with its page and its count; in
// the middle the chosen form's responses, newest first, a table with the
// time each was sent, the page's version it was sent from and its first
// written answer; on the right the response opened, whole: every field the
// form had then, with its answer. Delete asks first, since the CMS keeps no
// copy.
//
// What a visitor wrote is a stranger's text: it is drawn as React text,
// never as markup, and an address in it is not made a link.
//
// Everything is read through the storage (./context.ts), the adapter's
// three operations on a page's responses, a page at a time (./read.ts).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { isStorageError, type FormResponse, type ResponseSummary } from "../../storage/adapter.ts";
import { useEnv } from "../context.tsx";
import { Dialog } from "../dialog.tsx";
import { serverTime } from "../history-words.ts";
import { Icon } from "../icons.tsx";
import { useOptionalSession } from "../session.tsx";
import { useResponsesStorage } from "./context.ts";
import { readSiteForms, type SiteForm } from "./read.ts";
import "./responses.css";
import { answered, countLine, responsesCount, versionWords } from "./words.ts";

type Forms = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; forms: SiteForm[] };

// The chosen form's responses as far as they have been read: newest first,
// `next` continuing the list, and how reading the older ones went.
interface Part {
  key: string;
  phase: "loading" | "ready" | "failed";
  items: ResponseSummary[];
  next: number | null;
  message: string | null;
  older: "idle" | "loading" | "failed";
}

type Opened = { id: number; phase: "loading" } | { id: number; phase: "ready"; response: FormResponse } | { id: number; phase: "failed"; message: string };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

export function ResponsesScreen({ onClose }: { onClose: () => void }) {
  const storage = useResponsesStorage();
  const { store, clock } = useEnv();
  const openPageId = useOptionalSession()?.current?.id ?? null;
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [forms, setForms] = useState<Forms>({ phase: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [part, setPart] = useState<Part | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // The row the table's one Tab stop is on; the arrows move it.
  const [active, setActive] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<"asking" | "working" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const body = useRef<HTMLDivElement>(null);
  // What takes the focus once the screen has drawn what a delete changed.
  const focusNext = useRef<string | null>(null);
  // The answers still wanted: one that comes back after another was asked
  // for (another form chosen, another response opened) is dropped.
  const wanted = useRef({ part: 0, opened: 0 });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const list = forms.phase === "ready" ? forms.forms : [];
  const form = list.find((f) => f.key === chosen) ?? null;
  const total = list.reduce((sum, f) => sum + f.count, 0);
  const now = clock.now();

  // The site's forms: read when the screen opens, and again on Try again
  // (retry, which says it is reading). The page being edited is named from
  // the editor's own draft.
  useEffect(() => {
    if (!storage) return;
    let current = true;
    readSiteForms(storage, (pageId) => (pageId === openPageId ? store.getState().document : null)).then(
      (read) => {
        if (!current) return;
        setForms({ phase: "ready", forms: read });
        setChosen((key) => (key !== null && read.some((f) => f.key === key) ? key : (read[0]?.key ?? null)));
      },
      (error: unknown) => {
        if (current) setForms({ phase: "failed", message: describe(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [storage, store, openPageId, attempt]);

  // The chosen form's newest responses, read as it is chosen. Until they
  // come, the part held is another form's, and the table says it is
  // reading (rows, below).
  const formPage = form?.pageId ?? null;
  const formId = form?.formId ?? null;
  useEffect(() => {
    if (!storage || chosen === null || formPage === null || formId === null) return;
    const ticket = ++wanted.current.part;
    storage.listResponses(formPage, { form: formId }).then(
      (read) => {
        if (ticket !== wanted.current.part) return;
        setPart({ key: chosen, phase: "ready", items: read.responses, next: read.next, message: null, older: "idle" });
        // The count as the CMS has it now: visitors may have sent more
        // since the screen opened.
        const count = read.forms.find((f) => f.formId === formId)?.count;
        if (count !== undefined) setForms((before) => (before.phase === "ready" ? { ...before, forms: before.forms.map((f) => (f.key === chosen ? { ...f, count } : f)) } : before));
      },
      (error: unknown) => {
        if (ticket === wanted.current.part) setPart({ key: chosen, phase: "failed", items: [], next: null, message: describe(error), older: "idle" });
      },
    );
  }, [storage, chosen, formPage, formId]);

  // What the screen shows now, as drawn last: read by a delete that was on
  // its way when the person went elsewhere (another form, another response)
  // and lands after, which must change what is there now and not what was
  // there when it was asked.
  const showing = useRef({ chosen, openedId: opened?.id ?? null, part, list });
  useLayoutEffect(() => {
    showing.current = { chosen, openedId: opened?.id ?? null, part, list };
  });

  // After a delete, the focus goes where the screen said, once drawn.
  useLayoutEffect(() => {
    const selector = focusNext.current;
    if (selector === null) return;
    focusNext.current = null;
    (body.current?.closest(".dialog")?.querySelector<HTMLElement>(selector))?.focus();
  });

  if (!storage) return null;

  const openResponse = (responseId: number) => {
    if (!form) return;
    const ticket = ++wanted.current.opened;
    setActive(responseId);
    setOpened({ id: responseId, phase: "loading" });
    setDeleting(null);
    setSaid(null);
    storage.getResponse(form.pageId, responseId).then(
      (response) => {
        if (ticket === wanted.current.opened) setOpened({ id: responseId, phase: "ready", response });
      },
      (error: unknown) => {
        if (ticket !== wanted.current.opened) return;
        const message = isStorageError(error) && error.failure.kind === "not-found" ? "This response is no longer kept: it was deleted elsewhere." : `It could not be read: ${describe(error)}`;
        setOpened({ id: responseId, phase: "failed", message });
      },
    );
  };

  const readOlder = () => {
    if (!form || !part || part.key !== chosen || part.next === null || part.older === "loading") return;
    const ticket = wanted.current.part;
    setPart({ ...part, older: "loading" });
    storage.listResponses(form.pageId, { form: form.formId, before: part.next }).then(
      (read) => {
        if (ticket !== wanted.current.part) return;
        setPart((before) => (before ? { ...before, items: [...before.items, ...read.responses], next: read.next, older: "idle" } : before));
        // The button that asked goes with the list's end: the focus goes
        // to the first response it brought.
        const first = read.responses[0];
        if (first) {
          setActive(first.id);
          focusNext.current = `[data-response-id="${first.id}"]`;
        }
      },
      (error: unknown) => {
        if (ticket !== wanted.current.part) return;
        setPart((before) => (before ? { ...before, older: "failed", message: describe(error) } : before));
      },
    );
  };

  const remove = async () => {
    if (!form || !part || part.key !== chosen || opened?.phase !== "ready") return;
    const response = opened.response;
    const from = form.key;
    setDeleting("working");
    setSaid(null);
    let already = false;
    try {
      await storage.deleteResponse(form.pageId, response.id);
    } catch (error) {
      // Deleted already, from another tab: what was asked is so.
      if (isStorageError(error) && error.failure.kind === "not-found") already = true;
      else {
        if (!mounted.current) return;
        // Said where the person is: under this response while it is open,
        // else in the note, which is not about the response now open.
        if (showing.current.openedId === response.id) {
          setDeleting(null);
          setSaid(`Not deleted: ${describe(error)}`);
        } else {
          setNote(`The response sent ${serverTime(response.submittedAt, clock.now())} was not deleted: ${describe(error)}`);
        }
        return;
      }
    }
    if (!mounted.current) return;
    const when = serverTime(response.submittedAt, clock.now());
    setNote(already ? `The response sent ${when} had already been deleted.` : `The response sent ${when} was deleted.`);

    // From here on, what the screen shows now: the person may have chosen
    // another form or opened another response while the delete was on its
    // way. Only what belongs to this response and its form changes; the
    // focus moves only if the person is still where the delete was asked.
    const shown = showing.current;
    const here = shown.chosen === from;
    const open = shown.openedId === response.id;
    if (open) {
      setDeleting(null);
      setOpened(null);
    }
    const held = shown.part?.key === from ? shown.part : null;
    const rest = held ? held.items.filter((r) => r.id !== response.id) : null;
    setPart((before) => (before && before.key === from ? { ...before, items: before.items.filter((r) => r.id !== response.id) } : before));
    const listed = shown.list.find((f) => f.key === from);
    if (!listed) return;
    const count = Math.max(0, listed.count - 1);
    if (count > 0 && !(held && rest && rest.length === 0 && held.next === null)) {
      setForms((before) => (before.phase === "ready" ? { ...before, forms: before.forms.map((f) => (f.key === from ? { ...f, count } : f)) } : before));
      // The focus goes to the response that took its place, else the one
      // above it, else the button that reads older ones.
      if (open && held && rest) {
        const at = held.items.findIndex((r) => r.id === response.id);
        const neighbour = rest[at] ?? rest[at - 1];
        if (neighbour) {
          setActive(neighbour.id);
          focusNext.current = `[data-response-id="${neighbour.id}"]`;
        } else if (held.next !== null) {
          setActive(null);
          focusNext.current = "[data-older]";
        }
      }
      return;
    }
    // A form left with none leaves the list. If it is the one chosen, the
    // next form is, or the one before, and the focus goes to it, or, with
    // no form left, to Close.
    const index = shown.list.findIndex((f) => f.key === from);
    const left = shown.list.filter((f) => f.key !== from);
    setForms((before) => (before.phase === "ready" ? { ...before, forms: before.forms.filter((f) => f.key !== from) } : before));
    if (!here) return;
    const nextForm = left[index] ?? left[index - 1] ?? null;
    setChosen(nextForm?.key ?? null);
    setOpened(null);
    setActive(null);
    if (open) focusNext.current = nextForm ? `[data-form-key="${nextForm.key}"]` : "[data-close]";
  };

  // The table is one Tab stop: the arrows, Home and End move along its
  // rows, and Enter or Space opens the one there.
  const rove = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!part) return;
    const to = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? part.items.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    const target = part.items[Math.max(0, Math.min(part.items.length - 1, to))];
    if (!target) return;
    setActive(target.id);
    body.current?.querySelector<HTMLElement>(`[data-response-id="${target.id}"]`)?.focus();
  };

  // Another form chosen: what was opened was the other form's.
  const choose = (key: string) => {
    if (key === chosen) return;
    setChosen(key);
    setOpened(null);
    setActive(null);
    setDeleting(null);
    setSaid(null);
  };

  // Try again: every read made again, from the site's pages on.
  const retry = () => {
    setForms({ phase: "loading" });
    setPart(null);
    setOpened(null);
    setAttempt((n) => n + 1);
  };

  const rows: Part | null = chosen === null ? null : part?.key === chosen ? part : { key: chosen, phase: "loading", items: [], next: null, message: null, older: "idle" };
  const stop = rows?.items.some((r) => r.id === active) ? active : (rows?.items[0]?.id ?? null);

  return (
    <Dialog
      title="Form responses"
      className="dlg-responses"
      bodyClassName="rs-main"
      closeLabel="Close form responses"
      tools={<p className="dlg-count">{forms.phase === "ready" ? countLine(total, list.length) : ""}</p>}
      onClose={onClose}
      footer={
        <>
          <p className="hint">What visitors sent with the forms of your published pages, as they wrote it. A response deleted here is gone for good.</p>
          <p className="rs-note" role="status">{note}</p>
          <button className="btn btn-secondary" type="button" data-close="" onClick={onClose}>Close</button>
        </>
      }
    >
      <div ref={body} className="rs-body">
        {forms.phase === "loading" && <p className="rs-state" role="status">Reading the responses…</p>}
        {forms.phase === "failed" && (
          <div className="rs-state">
            <p className="error"><Icon name="error" />The responses could not be read: {forms.message}</p>
            <button className="btn btn-small btn-secondary" type="button" onClick={retry}>Try again</button>
          </div>
        )}
        {forms.phase === "ready" && list.length === 0 && (
          <div className="rs-state">
            <p className="rs-empty-title">No responses yet</p>
            <p className="hint">When a visitor sends a form from one of your published pages, what they wrote shows here.</p>
          </div>
        )}
        {forms.phase === "ready" && list.length > 0 && (
          <>
            <div className="rs-forms">
              <h3 className="group-title" id={`${id}-forms`}>Forms</h3>
              <ul aria-labelledby={`${id}-forms`}>
                {list.map((f) => (
                  <li key={f.key}>
                    {/* Named in words a sentence would put them in: the
                        three lines drawn are blocks to a browser, which
                        would read them with stray spaces around commas. */}
                    <button className="rs-form" type="button" data-form-key={f.key} aria-label={`${f.name}, ${f.pageTitle}, ${responsesCount(f.count)}`} aria-current={f.key === chosen ? "true" : undefined} onClick={() => choose(f.key)}>
                      <span className="rs-form-name">{f.name}</span>
                      <span className="rs-form-meta">{f.pageTitle}<span className="rs-form-count">{responsesCount(f.count)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rs-list">
              {form && (
                <table className="rs-table" aria-busy={rows?.phase === "loading" ? true : undefined}>
                  <caption>
                    <span className="rs-caption-name">{form.name}</span> <span className="rs-caption-page">on {form.pageTitle}</span>
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Sent, newest first</th>
                      <th scope="col">Version</th>
                      <th scope="col">First written answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows?.items.map((r, index) => (
                      <tr key={r.id} className={opened?.id === r.id ? "rs-row-open" : undefined}>
                        <th scope="row">
                          <button
                            className="rs-open"
                            type="button"
                            data-response-id={r.id}
                            tabIndex={r.id === stop ? 0 : -1}
                            aria-current={opened?.id === r.id ? "true" : undefined}
                            aria-controls={`${id}-details`}
                            onClick={() => openResponse(r.id)}
                            onKeyDown={(event) => rove(event, index)}
                          >
                            {serverTime(r.submittedAt, now)}
                          </button>
                        </th>
                        <td>{r.versionNumber}</td>
                        <td className="rs-excerpt">
                          {r.excerpt
                            ? <><span className="rs-excerpt-label">{r.excerpt.label}:</span> {r.excerpt.text}{r.excerpt.truncated ? "…" : ""}</>
                            : <span className="rs-none">No written answer</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {rows?.phase === "loading" && <p className="rs-state-line" role="status">Reading the responses…</p>}
              {rows?.phase === "failed" && (
                <div className="rs-state-line">
                  <p className="error"><Icon name="error" />The responses could not be read: {rows.message}</p>
                  <button className="btn btn-small btn-secondary" type="button" onClick={retry}>Try again</button>
                </div>
              )}
              {rows?.phase === "ready" && rows.next !== null && (
                <div className="rs-older">
                  <button className="btn btn-small btn-secondary" type="button" data-older="" aria-disabled={rows.older === "loading" ? true : undefined} onClick={readOlder}>
                    {rows.older === "loading" ? "Reading older responses…" : "Show older responses"}
                  </button>
                  {rows.older === "failed" && <p className="error"><Icon name="error" />The older responses could not be read: {rows.message}</p>}
                </div>
              )}
            </div>

            <section className="rs-details" id={`${id}-details`} aria-labelledby={`${id}-details-title`}>
              {opened === null && (
                <>
                  <h3 className="visually-hidden" id={`${id}-details-title`}>Response</h3>
                  <p className="hint">Choose a response to read it whole.</p>
                </>
              )}
              {opened?.phase === "loading" && (
                <>
                  <h3 className="visually-hidden" id={`${id}-details-title`}>Response</h3>
                  <p className="hint">Reading the response…</p>
                </>
              )}
              {opened?.phase === "failed" && (
                <>
                  <h3 className="visually-hidden" id={`${id}-details-title`}>Response</h3>
                  <p className="error"><Icon name="error" />{opened.message}</p>
                </>
              )}
              {opened?.phase === "ready" && form && (
                <>
                  <h3 className="rs-details-title" id={`${id}-details-title`}>Sent {serverTime(opened.response.submittedAt, now)}</h3>
                  <p className="rs-details-meta">{versionWords(opened.response.versionNumber, form.liveVersion, form.pageTitle)}</p>
                  <dl className="rs-answers">
                    {answered(opened.response).map(({ field, text, given }) => (
                      <div key={field.name} className="rs-answer">
                        <dt>{field.label}</dt>
                        <dd className={given ? undefined : "rs-none"}>{text}</dd>
                      </div>
                    ))}
                  </dl>
                  <DeleteControl
                    when={serverTime(opened.response.submittedAt, now)}
                    deleting={deleting}
                    said={said}
                    onAsk={() => {
                      setSaid(null);
                      setDeleting("asking");
                    }}
                    onKeep={() => setDeleting(null)}
                    onDelete={() => void remove()}
                  />
                </>
              )}
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

// Delete, asked twice, as the media library asks: the question takes the
// focus on its safe answer, Keep it gives the focus back to Delete, and Esc
// in the question is Keep it, not the whole screen closing.
function DeleteControl({ when, deleting, said, onAsk, onKeep, onDelete }: { when: string; deleting: "asking" | "working" | null; said: string | null; onAsk: () => void; onKeep: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  const ask = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (deleting === "asking") keep.current?.focus();
    else if (asked.current) ask.current?.focus();
    asked.current = deleting === "asking";
  }, [deleting]);
  return (
    <div className="rs-delete">
      {deleting === "asking" ? (
        <div className="rs-confirm" role="group" aria-label={`Delete the response sent ${when}`} onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onKeep();
        }}>
          <p>Delete this response for good? The CMS keeps no other copy of it.</p>
          <div className="rs-confirm-buttons">
            <button ref={keep} className="btn btn-small btn-secondary" type="button" onClick={onKeep}>Keep it</button>
            <button className="btn btn-small btn-danger" type="button" onClick={onDelete}>Delete</button>
          </div>
        </div>
      ) : (
        <button ref={ask} className="btn btn-small btn-quiet rs-delete-btn" type="button" aria-disabled={deleting === "working" ? true : undefined} onClick={deleting === "working" ? undefined : onAsk}>
          <Icon name="trash" className="i i-xs" />{deleting === "working" ? "Deleting…" : "Delete response"}
        </button>
      )}
      <div aria-live="polite">{said && <p className="error"><Icon name="error" />{said}</p>}</div>
    </div>
  );
}
