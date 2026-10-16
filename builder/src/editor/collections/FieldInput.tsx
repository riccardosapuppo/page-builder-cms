// One field of an entry's form, drawn with the sidebar's own controls
// (../controls.tsx) by its type: a text field for a text, a paragraph's
// box, the text widget's editor for a rich text (./RichText.tsx, loaded
// with TipTap when a form first needs it, in the canvas's text editor's
// chunk, ../rich/TextEditor.tsx), a number typed as the panels
// type theirs, the browser's date field, an image from the media library
// with its alt text or the decorative mark (as the image widget's panel
// has them), a link's words and address (as a button's), a switch, and a
// choice's segments, or a list beyond four options.
//
// A control hands its value to the form (onChange), which keeps it until
// Save: text when the person pauses, leaves the field or presses Enter, as
// in the panels, so the form's Save hands over what waits first
// (../pending.ts). What the form found wrong comes back as `issues`, said
// under the control that holds it.
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ChoiceField, Field, ImageValue, LinkValue, NumberField } from "../../shared/collection.ts";
import type { RichTextDoc } from "../../shared/document.ts";
import { describedBy, ErrorList, FieldFrame, RadioField, TextField, Toggle } from "../controls.tsx";
import { useUi } from "../context.tsx";
import { Icon } from "../icons.tsx";
import { ImagePicker } from "../pickers.tsx";
import { usePageLinks } from "../session.tsx";
import { amountText, ENTRY_DEEPEST_LIST, imageValue, richTextRefusal, typedAmount } from "./values.ts";
import { boundsWords } from "./words.ts";

const RichText = lazy(() => import("../rich/TextEditor.tsx").then((chunk) => ({ default: chunk.EntryRichText })));

// A change of a value of parts (a link's words and address, an image's alt
// text and its mark), made to the value as the form holds it then: one
// part may be handed over before the other's change is drawn.
export type ValueUpdate = (now: unknown) => unknown;

export interface FieldInputProps {
  field: Field;
  value: unknown;
  // The form's value of the field: undefined for none; or a ValueUpdate,
  // since a value itself is never a function.
  onChange: (value: unknown | ValueUpdate) => void;
  // What the form found wrong, by the field's key and a part's ("hero/alt").
  issues: Readonly<Record<string, readonly string[]>>;
}

const NONE: readonly string[] = [];

export function FieldInput(props: FieldInputProps) {
  const { field } = props;
  return <div className="co-field" data-field-key={field.key}>{control(props)}</div>;
}

function control({ field, value, onChange, issues }: FieldInputProps): ReactNode {
  const own = issues[field.key] ?? NONE;
  const at = `/values/${field.key}`;
  switch (field.type) {
    case "text":
    case "paragraph":
      return (
        <TextField
          label={field.label}
          required={field.required}
          multiline={field.type === "paragraph"}
          rows={4}
          value={typeof value === "string" ? value : ""}
          field={at}
          rules={field.type === "text" ? { kind: "line", maxLength: 200 } : { kind: "paragraph", maxLength: 5000 }}
          issues={own}
          onCommit={(text) => {
            onChange(text === "" ? undefined : text);
            return null;
          }}
        />
      );
    case "number":
      return <NumberInput field={field} value={typeof value === "number" ? value : null} onChange={onChange} issues={own} />;
    case "date":
      return <DateInput field={field} value={typeof value === "string" ? value : ""} onChange={onChange} issues={own} />;
    case "richText":
      return <RichTextInput field={field} value={(value as RichTextDoc | undefined) ?? null} onChange={onChange} issues={own} />;
    case "image":
      return <ImageInput field={field} value={(value as ImageValue | undefined) ?? null} onChange={onChange} issues={issues} />;
    case "link":
      return <LinkInput field={field} value={(value as LinkValue | undefined) ?? null} onChange={onChange} issues={issues} />;
    case "toggle":
      return (
        <div className="field">
          <Toggle label={field.label} checked={value === true} field={at} issues={own} onChange={(on) => {
            onChange(on);
            return null;
          }} />
        </div>
      );
    case "choice":
      return <ChoiceInput field={field} value={typeof value === "string" ? value : null} onChange={onChange} issues={own} />;
  }
}

