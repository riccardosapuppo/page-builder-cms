// The Advanced tab, as the approved design draws it for a section
// (design/shots-extra/advanced.png): the section's label, which only the
// editor shows, its anchor for in-page links, and for every block whether
// it is hidden on tablets or on phones.
//
// Hiding is a tablet or phone value of the style's visibility. A block
// shows on a device what that device's value says, else what the base
// says; so hiding on one device sets that device's value when it differs
// from the base, and removes it when it would only repeat the base.
import { useId } from "react";
import { REMOVE } from "../../document/commands.ts";
import type { Block, StyleTokens } from "../../shared/document.ts";
import { TextField, Toggle } from "../controls.tsx";
import { useBlockCommands } from "./hooks.ts";

export function AdvancedTab({ block }: { block: Block }) {
  const commands = useBlockCommands(block.id);
  const hintId = useId();
  const style = block.style as { base: StyleTokens; tablet?: StyleTokens; phone?: StyleTokens };
  const base = style.base.visibility ?? "visible";
  const hidden = (device: "tablet" | "phone") => (style[device]?.visibility ?? base) === "hidden";
  const hide = (device: "tablet" | "phone", on: boolean) => {
    const wanted = on ? "hidden" : "visible";
    return commands.setStyle(device, { visibility: wanted === base ? REMOVE : wanted });
  };
  const what = block.type === "section" ? "sections" : block.type === "column" ? "columns" : "widgets";
  return (
    <>
      {block.type === "section" && (
        <>
          <TextField
            label="Section label"
            value={block.props.label ?? ""}
            blockId={block.id}
            field="/props/label"
            rules={{ kind: "line", maxLength: 60 }}
            hint="Only you see it, in the navigator and in history."
            onCommit={(label) => commands.setProps({ label: label.trim() === "" ? REMOVE : label })}
          />
          <TextField
            label="Anchor id"
            icon="anchor"
            value={block.props.anchor ?? ""}
            blockId={block.id}
            field="/props/anchor"
            rules={{ kind: "anchor" }}
            hint={block.props.anchor ? `Links to #${block.props.anchor} scroll to this section.` : "A name for links to this section, such as #join."}
            onCommit={(anchor) => {
              const name = anchor.trim().replace(/^#/, "");
              return commands.setProps({ anchor: name === "" ? REMOVE : name });
            }}
          />
        </>
      )}
      <div className="field">
        <Toggle label="Hide on tablet" checked={hidden("tablet")} blockId={block.id} field="/style/tablet/visibility" describedById={hintId} onChange={(on) => hide("tablet", on)} />
        <Toggle label="Hide on phone" checked={hidden("phone")} blockId={block.id} field="/style/phone/visibility" describedById={hintId} onChange={(on) => hide("phone", on)} />
        <p className="hint" id={hintId}>Hidden {what} stay in the navigator, grayed out, so you can find them again.</p>
      </div>
    </>
  );
}
