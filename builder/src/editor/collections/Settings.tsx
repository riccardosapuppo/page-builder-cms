// A collection's settings (the design's "the collection's settings"): its
// name, its prefix with the address its entries take, the order its
// entries are listed in, its fields, the way to its template, and Delete.
//
// The fields: each with its label, its key (suggested from the label while
// the field is new; fixed once an entry holds a value under it, since the
// value is found by its key), its type (chosen when the field is added, and
// kept: a value of one type is no value of another), whether it is
// required, a choice's options and a number's bounds; moved up and down;
// deleted after asking, the entries keeping that field's values until each
// is saved again, which leaves them out.
//
// Everything here is one change of the definition: it is checked as the
// storage checks it (validateCollection), each refusal at its control, and
// sent by Save changes (updateCollection), the parts changed only and not
// at a revision (docs/decisions/collections-are-typed-entries.md): the
// storage merges them into the collection as it stands, and the settings
// then take the collection as it answers, another tab's change to the rest
// with it (afterSave). Like an entry's save, it is the storage's, not a
// command on the page: Undo does not take it back.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { sameJson } from "../../document/json.ts";
import { FIELD_TYPES, type CollectionDefinition, type Field, type FieldType } from "../../shared/collection.ts";
import { validateCollection } from "../../shared/validate.ts";
import { isStorageError, type Collection } from "../../storage/adapter.ts";
import { describedBy, ErrorList, FieldFrame, RadioField, TextField, Toggle } from "../controls.tsx";
import { Icon } from "../icons.tsx";
import { typedAmount, amountText } from "./values.ts";
import type { CollectionsStorage } from "./context.ts";
import { anyIssue, definitionIssues, NO_DEFINITION_ISSUES, type DefinitionIssues, type FieldIssues } from "./refusals.ts";
import { addressLine, directionWords, FIELD_TYPE_HINTS, FIELD_TYPE_NAMES, keyFrom, orderChoices } from "./words.ts";

export interface SettingsProps {
  storage: CollectionsStorage;
  collection: Collection;
  livePages: boolean;
  onSaved: (collection: Collection) => void;
  onDeleted: (collection: Collection) => void;
  // Opens the collection's template on the canvas, as a part opens.
  onEditTemplate: () => void;
  onDirty: (dirty: boolean) => void;
  say: (sentence: string) => void;
}

// A field as the settings hold it while it is changed: with an id of the
// form's own (a key may change), and whether it was added here, whose key
// follows its label until one is typed.
interface DraftField {
  uid: string;
  field: Field;
  added: boolean;
  keyOwn: boolean;
}

interface Draft {
  name: string;
  prefix: string;
  fields: DraftField[];
  sort: CollectionDefinition["sort"];
}

const MAX_FIELDS = 30;
const MAX_OPTIONS = 20;
const NONE: readonly string[] = [];
const NO_FIELD_ISSUES: FieldIssues = { key: [], label: [], options: [], option: {}, bounds: [], other: [] };

let made = 0;
const uid = () => `field-${++made}`;

const draftOf = (collection: Collection): Draft => ({
  name: collection.name,
  prefix: collection.prefix,
  fields: collection.fields.map((field) => ({ uid: uid(), field: { ...field, ...(field.type === "choice" ? { options: [...field.options] } : {}) } as Field, added: false, keyOwn: true })),
  sort: { ...collection.sort },
});

const definitionOf = (draft: Draft): CollectionDefinition => ({ name: draft.name, prefix: draft.prefix, fields: draft.fields.map((d) => d.field), sort: draft.sort });

