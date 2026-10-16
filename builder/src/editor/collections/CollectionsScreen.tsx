// Collections, opened from the mark's menu beside the media library and
// the form responses (and from the phone's More): the site's types of
// content and their entries (docs/decisions/collections-are-typed-entries.md).
// On the left the collections, each with its address and its count, and
// New collection; on the right the one chosen, under two tabs: its entries
// (./EntryList.tsx), each opened in its form (./EntryForm.tsx) in the
// table's place, and its settings (./Settings.tsx), the way to its
// template among them. With none yet, the screen says what a collection is
// and makes the first (./NewCollection.tsx).
//
// The window is the media library's and the form responses': its size,
// head and footer, Esc and Close, the focus back where it was when it
// closes. On a phone's window it is the whole window, and goes one level
// at a time: the collections, then the one chosen, with the way back.
//
// What is written here is saved by its own Save, through the storage
// (./context.ts), not by the page: an entry, a collection's settings, a
// collection made or deleted are not commands on the document, are not in
// its history, and Undo does not take them back, as the media library's
// images and the form responses are not. Changes not saved yet are asked
// about before anything takes their place: another collection, the other
// tab, the template, closing.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { isStorageError, type Collection, type Entry } from "../../storage/adapter.ts";
import { useEnv, useUi } from "../context.tsx";
import { Dialog } from "../dialog.tsx";
import { Icon } from "../icons.tsx";
import { useLayoutMode } from "../layout-mode.ts";
import { useOptionalSession } from "../session.tsx";
import type { CollectionsAt } from "../ui-store.ts";
import { useCollectionsStorage, type CollectionsStorage } from "./context.ts";
import "./collections.css";
import { EntryForm } from "./EntryForm.tsx";
import { EntryList } from "./EntryList.tsx";
import { NewCollection } from "./NewCollection.tsx";
import type { Finding } from "./refusals.ts";
import { Settings } from "./Settings.tsx";
import { addressLine, collectionMeta, collectionsCount } from "./words.ts";

// The screen, while the interface's store says it is open.
export function CollectionsScreen() {
  const storage = useCollectionsStorage();
  const at = useUi((u) => u.collections);
  const { ui } = useEnv();
  if (!storage || !at) return null;
  return <Screen storage={storage} at={at} onClose={() => ui.getState().setCollections(null)} />;
}

type List = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; collections: Collection[] };
type Tab = "entries" | "settings";
type View = { kind: "list"; focus: number | "new" | null } | { kind: "entry"; entryId: number | null; refused?: readonly Finding[] | undefined };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// What a question before leaving says is not saved, and what comes after
// it once the person leaves.
interface Leaving {
  what: string;
  next: () => void;
}

