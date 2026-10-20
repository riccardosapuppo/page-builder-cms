// The logo's Logo group: the name beside the mark, which links to the home
// page; emptied, the mark alone, a decoration. With a name, whether the
// site's mark is drawn beside it: off, the name alone, a word mark. Its
// colour and alignment are the Text color and Alignment groups'.
import { REMOVE } from "../../document/commands.ts";
import { TextField, Toggle } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function LogoContent({ block }: ContentProps<"logo">) {
  const commands = useBlockCommands(block.id);
  const named = (block.props.name ?? "") !== "";
  return (
    <>
      <TextField
        label="Site name"
        value={block.props.name ?? ""}
        placeholder="None: the mark alone"
        blockId={block.id}
        field="/props/name"
        rules={{ kind: "line", maxLength: 40 }}
        hint="A link to the home page. Left empty, the mark stands alone, as in a footer."
        onCommit={(name) => commands.setProps({ name: name.trim() === "" ? REMOVE : name })}
      />
      {named && (
        <Toggle
          label="The site's mark beside it"
          checked={block.props.mark !== false}
          blockId={block.id}
          field="/props/mark"
          onChange={(on) => commands.setProps({ mark: on ? REMOVE : false })}
        />
      )}
    </>
  );
}

export const panel: WidgetPanel<"logo"> = { content: { name: "Logo", Content: LogoContent } };