// The settings once a save is answered: the collection as the storage
// holds it, which merges what this tab sent into what another tab changed
// meanwhile (a field it added, say), with what was changed here while the
// save travelled kept over it, a change of its own: a name, a field's
// contents, a field added, deleted or moved. `sent` is the draft the save
// was made from, `now` the draft as it is. Fields go by the form's ids:
// one the answer holds takes the id of the field sent under its key.
function afterSave(sent: Draft, now: Draft, back: CollectionDefinition): Draft {
  const sentUnder = new Map(sent.fields.map((d) => [d.field.key, d.uid]));
  const answered = new Map(back.fields.map((field): [string, DraftField] => {
    const id = sentUnder.get(field.key) ?? uid();
    return [id, { uid: id, field: { ...field, ...(field.type === "choice" ? { options: [...field.options] } : {}) } as Field, added: false, keyOwn: true }];
  }));
  const before = new Map(sent.fields.map((d) => [d.uid, d.field]));
  const mine = new Map(now.fields.map((d) => [d.uid, d]));
  // Added here meanwhile, or its contents changed here.
  const changedHere = (id: string) => {
    const d = mine.get(id);
    const was = before.get(id);
    return d !== undefined && (was === undefined || !sameJson(was, d.field));
  };
  // The fields there are: the answer's, but one deleted here meanwhile;
  // and one changed here, though another tab deleted it.
  const there = (id: string) => (answered.has(id) && (mine.has(id) || !before.has(id))) || changedHere(id);
  // Their order: this tab's when a field was moved here meanwhile, else the
  // answer's, which holds another tab's moves. A field only the other order
  // has (another tab's new field, one added here) goes before the field it
  // comes before there, or last.
  const answerIds = [...answered.keys()];
  const nowIds = now.fields.map((d) => d.uid);
  const moved = !sameJson(sent.fields.map((d) => d.uid).filter((id) => mine.has(id)), nowIds.filter((id) => before.has(id)));
  const [lead, among] = moved ? [nowIds, answerIds] : [answerIds, nowIds];
  const ids = lead.filter(there);
  for (const id of among) {
    if (!there(id) || ids.includes(id)) continue;
    const next = among.slice(among.indexOf(id) + 1).find((other) => ids.includes(other));
    ids.splice(next === undefined ? ids.length : ids.indexOf(next), 0, id);
  }
  // Each as the answer has it, or as it was changed here.
  const fields = ids.map((id) => {
    const saved = answered.get(id);
    if (!changedHere(id)) return saved!;
    const d = mine.get(id)!;
    return saved ? { ...saved, field: d.field } : d;
  });
  return {
    name: now.name === sent.name ? back.name : now.name,
    prefix: now.prefix === sent.prefix ? back.prefix : now.prefix,
    fields,
    sort: sameJson(now.sort, sent.sort) ? back.sort : now.sort,
  };
}

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// A field of a type, as it is added: its type's name as its label.
function newField(type: FieldType, label: string, key: string): Field {
  if (type === "choice") return { key, label, type, required: false, options: ["First option"] };
  return { key, label, type, required: false } as Field;
}

