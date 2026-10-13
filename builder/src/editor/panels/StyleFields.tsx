// A block's style settings, drawn in the Block tab's groups
// (./groups.tsx): each group hands the keys it holds, of those the type
// accepts (STYLE_KEYS_BY_TYPE), each from the site's tokens only, never a
// free value: space on the spacing scale, colours from the site's palette
// slots, sizes from its type scale. Visibility is the Shown on group's
// (./ShownOn.tsx).
//
// The settings edit the device the canvas previews (design/shots/style.png).
// On the desktop they write the style's base, which every device shows
// unless it has a value of its own. With a tablet or a phone previewed they
// write that device's values only, and each setting says where its value
// comes from: "From desktop" (the device shows the base, and a change
// makes it its own), or "Tablet only" with the override's words and a
// Remove that takes the device's key out, so the device follows the
// desktop again (./device-style.ts, backToDesktop: never the desktop's
// value written in its place).
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { REMOVE } from "../../document/commands.ts";
import { STYLE_KEY_NAMES, tokenName } from "../../document/labels.ts";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, SECTION_SPACE_TOKENS, SPACE_TOKENS, STYLE_KEYS_BY_TYPE, TYPE_STEPS, TYPEFACE_TOKENS, VERTICAL_ALIGN_TOKENS,
  type Block, type BlockType, type Device, type PaletteSlot, type StyleTokens,
} from "../../shared/document.ts";
import { locate } from "../../document/tree.ts";
import { LEVEL_SIZES } from "../../widgets/heading/render.tsx";
import { COLUMN_GAP_DEFAULT, slotLabel, slotTone } from "../../shared/site-tokens.ts";
import { afterRender } from "../act.ts";
import { RadioField, RadioPairField, RulerField, type Choice, type ScopeProps } from "../controls.tsx";
import { useEditor, useUi } from "../context.tsx";
import { backToDesktop, deviceOf, ownValue, shownValue, type OverrideDevice } from "../device-style.ts";
import { Icon } from "../icons.tsx";
import { useBlockCommands } from "./hooks.ts";
import { spaceSteps } from "./steps.ts";

export type StyleKey = Exclude<keyof StyleTokens, "visibility">;

