// The steps block's Steps group: its steps in order, each a title and the
// text that says what it means, moved up or down or removed with the
// block's own item commands, and new ones added at the end, from two steps
// to ten. The page numbers them in this order.
import { ServerErrors, TextField } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

// The schema's fewest and most steps in one block.
const MIN_ITEMS = 2;
const MAX_ITEMS = 10;

function StepsContent({ block }: ContentProps<"steps">) {
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
                <span>Step {n}</span>
                <span className="item-tools">
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move step ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move step ${n} down`} title="Move down" disabled={index === items.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Remove step ${n}`} title="Remove" disabled={items.length <= MIN_ITEMS} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                </span>
              </div>
              <TextField
                label={`Title ${n}`}
                value={item.title}
                blockId={block.id}
                field={`${at}/title`}
                rules={{ kind: "line", maxLength: 120 }}
                onCommit={(title) => commands.setItem(index, { title })}
              />
              <TextField
                label={`Text ${n}`}
                multiline
                rows={3}
                value={item.text}
                blockId={block.id}
                field={`${at}/text`}
                rules={{ kind: "paragraph", maxLength: 1000 }}
                onCommit={(text) => commands.setItem(index, { text })}
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
          onClick={() => commands.insertItems(items.length, [{ title: "A step", text: "What happens in it." }])}
        >
          <Icon name="plus" />Add a step
        </button>
      )}
    </div>
  );
}

export const panel: WidgetPanel<"steps"> = { content: { name: "Steps", Content: StepsContent } };
