// A collection's entries (the design's "a collection's entries as a
// table"): each entry's title and slug, whether it is a draft, published
// or changed since, when it last changed, and its first two fields' values
// in words; a search over the titles, as the storage searches them
// (listEntries, its q), and the entries in the collection's own order.
// Each row opens its entry's form from its title, and publishes or
// unpublishes it, or deletes it after asking, where it is.
//
// A publish the storage refuses (a field made required since the entry was
// saved) opens the entry's form with the fields it named marked, since
// they are filled in there.
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { isStorageError, type Collection, type Entry } from "../../storage/adapter.ts";
import { useEnv } from "../context.tsx";
import { serverTime } from "../history-words.ts";
import { Icon } from "../icons.tsx";
import type { CollectionsStorage } from "./context.ts";
import type { Finding } from "./refusals.ts";
import { entriesLine, entryAddress, entryStatus, STATUS_DOTS, STATUS_WORDS, valueWords } from "./words.ts";

export interface EntryListProps {
  storage: CollectionsStorage;
  collection: Collection;
  livePages: boolean;
  // The entry whose row takes the focus once drawn (back from its form),
  // or "new" for New entry.
  focus: number | "new" | null;
  // Opens an entry's form, or a new one's (null); with the refusals of a
  // publish to show there.
  onOpen: (entryId: number | null, refused?: readonly Finding[]) => void;
  // An entry made live, taken off or deleted: the collection's counts
  // change.
  onChanged: () => void;
  // The whole list read: how many entries it holds and how many are live,
  // which another tab may have changed since the collection was read.
  onCounted: (total: number, published: number) => void;
  // A sentence for the screen's own line.
  say: (sentence: string) => void;
}

type Rows = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; entries: Entry[]; query: string };
type Asking = { id: number; phase: "asking" | "working" } | null;

// How long the search waits for the typing to pause.
const SEARCH_AFTER_MS = 250;

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));
const named = (entry: Entry) => `“${entry.title}”`;

