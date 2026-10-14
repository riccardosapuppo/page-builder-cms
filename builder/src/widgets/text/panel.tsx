// The text widget's Text group. The text is written on the canvas, where
// it stands, in the text editor (../../editor/rich/): this group opens it
// there and says how, with the Assistant's Write it again below
// (../../editor/AssistantTools.tsx); while it is being written, the group
// lists the keys that work in it, from the keymap (design/layout/, the
// text-editing state). What the server refused in the text shows above the groups,
// with the panel's other unclaimed refusals.
import { useId } from "react";
import { RewriteTool } from "../../editor/AssistantTools.tsx";
import { useEnv, useUi } from "../../editor/context.tsx";
import { entry, entryCaps, type KeyAction } from "../../editor/keymap.ts";
import { useCoarsePointer } from "../../editor/layout-mode.ts";
import { startEditing } from "../../editor/rich/tools.ts";
import { KeyCaps } from "../../editor/ShortcutsDialog.tsx";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

const WHILE_WRITING: readonly KeyAction[] = ["bold", "italic", "link", "leaveText"];

function TextContent({ block }: ContentProps<"text">) {
  const env = useEnv();
  const id = useId();
  const writing = useUi((u) => u.editingText?.id === block.id);
  const touch = useCoarsePointer();
  if (writing) {
    return (
      <div className="field">
        <ul className="write-keys" aria-label="While you write">
          {WHILE_WRITING.map((action) => {
            const keys = entry(action);
            return <li key={action}><span>{keys.label}</span><span className="keys-inline"><KeyCaps caps={entryCaps(keys)} small /></span></li>;
          })}
        </ul>
        <p className="hint">Bold, italic and link are on the block’s tools beside the text too, while you write.</p>
      </div>
    );
  }
  return (
    <>
      <div className="field">
        <button className="btn btn-small btn-secondary" type="button" aria-describedby={`${id}-hint`} onClick={() => startEditing(env, block.id, "end")}>
          Edit on the page
        </button>
        <p className="hint" id={`${id}-hint`}>Or {touch ? "tap" : "click"} the text on the page, or press Enter with it selected. Select words to make them bold, italic or a link; Esc leaves the text.</p>
      </div>
      <RewriteTool block={block} />
    </>
  );
}

export const panel: WidgetPanel<"text"> = { content: { name: "Text", Content: TextContent } };
