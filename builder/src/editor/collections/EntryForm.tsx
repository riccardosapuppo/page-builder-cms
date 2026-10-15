// An entry's form (the design's "an entry's form"): its title, its slug
// (suggested from the title while the entry is new, its rules said as a
// page's address says them), then one control per field of its collection
// (./FieldInput.tsx). Save is one call to the storage with everything, at
// the revision the form was opened at (saveEntry; createEntry for a new
// one), so another tab's save meets a conflict instead of being saved
// over; Publish saves what waits first, then puts it live at that
// revision; Unpublish takes it off, the draft kept.
//
// What the form holds is checked as the storage checks it before it is
// sent (validateEntry, ../../shared/validate.ts): a required field with
// nothing, a number past its bounds, a day that does not exist, each said
// at its field, as the sidebar marks a refused value; the storage's own
// refusals (a slug another entry has, an image gone from the library) are
// laid on their fields the same way.
//
// These are the storage's operations, not commands on the page: they are
// not in the page's history, and Undo does not take them back (as with the
// media library and the form responses). A conflict is settled the
// person's way, as the page's is: Reload takes the entry as the other tab
// saved it, Keep mine saves this one over it.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { sameJson } from "../../document/json.ts";
import type { EntryContent } from "../../shared/collection.ts";
import { validateEntry } from "../../shared/validate.ts";
import { isStorageError, type Collection, type Entry } from "../../storage/adapter.ts";
import { defaultSaveId } from "../../storage/autosave.ts";
import { TextField } from "../controls.tsx";
import { useEnv } from "../context.tsx";
import { serverTime } from "../history-words.ts";
import { Icon } from "../icons.tsx";
import { coarsePointer } from "../layout-mode.ts";
import { slugFrom } from "../session.tsx";
import type { CollectionsStorage } from "./context.ts";
import { FieldInput, type ValueUpdate } from "./FieldInput.tsx";
import { entryIssues, issueCount, NO_ENTRY_ISSUES, type EntryIssues, type Finding } from "./refusals.ts";
import { entryContent, formValues, type FormValues } from "./values.ts";
import { entryAddress, entryStatus, STATUS_DOTS, STATUS_WORDS } from "./words.ts";

export interface EntryFormProps {
  storage: CollectionsStorage;
  collection: Collection;
  // The entry to open, or null for a new one.
  entryId: number | null;
  // Whether the storage serves what is published (the CMS), or only keeps
  // it (the browser demo): the words say where the entry is found.
  livePages: boolean;
  // Refusals to show as the form opens: a publish from the list that the
  // storage refused, at the fields it named.
  refused?: readonly Finding[] | undefined;
  // Back to the list, on the entry the form was on (null for a new one
  // never saved).
  onBack: (entryId: number | null) => void;
  // The entry changed in the storage (made, saved, published,
  // unpublished): the list and the counts read it again.
  onChanged: (entry: Entry) => void;
  // Whether the form holds changes not saved, for the screen to ask before
  // they are left.
  onDirty: (dirty: boolean) => void;
}

interface Held {
  title: string;
  slug: string;
  // The slug follows the title while the entry is new and the person has
  // not written a slug of their own.
  slugOwn: boolean;
  values: FormValues;
}

// What a save that got no answer sent: sent again unchanged, it carries
// the same saveId, so a save that reached the storage is answered as saved.
interface Unanswered {
  saveId: string;
  revision: number;
  content: EntryContent;
}

type Busy = "saving" | "publishing" | "unpublishing" | "reloading" | null;
type Doing = "Not saved" | "Not published";

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

