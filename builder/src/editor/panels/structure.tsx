// A section's own groups (design/layout/, the section state). Columns: how
// many, and how they share the width on desktop. Name and link: the
// section's label, which only the editor shows, and its anchor for links
// to it, the one block that has one (widgets have none in the real
// editor, so the layout draws none for them).
import { makeSetColumnCount, makeSetColumnWidths, REMOVE } from "../../document/commands.ts";
import { plural } from "../../document/labels.ts";
import { COLUMN_WIDTHS_BY_COUNT, type ColumnWidthsToken, type SectionBlock } from "../../shared/document.ts";
import { RadioField, TextField } from "../controls.tsx";
import { useEnv, useRun } from "../context.tsx";
import { useBlockCommands } from "./hooks.ts";

// A preset drawn as its columns side by side, each as wide as its share.
function WidthsPicture({ parts }: { parts: readonly number[] }) {
  return (
    <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: parts.map((p) => `${p}fr`).join(" "), gap: 3, width: 44, height: 18 }}>
      {parts.map((_, i) => <i key={i} style={{ border: "1.5px solid currentColor", borderRadius: 2 }} />)}
    </span>
  );
}

// What Columns says closed: "2, equal", "2, 2:1".
export function columnsWords(block: SectionBlock): string {
  return `${block.children.length}, ${block.props.columnWidths ?? "equal"}`;
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
        hint="Side by side on desktop, one under another on tablets and phones. Fewer columns move their widgets into the last column that stays."
        onChange={(n) => run(makeSetColumnCount(store.getState().document, block.id, n, newId))}
      />
      {presets.length > 0 && (
        <RadioField<ColumnWidthsToken | "equal">
          label="Column widths"
          look="choices"
          choices={[
            { value: "equal", label: "Equal", content: <><WidthsPicture parts={Array.from({ length: count }, () => 1)} /><span>Equal</span></> },
            ...presets.map((preset) => ({ value: preset, label: preset, content: <><WidthsPicture parts={preset.split(":").map(Number)} /><span>{preset}</span></> })),
          ]}
          value={block.props.columnWidths ?? "equal"}
          blockId={block.id}
          field="/props/columnWidths"
          hint="How the columns share the width on desktop."
          onChange={(preset) => run(makeSetColumnWidths(store.getState().document, block.id, preset))}
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