// A number, typed: digits, a point and two decimals at most, stepped by
// the arrows within the field's bounds; emptied, it has none.
function NumberInput({ field, value, onChange, issues }: { field: NumberField; value: number | null; onChange: (value: unknown) => void; issues: readonly string[] }) {
  const bounds = boundsWords(field.min, field.max);
  const step = (draft: string, by: 1 | -1, big: boolean): string | null => {
    const from = draft.trim() === "" ? (field.min ?? 0) - by : typedAmount(draft);
    if (from === null) return null;
    const next = Math.round((from + by * (big ? 10 : 1)) * 100) / 100;
    return amountText(Math.min(field.max ?? 1_000_000_000, Math.max(field.min ?? -1_000_000_000, next)));
  };
  return (
    <TextField
      label={field.label}
      required={field.required}
      value={value === null ? "" : amountText(value)}
      field={`/values/${field.key}`}
      inputMode="decimal"
      rules={{ kind: "number" }}
      hint={bounds ? `${bounds} Two decimals at most.` : "Two decimals at most."}
      stepBy={step}
      issues={issues}
      onCommit={(text) => {
        if (text.trim() === "") {
          onChange(undefined);
          return null;
        }
        const number = typedAmount(text);
        if (number === null) return { reason: "invalid", message: "Write a number, with two decimals at most: 1250.50." };
        onChange(number);
        return null;
      }}
    />
  );
}

// A day, in the browser's own date field; emptied, none.
function DateInput({ field, value, onChange, issues }: { field: Field; value: string; onChange: (value: unknown) => void; issues: readonly string[] }) {
  const id = useId();
  return (
    <FieldFrame id={id} label={<>{field.label}{field.required && <> <span className="req">required</span></>}</>} errors={issues}>
      <input
        id={id}
        className="input co-date"
        type="date"
        value={value}
        aria-required={field.required ? true : undefined}
        aria-invalid={issues.length > 0 ? true : undefined}
        aria-describedby={describedBy(id, null, issues)}
        onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      />
    </FieldFrame>
  );
}

// The text widget's editor, once its chunk is here; until then the field's
// frame says it is coming. A change the entry could not keep (past what a
// text takes) is not made, and said under the field until the next one.
function RichTextInput({ field, value, onChange, issues }: { field: Field; value: RichTextDoc | null; onChange: (value: unknown) => void; issues: readonly string[] }) {
  const id = useId();
  const [said, setSaid] = useState<string | null>(null);
  const hint = said ?? "Bold, italic, links and lists, as in a text block.";
  return (
    <FieldFrame id={id} labelFor={false} label={<>{field.label}{field.required && <> <span className="req">required</span></>}</>} hint={hint} errors={issues}>
      <Suspense fallback={<div className="co-rte co-rte-loading" aria-busy="true"><p className="hint">Opening the text editor…</p></div>}>
        <RichText
          label={field.label}
          describedBy={describedBy(id, hint, issues)}
          invalid={issues.length > 0}
          required={field.required}
          value={value}
          refuses={richTextRefusal}
          deepestList={ENTRY_DEEPEST_LIST}
          onSay={setSaid}
          onChange={(doc) => {
            setSaid(null);
            onChange(doc ?? undefined);
          }}
        />
      </Suspense>
    </FieldFrame>
  );
}

// An image of the media library, with its alt text or the decorative mark,
// as the image widget's panel has them; chosen in the library, which
// offers no image from another site here: an entry's comes from the
// library only.
function ImageInput({ field, value, onChange, issues }: { field: Field; value: ImageValue | null; onChange: (value: unknown | ValueUpdate) => void; issues: Readonly<Record<string, readonly string[]>> }) {
  const id = useId();
  const media = useUi((u) => u.media);
  const [picking, setPicking] = useState(false);
  // The library closed: the focus goes back to the button that opened it,
  // or, an image chosen in place of none, to Replace image, which took
  // that button's place.
  const back = useRef(false);
  const replace = useRef<HTMLButtonElement>(null);
  const choose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!back.current || picking) return;
    back.current = false;
    (replace.current ?? choose.current)?.focus();
  });
  const close = () => {
    back.current = true;
    setPicking(false);
  };
  const item = value ? media.get(value.mediaId) : undefined;
  const own = issues[field.key] ?? NONE;
  const alt = issues[`${field.key}/alt`] ?? NONE;
  const decorative = value?.decorative === true;
  return (
    <fieldset className="co-group" aria-describedby={own.length > 0 ? `${id}-error` : undefined}>
      <legend className="label">{field.label}{field.required && <> <span className="req">required</span></>}</legend>
      {value ? (
        <div className="co-image">
          {item ? <img className="co-thumb" src={item.url} alt="" /> : <span className="co-thumb co-thumb-none" aria-hidden="true"><Icon name="error" /></span>}
          <div className="co-image-about">
            <p className="co-image-name">{item ? item.filename : "Not in the media library any more"}</p>
            <div className="co-image-buttons">
              <button ref={replace} className="btn btn-small btn-secondary" type="button" onClick={() => setPicking(true)}>Replace image</button>
              <button className="btn btn-small btn-quiet" type="button" onClick={() => {
                back.current = true;
                onChange(undefined);
              }}>Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <button ref={choose} className="btn btn-secondary co-choose" type="button" onClick={() => setPicking(true)}><Icon name="plus" />Choose image</button>
      )}
      <ErrorList id={`${id}-error`} errors={own} />
      {value && (
        <>
          <TextField
            label="Alt text"
            multiline
            oneLine
            rows={2}
            value={decorative ? "" : (value.alt ?? "")}
            disabled={decorative}
            field={`/values/${field.key}/alt`}
            rules={{ kind: "line", maxLength: 300 }}
            hint="What the image shows, for people who cannot see it."
            issues={alt}
            onCommit={(text) => {
              onChange(((now: ImageValue | undefined) => (now ? imageValue(now.mediaId, { alt: text }) : now)) as ValueUpdate);
              return null;
            }}
          />
          <div className="field co-decorative">
            <Toggle label="Decorative" checked={decorative} field={`/values/${field.key}/decorative`} onChange={(on) => {
              onChange(((now: ImageValue | undefined) => (now ? imageValue(now.mediaId, on ? { decorative: true } : { alt: media.get(now.mediaId)?.alt ?? "" }) : now)) as ValueUpdate);
              return null;
            }} />
            <p className="hint">A decorative image adds nothing to the text: screen readers skip it.</p>
          </div>
        </>
      )}
      {picking && (
        <ImagePicker
          confirm="Use image"
          libraryOnly
          onClose={close}
          onPick={([next]) => {
            if (!next || next.mediaId === undefined) return null;
            onChange(imageValue(next.mediaId, next.decorative === true ? { decorative: true } : { alt: next.alt ?? "" }));
            close();
            return null;
          }}
        />
      )}
    </fieldset>
  );
}

