// A section's own groups (design/layout/, the section state). Columns: how
// many, how they share the width on desktop, and on which devices they go
// one under another. Name and link: the
// section's label, which only the editor shows, and its anchor for links
// to it, the one block that has one (widgets have none in the real
// editor, so the layout draws none for them).
import { makeSetColumnCount, makeSetColumnWidths, makeSetStack, REMOVE } from "../../document/commands.ts";
import { plural } from "../../document/labels.ts";
import { COLUMN_WIDTHS_BY_COUNT, type ColumnWidthsToken, type SectionBlock, type StackToken } from "../../shared/document.ts";
import { RadioField, TextField } from "../controls.tsx";
import { useEnv, useRun } from "../context.tsx";
import { useBlockCommands } from "./hooks.ts";

// A preset drawn as its columns side by side, each as wide as its share; a
// fit part, a column as wide as what it holds, drawn narrow.
function WidthsPicture({ parts }: { parts: readonly string[] }) {
  return (
    <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: parts.map((p) => (p === "fit" ? "8px" : `${p}fr`)).join(" "), gap: 3, width: 44, height: 18 }}>
      {parts.map((_, i) => <i key={i} style={{ border: "1.5px solid currentColor", borderRadius: 2 }} />)}
    </span>
  );
}

// A fit preset in words, for its title.
const FIT_TITLES: Readonly<Partial<Record<ColumnWidthsToken, string>>> = {
  "fit:1": "The first column as wide as what it holds, the second takes the rest",
  "1:fit": "The last column as wide as what it holds, the first takes the rest",
  "fit:1:fit": "The outer columns as wide as what they hold, the middle one takes the rest",
};

const STACK_CHOICES: ReadonlyArray<{ value: StackToken | "tablet"; label: string; title: string }> = [
  { value: "tablet", label: "Tablet", title: "One under another on tablets and phones" },
  { value: "phone", label: "Phone", title: "One under another on phones only" },
  { value: "never", label: "Never", title: "Side by side on every device" },
];

// What Columns says closed: "2, equal", "2, 2:1", "3, fit:1:fit, never
// stacked".
export function columnsWords(block: SectionBlock): string {
  const stack = block.props.stack === "phone" ? "stacked on phones" : block.props.stack === "never" ? "never stacked" : null;
  return [String(block.children.length), block.props.columnWidths ?? "equal", stack].filter((part) => part !== null).join(", ");
}

export function SectionColumns({ block }: { block: SectionBlock }) {
  const { store, newId } = useEnv();
  const run = useRun();
  const count = block.children.length as 1 | 2 | 3 | 4;
  const presets: readonly ColumnWidthsToken[] = COLUMN_WIDTHS_BY_COUNT[count];
  return (
    <>
      <RadioField
        label="Columns"
        choices={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n), title: `${n} ${plural("column", n)}` }))}
        value={count}
        blockId={block.id}
        field="/children"
        hint="Side by side on desktop. Fewer columns move their widgets into the last column that stays."
        onChange={(n) => run(makeSetColumnCount(store.getState().document, block.id, n, newId))}
      />
      {presets.length > 0 && (
        <RadioField<ColumnWidthsToken | "equal">
          label="Column widths"
          look="choices"
          choices={[
            { value: "equal", label: "Equal", content: <><WidthsPicture parts={Array.from({ length: count }, () => "1")} /><span>Equal</span></> },
            ...presets.map((preset) => ({ value: preset, label: preset, ...(FIT_TITLES[preset] ? { title: FIT_TITLES[preset] } : {}), content: <><WidthsPicture parts={preset.split(":")} /><span>{preset}</span></> })),
          ]}
          value={block.props.columnWidths ?? "equal"}
          blockId={block.id}
          field="/props/columnWidths"
          hint="How the columns share the width on desktop. A fit column is as wide as what it holds."
          onChange={(preset) => run(makeSetColumnWidths(store.getState().document, block.id, preset))}
        />
      )}
      {count > 1 && (
        <RadioField<StackToken | "tablet">
          label="Stack columns"
          choices={STACK_CHOICES}
          value={block.props.stack ?? "tablet"}
          blockId={block.id}
          field="/props/stack"
          hint="Where the columns go one under another: from tablets down, on phones only, or never."
          onChange={(stack) => run(makeSetStack(store.getState().document, block.id, stack))}
        />
      )}
    </>
  );
}

// What Name and link says closed: "Join, #join", "No label yet".
export function nameWords(block: SectionBlock): string {
  const anchor = block.props.anchor ? `#${block.props.anchor}` : null;
  return [block.props.label ?? "No label yet", anchor].filter((part) => part !== null).join(", ");
}

export function SectionName({ block }: { block: SectionBlock }) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Section label"
        value={block.props.label ?? ""}
        blockId={block.id}
        field="/props/label"
        rules={{ kind: "line", maxLength: 60 }}
        hint="Only you see it, in the outline, the bottom line and history."
        onCommit={(label) => commands.setProps({ label: label.trim() === "" ? REMOVE : label })}
      />
      <TextField
        label="Anchor id"
        icon="anchor"
        value={block.props.anchor ?? ""}
        blockId={block.id}
        field="/props/anchor"
        rules={{ kind: "anchor" }}
        hint={block.props.anchor ? `Links to #${block.props.anchor} scroll to this section.` : "A name for links to this section, such as #join."}
        onCommit={(anchor) => {
          const name = anchor.trim().replace(/^#/, "");
          return commands.setProps({ anchor: name === "" ? REMOVE : name });
        }}
      />
    </>
  );
}