// The setting's name where the type means it its own way.
export function labelOf(type: BlockType, key: StyleKey): string {
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

// The order a group lists its settings in, the approved design's (the
// #style state: Space inside, Space between, Background, Text size,
// Alignment): space first, then colour, then type, then placement.
// Alignment, a column's two in one field, vertical first; then the text
// colour, which the design does not draw. The typeface, which the design
// does not draw either, goes with the text size.
const DISPLAY_ORDER: readonly StyleKey[] = ["spaceInside", "spaceAbove", "spaceBelow", "spaceBetween", "background", "textSize", "typeface", "verticalAlign", "align", "color", "aspect"];

// The keys of `keys` the block's type accepts, in that order.
export function acceptedKeys(type: BlockType, keys: readonly StyleKey[]): StyleKey[] {
  const accepted = STYLE_KEYS_BY_TYPE[type] as readonly (keyof StyleTokens)[];
  return keys.filter((key) => accepted.includes(key)).sort((a, b) => DISPLAY_ORDER.indexOf(a) - DISPLAY_ORDER.indexOf(b));
}

const ALIGN_ICONS = { left: "align-left", center: "align-center", right: "align-right" } as const;
const VALIGN_ICONS = { top: "valign-top", middle: "valign-middle", bottom: "valign-bottom" } as const;

// The settings drawn as a ruler, whose desktop value the override marks
// with a ring.
const RULERS: ReadonlySet<StyleKey> = new Set(["spaceInside", "spaceBetween", "spaceAbove", "spaceBelow"]);

export const DEVICE_WORDS: Readonly<Record<OverrideDevice, { name: string; plural: string; other: OverrideDevice }>> = {
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
// A field drawn anew (two alignments joined into one) is found again by
// its label.
function focusFieldOf(event: MouseEvent<HTMLElement>): void {
  const field = event.currentTarget.closest(".field");
  const label = field?.querySelector(":scope > .label, :scope > .label-row > .label")?.textContent ?? null;
  const tray = field?.closest(".sidebar") ?? document;
  afterRender(() => {
    const now = field?.isConnected ? field : [...tray.querySelectorAll(".field")].find((f) => f.querySelector(":scope > .label, :scope > .label-row > .label")?.textContent === label);
    now?.querySelector<HTMLElement>("[role=slider], [role=radio][tabindex='0']")?.focus();
  });
}

// The value a setting the block leaves unset is in use with, where the
// page's stylesheet gives one whatever surrounds the block: checked in
// its field, as the design draws None and Body. A background is a
// section's or a column's none, a button's accent; a text size the level's
// for a heading, the quote's own, a column's body, and for a text the one
// its column shows; a typeface the headings' for a heading, the body's for
// a text and a quote; an alignment its column's, else left; a column's
// content at its top; an image its own shape. A colour depends on the
// band around the block, so none is checked for it.
export function inUseOf(block: Block, key: StyleKey, device: Device, columnStyle: unknown): string | null {
  switch (key) {
    case "background":
      return block.type === "section" || block.type === "column" ? "none" : block.type === "button" ? "accent" : null;
    case "textSize":
      if (block.type === "heading") return LEVEL_SIZES[block.props.level];
      if (block.type === "quote") return "heading-3";
      if (block.type === "column") return "body";
      if (block.type === "text") return shownValue(columnStyle, device, "textSize") ?? "body";
      return null;
    case "typeface":
      return block.type === "heading" ? "heading" : block.type === "text" || block.type === "quote" ? "body" : null;
    case "align":
      return block.type === "column" ? "left" : (shownValue(columnStyle, device, "align") ?? "left");
    case "verticalAlign":
      return "top";
    case "aspect":
      return "original";
    default:
      return null;
  }
}

// The swatches in the design's order: None, the light tones, the
// colours, the ink; then the slot the design does not draw, Slate.
const SWATCH_ORDER: readonly PaletteSlot[] = ["background", "soft", "primary", "accent", "text", "muted"];
// A column's text sizes are the running text's (the design's three);
// another step it holds already is listed too, so it shows.
const COLUMN_STEPS: readonly string[] = ["small", "body", "large"];
const ALIGN_CHOICES = ALIGN_TOKENS.map((t) => ({ value: t as string, label: tokenName(t), icon: ALIGN_ICONS[t] }));
const VALIGN_CHOICES = VERTICAL_ALIGN_TOKENS.map((t) => ({ value: t as string, label: tokenName(t), icon: VALIGN_ICONS[t] }));

interface Setting {
  label: string;
  value: string | null;
  field: string;
  set: (next: string) => ReturnType<ReturnType<typeof useBlockCommands>["setStyle"]>;
  scoping: ScopeProps;
  hint: ReactNode;
  ring: string | null;
}

// The column a widget stands in, its style: what the widget takes on when
// it sets nothing.
export function useColumnStyle(id: string): unknown {
  return useEditor((s) => {
    const found = locate(s.document, id);
    const parent = found?.parentId ? locate(s.document, found.parentId)?.block : undefined;
    return parent?.type === "column" ? parent.style : undefined;
  });
}

// The block's settings of `keys`, those its type accepts.
export function StyleFields({ block, keys: wanted }: { block: Block; keys: readonly StyleKey[] }) {
  const commands = useBlockCommands(block.id);
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const columnStyle = useColumnStyle(block.id);
  const keys = acceptedKeys(block.type, wanted);
  const style: unknown = block.style;
  const device = deviceOf(preview);

  const swatch = (slot: PaletteSlot): Choice<string> => {
    const tone = slotTone(slot, siteStyle?.palette);
    return { value: slot, label: `${slotLabel(slot)}, ${tone.label}`, color: tone.hex };
  };

  const settingOf = (key: StyleKey): Setting => {
    const label = labelOf(block.type, key);
    const base = shownValue(style, "base", key);
    const value = shownValue(style, device, key);
    const field = `/style/${device}/${key}`;
    const set = (next: string) => commands.setStyle(device, { [key]: next } as Parameters<typeof commands.setStyle>[1]);
    if (device === "base") {
      return {
        label, value, field, set, ring: null, hint: elsewhereWords(style, key),
        scoping: {
          // Reset goes once the value does: the focus goes back to the
          // setting, as after Remove.
          scope: base === null
            ? "Theme default"
            : (
              <button
                className="btn btn-small btn-quiet"
                type="button"
                aria-label={`Reset ${label}`}
                onClick={(event) => {
                  if (commands.setStyle("base", { [key]: REMOVE }) === null) focusFieldOf(event);
                }}
              >
                Reset
              </button>
            ),
        },
      };
    }
    const words = DEVICE_WORDS[device];
    const own = ownValue(style, device, key);
    if (own === null) {
      return {
        label, value, field, set, ring: null, hint: undefined,
        scoping: {
          scope: "From desktop",
          scopeTitle: `${words.name}s use the desktop value until you change it here`,
          note: { kind: "then", icon: device, text: `A change here applies to ${words.plural} only.` },
        },
      };
    }
    const desktop = base ?? themeStep(block.type, key);
    return {
      label, value, field, set, ring: desktop, hint: undefined,
      scoping: {
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
      },
    };
  };

  // A column's two alignments, one field (./controls.tsx, RadioPairField).
  const paired = keys.includes("verticalAlign") && keys.includes("align") ? [settingOf("verticalAlign"), settingOf("align")] as const : null;

  return (
    <>
      {keys.map((key) => {
        // A column's two alignments as one field, as the design draws
        // them: drawn where the vertical one stands.
        if (key === "align" && paired) return null;
        if (key === "verticalAlign" && paired) {
          const [v, h] = paired;
          return (
            <RadioPairField
              key="alignment"
              label="Alignment"
              blockId={block.id}
              hint={v.hint || h.hint ? <>{v.hint}{v.hint && h.hint ? " " : null}{h.hint}</> : undefined}
              parts={[
                { label: "Vertical alignment", choices: VALIGN_CHOICES, value: v.value, inUse: inUseOf(block, "verticalAlign", device, columnStyle), onChange: v.set, field: v.field, look: "seg-icons", ...v.scoping },
                { label: "Horizontal alignment", choices: ALIGN_CHOICES, value: h.value, inUse: inUseOf(block, "align", device, columnStyle), onChange: h.set, field: h.field, look: "seg-icons", ...h.scoping },
              ]}
            />
          );
        }
        const { label, value, field, set, scoping, hint, ring } = settingOf(key);
        const inUse = inUseOf(block, key, device, columnStyle);
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
                choices={[{ value: "none", label: "None" }, ...SWATCH_ORDER.filter((slot) => (BACKGROUND_TOKENS as readonly string[]).includes(slot)).map(swatch)]}
                value={value}
                inUse={inUse}
                onChange={set}
              />
            );
          case "color":
            return <RadioField key={key} {...common} look="swatches" choices={SWATCH_ORDER.map(swatch)} value={value} inUse={inUse} onChange={set} />;
          case "textSize":
            return (
              <RadioField
                key={key}
                {...common}
                look="steps"
                choices={(block.type === "column" ? [...COLUMN_STEPS, ...(value !== null && !COLUMN_STEPS.includes(value) ? [value] : [])] : TYPE_STEPS).map((step) => {
                  const sample = STEP_SAMPLES[step]!;
                  return {
                    value: step,
                    label: tokenName(step),
                    content: <><span className={sample.sans ? "sans" : undefined} style={{ fontSize: `${sample.size}px` } as CSSProperties}>Aa</span>{sample.label}</>,
                  };
                })}
                value={value}
                inUse={inUse}
                onChange={set}
              />
            );
          case "typeface":
            return (
              <RadioField
                key={key}
                {...common}
                look="steps"
                choices={TYPEFACE_TOKENS.map((face) => ({
                  value: face,
                  label: tokenName(face),
                  content: <><span className={face === "heading" ? "sans" : undefined} style={{ fontSize: "18px" } as CSSProperties}>Aa</span>{tokenName(face)}</>,
                }))}
                value={value}
                inUse={inUse}
                onChange={set}
              />
            );
          case "align":
            return <RadioField key={key} {...common} look="seg-icons" choices={ALIGN_CHOICES} value={value} inUse={inUse} onChange={set} />;
          case "verticalAlign":
            return <RadioField key={key} {...common} look="seg-icons" choices={VALIGN_CHOICES} value={value} inUse={inUse} onChange={set} />;
          case "aspect":
            return <RadioField key={key} {...common} look="seg" choices={ASPECT_TOKENS.map((t) => ({ value: t, label: tokenName(t) }))} value={value} inUse={inUse} onChange={set} hint={hint ?? "Crops the image to this shape; Original keeps its own."} />;
          default:
            return null;
        }
      })}
    </>
  );
}
