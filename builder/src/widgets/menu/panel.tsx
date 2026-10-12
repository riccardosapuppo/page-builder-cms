// The menu's Links group: its name for a screen reader, then its links in
// order, each a label and where it goes (a page of the site, offered as
// the author types, or any address), moved up or down or removed with the
// menu's own item commands, and new ones added at the end. Where the
// links fold into Menu is worked out from their words, as the page draws
// them; the panel says so.
import { ServerErrors, TextField } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import { usePageLinks } from "../../editor/session.tsx";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

// The schema's most links in one menu.
const MAX_ITEMS = 12;

function MenuContent({ block }: ContentProps<"menu">) {
  const commands = useBlockCommands(block.id);
  const pages = usePageLinks();
  const items = block.props.items;
  return (
    <>
      <TextField
        label="Menu name"
        value={block.props.label}
        blockId={block.id}
        field="/props/label"
        rules={{ kind: "line", maxLength: 40 }}
        hint="What a screen reader calls it: Main for the header's, Footer for the footer's. Two menus of one page need two names."
        onCommit={(label) => commands.setProps({ label })}
      />
      <div className="field">
        <ol className="items">
          {items.map((item, index) => {
            const n = index + 1;
            const at = `/props/items/${index}`;
            return (
              <li className="item" key={index}>
                <div className="item-head">
                  <span>Link {n}</span>
                  <span className="item-tools">
                    <button className="ibtn ibtn-small" type="button" aria-label={`Move link ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                    <button className="ibtn ibtn-small" type="button" aria-label={`Move link ${n} down`} title="Move down" disabled={index === items.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                    <button className="ibtn ibtn-small" type="button" aria-label={`Remove link ${n}`} title="Remove" disabled={items.length === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                  </span>
                </div>
                <TextField
                  label={`Text ${n}`}
                  value={item.label}
                  blockId={block.id}
                  field={`${at}/label`}
                  rules={{ kind: "line", maxLength: 40 }}
                  onCommit={(label) => commands.setItem(index, { label })}
                />
                <TextField
                  label={`Link ${n}`}
                  icon="link"
                  value={item.href}
                  placeholder="Paste a link or choose a page"
                  suggestions={pages}
                  blockId={block.id}
                  field={`${at}/href`}
                  rules={{ kind: "href", maxLength: 2048 }}
                  hint="A page of this site (/winter-series), a section of a page (/#join), a full address, mailto: or tel:."
                  onCommit={(href) => commands.setItem(index, { href: href.trim() })}
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
            onClick={() => commands.insertItems(items.length, [{ label: "New link", href: "/" }])}
          >
            <Icon name="plus" />Add a link
          </button>
        )}
      </div>
    </>
  );
}

export const panel: WidgetPanel<"menu"> = { content: { name: "Links", Content: MenuContent } };