function Screen({ storage, at, onClose }: { storage: CollectionsStorage; at: CollectionsAt; onClose: () => void }) {
  const { ui } = useEnv();
  const session = useOptionalSession();
  const livePages = session?.capabilities.livePages ?? true;
  const id = useId();
  const [list, setList] = useState<List>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  // The collection chosen; on a phone's window none at first, the list
  // being a level of its own there (../layout-mode.ts, narrow).
  const narrow = useLayoutMode() === "narrow";
  const [chosen, setChosen] = useState<number | null>(at.collectionId);
  const [tab, setTab] = useState<Tab>(at.tab ?? "entries");
  const [view, setView] = useState<View>({ kind: "list", focus: null });
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  // Whether what is open (an entry's form, the settings, a new collection)
  // holds changes not saved.
  const dirty = useRef(false);
  const onDirty = useCallback((on: boolean) => {
    dirty.current = on;
  }, []);

  // The window's layout as last drawn, for the list when it comes.
  const narrowNow = useRef(narrow);
  useLayoutEffect(() => {
    narrowNow.current = narrow;
  });
  const asked = useRef(at.collectionId);

  // The collections, read when the screen opens and on Try again: the one
  // asked for chosen, else the first (none on a phone's window), the focus
  // on it, or on the way to the first collection.
  useEffect(() => {
    let current = true;
    storage.listCollections().then(
      (collections) => {
        if (!current) return;
        const wanted = asked.current;
        const pick = wanted !== null && collections.some((c) => c.id === wanted) ? wanted : narrowNow.current ? null : (collections[0]?.id ?? null);
        setList({ phase: "ready", collections });
        setChosen(pick);
        focusNext.current = collections.length === 0 ? "[data-first-collection]" : pick === null ? "[data-collection-id]" : `[data-collection-id="${pick}"]`;
      },
      (error: unknown) => {
        if (current) setList({ phase: "failed", message: describe(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [storage, attempt]);

  useLayoutEffect(() => {
    const selector = focusNext.current;
    if (selector === null) return;
    focusNext.current = null;
    body.current?.closest(".dialog")?.querySelector<HTMLElement>(selector)?.focus();
  });

  const collections = list.phase === "ready" ? list.collections : [];
  const collection = collections.find((c) => c.id === chosen) ?? null;

  // Anything not saved is asked about first; then `next`. Text typed in a
  // field and not handed over yet counts too (../pending.ts: a field hands
  // it over at its pause, when it is left, or at Enter): Esc, or a choice
  // the field is not left for, would take it away with the form unasked.
  const leave = (next: () => void, what?: string) => {
    if (!dirty.current && ui.getState().pending.waiting === 0) {
      next();
      return;
    }
    setLeaving({ what: what ?? "", next });
  };
  const leaveWords = (): string => {
    if (creating) return "The new collection is not made yet.";
    if (view.kind === "entry" && tab === "entries") return "The changes to this entry are not saved.";
    return `The changes to the settings of ${collection?.name ?? "this collection"} are not saved.`;
  };
  const ask = (next: () => void) => leave(next, leaveWords());

  // A collection read again, its counts changed by its entries.
  const refresh = useCallback((collectionId: number) => {
    storage.getCollection(collectionId).then(
      (fresh) => setList((before) => (before.phase === "ready" ? { ...before, collections: before.collections.map((c) => (c.id === fresh.id ? fresh : c)) } : before)),
      () => undefined,
    );
  }, [storage]);

  // A collection's entries as its list read them: its counts, if another
  // tab changed them since the collection was read.
  const counted = (collectionId: number, total: number, published: number) => setList((before) => (before.phase === "ready" && before.collections.some((c) => c.id === collectionId && (c.entryCount !== total || c.publishedCount !== published))
    ? { ...before, collections: before.collections.map((c) => (c.id === collectionId ? { ...c, entryCount: total, publishedCount: published } : c)) }
    : before));

  const choose = (collectionId: number) => {
    if (collectionId === chosen && !creating) return;
    ask(() => {
      dirty.current = false;
      setCreating(false);
      setChosen(collectionId);
      setTab("entries");
      setView({ kind: "list", focus: null });
    });
  };
  const toTab = (next: Tab) => {
    if (next === tab) return;
    ask(() => {
      dirty.current = false;
      setTab(next);
      setView({ kind: "list", focus: null });
    });
  };
  const startNew = () => ask(() => {
    dirty.current = false;
    setCreating(true);
  });
  const close = () => ask(() => {
    dirty.current = false;
    onClose();
  });
  // On a phone's window, back from a collection to the list of them.
  const toList = () => ask(() => {
    dirty.current = false;
    setCreating(false);
    focusNext.current = chosen === null ? "[data-new-collection]" : `[data-collection-id="${chosen}"]`;
    setChosen(null);
  });

  // The template, on the canvas, as a part opens: the screen closes first,
  // the focus going back where it was, and the page open is saved first
  // (the shell's openPage).
  const editTemplate = (target: Collection) => ask(() => {
    dirty.current = false;
    onClose();
    void session?.openPage(target.template.id).then((why) => {
      if (why) ui.getState().say(why);
    });
  });

  const made = (fresh: Collection) => {
    dirty.current = false;
    setList((before) => (before.phase === "ready" ? { ...before, collections: [...before.collections, fresh] } : before));
    setCreating(false);
    setChosen(fresh.id);
    setTab("entries");
    setView({ kind: "list", focus: "new" });
    setNote(`${fresh.name} is made: write its first entry.`);
  };

  const deleted = (gone: Collection) => {
    dirty.current = false;
    const index = collections.findIndex((c) => c.id === gone.id);
    const rest = collections.filter((c) => c.id !== gone.id);
    const next = rest[index] ?? rest[index - 1] ?? null;
    setList((before) => (before.phase === "ready" ? { ...before, collections: before.collections.filter((c) => c.id !== gone.id) } : before));
    setChosen(narrow ? null : (next?.id ?? null));
    setTab("entries");
    setView({ kind: "list", focus: null });
    focusNext.current = next && !narrow ? `[data-collection-id="${next.id}"]` : rest.length === 0 ? "[data-first-collection]" : "[data-new-collection]";
  };

  const level = creating || collection !== null ? "pane" : "list";
  const footHint = "Entries and settings are saved with their own buttons, apart from the page: Undo does not take them back.";

  return (
    <Dialog
      title="Collections"
      className="dlg-collections"
      bodyClassName="co-main"
      closeLabel="Close collections"
      tools={<p className="dlg-count">{list.phase === "ready" ? collectionsCount(collections.length) : ""}</p>}
      onClose={close}
      footer={
        <>
          <p className="hint">{footHint}</p>
          <p className="co-note" role="status">{note}</p>
          <button className="btn btn-secondary" type="button" data-close="" onClick={close}>Close</button>
        </>
      }
    >
      <div ref={body} className="co-body" data-level={level}>
        {list.phase === "loading" && <p className="co-state co-state-wide" role="status">Reading the collections…</p>}
        {list.phase === "failed" && (
          <div className="co-state co-state-wide">
            <p className="error"><Icon name="error" />The collections could not be read: {list.message}</p>
            <button className="btn btn-small btn-secondary" type="button" onClick={() => {
              setList({ phase: "loading" });
              setAttempt((n) => n + 1);
            }}>Try again</button>
          </div>
        )}
        {list.phase === "ready" && collections.length === 0 && !creating && (
          <div className="co-empty co-empty-wide">
            <p className="co-empty-title">No collections yet</p>
            <p className="hint">A collection keeps entries of one kind, news or events, each with the same fields: you write them here, and each one is drawn with the collection’s template.</p>
            <button className="btn btn-dark" type="button" data-first-collection="" onClick={startNew}><Icon name="plus" />New collection</button>
          </div>
        )}
        {list.phase === "ready" && (collections.length > 0 || creating) && (
          <>
            <nav className="co-list" aria-labelledby={`${id}-list`}>
              <h3 className="group-title" id={`${id}-list`}>Collections</h3>
              {collections.length > 0 && (
                <ul>
                  {collections.map((c) => (
                    <li key={c.id}>
                      <button className="co-collection" type="button" data-collection-id={c.id} aria-current={c.id === chosen && !creating ? "true" : undefined} aria-label={`${c.name}, ${collectionMeta(c).replace(" · ", ", ")}`} onClick={() => choose(c.id)}>
                        <span className="co-collection-name">{c.name}</span>
                        <span className="co-collection-meta">{collectionMeta(c)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className={`btn btn-small btn-quiet co-new-collection${creating ? " co-new-current" : ""}`} type="button" data-new-collection="" aria-current={creating ? "true" : undefined} onClick={startNew}><Icon name="plus" className="i i-xs" />New collection</button>
            </nav>

            <section className="co-pane" aria-label={creating ? "New collection" : collection?.name ?? "Collection"}>
              {leaving && (
                <LeaveQuestion
                  what={leaving.what}
                  onStay={() => setLeaving(null)}
                  onLeave={() => {
                    const next = leaving.next;
                    setLeaving(null);
                    next();
                  }}
                />
              )}
              {creating && (
                <NewCollection
                  storage={storage}
                  livePages={livePages}
                  onDirty={onDirty}
                  onMade={made}
                  onCancel={() => ask(() => {
                    dirty.current = false;
                    setCreating(false);
                    focusNext.current = "[data-new-collection]";
                  })}
                />
              )}
              {!creating && collection && (
                <>
                  <div className="co-head">
                    <button className="btn btn-small btn-quiet co-back-list" type="button" onClick={toList}><Icon name="arrow-left" />Collections</button>
                    <h3 className="co-head-name">{collection.name}</h3>
                    <p className="co-head-meta">{addressLine(collection.prefix, livePages)}</p>
                  </div>
                  <Tabs id={id} tab={tab} onTab={toTab} />
                  <div className="co-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
                    {tab === "entries" && view.kind === "list" && (
                      <EntryList
                        key={collection.id}
                        storage={storage}
                        collection={collection}
                        livePages={livePages}
                        focus={view.focus}
                        onOpen={(entryId, refused) => setView({ kind: "entry", entryId, refused })}
                        onChanged={() => refresh(collection.id)}
                        onCounted={(total, published) => counted(collection.id, total, published)}
                        say={setNote}
                      />
                    )}
                    {tab === "entries" && view.kind === "entry" && (
                      <EntryForm
                        key={`${collection.id}-${view.entryId ?? "new"}`}
                        storage={storage}
                        collection={collection}
                        entryId={view.entryId}
                        livePages={livePages}
                        refused={view.refused}
                        onDirty={onDirty}
                        onChanged={(entry: Entry) => refresh(entry.collectionId)}
                        onBack={(entryId) => ask(() => {
                          dirty.current = false;
                          setView({ kind: "list", focus: entryId ?? "new" });
                        })}
                      />
                    )}
                    {tab === "settings" && (
                      <Settings
                        key={collection.id}
                        storage={storage}
                        collection={collection}
                        livePages={livePages}
                        onDirty={onDirty}
                        say={setNote}
                        onSaved={(fresh) => setList((before) => (before.phase === "ready" ? { ...before, collections: before.collections.map((c) => (c.id === fresh.id ? fresh : c)) } : before))}
                        onDeleted={deleted}
                        onEditTemplate={() => editTemplate(collection)}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

// Entries and Settings, the tabs of a collection: the arrows go from one
// to the other, as the sidebar's and the drawers' tabs do.
function Tabs({ id, tab, onTab }: { id: string; tab: Tab; onTab: (tab: Tab) => void }) {
  const tabs: readonly Tab[] = ["entries", "settings"];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div className="dtabs co-tabs" role="tablist" aria-label="Collection">
      {tabs.map((t, index) => (
        <button
          key={t}
          ref={(element) => {
            refs.current[index] = element;
          }}
          id={`${id}-${t}`}
          role="tab"
          type="button"
          aria-selected={tab === t}
          aria-controls={`${id}-panel`}
          tabIndex={tab === t ? 0 : -1}
          onClick={() => onTab(t)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = tabs[(index + 1) % tabs.length]!;
            onTab(next);
            refs.current[tabs.indexOf(next)]?.focus();
          }}
        >
          {t === "entries" ? "Entries" : "Settings"}
        </button>
      ))}
    </div>
  );
}

// Changes not saved, before something takes their place: asked, the focus
// on the safe answer, Esc staying. The Shop screen asks it too
// (../shop/ShopScreen.tsx).
export function LeaveQuestion({ what, onStay, onLeave }: { what: string; onStay: () => void; onLeave: () => void }) {
  const id = useId();
  const stay = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    stay.current?.focus();
  }, []);
  const keep = () => {
    onStay();
    if (back.current instanceof HTMLElement && back.current.isConnected) back.current.focus();
  };
  return (
    <div className="co-leave" role="alertdialog" aria-modal="false" aria-labelledby={`${id}-words`} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      keep();
    }}>
      <Icon name="warning" />
      <p id={`${id}-words`}><strong>Leave without saving?</strong> {what}</p>
      <div className="co-leave-buttons">
        <button ref={stay} className="btn btn-small btn-dark" type="button" onClick={keep}>Keep editing</button>
        <button className="btn btn-small btn-secondary" type="button" onClick={onLeave}>Leave without saving</button>
      </div>
    </div>
  );
}

