// The icon box's Icon box group: its icon, from the site's own set
// (schema/icons.svg, drawn as the page draws it), its title and its text.
// The set holds forty-eight icons: a grid of them, the site's own first,
// with a search that keeps those whose name or words hold what is typed
// (./words.ts); the icon chosen stays in the grid whatever is typed.
import { useId, useState } from "react";
import { RadioField, TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { SiteIcon } from "../../render/drawings.tsx";
import type { IconName } from "../../shared/document.ts";
import { findIcons, ICON_LABELS } from "./words.ts";

function IconboxContent({ block }: ContentProps<"iconbox">) {
  const commands = useBlockCommands(block.id);
  const [query, setQuery] = useState("");
  const search = useId();
  const found = findIcons(query);
  const chosen = block.props.icon;
  // Whatever is typed, the icon chosen stays: the grid is never empty, and
  // its choice can be seen and kept.
  const shown: IconName[] = found.includes(chosen) ? found : [chosen, ...found];
  const none = query.trim() !== "" && found.length === 0;
  return (
    <>
      <RadioField
        label="Icon"
        look="icon-grid"
        before={
          <div className="icon-find">
            <label className="visually-hidden" htmlFor={search}>Find an icon</label>
            <input
              id={search}
              className="input icon-find-input"
              type="search"
              placeholder="Find an icon"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
        choices={shown.map((name) => ({
          value: name,
          label: ICON_LABELS[name],
          title: ICON_LABELS[name],
          content: <SiteIcon name={name} className="sw-icon" />,
        }))}
        value={chosen}
        blockId={block.id}
        field="/props/icon"
        hint={none ? `No other icon is called “${query.trim()}”: ${ICON_LABELS[chosen]} stays chosen.` : `Chosen: ${ICON_LABELS[chosen]}.`}
        onChange={(icon) => commands.setProps({ icon })}
      />
      <TextField
        label="Title"
        value={block.props.title}
        blockId={block.id}
        field="/props/title"
        rules={{ kind: "line", maxLength: 80 }}
        onCommit={(title) => commands.setProps({ title })}
      />
      <TextField
        label="Text"
        multiline
        rows={3}
        value={block.props.text}
        blockId={block.id}
        field="/props/text"
        rules={{ kind: "paragraph", maxLength: 300 }}
        onCommit={(text) => commands.setProps({ text })}
      />
    </>
  );
}

export const panel: WidgetPanel<"iconbox"> = { content: { name: "Icon box", Content: IconboxContent } };
