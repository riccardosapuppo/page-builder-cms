// The Shown on group of every block (design/layout/, the section state):
// whether it is hidden on tablets or on phones.
//
// Hiding is a tablet or phone value of the style's visibility. A block
// shows on a device what that device's value says, else what the base
// says; so hiding on one device sets that device's value when it differs
// from the base, and removes it when it would only repeat the base. A
// block hidden on the device the canvas previews is not drawn there, as
// on a visitor's device, and the group says so.
import { useId } from "react";
import { REMOVE } from "../../document/commands.ts";
import type { Block, StyleTokens } from "../../shared/document.ts";
import { Toggle } from "../controls.tsx";
import { useUi } from "../context.tsx";
import { Icon } from "../icons.tsx";
import { useBlockCommands } from "./hooks.ts";

type Shown = "desktop" | "tablet" | "phone";

// The devices a block is shown on, the desktop first.
export function shownOn(style: unknown): Shown[] {
  const parts = style as { base: StyleTokens; tablet?: StyleTokens; phone?: StyleTokens };
  const base = parts.base.visibility ?? "visible";
  return (["desktop", "tablet", "phone"] as const).filter((device) => (device === "desktop" ? base : (parts[device]?.visibility ?? base)) === "visible");
}

// What the group says closed: "Every device", "Desktop and phone",
// "Desktop only", "No device".
export function shownOnWords(style: unknown): string {
  const devices = shownOn(style);
  if (devices.length === 3) return "Every device";
  if (devices.length === 0) return "No device";
  const names = devices.map((device, index) => (index === 0 ? device[0]!.toUpperCase() + device.slice(1) : device));
  return devices.length === 1 ? `${names[0]} only` : names.join(" and ");
}

export function ShownOn({ block }: { block: Block }) {
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
  // Hidden on the device previewed, the block is not on the canvas, as on
  // a visitor's device: said here, where it is chosen.
  const preview = useUi((u) => u.preview);
  const gone = preview !== "desktop" && hidden(preview);
  return (
    <div className="field">
      <Toggle label="Hide on tablet" checked={hidden("tablet")} blockId={block.id} field="/style/tablet/visibility" describedById={hintId} onChange={(on) => hide("tablet", on)} />
      <Toggle label="Hide on phone" checked={hidden("phone")} blockId={block.id} field="/style/phone/visibility" describedById={hintId} onChange={(on) => hide("phone", on)} />
      <p className="hint" id={hintId}>Hidden {what} stay in the outline, grayed out, so you can find them again.</p>
      {gone && <p className="note device-note" role="status"><Icon name={preview} /><span>Hidden on {preview}s: the canvas leaves it out while you preview a {preview}, as a visitor’s {preview} does.</span></p>}
    </div>
  );
}
