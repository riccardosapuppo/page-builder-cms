// The Style tab of any block: the settings its type accepts
// (STYLE_KEYS_BY_TYPE), each from the site's tokens only, never a free
// value: space on the spacing scale, colours from the site's palette slots,
// sizes from its type scale. Visibility is the Advanced tab's.
//
// What this tab sets applies on every device: it writes the style's base.
// Where a block has a tablet or phone value of its own, the tab says so
// under the setting it changes.
import type { CSSProperties, ReactNode } from "react";
import { REMOVE } from "../../document/commands.ts";
import { STYLE_KEY_NAMES, tokenName } from "../../document/labels.ts";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, PALETTE_SLOTS, SECTION_SPACE_TOKENS, SPACE_TOKENS, STYLE_KEYS_BY_TYPE, TYPE_STEPS, VERTICAL_ALIGN_TOKENS,
  type Block, type BlockType, type Device, type PaletteSlot, type StyleTokens,
} from "../../shared/document.ts";
import { slotLabel, slotTone } from "../../shared/site-tokens.ts";
import { RadioField, RulerField, type Choice } from "../controls.tsx";
import { useUi } from "../context.tsx";
import { Icon } from "../icons.tsx";
import { useBlockCommands } from "./hooks.ts";
import { spaceSteps } from "./steps.ts";

type StyleKey = Exclude<keyof StyleTokens, "visibility">;

// The setting's name where the type means it its own way.
function labelOf(type: BlockType, key: StyleKey): string {
  if (key === "spaceBetween") return type === "section" ? "Space between columns" : type === "gallery" ? "Space between images" : "Space between widgets";
  if (key === "color") return type === "divider" || type === "accordion" ? "Line color" : "Text color";
  if (key === "textSize") return type === "column" ? "Text size in this column" : "Text size";
  if (key === "verticalAlign") return "Vertical alignment";
  if (key === "align") return "Alignment";
  return STYLE_KEY_NAMES[key];
}

const STEP_SAMPLES: Readonly<Record<string, { size: number; sans: boolean; label: string }>> = {
  display: { size: 20, sans: true, label: "Display" },
  "heading-1": { size: 18, sans: true, label: "H1" },
  "heading-2": { size: 16, sans: true, label: "H2" },
  "heading-3": { size: 14, sans: true, label: "H3" },
  large: { size: 17, sans: false, label: "Large" },
  body: { size: 14, sans: false, label: "Body" },
  small: { size: 12, sans: false, label: "Small" },
};

const ALIGN_ICONS = { left: "align-left", center: "align-center", right: "align-right" } as const;
const VALIGN_ICONS = { top: "valign-top", middle: "valign-middle", bottom: "valign-bottom" } as const;

export function StyleTab({ block }: { block: Block }) {
  const commands = useBlockCommands(block.id);
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const keys = (STYLE_KEYS_BY_TYPE[block.type] as readonly (keyof StyleTokens)[]).filter((k): k is StyleKey => k !== "visibility");
  const style = block.style as { base: StyleTokens; tablet?: StyleTokens; phone?: StyleTokens };
  const device: Device = preview === "desktop" ? "base" : preview;

  const swatch = (slot: PaletteSlot): Choice<string> => {
    const tone = slotTone(slot, siteStyle?.palette);
    return { value: slot, label: `${slotLabel(slot)}, ${tone.label}`, color: tone.hex };
  };

  return (
    <>
      {device !== "base" && (
        <p className="note"><Icon name={device === "tablet" ? "tablet" : "phone"} /><span>You are looking at the {device} preview. The settings here apply on every device.</span></p>
      )}
      {keys.length === 0 && <p className="hint">This widget has no style settings of its own.</p>}
      {keys.map((key) => {
        const value = style.base[key] ?? null;
        const field = `/style/base/${key}`;
        const set = (next: string) => commands.setStyle("base", { [key]: next } as Parameters<typeof commands.setStyle>[1]);
        const reset = value === null
          ? "Theme default"
          : <button className="btn btn-small btn-quiet" type="button" aria-label={`Reset ${labelOf(block.type, key)}`} onClick={() => commands.setStyle("base", { [key]: REMOVE })}>Reset</button>;
        const own = device === "base" ? undefined : style[device]?.[key];
        const hint: ReactNode = own === undefined ? undefined : `On ${device === "tablet" ? "tablets" : "phones"} this block has its own value: ${tokenName(own)}.`;
        const common = { label: labelOf(block.type, key), blockId: block.id, field, scope: reset, hint };
        switch (key) {
          case "spaceInside":
          case "spaceBetween":
            return <RulerField key={key} {...common} steps={spaceSteps(SPACE_TOKENS)} value={value} onChange={set} />;
          case "spaceAbove":
          case "spaceBelow":
            return <RulerField key={key} {...common} steps={spaceSteps(SECTION_SPACE_TOKENS)} value={value} onChange={set} />;
          case "background":
            return (
              <RadioField
                key={key}
                {...common}
                look="swatches"
                choices={BACKGROUND_TOKENS.map((token) => (token === "none" ? { value: token, label: "None" } : swatch(token)))}
                value={value}
                onChange={set}
              />
            );
          case "color":
            return <RadioField key={key} {...common} look="swatches" choices={PALETTE_SLOTS.map(swatch)} value={value} onChange={set} />;
          case "textSize":
            return (
              <RadioField
                key={key}
                {...common}
                look="steps"
                choices={TYPE_STEPS.map((step) => {
                  const sample = STEP_SAMPLES[step]!;
                  return {
                    value: step,
                    label: tokenName(step),
                    content: <><span className={sample.sans ? "sans" : undefined} style={{ fontSize: `${sample.size}px` } as CSSProperties}>Aa</span>{sample.label}</>,
                  };
                })}
                value={value}
                onChange={set}
              />
            );
          case "align":
            return <RadioField key={key} {...common} look="seg-icons" choices={ALIGN_TOKENS.map((t) => ({ value: t, label: tokenName(t), icon: ALIGN_ICONS[t] }))} value={value} onChange={set} />;
          case "verticalAlign":
            return <RadioField key={key} {...common} look="seg-icons" choices={VERTICAL_ALIGN_TOKENS.map((t) => ({ value: t, label: tokenName(t), icon: VALIGN_ICONS[t] }))} value={value} onChange={set} />;
          case "aspect":
            return <RadioField key={key} {...common} look="seg" choices={ASPECT_TOKENS.map((t) => ({ value: t, label: tokenName(t) }))} value={value} onChange={set} hint={hint ?? "Crops the image to this shape; Original keeps its own."} />;
          default:
            return null;
        }
      })}
    </>
  );
}
