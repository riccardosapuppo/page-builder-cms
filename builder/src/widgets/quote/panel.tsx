// The quote's Content tab: the words quoted and, if there is one, who said
// them.
import { REMOVE } from "../../document/commands.ts";
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function QuoteContent({ block }: ContentProps<"quote">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Quote"
        multiline
        rows={4}
        value={block.props.text}
        blockId={block.id}
        field="/props/text"
        rules={{ kind: "paragraph", maxLength: 500 }}
        onCommit={(text) => commands.setProps({ text })}
      />
      <TextField
        label="Who said it"
        value={block.props.attribution ?? ""}
        placeholder="Optional"
        blockId={block.id}
        field="/props/attribution"
        rules={{ kind: "line", maxLength: 120 }}
        onCommit={(attribution) => commands.setProps({ attribution: attribution.trim() === "" ? REMOVE : attribution })}
      />
    </>
  );
}

export const panel: WidgetPanel<"quote"> = { Content: QuoteContent };
