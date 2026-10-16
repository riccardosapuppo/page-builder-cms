// A new collection (the design's New collection): its name, its prefix,
// suggested from the name until one is typed, and the fields it starts
// with, from one of three presets (./presets.ts). Checked as the storage
// checks it before it is sent (validateCollection), each refusal at its
// field, the storage's own (a prefix another collection has, or one the
// site answers itself) the same way. Made, it opens on its entries, empty.
import { useEffect, useId, useRef, useState } from "react";
import { validateCollection } from "../../shared/validate.ts";
import { isStorageError, type Collection } from "../../storage/adapter.ts";
import { TextField } from "../controls.tsx";
import { useEnv } from "../context.tsx";
import { Icon } from "../icons.tsx";
import { listed } from "../plain-words.ts";
import { slugFrom } from "../session.tsx";
import type { CollectionsStorage } from "./context.ts";
import { PRESET_FIELDS, PRESETS, presetFields, type PresetId } from "./presets.ts";
import { anyIssue, definitionIssues, NO_DEFINITION_ISSUES, type DefinitionIssues } from "./refusals.ts";
import { addressLine } from "./words.ts";

export interface NewCollectionProps {
  storage: CollectionsStorage;
  livePages: boolean;
  onMade: (collection: Collection) => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// What a preset starts a collection with, in words.
export const presetLine = (id: PresetId): string => {
  const fields = PRESET_FIELDS[id].fields;
  return fields.length === 0 ? "No fields yet: add your own." : listed(fields.map((f) => f.label));
};

export function NewCollection({ storage, livePages, onMade, onCancel, onDirty }: NewCollectionProps) {
  const { ui } = useEnv();
  const id = useId();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixOwn, setPrefixOwn] = useState(false);
  const [preset, setPreset] = useState<PresetId>("articles");
  const [issues, setIssues] = useState<DefinitionIssues>(NO_DEFINITION_ISSUES);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  // The values as the fields last handed them over (at their pause, or as
  // Create hands over what waits just before it reads them).
  const latest = useRef({ name: "", prefix: "" });
  const dirty = name !== "" || prefix !== "";
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const create = async () => {
    if (!ui.getState().pending.deliver()) return;
    const definition = { name: latest.current.name, prefix: latest.current.prefix, fields: presetFields(preset), sort: { ...PRESET_FIELDS[preset].sort } };
    const checked = validateCollection(definition);
    if (!checked.valid) {
      setIssues(definitionIssues(checked.errors));
      setSaid("Not made: a field needs a change, marked above.");
      return;
    }
    setIssues(NO_DEFINITION_ISSUES);
    setBusy(true);
    setSaid("");
    try {
      const outcome = await storage.createCollection(definition);
      if (!outcome.ok) {
        const found = definitionIssues(outcome.problem.errors);
        setIssues(found);
        setSaid(anyIssue(found) ? "Not made: a field needs a change, marked above." : `Not made: ${outcome.problem.message}`);
        return;
      }
      onMade(outcome.value);
    } catch (error) {
      setSaid(`Not made: ${describe(error)} Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="co-new">
      <h3 className="co-new-title">New collection</h3>
      <p className="hint co-new-lead">A collection keeps entries of one kind, news or events, each with the same fields. You write its entries here; every one of them is drawn with the collection’s template.</p>
      <div data-new-name="">
        <TextField
          label="Name"
          required
          value={name}
          field="/name"
          placeholder="News"
          rules={{ kind: "line", maxLength: 60 }}
          issues={issues.name}
          onCommit={(text) => {
            latest.current.name = text;
            setName(text);
            if (!prefixOwn) {
              latest.current.prefix = slugFrom(text);
              setPrefix(latest.current.prefix);
            }
            return null;
          }}
        />
      </div>
      <TextField
        label="Prefix"
        required
        value={prefix}
        field="/prefix"
        prefix="/"
        placeholder="news"
        rules={{ kind: "slug", maxLength: 64 }}
        hint={`Lowercase letters, digits and hyphens. ${addressLine(prefix, livePages)}`}
        issues={issues.prefix}
        onCommit={(text) => {
          const typed = text.trim().replace(/^\/+|\/+$/g, "");
          latest.current.prefix = typed;
          setPrefix(typed);
          setPrefixOwn(typed !== "");
          return null;
        }}
      />
      <div className="field">
        <p className="label" id={`${id}-presets`}>Start with</p>
        <div className="co-presets" role="radiogroup" aria-labelledby={`${id}-presets`}>
          {PRESETS.map((choice, index) => (
            <button
              key={choice}
              className="co-preset"
              type="button"
              role="radio"
              aria-checked={preset === choice}
              tabIndex={preset === choice ? 0 : -1}
              onClick={() => setPreset(choice)}
              onKeyDown={(event) => {
                const by = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                if (by === 0) return;
                event.preventDefault();
                const next = PRESETS[(index + by + PRESETS.length) % PRESETS.length]!;
                setPreset(next);
                (event.currentTarget.parentElement?.children[PRESETS.indexOf(next)] as HTMLElement | undefined)?.focus();
              }}
            >
              <strong>{PRESET_FIELDS[choice].name}</strong>
              <span><span className="visually-hidden">: </span>{presetLine(choice)}</span>
            </button>
          ))}
        </div>
        <p className="hint">The fields are a start: change, add or delete them later in the collection’s settings.</p>
      </div>
      <p className="co-said" role="status">{said}</p>
      <div className="co-new-buttons">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        <button className={`btn${busy ? "" : " btn-primary"}`} type="button" aria-disabled={busy ? true : undefined} onClick={busy ? undefined : () => void create()}><Icon name="plus" />{busy ? "Making it…" : "Create collection"}</button>
      </div>
    </div>
  );
}
