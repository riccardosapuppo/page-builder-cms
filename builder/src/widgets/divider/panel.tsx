// The divider's Content tab. A divider is a line and holds nothing of its
// own, so its tab says where its one setting, the colour, is.
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function DividerContent(_props: ContentProps<"divider">) {
  return (
    <div className="field">
      <span className="label">Line</span>
      <p className="hint">A divider is a line between the widgets around it. Its color is in the Style tab.</p>
    </div>
  );
}

export const panel: WidgetPanel<"divider"> = { Content: DividerContent };
