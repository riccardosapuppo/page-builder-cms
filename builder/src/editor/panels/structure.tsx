// The Content tabs of the two blocks that hold others. A section's content
// is its columns: how many, and how they share the width on desktop. A
// column's is its widgets, which the canvas and the navigator show.
import { makeSetColumnCount, makeSetColumnWidths } from "../../document/commands.ts";
import { plural } from "../../document/labels.ts";
import { COLUMN_WIDTHS_BY_COUNT, type ColumnBlock, type ColumnWidthsToken, type SectionBlock } from "../../shared/document.ts";
import { RadioField } from "../controls.tsx";
import { useEnv, useRun } from "../context.tsx";

// A preset drawn as its columns side by side, each as wide as its share.
function WidthsPicture({ parts }: { parts: readonly number[] }) {
  return (
    <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: parts.map((p) => `${p}fr`).join(" "), gap: 3, width: 44, height: 18 }}>
      {parts.map((_, i) => <i key={i} style={{ border: "1.5px solid currentColor", borderRadius: 2 }} />)}
    </span>
  );
}

export function SectionContent({ block }: { block: SectionBlock }) {
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

export function ColumnContent({ block }: { block: ColumnBlock }) {
  const count = block.children.length;
  return (
    <div className="field">
      <span className="label">Widgets</span>
      <p className="hint">
        {count === 0 ? "This column is empty." : `This column holds ${count} ${count === 1 ? "widget" : "widgets"}, top to bottom.`}
        {" "}To add one here, keep the column selected and pick a widget in Add.
      </p>
    </div>
  );
}
