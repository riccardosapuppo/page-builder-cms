// The form's two groups. Fields: each field in order, its label, its type,
// whether it must be filled in and, for the two kinds of text, the
// longest answer it takes; each moved up or down or removed with the
// form's own item commands, and new ones added at the end. Button and
// message: the button's text, and what the visitor reads once the answer
// is kept.
//
// A field's name, the key its answers are kept under, is made here and
// never shown: a new field takes the first "field-<n>" the form does not
// have, and a field keeps its name through every change, so its answers
// line up from one version to the next.
import { REMOVE, type Updates } from "../../document/commands.ts";
import { Icon } from "../../editor/icons.tsx";
import { NumberField, RadioField, ServerErrors, TextField, Toggle } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { FORM_TEXT_LIMITS, type FormField, type FormFieldKind } from "../../shared/document.ts";

// The schema's most fields in one form.
const MAX_FIELDS = 20;

const KINDS: ReadonlyArray<{ value: FormFieldKind; label: string }> = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "textarea", label: "Long text" },
  { value: "checkbox", label: "Checkbox" },
];

// The longest answer a new field of each kind of text takes.
const DEFAULT_LIMITS = { text: 100, textarea: 1000 } as const;

// What changes with a field's kind: its limit, kept when the new kind
// allows it, the new kind's default when it does not, taken out for an
// email address or a checkbox.
function kindUpdates(field: FormField, kind: FormFieldKind): Updates {
  if (kind === "email" || kind === "checkbox") return { kind, maxLength: REMOVE };
  const own = field.maxLength;
  return { kind, maxLength: own !== undefined && own <= FORM_TEXT_LIMITS[kind] ? own : DEFAULT_LIMITS[kind] };
}

export function newFieldName(fields: readonly FormField[]): string {
  const taken = new Set(fields.map((field) => field.name));
  let n = fields.length + 1;
  while (taken.has(`field-${n}`)) n += 1;
  return `field-${n}`;
}

function FieldsContent({ block }: ContentProps<"form">) {
  const commands = useBlockCommands(block.id);
  const fields = block.props.items;
  return (
    <div className="field">
      <ol className="items">
        {fields.map((field, index) => {
          const n = index + 1;
          const at = `/props/items/${index}`;
          return (
            <li className="item" key={index}>
              <div className="item-head">
                <span>Field {n}</span>
                <span className="item-tools">
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move field ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move field ${n} down`} title="Move down" disabled={index === fields.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Remove field ${n}`} title="Remove" disabled={fields.length === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                </span>
              </div>
              <TextField
                label={`Field ${n} label`}
                value={field.label}
                blockId={block.id}
                field={`${at}/label`}
                rules={{ kind: "line", maxLength: 200 }}
                onCommit={(label) => commands.setItem(index, { label })}
              />
              <RadioField
                label={`Field ${n} type`}
                choices={KINDS}
                value={field.kind}
                blockId={block.id}
                field={`${at}/kind`}
                onChange={(kind) => commands.setItem(index, kindUpdates(field, kind))}
              />
              {field.kind !== "email" && field.kind !== "checkbox" && (
                <NumberField
                  label={`Field ${n} longest answer`}
                  integer
                  value={field.maxLength ?? DEFAULT_LIMITS[field.kind]}
                  blockId={block.id}
                  field={`${at}/maxLength`}
                  rules={{ minimum: 1, maximum: FORM_TEXT_LIMITS[field.kind] }}
                  hint={`In characters, from 1 to ${FORM_TEXT_LIMITS[field.kind]}.`}
                  onCommit={(maxLength) => commands.setItem(index, { maxLength })}
                />
              )}
              <div className="field">
                <Toggle
                  label={field.kind === "checkbox" ? `Field ${n} must be ticked` : `Field ${n} must be filled in`}
                  checked={field.required}
                  blockId={block.id}
                  field={`${at}/required`}
                  onChange={(required) => commands.setItem(index, { required })}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <ServerErrors blockId={block.id} fields={["/props/items"]} />
      {fields.length < MAX_FIELDS && (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          style={{ marginTop: 10 }}
          onClick={() => commands.insertItems(fields.length, [{ name: newFieldName(fields), kind: "text", label: "New field", required: false, maxLength: DEFAULT_LIMITS.text }])}
        >
          <Icon name="plus" />Add a field
        </button>
      )}
    </div>
  );
}

function SendingContent({ block }: ContentProps<"form">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Button text"
        value={block.props.submitLabel}
        blockId={block.id}
        field="/props/submitLabel"
        rules={{ kind: "line", maxLength: 60 }}
        onCommit={(submitLabel) => commands.setProps({ submitLabel })}
      />
      <TextField
        label="Message after sending"
        multiline
        rows={3}
        value={block.props.confirmation}
        blockId={block.id}
        field="/props/confirmation"
        rules={{ kind: "paragraph", maxLength: 500 }}
        hint="What the visitor reads once the answer has reached the site."
        onCommit={(confirmation) => commands.setProps({ confirmation })}
      />
    </>
  );
}

export const panel: WidgetPanel<"form"> = {
  content: { name: "Fields", Content: FieldsContent },
  more: [{ id: "form-sending", name: "Button and message", props: ["submitLabel", "confirmation"], summary: (block) => block.props.submitLabel, Content: SendingContent }],
};