export function Settings({ storage, collection, livePages, onSaved, onDeleted, onEditTemplate, onDirty, say }: SettingsProps) {
  const id = useId();
  // The settings as changed: drawn from their state, and kept in a ref too,
  // which each change and Save read at once. A text handed over after its
  // pause may not be drawn yet when the next change or Save comes, and a
  // change made from the last drawing would undo it (an entry's form keeps
  // its values so too, ./EntryForm.tsx).
  const [draft, setDrawn] = useState<Draft>(() => draftOf(collection));
  const latest = useRef(draft);
  const setDraft = useCallback((next: Draft | ((now: Draft) => Draft)) => {
    latest.current = typeof next === "function" ? next(latest.current) : next;
    setDrawn(latest.current);
  }, []);
  const [saved, setSaved] = useState<CollectionDefinition>(() => definitionOf(draftOf(collection)));
  const [issues, setIssues] = useState<DefinitionIssues>(NO_DEFINITION_ISSUES);
  const [busy, setBusy] = useState<"saving" | "deleting" | null>(null);
  const [said, setSaid] = useState("");
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  // The keys entries hold values under, in their draft or in what is
  // live: a field's key is fixed once one does, and a new field is not
  // given one of them by itself.
  const [held, setHeld] = useState<ReadonlySet<string> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    storage.listEntries(collection.id).then(
      (entries) => {
        if (!current) return;
        const keys = new Set<string>();
        for (const entry of entries) for (const key of [...Object.keys(entry.values), ...Object.keys(entry.published?.values ?? {})]) keys.add(key);
        setHeld(keys);
      },
      // Not known: every key that was saved stays fixed.
      () => {
        if (current) setHeld(new Set(collection.fields.map((f) => f.key)));
      },
    );
    return () => {
      current = false;
    };
  }, [storage, collection.id, collection.fields]);

  const definition = definitionOf(draft);
  const changed = !sameJson(definition, saved);
  useEffect(() => {
    onDirty(changed);
  }, [changed, onDirty]);
  useEffect(() => {
    if (!changed) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  // The focus where a change asked for it, once drawn.
  useEffect(() => {
    const selector = focusNext.current;
    if (selector === null) return;
    focusNext.current = null;
    box.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  // A field changed by its id, from the draft as it is now.
  const changeField = (uidOf: string, change: (now: DraftField, fields: readonly DraftField[]) => DraftField) => setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.uid === uidOf ? change(f, d.fields) : f)) }));

  const keysTaken = (fields: readonly DraftField[], except: string) => [...fields.filter((f) => f.uid !== except).map((f) => f.field.key), ...(held ?? [])];

  const add = (type: FieldType) => {
    const label = FIELD_TYPE_NAMES[type];
    const fresh = uid();
    setDraft((d) => ({ ...d, fields: [...d.fields, { uid: fresh, field: newField(type, label, keyFrom(label, keysTaken(d.fields, ""))), added: true, keyOwn: false }] }));
    setAdding(false);
    focusNext.current = `[data-field-uid="${fresh}"] [data-field-label] input`;
  };

  const move = (uidOf: string, by: -1 | 1) => {
    const now = latest.current;
    const at = now.fields.findIndex((f) => f.uid === uidOf);
    const to = at + by;
    if (at < 0 || to < 0 || to >= now.fields.length) return;
    const fields = [...now.fields];
    const [moved] = fields.splice(at, 1);
    fields.splice(to, 0, moved!);
    setDraft({ ...now, fields });
    // The issues are by place: moved, they would mark another field.
    setIssues(NO_DEFINITION_ISSUES);
    const still = to === 0 ? "down" : to === fields.length - 1 ? "up" : by < 0 ? "up" : "down";
    focusNext.current = `[data-field-uid="${moved!.uid}"] [data-move="${still}"]`;
  };

  // The field goes from the draft; the order, if it followed it, goes
  // back to the last change, newest first, as the question said.
  const remove = (uidGone: string) => {
    const now = latest.current;
    const at = now.fields.findIndex((f) => f.uid === uidGone);
    const gone = now.fields[at];
    if (!gone) return;
    const fields = now.fields.filter((f) => f.uid !== uidGone);
    setDraft({ ...now, fields, sort: now.sort.by === gone.field.key ? { by: "updatedAt", direction: "desc" } : now.sort });
    setAsking(null);
    setIssues(NO_DEFINITION_ISSUES);
    const neighbour = fields[at] ?? fields[at - 1];
    focusNext.current = neighbour ? `[data-field-uid="${neighbour.uid}"] [data-field-label] input` : "[data-add-field]";
  };

  const save = async () => {
    const from = latest.current;
    const sending = definitionOf(from);
    const checked = validateCollection(sending);
    if (!checked.valid) {
      setIssues(definitionIssues(checked.errors));
      setSaid("Not saved: a setting needs a change, marked below.");
      return;
    }
    setIssues(NO_DEFINITION_ISSUES);
    setBusy("saving");
    setSaid("");
    try {
      const changes: Partial<CollectionDefinition> = {};
      if (sending.name !== saved.name) changes.name = sending.name;
      if (sending.prefix !== saved.prefix) changes.prefix = sending.prefix;
      if (!sameJson(sending.fields, saved.fields)) changes.fields = sending.fields;
      if (!sameJson(sending.sort, saved.sort)) changes.sort = sending.sort;
      const outcome = await storage.updateCollection(collection.id, changes);
      if (!mounted.current) return;
      if (!outcome.ok) {
        const found = definitionIssues(outcome.problem.errors);
        setIssues(found);
        setSaid(anyIssue(found) ? "Not saved: a setting needs a change, marked below." : `Not saved: ${outcome.problem.message}`);
        return;
      }
      const next = outcome.value;
      const back = { name: next.name, prefix: next.prefix, fields: next.fields, sort: next.sort };
      setSaved(back);
      setDraft((now) => afterSave(from, now, back));
      setSaid("Saved.");
      onSaved(next);
    } catch (error) {
      if (mounted.current) setSaid(`Not saved: ${describe(error)} Your changes are still here: try again.`);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const discard = () => {
    setDraft(draftOf({ ...collection, ...saved }));
    setIssues(NO_DEFINITION_ISSUES);
    setAsking(null);
    setSaid("Changes discarded.");
  };

  const deleteCollection = async () => {
    setBusy("deleting");
    try {
      await storage.deleteCollection(collection.id);
    } catch (error) {
      if (!(isStorageError(error) && error.failure.kind === "not-found")) {
        if (mounted.current) {
          setBusy(null);
          setSaid(`Not deleted: ${describe(error)}`);
        }
        return;
      }
    }
    say(`${collection.name} was deleted, with its entries and its template.`);
    onDeleted(collection);
  };

  const off = busy !== null;
  const orders = orderChoices(definition.fields);
  const directions = directionWords(draft.sort.by, definition.fields);
  const templateLive = collection.template.published !== null;

  return (
    <div ref={box} className="co-settings">
      <div className="co-settings-head">
        <p className="co-said" role="status">{said || (changed ? "Changes not saved yet." : "")}</p>
        <div className="co-form-actions">
          {changed && <button className="btn btn-small btn-quiet" type="button" aria-disabled={off ? true : undefined} onClick={off ? undefined : discard}>Discard changes</button>}
          <button className="btn btn-small btn-dark" type="button" aria-disabled={off || !changed ? true : undefined} title={changed ? undefined : "No changes to save."} onClick={off || !changed ? undefined : () => void save()}>{busy === "saving" ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      <Section id={`${id}-about`} title="Name and address">
        <TextField label="Name" required value={draft.name} field="/name" rules={{ kind: "line", maxLength: 60 }} issues={issues.name} hint="What the editor calls the collection." onCommit={(name) => {
          setDraft((d) => ({ ...d, name }));
          return null;
        }} />
        <TextField
          label="Prefix"
          required
          value={draft.prefix}
          field="/prefix"
          prefix="/"
          rules={{ kind: "slug", maxLength: 64 }}
          issues={issues.prefix}
          hint={`${addressLine(draft.prefix, livePages)}${collection.publishedCount > 0 && draft.prefix !== saved.prefix ? ` ${livePages ? "Saved, it moves the address of every published entry: their old addresses stop answering." : "Saved, it changes the address of every published entry."}` : ""}`}
          onCommit={(text) => {
            setDraft((d) => ({ ...d, prefix: text.trim().replace(/^\/+|\/+$/g, "") }));
            return null;
          }}
        />
      </Section>

      <Section id={`${id}-order`} title="Default order">
        <OrderField id={id} value={draft.sort.by} choices={orders} issues={issues.sort} onChange={(by) => setDraft((d) => ({ ...d, sort: { by, direction: by === "title" ? "asc" : d.sort.by === "title" ? "desc" : d.sort.direction } }))} />
        <RadioField
          label="Direction"
          look="seg"
          choices={[{ value: "asc", label: directions.asc }, { value: "desc", label: directions.desc }]}
          value={draft.sort.direction}
          field="/sort/direction"
          hint="The order of the list here, and of a list of entries on a page unless it sets its own."
          onChange={(direction) => {
            setDraft((d) => ({ ...d, sort: { ...d.sort, direction } }));
            return null;
          }}
        />
      </Section>

      <Section id={`${id}-fields`} title="Fields" aside={`${draft.fields.length} of ${MAX_FIELDS}`}>
        <p className="hint co-section-hint">Every entry has a title and a slug of its own; these fields come after them, in this order. Each entry keeps a field’s value under its key, which is fixed once an entry holds one.</p>
        <ErrorList id={`${id}-fields-error`} errors={issues.list} />
        <ol className="co-fields">
          {draft.fields.map((d, at) => (
            <FieldCard
              key={d.uid}
              draft={d}
              at={at}
              count={draft.fields.length}
              fixed={!d.added && (held === null || held.has(d.field.key))}
              issues={issues.fields[at] ?? NO_FIELD_ISSUES}
              asking={asking === d.uid}
              sortedBy={draft.sort.by === d.field.key}
              collectionName={draft.name || collection.name}
              entryCount={collection.entryCount}
              onLabel={(label) => changeField(d.uid, (f, fields) => ({ ...f, field: { ...f.field, label, ...(f.keyOwn ? {} : { key: keyFrom(label, keysTaken(fields, f.uid)) }) } as Field }))}
              onKey={(key) => changeField(d.uid, (f) => ({ ...f, field: { ...f.field, key } as Field, keyOwn: true }))}
              onField={(change) => changeField(d.uid, (f) => ({ ...f, field: change(f.field) }))}
              onMove={(by) => move(d.uid, by)}
              onAsk={() => setAsking(d.uid)}
              onKeep={() => {
                setAsking(null);
                focusNext.current = `[data-field-uid="${d.uid}"] [data-delete-field]`;
              }}
              onDelete={() => remove(d.uid)}
            />
          ))}
        </ol>
        {draft.fields.length === 0 && <p className="co-state">No fields yet. Add the first: a summary, an image, a date…</p>}
        {adding ? (
          <TypePicker onPick={add} onCancel={() => {
            setAdding(false);
            focusNext.current = "[data-add-field]";
          }} />
        ) : (
          <button className="btn btn-secondary co-add-field" type="button" data-add-field="" aria-disabled={draft.fields.length >= MAX_FIELDS ? true : undefined} title={draft.fields.length >= MAX_FIELDS ? `A collection holds at most ${MAX_FIELDS} fields.` : undefined} onClick={draft.fields.length >= MAX_FIELDS ? undefined : () => setAdding(true)}><Icon name="plus" />Add a field</button>
        )}
      </Section>

      <Section id={`${id}-template`} title="Template">
        <p className="co-template-line">
          {livePages ? `Every entry of ${collection.name} is drawn with the template, between the site’s header and footer.` : `In the full system, every entry of ${collection.name} is drawn with the template, between the site’s header and footer.`}
          {" "}<span className="co-template-state"><span className={templateLive ? "dot-live" : "dot-draft"} aria-hidden="true" />{templateLive ? "Published" : "Not published yet"}</span>
        </p>
        <button className="btn btn-secondary" type="button" data-edit-template="" onClick={onEditTemplate}><Icon name="page" />Edit the template</button>
      </Section>

      <Section id={`${id}-delete`} title="Delete">
        {deletingAll ? (
          <div className="co-confirm" role="group" aria-labelledby={`${id}-delete-words`} onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setDeletingAll(false);
            focusNext.current = "[data-delete-collection]";
          }}>
            <p id={`${id}-delete-words`}>Delete {collection.name} for good? {collection.entryCount > 0 ? `Its ${collection.entryCount === 1 ? "entry" : `${collection.entryCount} entries`}${collection.publishedCount > 0 ? ` (${collection.publishedCount} published)` : ""} and its template go with it.` : "Its template goes with it."} Nothing of it can be brought back.</p>
            <div className="co-confirm-buttons">
              <AutoFocus><button className="btn btn-small btn-secondary" type="button" onClick={() => {
                setDeletingAll(false);
                focusNext.current = "[data-delete-collection]";
              }}>Keep it</button></AutoFocus>
              <button className="btn btn-small btn-danger" type="button" aria-disabled={off ? true : undefined} onClick={off ? undefined : () => void deleteCollection()}>{busy === "deleting" ? "Deleting…" : "Delete collection"}</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-small btn-quiet co-delete-collection" type="button" data-delete-collection="" onClick={() => setDeletingAll(true)}><Icon name="trash" className="i i-xs" />Delete collection</button>
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="co-section" aria-labelledby={id}>
      <h4 className="co-section-title" id={id}>{title}{aside && <span className="co-section-aside">{aside}</span>}</h4>
      {children}
    </section>
  );
}

// Its child takes the focus as it is drawn: the safe answer of a question.
function AutoFocus({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  return <span ref={box} className="co-autofocus">{children}</span>;
}

// What the entries are ordered by: the title, a time, or a date or number
// field, in a list.
function OrderField({ id, value, choices, issues, onChange }: { id: string; value: string; choices: ReadonlyArray<{ value: string; label: string }>; issues: readonly string[]; onChange: (by: string) => void }) {
  const field = `${id}-order-by`;
  const known = choices.some((c) => c.value === value);
  return (
    <FieldFrame id={field} label="Order by" errors={issues}>
      <select id={field} className="input co-order" value={value} aria-invalid={issues.length > 0 ? true : undefined} aria-describedby={describedBy(field, null, issues)} onChange={(event) => onChange(event.target.value)}>
        {!known && <option value={value}>A field no longer there</option>}
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </FieldFrame>
  );
}

// The types a field may be of, to add one: each named, with what it holds.
function TypePicker({ onPick, onCancel }: { onPick: (type: FieldType) => void; onCancel: () => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  return (
    <div ref={box} className="co-types" role="group" aria-labelledby={`${id}-title`} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    }}>
      <p className="co-types-title" id={`${id}-title`}>Add a field of the type:</p>
      <div className="co-types-grid">
        {FIELD_TYPES.map((type) => (
          <button key={type} className="co-type" type="button" onClick={() => onPick(type)}>
            <strong>{FIELD_TYPE_NAMES[type]}</strong>
            <span><span className="visually-hidden">: </span>{FIELD_TYPE_HINTS[type]}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-small btn-quiet" type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

interface FieldCardProps {
  draft: DraftField;
  at: number;
  count: number;
  // Its key is fixed: entries hold values under it.
  fixed: boolean;
  issues: FieldIssues;
  asking: boolean;
  // The entries' default order follows it.
  sortedBy: boolean;
  collectionName: string;
  entryCount: number;
  onLabel: (label: string) => void;
  onKey: (key: string) => void;
  // A change of the field as it is then, not as this drawing has it.
  onField: (change: (field: Field) => Field) => void;
  onMove: (by: -1 | 1) => void;
  onAsk: () => void;
  onKeep: () => void;
  onDelete: () => void;
}

function FieldCard({ draft, at, count, fixed, issues, asking, sortedBy, collectionName, entryCount, onLabel, onKey, onField, onMove, onAsk, onKeep, onDelete }: FieldCardProps) {
  const id = useId();
  const { field } = draft;
  const label = field.label || FIELD_TYPE_NAMES[field.type];
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);
  const other = issues.other;
  return (
    <li className={`co-fieldcard${asking ? " co-fieldcard-asking" : ""}`} data-field-uid={draft.uid} aria-label={`${label}, ${FIELD_TYPE_NAMES[field.type]}`}>
      <div className="co-fieldcard-head">
        <span className="co-fieldcard-name">{label}<span className="co-type-chip">{FIELD_TYPE_NAMES[field.type]}</span></span>
        <div className="co-fieldcard-tools">
          <button className="ibtn ibtn-small" type="button" data-move="up" aria-label={`Move ${label} up`} aria-disabled={at === 0 ? true : undefined} onClick={at === 0 ? undefined : () => onMove(-1)}><Icon name="arrow-up" className="i i-xs" /></button>
          <button className="ibtn ibtn-small" type="button" data-move="down" aria-label={`Move ${label} down`} aria-disabled={at === count - 1 ? true : undefined} onClick={at === count - 1 ? undefined : () => onMove(1)}><Icon name="arrow-down" className="i i-xs" /></button>
          <button className="ibtn ibtn-small co-delete" type="button" data-delete-field="" aria-label={`Delete ${label}`} title="Delete" onClick={onAsk}><Icon name="trash" className="i i-xs" /></button>
        </div>
      </div>
      {asking && (
        <div className="co-confirm" role="group" aria-labelledby={`${id}-ask`} onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onKeep();
        }}>
          <p id={`${id}-ask`}>
            Delete the field {label}?{" "}
            {entryCount > 0 && !draft.added ? `The entries of ${collectionName} keep their ${label} values until each is saved again, which leaves them out.` : ""}
            {sortedBy ? " The entries’ order follows it: it goes back to the last change, newest first." : ""}
            {" "}It goes when you save the settings.
          </p>
          <div className="co-confirm-buttons">
            <button ref={keep} className="btn btn-small btn-secondary" type="button" onClick={onKeep}>Keep it</button>
            <button className="btn btn-small btn-danger" type="button" onClick={onDelete}>Delete field</button>
          </div>
        </div>
      )}
      <div className="co-fieldcard-body">
        <div data-field-label="">
          <TextField label="Label" value={field.label} field={`/fields/${at}/label`} rules={{ kind: "line", maxLength: 60 }} issues={issues.label} onCommit={(text) => {
            onLabel(text);
            return null;
          }} />
        </div>
        <div data-field-key="">
          {fixed ? (
            <FixedKey id={`${id}-key`} value={field.key} issues={issues.key} />
          ) : (
            <TextField label="Key" value={field.key} field={`/fields/${at}/key`} rules={{ kind: "anchor", maxLength: 64 }} issues={issues.key} onCommit={(text) => {
              onKey(text.trim());
              return null;
            }} />
          )}
        </div>
        <div className="co-required">
          <Toggle label="Required" checked={field.required} field={`/fields/${at}/required`} onChange={(on) => {
            onField((now) => ({ ...now, required: on }) as Field);
            return null;
          }} />
        </div>
      </div>
      {field.type === "number" && (
        <div className="co-fieldcard-more">
          <Bounds at={at} min={field.min} max={field.max} issues={issues.bounds} onBound={(end, value) => onField((now) => bounded(now, end, value))} />
        </div>
      )}
      {field.type === "choice" && <Options label={label} options={field.options} issues={issues} onChange={(change) => onField((now) => (now.type === "choice" ? { ...now, options: change(now.options) } : now))} />}
      <ErrorList id={`${id}-other`} errors={other} />
    </li>
  );
}

// A key no longer changed: entries keep their values under it.
function FixedKey({ id, value, issues }: { id: string; value: string; issues: readonly string[] }) {
  const hint = "Fixed: entries hold values under it.";
  return (
    <FieldFrame id={id} label="Key" hint={hint} errors={issues}>
      <input id={id} className="input co-key-fixed" type="text" value={value} readOnly aria-describedby={describedBy(id, hint, issues)} />
    </FieldFrame>
  );
}

// A number field with one of its bounds set, or taken out (undefined).
function bounded(field: Field, end: "min" | "max", value: number | undefined): Field {
  if (field.type !== "number") return field;
  const { min, max, ...rest } = field;
  const next = { min: end === "min" ? value : min, max: end === "max" ? value : max };
  return { ...rest, ...(next.min === undefined ? {} : { min: next.min }), ...(next.max === undefined ? {} : { max: next.max }) };
}

// A number's lowest and highest values, each optional.
function Bounds({ at, min, max, issues, onBound }: { at: number; min: number | undefined; max: number | undefined; issues: readonly string[]; onBound: (end: "min" | "max", value: number | undefined) => void }) {
  const id = useId();
  const bound = (text: string) => (text.trim() === "" ? undefined : typedAmount(text));
  return (
    <div className="co-bounds">
      {(["min", "max"] as const).map((end) => (
        <TextField
          key={end}
          label={end === "min" ? "Lowest" : "Highest"}
          value={(end === "min" ? min : max) === undefined ? "" : amountText((end === "min" ? min : max)!)}
          field={`/fields/${at}/${end}`}
          inputMode="decimal"
          placeholder="None"
          rules={{ kind: "number" }}
          onCommit={(text) => {
            const value = bound(text);
            if (value === null) return { reason: "invalid", message: "Write a number, with two decimals at most, or leave it empty." };
            onBound(end, value);
            return null;
          }}
        />
      ))}
      <ErrorList id={`${id}-error`} errors={issues} />
    </div>
  );
}

// A choice's options, in the order an entry's form offers them; each
// change made to them as they are then.
function Options({ label, options, issues, onChange }: { label: string; options: readonly string[]; issues: FieldIssues; onChange: (change: (options: readonly string[]) => string[]) => void }) {
  const id = useId();
  const list = useRef<HTMLOListElement>(null);
  // The option whose field takes the focus once drawn: the one added, or
  // the one before an option removed.
  const focusAt = useRef<number | null>(null);
  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    list.current?.querySelectorAll<HTMLInputElement>("input")[at]?.focus();
  });
  const setFocusAt = (at: number) => {
    focusAt.current = at;
  };
  const shown = useMemo(() => options.map((option, at) => ({ option, at })), [options]);
  return (
    <div className="co-options" role="group" aria-labelledby={`${id}-title`}>
      <p className="label" id={`${id}-title`}>Options</p>
      <ol ref={list}>
        {shown.map(({ option, at }) => (
          <li key={at} className="co-option">
            <TextField label={`Option ${at + 1}`} value={option} field={`/options/${at}`} rules={{ kind: "line", maxLength: 60 }} issues={issues.option[at] ?? NONE} onCommit={(text) => {
              onChange((now) => now.map((o, i) => (i === at ? text : o)));
              return null;
            }} />
            <button className="ibtn ibtn-small" type="button" aria-label={`Remove option ${at + 1} of ${label}`} aria-disabled={options.length <= 1 ? true : undefined} title={options.length <= 1 ? "A choice keeps one option at least." : "Remove"} onClick={options.length <= 1 ? undefined : () => {
              onChange((now) => now.filter((_, i) => i !== at));
              setFocusAt(Math.max(0, at - 1));
            }}><Icon name="close" className="i i-xs" /></button>
          </li>
        ))}
      </ol>
      <ErrorList id={`${id}-error`} errors={issues.options} />
      <button className="btn btn-small btn-quiet" type="button" aria-disabled={options.length >= MAX_OPTIONS ? true : undefined} title={options.length >= MAX_OPTIONS ? `A choice lists ${MAX_OPTIONS} options at most.` : undefined} onClick={options.length >= MAX_OPTIONS ? undefined : () => {
        onChange((now) => [...now, `Option ${now.length + 1}`]);
        setFocusAt(options.length);
      }}><Icon name="plus" className="i i-xs" />Add option</button>
    </div>
  );
}
