// The text widget's Text group. The text is written on the canvas, where
// it stands, in the text editor (../../editor/rich/): this group opens it
// there and says how. What the server refused in the text shows above the
// groups, with the panel's other unclaimed refusals.
import { useId } from "react";
import { useEnv } from "../../editor/context.tsx";
import { startEditing } from "../../editor/rich/tools.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function TextContent({ block }: ContentProps<"text">) {
  const env = useEnv();
  const id = useId();
  return (
    <div className="field">
      <button className="btn btn-small btn-secondary" type="button" aria-describedby={`${id}-hint`} onClick={() => startEditing(env, block.id, "end")}>
        Edit on the page
      </button>
      <p className="hint" id={`${id}-hint`}>Or click the text on the page, or press Enter with it selected. Select words to make them bold, italic or a link; Esc leaves the text.</p>
    </div>
  );
}

export const panel: WidgetPanel<"text"> = { content: { name: "Text", Content: TextContent } };
