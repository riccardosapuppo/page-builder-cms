// The logo's Logo group: the name beside the mark, which links to the home
// page; emptied, the mark alone, a decoration. Its colour and alignment are
// the Text color and Alignment groups'.
import { REMOVE } from "../../document/commands.ts";
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function LogoContent({ block }: ContentProps<"logo">) {
  const commands = useBlockCommands(block.id);
  return (
    <TextField
      label="Site name"
      value={block.props.name ?? ""}
      placeholder="None: the mark alone"
      blockId={block.id}
      field="/props/name"
      rules={{ kind: "line", maxLength: 40 }}
      hint="Beside the mark, as a link to the home page. Left empty, the mark stands alone, as in a footer."
      onCommit={(name) => commands.setProps({ name: name.trim() === "" ? REMOVE : name })}
    />
  );
}

export const panel: WidgetPanel<"logo"> = { content: { name: "Logo", Content: LogoContent } };
