// The text widget's Content tab. Text is written here, in the panel, as
// plain paragraphs (./plain.ts). A text that holds bold, italic, links or
// lists is shown as it reads and kept as it is; "Edit as plain text"
// replaces it with its words only, and only once the person changes them.
import { useMemo, useState } from "react";
import type { Json } from "../../document/json.ts";
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { renderRichText } from "../../render/rich-text.tsx";
import { docFromPlain, flattenText, plainText } from "./plain.ts";

function TextContent({ block }: ContentProps<"text">) {
  const commands = useBlockCommands(block.id);
  const plain = useMemo(() => plainText(block.props.doc), [block.props.doc]);
  const [asPlain, setAsPlain] = useState(false);
  if (plain === null && !asPlain) {
    return (
      <div className="field">
        <span className="label">Text</span>
        <div className="preview-text">{renderRichText(block.props.doc)}</div>
        <p className="hint">This text has bold, italic, links or lists, which the field here cannot hold, so it is kept as it is.</p>
        <button className="btn btn-small btn-secondary" type="button" style={{ marginTop: 8 }} onClick={() => setAsPlain(true)}>Edit as plain text</button>
      </div>
    );
  }
  return (
    <TextField
      label="Text"
      multiline
      rows={6}
      value={plain ?? flattenText(block.props.doc)}
      blockId={block.id}
      field="/props/doc"
      rules={{ kind: "paragraph" }}
      autoFocus={asPlain && plain === null}
      hint={plain === null ? "Changing the text here removes its bold, italic, links and lists." : "A blank line starts a new paragraph."}
      onCommit={(text) => commands.setProps({ doc: docFromPlain(text) as unknown as Json })}
    />
  );
}

export const panel: WidgetPanel<"text"> = { Content: TextContent };