export function EntryForm({ storage, collection, entryId, livePages, refused, onBack, onChanged, onDirty }: EntryFormProps) {
  const { ui, clock } = useEnv();
  const id = useId();
  const fields = collection.fields;
  const [phase, setPhase] = useState<{ kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready" }>(entryId === null ? { kind: "ready" } : { kind: "loading" });
  const [start] = useState<Held>(() => ({ title: "", slug: "", slugOwn: false, values: formValues(fields, null).values }));
  // The entry as last read or saved, null for one not made yet; and the
  // form's values. Each is drawn from its state, and kept in a ref too,
  // which an operation reads at once: the fields hand over what they hold
  // just before a save (../pending.ts), and after a save the publish that
  // follows needs its revision, both before the next drawing.
  const [entry, setEntry] = useState<Entry | null>(null);
  const kept = useRef<Entry | null>(null);
  const [now, setNow] = useState<Held>(start);
  const held = useRef<Held>(start);
  // The content as last saved or read, to tell a change from none.
  const [baseline, setBaseline] = useState<EntryContent>(() => entryContent(collection, start.title, start.slug, start.values));
  const [left, setLeft] = useState<string[]>([]);
  const [issues, setIssues] = useState<EntryIssues>(() => (refused && refused.length > 0 ? entryIssues(fields, refused) : NO_ENTRY_ISSUES));
  const [busy, setBusy] = useState<Busy>(null);
  // What the last operation did, or why it did not; one about the marked
  // fields goes once none is marked any more.
  const [said, setSaidLine] = useState(() => (refused && refused.length > 0 ? { text: "Not published: fill in the marked fields, then publish.", ofIssues: true } : { text: "", ofIssues: false }));
  const setSaid = (text: string, ofIssues = false) => setSaidLine({ text, ofIssues });
  const [conflict, setConflict] = useState(false);
  const unanswered = useRef<Unanswered | null>(null);
  const form = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const keep = useCallback((next: Entry) => {
    kept.current = next;
    setEntry(next);
  }, []);
  const hold = useCallback((next: Held) => {
    held.current = next;
    setNow(next);
  }, []);
  // The collection as the latest drawing had it, for the entry read when
  // it comes: read again after a save, the collection is a new object, and
  // the form is not read again for it.
  const definition = useRef(collection);
  useLayoutEffect(() => {
    definition.current = collection;
  });
  // The entry read: what the form shows from now on.
  const take = useCallback((read: Entry) => {
    const { values, left: notTaken } = formValues(definition.current.fields, read.values);
    hold({ title: read.title, slug: read.slug, slugOwn: true, values });
    setLeft(notTaken);
    setBaseline(entryContent(definition.current, read.title, read.slug, values));
    keep(read);
  }, [hold, keep]);

  // The entry, read as the form opens: its revision is the one a save
  // starts from.
  useEffect(() => {
    if (entryId === null) return undefined;
    let current = true;
    storage.getEntry(collection.id, entryId).then(
      (read) => {
        if (!current) return;
        take(read);
        setPhase({ kind: "ready" });
      },
      (error: unknown) => {
        if (current) setPhase({ kind: "failed", message: isStorageError(error) && error.failure.kind === "not-found" ? "This entry is no longer kept: it was deleted elsewhere." : `It could not be read: ${describe(error)}` });
      },
    );
    return () => {
      current = false;
    };
  }, [storage, collection.id, entryId, take]);

  const content = entryContent(collection, now.title, now.slug, now.values);
  const changed = !sameJson(content, baseline);
  const status = entry ? entryStatus(entry) : null;
  // A new entry with something written, or a kept one with a change or
  // with values its fields no longer take, which a save leaves out.
  const savable = entry === null ? changed : changed || left.length > 0;
  useEffect(() => {
    onDirty(changed);
  }, [changed, onDirty]);

  // Closing the tab with changes not saved asks first, as the page does.
  useEffect(() => {
    if (!changed) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  // The title as the form opens, for a pointer that has a keyboard; with a
  // finger, the way back (no keyboard opens unasked).
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || phase.kind !== "ready") return;
    opened.current = true;
    const target = coarsePointer() ? form.current?.querySelector<HTMLElement>("[data-entry-back]") : form.current?.querySelector<HTMLElement>("[data-entry-title] input");
    target?.focus();
  });

  const change = (next: Partial<Held>) => hold({ ...held.current, ...next });
  // A refusal goes from its control once the person changes what it was
  // about; the next save checks it all again.
  const forget = (member: "title" | "slug" | { key: string }) => setIssues((now) => {
    if (member === "title" || member === "slug") return now[member].length === 0 ? now : { ...now, [member]: [] };
    const slots = Object.entries(now.values).filter(([slot]) => slot !== member.key && !slot.startsWith(`${member.key}/`));
    return slots.length === Object.keys(now.values).length ? now : { ...now, values: Object.fromEntries(slots) };
  });

  // The first field a refusal marks, its control focused.
  const focusFirstIssue = (found: EntryIssues) => {
    const marked = [
      found.title.length > 0 ? "[data-entry-title]" : null,
      found.slug.length > 0 ? "[data-entry-slug]" : null,
      ...fields.filter((f) => Object.keys(found.values).some((k) => k === f.key || k.startsWith(`${f.key}/`))).map((f) => `[data-field-key="${f.key}"]`),
    ].find((selector) => selector !== null);
    if (!marked) return;
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`${marked} :is(input, textarea, select, [contenteditable="true"], button)`)?.focus());
  };

  const refuse = (errors: readonly Finding[], doing: Doing) => {
    const found = entryIssues(fields, errors);
    setIssues(found);
    setSaid(`${doing}: ${found.other[0] ?? "a field needs a change, marked below."}`, true);
    focusFirstIssue(found);
  };

  // Saves what the form holds over the entry at `revision`, a save sent
  // before with no answer sent again unchanged; the entry as saved, or why
  // not.
  const send = async (over: Entry, sending: EntryContent): Promise<{ saved: Entry } | { conflict: true } | { refused: readonly Finding[] }> => {
    let revision = over.revision;
    // A second try only when the first meets the save this form sent
    // before and got no answer for, which did reach the storage.
    for (let attempt = 0; ; attempt += 1) {
      const before = unanswered.current;
      const saveId = before && before.revision === revision && sameJson(before.content, sending) ? before.saveId : defaultSaveId();
      let outcome;
      try {
        outcome = await storage.saveEntry(collection.id, over.id, { ...sending, revision, saveId });
      } catch (error) {
        if (isStorageError(error) && error.failure.kind === "unknown") unanswered.current = { saveId, revision, content: sending };
        throw error;
      }
      if (outcome.ok) return { saved: outcome.value };
      const problem = outcome.problem;
      if (problem.kind === "conflict" && attempt === 0 && before !== null && problem.lastSaveId === before.saveId) {
        unanswered.current = null;
        revision = problem.currentRevision;
        continue;
      }
      return problem.kind === "conflict" ? { conflict: true } : { refused: problem.errors };
    }
  };

  // Checks the form as the storage would, then saves it: the entry as
  // saved, or null when it was not (said, and marked where it was refused).
  const save = async (doing: Doing): Promise<Entry | null> => {
    // The text still in a field is handed over first; a field that refuses
    // what it holds keeps it, and nothing is sent.
    if (!ui.getState().pending.deliver()) {
      setSaid(`${doing}: a field holds what it cannot take. Change it first.`);
      return null;
    }
    const sending = entryContent(collection, held.current.title, held.current.slug, held.current.values);
    const checked = validateEntry(collection, sending);
    if (!checked.valid) {
      const found = entryIssues(fields, checked.errors);
      const count = issueCount(found);
      setIssues(found);
      setSaid(`${doing}: ${count === 1 ? "one field needs" : `${count} fields need`} a change, marked below.`, true);
      focusFirstIssue(found);
      return null;
    }
    setIssues(NO_ENTRY_ISSUES);
    setSaid("");
    setBusy("saving");
    try {
      const over = kept.current;
      let saved: Entry;
      if (over === null) {
        let outcome;
        try {
          outcome = await storage.createEntry(collection.id, sending);
        } catch (error) {
          // No answer: the entry may have been made. Found by its slug, it
          // is this form's from now on.
          const found = isStorageError(error) && error.failure.kind === "unknown"
            ? (await storage.listEntries(collection.id).catch(() => [])).find((e) => e.slug === sending.slug && e.title === sending.title)
            : undefined;
          if (!found) throw error;
          outcome = { ok: true as const, value: found };
        }
        if (!outcome.ok) {
          if (mounted.current) refuse(outcome.problem.errors, doing);
          return null;
        }
        saved = outcome.value;
      } else {
        const sent = await send(over, sending);
        if (!mounted.current) return null;
        if ("conflict" in sent) {
          setConflict(true);
          return null;
        }
        if ("refused" in sent) {
          refuse(sent.refused, doing);
          return null;
        }
        saved = sent.saved;
      }
      unanswered.current = null;
      if (!mounted.current) return saved;
      // What was typed while it travelled stays, a change of its own.
      hold({ ...held.current, slugOwn: true });
      setLeft([]);
      setBaseline(sending);
      setConflict(false);
      keep(saved);
      onChanged(saved);
      return saved;
    } catch (error) {
      if (mounted.current) setSaid(`${doing}: ${describe(error)} Your changes are still here: try again.`);
      return null;
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const saveNow = async () => {
    const saved = await save("Not saved");
    if (saved && mounted.current) setSaid(`Saved, ${serverTime(saved.updatedAt, clock.now())}.`);
  };

  const publish = async () => {
    let current = kept.current;
    if (current === null || savable) current = await save("Not published");
    if (current === null || !mounted.current) return;
    setBusy("publishing");
    try {
      const outcome = await storage.publishEntry(collection.id, current.id, { revision: current.revision });
      if (!mounted.current) return;
      if (!outcome.ok) {
        if (outcome.problem.kind === "conflict") setConflict(true);
        else refuse(outcome.problem.errors, "Not published");
        return;
      }
      setIssues(NO_ENTRY_ISSUES);
      keep(outcome.value);
      const at = entryAddress(collection.prefix, outcome.value.slug);
      setSaid(livePages ? `Published: visitors find it at ${at}.` : `Published in this browser. In the full system, visitors find it at ${at}.`);
      onChanged(outcome.value);
    } catch (error) {
      if (mounted.current) setSaid(`Not published: ${describe(error)}`);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const unpublish = async () => {
    const current = kept.current;
    if (!current) return;
    setBusy("unpublishing");
    try {
      const taken = await storage.unpublishEntry(collection.id, current.id);
      if (!mounted.current) return;
      keep(taken);
      setSaid(livePages ? "Unpublished: visitors no longer find it. Its draft is kept." : "Unpublished: it is a draft again, kept in this browser.");
      onChanged(taken);
    } catch (error) {
      if (mounted.current) setSaid(`Not unpublished: ${describe(error)}`);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  // The conflict, settled the person's way: the entry as the other tab
  // saved it, or this form's saved over that.
  const settle = async (choice: "reload" | "keep") => {
    const current = kept.current;
    if (!current) return;
    setBusy("reloading");
    let read;
    try {
      read = await storage.getEntry(collection.id, current.id);
    } catch (error) {
      if (mounted.current) {
        setBusy(null);
        setSaid(choice === "reload" ? `Not reloaded: ${describe(error)}` : `Nothing was saved over the other tab’s entry: it could not be read first (${describe(error)}).`);
      }
      return;
    }
    if (!mounted.current) return;
    setBusy(null);
    setConflict(false);
    if (choice === "reload") {
      take(read);
      setIssues(NO_ENTRY_ISSUES);
      setSaid("Reloaded: this is the entry as the other tab saved it.");
      return;
    }
    // Saved over what the other tab saved: from the revision it made.
    keep(read);
    const saved = await save("Not saved");
    if (saved && mounted.current) setSaid(`Kept this tab’s entry: it is saved over the other one, ${serverTime(saved.updatedAt, clock.now())}.`);
  };

  if (phase.kind === "loading") return <div className="co-state" role="status">Reading the entry…</div>;
  if (phase.kind === "failed") {
    return (
      <div className="co-state">
        <p className="error"><Icon name="error" />{phase.message}</p>
        <button className="btn btn-small btn-secondary" type="button" data-entry-back="" onClick={() => onBack(null)}><Icon name="arrow-left" />All entries</button>
      </div>
    );
  }

  const name = entry ? (entry.title || "Untitled entry") : "New entry";
  const off = busy !== null || conflict;
  const settleFirst = "Choose Reload or Keep mine first.";
  const saveWhy = conflict ? settleFirst : !savable ? "No changes to save." : null;
  const publishWhy = conflict ? settleFirst : status === "published" && !savable ? (livePages ? "Visitors see this entry as it is." : "It is published as it is.") : null;
  const live = entry?.published ? entryAddress(collection.prefix, entry.published.slug) : null;
  const next = entryAddress(collection.prefix, now.slug === "" ? "…" : now.slug);
  const slugHint = live !== null && live !== next
    ? livePages ? `Live at ${live}; the next publish moves it to ${next}, and the old address leads to the new one.` : `Published in this browser as ${live}; the next publish uses ${next}.`
    : livePages ? `Lowercase letters, digits and hyphens. Visitors find the entry at ${next} once it is published.` : `Lowercase letters, digits and hyphens. In the full system, visitors find the entry at ${next} once it is published.`;

  return (
    <div ref={form} className="co-form" role="region" aria-labelledby={`${id}-title`}>
      <div className="co-form-head">
        <button className="btn btn-small btn-quiet co-back" type="button" data-entry-back="" onClick={() => onBack(entry?.id ?? null)}><Icon name="arrow-left" />All entries</button>
        <div className="co-form-title">
          <h3 id={`${id}-title`}>{name}</h3>
          <p className="co-form-state">
            {entry && status
              ? <><span className={STATUS_DOTS[status]} aria-hidden="true" />{STATUS_WORDS[status]}<span className="co-sep" aria-hidden="true">·</span>Updated {serverTime(entry.updatedAt, clock.now())}</>
              : <><span className="dot-draft" aria-hidden="true" />Not saved yet</>}
          </p>
        </div>
        <div className="co-form-actions">
          {entry?.published && <button className="btn btn-small btn-secondary" type="button" aria-disabled={off ? true : undefined} onClick={off ? undefined : () => void unpublish()}>{busy === "unpublishing" ? "Unpublishing…" : "Unpublish"}</button>}
          <button className="btn btn-small btn-dark" type="button" data-entry-save="" aria-disabled={off || saveWhy !== null ? true : undefined} title={saveWhy ?? undefined} onClick={off || saveWhy !== null ? undefined : () => void saveNow()}>{busy === "saving" ? "Saving…" : "Save"}</button>
          <button className={`btn btn-small${off || publishWhy !== null ? "" : " btn-primary"}`} type="button" aria-disabled={off || publishWhy !== null ? true : undefined} title={publishWhy ?? undefined} onClick={off || publishWhy !== null ? undefined : () => void publish()}>{busy === "publishing" ? "Publishing…" : "Publish"}</button>
        </div>
      </div>
      <p className="co-said" role="status">{said.ofIssues && issueCount(issues) === 0 ? "" : said.text}</p>
      {conflict && (
        <div className="co-banner" role="alert">
          <Icon name="warning" />
          <p><strong>Changed in another tab.</strong> This entry was saved in another tab after you opened it. Saving waits until you choose.</p>
          <div className="co-banner-actions">
            <button className="btn btn-small btn-dark" type="button" title="Take the entry as the other tab saved it: the changes here are dropped" onClick={() => void settle("reload")}>Reload</button>
            <button className="btn btn-small btn-secondary" type="button" title="Save this tab’s entry over the one the other tab saved" onClick={() => void settle("keep")}>Keep mine</button>
          </div>
        </div>
      )}
      {issues.other.length > 0 && <p className="error co-other"><Icon name="error" />{issues.other.join(" ")}</p>}
      {left.length > 0 && (
        <p className="note co-left"><Icon name="info" /><span>This entry still holds values no field of {collection.name} takes ({left.join(", ")}). Saving leaves them out.</span></p>
      )}
      <div className="co-form-body">
        <div data-entry-title="">
          <TextField
            label="Title"
            required
            value={now.title}
            field="/title"
            rules={{ kind: "line", maxLength: 200 }}
            issues={issues.title}
            onCommit={(title) => {
              change(kept.current === null && !held.current.slugOwn ? { title, slug: slugFrom(title) } : { title });
              forget("title");
              return null;
            }}
          />
        </div>
        <div data-entry-slug="">
          <TextField
            label="Slug"
            required
            value={now.slug}
            field="/slug"
            prefix={`/${collection.prefix}/`}
            rules={{ kind: "slug", maxLength: 64 }}
            hint={slugHint}
            issues={issues.slug}
            onCommit={(slug) => {
              const typed = slug.trim().replace(/^\/+/, "");
              change({ slug: typed, slugOwn: typed !== "" });
              forget("slug");
              return null;
            }}
          />
        </div>
        {fields.map((field) => (
          <FieldInput key={field.key} field={field} value={now.values[field.key]} issues={issues.values} onChange={(next) => {
            const values = { ...held.current.values };
            // A value of parts changed as it is held now (./FieldInput.tsx).
            const value = typeof next === "function" ? (next as ValueUpdate)(values[field.key]) : next;
            if (value === undefined) delete values[field.key];
            else values[field.key] = value;
            change({ values });
            forget({ key: field.key });
          }} />
        ))}
        {fields.length === 0 && <p className="hint co-no-fields">{collection.name} has no fields yet: add them in its settings. Meanwhile an entry has its title and its slug.</p>}
      </div>
    </div>
  );
}
