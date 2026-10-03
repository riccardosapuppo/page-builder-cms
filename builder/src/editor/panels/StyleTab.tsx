// The Style tab of any block: the settings its type accepts
// (STYLE_KEYS_BY_TYPE), each from the site's tokens only, never a free
// value: space on the spacing scale, colours from the site's palette slots,
// sizes from its type scale. Visibility is the Advanced tab's.
//
// The tab edits the device the canvas previews (design/shots/style.png).
// On the desktop it writes the style's base, which every device shows
// unless it has a value of its own. With a tablet or a phone previewed it
// writes that device's values only, and each setting says where its value
// comes from: "From desktop" (the device shows the base, and a change
// makes it its own), or "Tablet only" with the override's words and a
// Remove that takes the device's key out, so the device follows the
// desktop again (./device-style.ts, backToDesktop: never the desktop's
// value written in its place).
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { REMOVE } from "../../document/commands.ts";
import { STYLE_KEY_NAMES, tokenName } from "../../document/labels.ts";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, PALETTE_SLOTS, SECTION_SPACE_TOKENS, SPACE_TOKENS, STYLE_KEYS_BY_TYPE, TYPE_STEPS, VERTICAL_ALIGN_TOKENS,
  type Block, type BlockType, type PaletteSlot, type StyleTokens,
} from "../../shared/document.ts";
import { COLUMN_GAP_DEFAULT, slotLabel, slotTone } from "../../shared/site-tokens.ts";
import { afterRender } from "../act.ts";
import { RadioField, RulerField, type Choice, type ScopeProps } from "../controls.tsx";
import { useUi } from "../context.tsx";
import { backToDesktop, deviceOf, ownValue, shownValue, type OverrideDevice } from "../device-style.ts";
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

// The order the tab lists its settings in, the approved design's (the
// #style state: Space inside, Space between, Background, Text size,
// Alignment): space first, then colour, then type, then placement.
const DISPLAY_ORDER: readonly StyleKey[] = ["spaceInside", "spaceAbove", "spaceBelow", "spaceBetween", "background", "textSize", "color", "align", "verticalAlign", "aspect"];

const ALIGN_ICONS = { left: "align-left", center: "align-center", right: "align-right" } as const;
const VALIGN_ICONS = { top: "valign-top", middle: "valign-middle", bottom: "valign-bottom" } as const;

// The settings drawn as a ruler, whose desktop value the override marks
// with a ring.
const RULERS: ReadonlySet<StyleKey> = new Set(["spaceInside", "spaceBetween", "spaceAbove", "spaceBelow"]);

const DEVICE_WORDS: Readonly<Record<OverrideDevice, { name: string; plural: string; other: OverrideDevice }>> = {
  tablet: { name: "Tablet", plural: "tablets", other: "phone" },
  phone: { name: "Phone", plural: "phones", other: "tablet" },
};

const valueWord = (value: string | null) => (value === null ? "the theme’s default" : tokenName(value));

// The theme's own step where a block sets none, for the settings the
// published page's stylesheet gives one value on every width (site.css):
// a column has no space inside, and its widgets are the column gap apart.
// Others vary with the width, and are said as the theme's default.
function themeStep(type: BlockType, key: StyleKey): string | null {
  if (key === "spaceInside") return "none";
  if (type === "column" && key === "spaceBetween") return COLUMN_GAP_DEFAULT;
  return null;
}

// The override's words (design/shots/style.png): "Tablet override: L on
// all four sides. Desktop and phone use None, marked with a ring." The
// desktop's value, and the other device's own if it has one.
function overrideWords(key: StyleKey, device: OverrideDevice, own: string, desktop: string | null, other: string | null): ReactNode {
  const words = DEVICE_WORDS[device];
  const ring = RULERS.has(key) && desktop !== null ? ", marked with a ring" : "";
  const rest = other === null
    ? `Desktop and ${words.other} use ${valueWord(desktop)}${ring}.`
    : `Desktop uses ${valueWord(desktop)}${ring}; ${DEVICE_WORDS[words.other].plural} have their own, ${tokenName(other)}.`;
  return <><strong>{words.name} override: {tokenName(own)}</strong>{key === "spaceInside" ? " on all four sides" : ""}. {rest}</>;
}

