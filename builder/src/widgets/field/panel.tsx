// The Field block's Field group: which value of the entry it draws (the
// entry's title, or a field of the template's collection, by its label),
// what that type draws, and for a text how (a heading of a level, or
// text); then which entry the canvas shows it from. Its settings are
// the groups of the widget it draws as (../../editor/panels/groups.tsx,
// fieldStyleBlock): a heading's or a text's type and colour, an image's
// crop, a button's colours.
import { REMOVE } from "../../document/commands.ts";
import { previewedEntry } from "../../editor/collections/content.ts";
import { useTemplateCollection } from "../../editor/collections/use-content.ts";
import { useUi } from "../../editor/context.tsx";
import { RadioField, SelectField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { dayWords } from "../../render/entry-words.ts";
import type { Field } from "../../shared/collection.ts";
import { moneyWords, type Currency } from "../../shared/shop.ts";
import { HEADING_LEVELS, type Block, type FieldBlock, type HeadingLevel } from "../../shared/document.ts";
import { fieldLevel, fieldShape, TITLE, type FieldShape } from "./drawing.ts";

// What a field of each type draws, in a sentence; the shop's price, in
// the currency it is sold in.
export function drawsWords(field: Pick<Field, "type" | "label"> | null, sold: Currency | null = null): string {
  if (field?.type === "number" && sold !== null) return `The shop's price, written as ${moneyWords(125_050, sold)}.`;
  switch (field?.type) {
    case "text":
      return "Its words, as a heading of the level below, or as text.";
    case "paragraph":
      return "Its paragraphs, as the entry writes them: an empty line starts the next.";
    case "richText":
      return "Its rich text, as a Text block draws it: paragraphs, lists, bold, italic and links.";
    case "number":
      return "The number, written as 1,250.5.";
    case "date":
      return `The day, written as ${dayWords("2026-10-15")}.`;
    case "image":
      return "The image, with its alt text, as an Image block draws it.";
    case "link":
      return "A button: its words, going to its address.";
    case "toggle":
      return `Its label, “${field.label}”, when the entry has it on; nothing when it is off.`;
    case "choice":
      return "The option the entry chose.";
    default:
      return "";
  }
}

// The levels a text may be drawn at, and text, a Text block's paragraph.
type Shape = HeadingLevel | "p";
const SHAPES: ReadonlyArray<{ value: Shape; label: string }> = [
  ...HEADING_LEVELS.map((level) => ({ value: level as Shape, label: `H${level}` })),
  { value: "p", label: "Text" },
];

// The entry's title, as the panel lists it beside the collection's fields.
const TITLE_FIELD = { key: TITLE, label: "Title", type: "text", required: true } as const satisfies Field;

function FieldContent({ block }: ContentProps<"field">) {
  const commands = useBlockCommands(block.id);
  const shown = useTemplateCollection();
  const picked = useUi((u) => u.previewEntry);
  const shop = useUi((u) => u.siteShop);
  const fields = shown?.collection.fields ?? [];
  const key = block.props.field;
  const field = key === TITLE ? TITLE_FIELD : (fields.find((f) => f.key === key) ?? null);
  const name = shown?.collection.name ?? "its collection";
  const choices = [
    ...(field === null ? [{ value: key, label: `${key}: no such field` }] : []),
    { value: TITLE, label: TITLE_FIELD.label },
    ...fields.map((f) => ({ value: f.key, label: f.label })),
  ];
  const level = fieldLevel(block.props as unknown as Readonly<Record<string, unknown>>);
  // Which entry the canvas draws the template with: its Page tab's choice.
  const previewed = shown ? previewedEntry(shown.collection, shown.entries, picked?.collectionId === shown.collection.id ? picked.choice : null) : null;
  const from = shown === null ? null : previewed ? `the values of “${previewed.title}”` : shown.entries.length === 0 ? `values made up from the fields’ types: ${name} has no entry yet` : "values made up from the fields’ types";
  return (
    <>
      <SelectField
        label="Field"
        choices={choices}
        value={key}
        blockId={block.id}
        field="/props/field"
        hint={field === null ? `${name} has no field “${key}”: this block draws nothing. Choose another.` : drawsWords(field, shop !== null && shop.enabled && shown?.collection.id === shop.productsCollectionId && key === shop.priceField ? shop.currency : null)}
        onChange={(next) => commands.setProps({ field: next })}
      />
      {field?.type === "text" && (
        <RadioField
          label="Drawn as"
          choices={SHAPES}
          value={level ?? "p"}
          blockId={block.id}
          field="/props/level"
          hint={level === 1 ? "Use one H1 per page: most templates give it to the entry’s title." : null}
          onChange={(shape) => commands.setProps({ level: shape === "p" ? REMOVE : shape })}
        />
      )}
      {from !== null && <p className="hint">The canvas shows {from}. The template’s Page tab picks another entry.</p>}
    </>
  );
}

export const panel: WidgetPanel<"field"> = { content: { name: "Field", Content: FieldContent } };

// What a Field block draws as, by the type of the field it names in the
// template's collection; null for any other block, and for a field the
// collection does not have.
export function useFieldShape(block: Block): FieldShape | null {
  const shown = useTemplateCollection();
  if (block.type !== "field") return null;
  const key = block.props.field;
  const type = key === TITLE ? TITLE : shown?.collection.fields.find((field) => field.key === key)?.type;
  return type === undefined ? null : fieldShape(type, fieldLevel(block.props as unknown as Readonly<Record<string, unknown>>));
}

// A Field block as the widget it draws as, for the style groups and their
// settings (../../editor/panels/groups.tsx): the same id and style, so its
// commands change the field's own, under the type whose settings, words
// and values in use they are; a heading of the field's level.
export function fieldStyleBlock(block: FieldBlock, shape: FieldShape): Block {
  const level = fieldLevel(block.props as unknown as Readonly<Record<string, unknown>>) ?? 2;
  const base = { id: block.id, children: [] as [], style: block.style as Block["style"] };
  switch (shape) {
    case "heading":
      return { ...base, type: "heading", props: { level, text: "" } } as Block;
    case "text":
      return { ...base, type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph" }] } } } as Block;
    case "image":
      return { ...base, type: "image", props: { url: "/", alt: "" } } as Block;
    case "button":
      return { ...base, type: "button", props: { label: "", href: "#" } } as Block;
  }
}
