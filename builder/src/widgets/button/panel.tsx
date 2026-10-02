// The button's Content tab: what it says and where it goes. Its colours
// and alignment are the Style tab's.
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function ButtonContent({ block }: ContentProps<"button">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Text"
        value={block.props.label}
        blockId={block.id}
        field="/props/label"
        rules={{ kind: "line", maxLength: 80 }}
        onCommit={(label) => commands.setProps({ label })}
      />
      <TextField
        label="Link"
        icon="link"
        value={block.props.href}
        placeholder="Paste a link or a page’s address"
        blockId={block.id}
        field="/props/href"
        rules={{ kind: "href", maxLength: 2048 }}
        hint="A full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:."
        onCommit={(href) => commands.setProps({ href: href.trim() })}
      />
    </>
  );
}

export const panel: WidgetPanel<"button"> = { Content: ButtonContent };
