// A form a visitor fills in and sends, with no script: the twin of
// cms/app/views/blocks/_form.html.erb. Its fields in order, each tied to
// its label by the field's id, the block's id and the field's name; a
// field that must be filled in carries required, which the browser
// checks before sending, and says "(required)" in its label. Then a field
// for robots, hidden from people and from screen readers, which a person
// leaves empty, and the button.
//
// It is sent to the page's own address: the form has no action, and the
// block's id goes with the answers in "form". Each answer goes under
// answers[<field name>], a ticked box as "yes".
//
// A field the renderer does not know (another kind, no name, not an
// object) is left out. A limit the schema refuses (not a whole number, out
// of its kind's range) gives way to the kind's own: 300 characters for a
// line of text, 5000 for a longer one. An email address takes 254, and a
// checkbox none.
//
// The server's partial can also draw a form the server refused, with what
// the visitor wrote and why it was refused; the editor never has a
// visitor's answer, so this renderer draws the form as the page first
// serves it.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, idText, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { visibilityClasses } from "../../render/style.ts";
import { EMAIL_MAX_LENGTH, FORM_FIELD_KINDS, FORM_TEXT_LIMITS, type FormFieldKind } from "../../shared/document.ts";

interface DrawnField {
  name: string;
  kind: FormFieldKind;
  label: string;
  required: boolean;
  maxLength: number | null;
}

function drawnFields(items: unknown): DrawnField[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown): DrawnField[] => {
    if (!isObject(item)) return [];
    const { name, kind } = item;
    if (typeof name !== "string" || name === "" || !(FORM_FIELD_KINDS as readonly unknown[]).includes(kind)) return [];
    const k = kind as FormFieldKind;
    let maxLength: number | null = null;
    if (k === "email") maxLength = EMAIL_MAX_LENGTH;
    else if (k !== "checkbox") {
      const limit = FORM_TEXT_LIMITS[k];
      const own = item.maxLength;
      maxLength = Number.isInteger(own) && (own as number) >= 1 && (own as number) <= limit ? (own as number) : limit;
    }
    return [{ name, kind: k, label: propText(item, "label"), required: item.required === true, maxLength }];
  });
}

function Label({ field, htmlFor }: { field: DrawnField; htmlFor: string }) {
  return field.required ? <label htmlFor={htmlFor}>{`${field.label} `}<em>(required)</em></label> : <label htmlFor={htmlFor}>{field.label}</label>;
}

export function FormRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const formId = idText(block.id);
  return (
    <BlockRoot block={block} classes={["w", "w-form", visibilityClasses(blockStyle(block))]} decoration={decoration}>
      <form className="sw-form" method="post">
        <input type="hidden" name="form" defaultValue={formId} />
        {drawnFields(props.items).map((field, index) => {
          const id = `${formId}:${field.name}`;
          const name = `answers[${field.name}]`;
          const required = field.required || undefined;
          const maxLength = field.maxLength ?? undefined;
          if (field.kind === "checkbox") {
            return (
              <div className="sw-check" key={index}>
                <input id={id} name={name} type="checkbox" value="yes" required={required} />
                <Label field={field} htmlFor={id} />
              </div>
            );
          }
          return (
            <div className="sw-field" key={index}>
              <Label field={field} htmlFor={id} />
              {field.kind === "textarea"
                ? <textarea id={id} name={name} rows={3} maxLength={maxLength} required={required} />
                : <input id={id} name={name} type={field.kind} maxLength={maxLength} required={required} autoComplete={field.kind === "email" ? "email" : undefined} />}
            </div>
          );
        })}
        <div className="sw-trap" aria-hidden="true">
          <label>Leave this field empty <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <button className="sw-btn sw-btn-primary" type="submit">{propText(props, "submitLabel")}</button>
      </form>
    </BlockRoot>
  );
}