export function EntryList({ storage, collection, livePages, focus, onOpen, onChanged, onCounted, say }: EntryListProps) {
  const { clock } = useEnv();
  const id = useId();
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [rows, setRows] = useState<Rows>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState<Asking>(null);
  const [working, setWorking] = useState<number | null>(null);
  const table = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(focus === null ? null : focus === "new" ? "[data-new-entry]" : `[data-entry-id="${focus}"]`);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The search waits for a pause in the typing, then asks the storage.
  useEffect(() => {
    if (query === asked) return undefined;
    const timer = clock.setTimeout(() => setAsked(query), SEARCH_AFTER_MS);
    return () => clock.clearTimeout(timer);
  }, [query, asked, clock]);

  // The entries, read as the list opens, at each search, and on Try
  // again; an answer that comes after a later question is dropped.
  const wanted = useRef(0);
  const counted = useRef(onCounted);
  useLayoutEffect(() => {
    counted.current = onCounted;
  });
  useEffect(() => {
    const ticket = ++wanted.current;
    const q = asked.trim();
    storage.listEntries(collection.id, q === "" ? {} : { q }).then(
      (entries) => {
        if (ticket !== wanted.current) return;
        setRows({ phase: "ready", entries, query: q });
        if (q === "") counted.current(entries.length, entries.filter((e) => e.published !== null).length);
      },
      (error: unknown) => {
        if (ticket === wanted.current) setRows({ phase: "failed", message: describe(error) });
      },
    );
  }, [storage, collection.id, asked, attempt]);

  // The focus where the list was asked to put it, once drawn.
  useLayoutEffect(() => {
    const selector = focusNext.current;
    if (selector === null || rows.phase !== "ready") return;
    focusNext.current = null;
    table.current?.closest(".co-pane")?.querySelector<HTMLElement>(selector)?.focus();
  });

  const entries = rows.phase === "ready" ? rows.entries : [];
  const shown = collection.fields.slice(0, 2);
  const now = clock.now();

  const replace = (next: Entry) => setRows((before) => (before.phase === "ready" ? { ...before, entries: before.entries.map((e) => (e.id === next.id ? next : e)) } : before));

  const publish = async (entry: Entry) => {
    setWorking(entry.id);
    try {
      const outcome = await storage.publishEntry(collection.id, entry.id, { revision: entry.revision });
      if (!mounted.current) return;
      if (!outcome.ok) {
        if (outcome.problem.kind === "invalid") {
          onOpen(entry.id, outcome.problem.errors);
          return;
        }
        say(`Not published: ${named(entry)} was saved in another tab since this list was read. Open it to see it as it is now.`);
        setAttempt((n) => n + 1);
        return;
      }
      replace(outcome.value);
      say(livePages ? `${named(entry)} is published: visitors find it at ${entryAddress(collection.prefix, outcome.value.slug)}.` : `${named(entry)} is published in this browser.`);
      onChanged();
    } catch (error) {
      if (mounted.current) say(`Not published: ${describe(error)}`);
    } finally {
      if (mounted.current) setWorking(null);
    }
  };

  const unpublish = async (entry: Entry) => {
    setWorking(entry.id);
    try {
      const taken = await storage.unpublishEntry(collection.id, entry.id);
      if (!mounted.current) return;
      replace(taken);
      say(`${named(entry)} is a draft again${livePages ? ": visitors no longer find it" : ""}.`);
      onChanged();
    } catch (error) {
      if (mounted.current) say(`Not unpublished: ${describe(error)}`);
    } finally {
      if (mounted.current) setWorking(null);
    }
  };

  const remove = async (entry: Entry) => {
    setDeleting({ id: entry.id, phase: "working" });
    let already = false;
    try {
      await storage.deleteEntry(collection.id, entry.id);
    } catch (error) {
      if (isStorageError(error) && error.failure.kind === "not-found") already = true;
      else {
        if (mounted.current) {
          setDeleting(null);
          say(`${named(entry)} was not deleted: ${describe(error)}`);
          focusNext.current = `[data-delete-entry="${entry.id}"]`;
        }
        return;
      }
    }
    if (!mounted.current) return;
    // The focus goes to the entry that took its place, else the one above
    // it, else New entry.
    const at = entries.findIndex((e) => e.id === entry.id);
    const rest = entries.filter((e) => e.id !== entry.id);
    const neighbour = rest[at] ?? rest[at - 1];
    focusNext.current = neighbour ? `[data-entry-id="${neighbour.id}"]` : "[data-new-entry]";
    setDeleting(null);
    setRows((before) => (before.phase === "ready" ? { ...before, entries: before.entries.filter((e) => e.id !== entry.id) } : before));
    say(already ? `${named(entry)} had already been deleted.` : `${named(entry)} was deleted.`);
    onChanged();
  };

  const searching = query.trim() !== "" || asked.trim() !== "";
  const total = rows.phase === "ready" && rows.query === "" ? rows.entries.length : null;
  const none = rows.phase === "ready" && rows.entries.length === 0 && rows.query === "" && !searching;

  return (
    <div ref={table} className="co-entries">
      {!none && (
        <div className="co-toolbar">
          <label className="search search-inline co-search">
            <Icon name="search" />
            <input type="search" placeholder="Search titles" aria-label={`Search the titles of ${collection.name}`} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <p className="co-count" aria-live="polite">
            {rows.phase === "ready" && (rows.query === "" ? entriesLine(rows.entries.length, rows.entries.filter((e) => e.published !== null).length) : `${rows.entries.length === 1 ? "1 entry holds" : `${rows.entries.length} entries hold`} “${rows.query}”`)}
          </p>
          <button className="btn btn-secondary" type="button" data-new-entry="" onClick={() => onOpen(null)}><Icon name="plus" />New entry</button>
        </div>
      )}
      {rows.phase === "loading" && <p className="co-state" role="status">Reading the entries…</p>}
      {rows.phase === "failed" && (
        <div className="co-state">
          <p className="error"><Icon name="error" />The entries could not be read: {rows.message}</p>
          <button className="btn btn-small btn-secondary" type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}
      {none && (
        <div className="co-empty">
          <p className="co-empty-title">No entries yet</p>
          <p className="hint">Each entry of {collection.name} has a title, an address under /{collection.prefix}/ and the fields its settings list. It stays a draft until you publish it.</p>
          <button className="btn btn-dark" type="button" data-new-entry="" onClick={() => onOpen(null)}><Icon name="plus" />Write the first entry</button>
        </div>
      )}
      {rows.phase === "ready" && rows.entries.length === 0 && !none && (
        <p className="co-state" role="status">{rows.query === "" ? "No entries yet." : `No entry’s title holds “${rows.query}”.`}</p>
      )}
      {rows.phase === "ready" && rows.entries.length > 0 && (
        <table className="co-table">
          <caption className="visually-hidden">Entries of {collection.name}{total === null ? `, titles holding “${rows.query}”` : ""}, in the collection’s order</caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col" className="co-col-status">Status</th>
              <th scope="col" className="co-col-updated">Updated</th>
              {shown.map((field) => <th key={field.key} scope="col" className="co-col-field">{field.label}</th>)}
              <th scope="col" className="co-col-actions"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const status = entryStatus(entry);
              const asking = deleting?.id === entry.id ? deleting : null;
              const busy = working === entry.id || asking?.phase === "working";
              return (
                <Fragment key={entry.id}>
                <tr className={asking ? "co-row-asking" : undefined}>
                  <th scope="row">
                    <button className="co-open" type="button" data-entry-id={entry.id} aria-label={`Edit ${entry.title}`} onClick={() => onOpen(entry.id)}>
                      <span className="co-entry-title">{entry.title}</span>
                      <span className="co-entry-slug">{entryAddress(collection.prefix, entry.slug)}</span>
                    </button>
                  </th>
                  <td className="co-col-status"><span className="co-status"><span className={STATUS_DOTS[status]} aria-hidden="true" />{STATUS_WORDS[status]}</span></td>
                  <td className="co-col-updated">{serverTime(entry.updatedAt, now)}</td>
                  {shown.map((field) => {
                    const words = valueWords(field, entry.values[field.key]);
                    return <td key={field.key} className="co-col-field">{words === null ? <span className="co-none">Not set</span> : <span className="co-value">{words}</span>}</td>;
                  })}
                  <td className="co-col-actions">
                    <div className="co-row-actions">
                      {status === "published"
                        ? <button className="btn btn-small btn-secondary" type="button" aria-label={`Unpublish ${entry.title}`} aria-disabled={busy ? true : undefined} onClick={busy ? undefined : () => void unpublish(entry)}>Unpublish</button>
                        : <button className="btn btn-small btn-secondary" type="button" aria-label={`Publish ${entry.title}`} aria-disabled={busy ? true : undefined} onClick={busy ? undefined : () => void publish(entry)}>Publish</button>}
                      <button className="ibtn ibtn-small co-delete" type="button" data-delete-entry={entry.id} aria-label={`Delete ${entry.title}`} title="Delete" aria-disabled={busy ? true : undefined} onClick={busy ? undefined : () => setDeleting({ id: entry.id, phase: "asking" })}><Icon name="trash" className="i i-xs" /></button>
                    </div>
                  </td>
                </tr>
                {asking && (
                  <tr className="co-row-question">
                    <td colSpan={4 + shown.length}>
                      <DeleteQuestion
                        id={`${id}-delete-${entry.id}`}
                        entry={entry}
                        address={status === "draft" ? null : entryAddress(collection.prefix, entry.published?.slug ?? entry.slug)}
                        livePages={livePages}
                        working={asking.phase === "working"}
                        onKeep={() => {
                          setDeleting(null);
                          focusNext.current = `[data-delete-entry="${entry.id}"]`;
                        }}
                        onDelete={() => void remove(entry)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Delete, asked twice, as the media library and the form responses ask:
// the question takes the focus on its safe answer, and Esc in it is Keep
// it, not the whole screen closing.
function DeleteQuestion({ id, entry, address, livePages, working, onKeep, onDelete }: { id: string; entry: Entry; address: string | null; livePages: boolean; working: boolean; onKeep: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div className="co-confirm" role="group" aria-labelledby={`${id}-words`} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onKeep();
    }}>
      <p id={`${id}-words`}>
        Delete {named(entry)} for good?
        {address !== null && (livePages ? ` It is published: visitors stop finding it at ${address}.` : " It is published here: it goes from this browser too.")}
        {" "}Nothing of it can be brought back.
      </p>
      <div className="co-confirm-buttons">
        <button ref={keep} className="btn btn-small btn-secondary" type="button" onClick={onKeep}>Keep it</button>
        <button className="btn btn-small btn-danger" type="button" aria-disabled={working ? true : undefined} onClick={working ? undefined : onDelete}>{working ? "Deleting…" : "Delete entry"}</button>
      </div>
    </div>
  );
}