// On the desktop, the values a block has of its own elsewhere: "Tablets
// have their own: L."
function elsewhereWords(style: unknown, key: StyleKey): string | undefined {
  const own = (["tablet", "phone"] as const).flatMap((device) => {
    const value = ownValue(style, device, key);
    return value === null ? [] : [`${DEVICE_WORDS[device].name}s have their own: ${tokenName(value)}.`];
  });
  return own.length > 0 ? own.join(" ") : undefined;
}

// The control of the field a click came from, for the focus to go back to
// once the button it came from is gone: the ruler, or the radio chosen.
function focusFieldOf(event: MouseEvent<HTMLElement>): void {
  const field = event.currentTarget.closest(".field");
  afterRender(() => field?.querySelector<HTMLElement>("[role=slider], [role=radio][tabindex='0']")?.focus());
}

export function StyleTab({ block }: { block: Block }) {
  const commands = useBlockCommands(block.id);
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const keys = (STYLE_KEYS_BY_TYPE[block.type] as readonly (keyof StyleTokens)[])
    .filter((k): k is StyleKey => k !== "visibility")
    .sort((a, b) => DISPLAY_ORDER.indexOf(a) - DISPLAY_ORDER.indexOf(b));
  const style: unknown = block.style;
  const device = deviceOf(preview);

  const swatch = (slot: PaletteSlot): Choice<string> => {
    const tone = slotTone(slot, siteStyle?.palette);
    return { value: slot, label: `${slotLabel(slot)}, ${tone.label}`, color: tone.hex };
  };

  return (
    <>
      {device !== "base" && (
        <p className="note device-note">
          <Icon name={device} />
          <span>Editing for <strong>{device}</strong>. Changes you make now apply to {DEVICE_WORDS[device].plural} only.</span>
        </p>
      )}
      {keys.length === 0 && <p className="hint">This widget has no style settings of its own.</p>}
      {keys.map((key) => {
        const label = labelOf(block.type, key);
        const base = shownValue(style, "base", key);
        const value = shownValue(style, device, key);
        const field = `/style/${device}/${key}`;
        const set = (next: string) => commands.setStyle(device, { [key]: next } as Parameters<typeof commands.setStyle>[1]);
        let scoping: ScopeProps;
        let hint: ReactNode;
        let ring: string | null = null;
        if (device === "base") {
          scoping = {
            scope: base === null
              ? "Theme default"
              : <button className="btn btn-small btn-quiet" type="button" aria-label={`Reset ${label}`} onClick={() => commands.setStyle("base", { [key]: REMOVE })}>Reset</button>,
          };
          hint = elsewhereWords(style, key);
        } else {
          const words = DEVICE_WORDS[device];
          const own = ownValue(style, device, key);
          if (own === null) {
            scoping = {
              scope: "From desktop",
              scopeTitle: `${words.name}s use the desktop value until you change it here`,
              note: { kind: "then", icon: device, text: `A change here applies to ${words.plural} only.` },
            };
          } else {
            const desktop = base ?? themeStep(block.type, key);
            ring = desktop;
            scoping = {
              scope: <><Icon name={device} />{words.name} only</>,
              scopeDevice: true,
              note: {
                kind: "override",
                icon: device,
                text: overrideWords(key, device, own, desktop, ownValue(style, words.other, key)),
                action: (
                  <button
                    className="btn btn-small btn-secondary"
                    type="button"
                    aria-label={`Remove the ${device} override of ${label}`}
                    onClick={(event) => {
                      if (commands.setStyle(device, backToDesktop(key)) === null) focusFieldOf(event);
                    }}
                  >
                    Remove
                  </button>
                ),
              },
            };
          }
        }
        const common = { label, blockId: block.id, field, hint, ...scoping };
        switch (key) {
          case "spaceInside":
          case "spaceBetween":
            return <RulerField key={key} {...common} steps={spaceSteps(SPACE_TOKENS)} value={value} theme={themeStep(block.type, key)} ring={ring} onChange={set} />;
          case "spaceAbove":
          case "spaceBelow":
            return <RulerField key={key} {...common} steps={spaceSteps(SECTION_SPACE_TOKENS)} value={value} ring={ring} onChange={set} />;
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
