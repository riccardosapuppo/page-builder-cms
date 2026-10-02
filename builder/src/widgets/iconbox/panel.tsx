// The icon box's Content tab: its icon, from the site's own set
// (schema/icons.svg, drawn as the page draws it), its title and its text.
import { RadioField, TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { SiteIcon } from "../../render/drawings.tsx";
import { ICON_NAMES, type IconName } from "../../shared/document.ts";

const ICON_LABELS: Readonly<Record<IconName, string>> = {
  sunrise: "Sunrise", buoys: "Buoys", cup: "Cup", calendar: "Calendar", clock: "Clock", pin: "Pin", globe: "Globe", info: "Info",
};

function IconboxContent({ block }: ContentProps<"iconbox">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <RadioField
        label="Icon"
        look="choices"
        choices={ICON_NAMES.map((name) => ({
          value: name,
          label: ICON_LABELS[name],
          content: <><SiteIcon name={name} className="sw-icon" /><span>{ICON_LABELS[name]}</span></>,
        }))}
        value={block.props.icon}
        blockId={block.id}
        field="/props/icon"
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

export const panel: WidgetPanel<"iconbox"> = { Content: IconboxContent };