// A link: its words and where it goes, as a button's (the button widget's
// panel), the site's pages offered as its address is typed.
function LinkInput({ field, value, onChange, issues }: { field: Field; value: LinkValue | null; onChange: (value: unknown | ValueUpdate) => void; issues: Readonly<Record<string, readonly string[]>> }) {
  const id = useId();
  const pages = usePageLinks();
  const link = value ?? { label: "", href: "" };
  const own = issues[field.key] ?? NONE;
  // One part changed, the other as the form holds it then.
  const set = (part: Partial<LinkValue>) => onChange(((now: LinkValue | undefined) => {
    const next = { label: now?.label ?? "", href: now?.href ?? "", ...part };
    return next.label === "" && next.href === "" ? undefined : next;
  }) as ValueUpdate);
  return (
    <fieldset className="co-group" aria-describedby={own.length > 0 ? `${id}-error` : undefined}>
      <legend className="label">{field.label}{field.required && <> <span className="req">required</span></>}</legend>
      <div className="co-link">
        <TextField
          label="Words"
          value={link.label}
          field={`/values/${field.key}/label`}
          rules={{ kind: "line", maxLength: 80 }}
          placeholder="Read more"
          issues={issues[`${field.key}/label`] ?? NONE}
          onCommit={(label) => {
            set({ label });
            return null;
          }}
        />
        <TextField
          label="Address"
          icon="link"
          value={link.href}
          placeholder="Paste a link or choose a page"
          suggestions={pages}
          field={`/values/${field.key}/href`}
          rules={{ kind: "href", maxLength: 2048 }}
          hint="A full address (https://…), a page of this site (/join), mailto: or tel:."
          issues={issues[`${field.key}/href`] ?? NONE}
          onCommit={(href) => {
            set({ href: href.trim() });
            return null;
          }}
        />
      </div>
      <ErrorList id={`${id}-error`} errors={own} />
    </fieldset>
  );
}

// A choice: up to four options as segments, more as a list. A field that
// is not required can be left with none.
function ChoiceInput({ field, value, onChange, issues }: { field: ChoiceField; value: string | null; onChange: (value: unknown) => void; issues: readonly string[] }) {
  const id = useId();
  const required = field.required;
  if (field.options.length <= 4) {
    const choices = [...(required ? [] : [{ value: "", label: "None" }]), ...field.options.map((option) => ({ value: option, label: option }))];
    return (
      <RadioField
        label={field.label}
        required={required}
        look="seg"
        choices={choices}
        value={value ?? (required ? null : "")}
        field={`/values/${field.key}`}
        issues={issues}
        onChange={(next) => {
          onChange(next === "" ? undefined : next);
          return null;
        }}
      />
    );
  }
  return (
    <FieldFrame id={id} label={<>{field.label}{required && <> <span className="req">required</span></>}</>} errors={issues}>
      <select
        id={id}
        className="input"
        value={value ?? ""}
        aria-required={required ? true : undefined}
        aria-invalid={issues.length > 0 ? true : undefined}
        aria-describedby={describedBy(id, null, issues)}
        onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      >
        {(!required || value === null) && <option value="">{required ? "Choose an option" : "None"}</option>}
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </FieldFrame>
  );
}
