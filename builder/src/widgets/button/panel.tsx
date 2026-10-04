// The button's Button group: what it says and where it goes. Its colours
// and alignment are the Colors and Alignment groups'.
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import { usePageLinks } from "../../editor/session.tsx";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function ButtonContent({ block }: ContentProps<"button">) {
  const commands = useBlockCommands(block.id);
  const pages = usePageLinks();
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
        placeholder="Paste a link or choose a page"
        suggestions={pages}
        blockId={block.id}
        field="/props/href"
        rules={{ kind: "href", maxLength: 2048 }}
        hint="A full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:."
        onCommit={(href) => commands.setProps({ href: href.trim() })}
      />
    </>
  );
}

export const panel: WidgetPanel<"button"> = { content: { name: "Button", Content: ButtonContent } };
