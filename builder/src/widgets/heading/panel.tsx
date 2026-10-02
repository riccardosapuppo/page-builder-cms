// The heading's Content tab: its text, its level and an optional link, as
// the approved design draws them (design/index.html, the #editor state).
// Its size and colour are the Style tab's, from the site's type scale and
// palette.
import { REMOVE } from "../../document/commands.ts";
import { RadioField, TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { HEADING_LEVELS } from "../../shared/document.ts";

function HeadingContent({ block }: ContentProps<"heading">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Text"
        multiline
        oneLine
        value={block.props.text}
        blockId={block.id}
        field="/props/text"
        rules={{ kind: "line", maxLength: 200 }}
        onCommit={(text) => commands.setProps({ text })}
      />
      <RadioField
        label="Level"
        choices={HEADING_LEVELS.map((level) => ({ value: level, label: `H${level}` }))}
        value={block.props.level}
        blockId={block.id}
        field="/props/level"
        hint="Use one H1 per page. It is the title search engines and screen readers announce."
        onChange={(level) => commands.setProps({ level })}
      />
      <TextField
        label="Link"
        icon="link"
        value={block.props.href ?? ""}
        placeholder="Paste a link or a page’s address"
        blockId={block.id}
        field="/props/href"
        rules={{ kind: "href", maxLength: 2048 }}
        onCommit={(href) => commands.setProps({ href: href.trim() === "" ? REMOVE : href.trim() })}
      />
      <div className="field">
        <span className="label">Size and color</span>
        <p className="hint">Set in the Style tab, from your site’s type scale and palette.</p>
      </div>
    </>
  );
}

export const panel: WidgetPanel<"heading"> = { Content: HeadingContent };
