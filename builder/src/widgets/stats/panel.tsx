// The stats block's Figures group: its figures in order, each a value and
// the label that says what it counts, moved up or down or removed with the
// block's own item commands, and new ones added at the end, from one
// figure to eight.
import { ServerErrors, TextField } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

// The schema's most figures in one block.
const MAX_ITEMS = 8;

function StatsContent({ block }: ContentProps<"stats">) {
  const commands = useBlockCommands(block.id);
  const items = block.props.items;
  return (
    <div className="field">
      <ol className="items">
        {items.map((item, index) => {
          const n = index + 1;
          const at = `/props/items/${index}`;
          return (
            <li className="item" key={index}>
              <div className="item-head">
                <span>Figure {n}</span>
                <span className="item-tools">
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move figure ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move figure ${n} down`} title="Move down" disabled={index === items.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Remove figure ${n}`} title="Remove" disabled={items.length === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                </span>
              </div>
              <TextField
                label={`Value ${n}`}
                value={item.value}
                blockId={block.id}
                field={`${at}/value`}
                rules={{ kind: "line", maxLength: 24 }}
                onCommit={(value) => commands.setItem(index, { value })}
              />
              <TextField
                label={`Label ${n}`}
                value={item.label}
                blockId={block.id}
                field={`${at}/label`}
                rules={{ kind: "line", maxLength: 80 }}
                onCommit={(label) => commands.setItem(index, { label })}
              />
            </li>
          );
        })}
      </ol>
      <ServerErrors blockId={block.id} fields={["/props/items"]} />
      {items.length < MAX_ITEMS && (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          style={{ marginTop: 10 }}
          onClick={() => commands.insertItems(items.length, [{ value: "100", label: "What it counts" }])}
        >
          <Icon name="plus" />Add a figure
        </button>
      )}
    </div>
  );
}

export const panel: WidgetPanel<"stats"> = { content: { name: "Figures", Content: StatsContent } };
