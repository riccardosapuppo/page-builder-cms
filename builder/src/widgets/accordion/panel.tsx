// The accordion's Questions group: its questions and answers in order, each
// moved up or down or removed with the accordion's own item commands, and
// new ones added at the end. The first one starts open on the page.
import { ServerErrors, TextField } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

// The schema's most questions in one accordion.
const MAX_ITEMS = 30;

function AccordionContent({ block }: ContentProps<"accordion">) {
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
                <span>Question {n}</span>
                <span className="item-tools">
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move question ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move question ${n} down`} title="Move down" disabled={index === items.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Remove question ${n}`} title="Remove" disabled={items.length === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                </span>
              </div>
              <TextField
                label={`Question ${n}`}
                value={item.question}
                blockId={block.id}
                field={`${at}/question`}
                rules={{ kind: "line", maxLength: 200 }}
                onCommit={(question) => commands.setItem(index, { question })}
              />
              <TextField
                label={`Answer ${n}`}
                multiline
                rows={3}
                value={item.answer}
                blockId={block.id}
                field={`${at}/answer`}
                rules={{ kind: "paragraph", maxLength: 2000 }}
                onCommit={(answer) => commands.setItem(index, { answer })}
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
          onClick={() => commands.insertItems(items.length, [{ question: "A question?", answer: "Its answer." }])}
        >
          <Icon name="plus" />Add a question
        </button>
      )}
    </div>
  );
}

export const panel: WidgetPanel<"accordion"> = { content: { name: "Questions", Content: AccordionContent } };
