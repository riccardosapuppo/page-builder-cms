// The spacer's Height group: its height, one step of the site's spacing
// scale, on the same ruler the Spacing groups use for space.
import { RulerField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import { spaceSteps } from "../../editor/panels/steps.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { SPACE_TOKENS } from "../../shared/document.ts";

function SpacerContent({ block }: ContentProps<"spacer">) {
  const commands = useBlockCommands(block.id);
  return (
    <RulerField
      label="Height"
      steps={spaceSteps(SPACE_TOKENS)}
      value={block.props.size}
      blockId={block.id}
      field="/props/size"
      hint="Empty space between the widgets above and below, from the site’s spacing scale."
      onChange={(size) => commands.setProps({ size })}
    />
  );
}

export const panel: WidgetPanel<"spacer"> = { content: { name: "Height", Content: SpacerContent } };
