// A block's style settings, drawn in the Block tab's groups
// (./groups.tsx): each group hands the keys it holds, of those the type
// accepts (STYLE_KEYS_BY_TYPE), each from the site's tokens: space on the
// spacing scale, colours from the site's palette slots (or a colour of the
// site's own, picked), sizes from its type scale. A heading's, a text's
// and a quote's own type is the free values of the Type group, each over
// its preset, the step's and the face's (./type.ts), typed or stepped.
// Visibility is the Shown on group's (./ShownOn.tsx).
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
import { Fragment, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { REMOVE } from "../../document/commands.ts";
import { settingWords, STYLE_KEY_NAMES, tokenName } from "../../document/labels.ts";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, MOTION_TOKENS, SECTION_SPACE_TOKENS, SPACE_TOKENS, STYLE_KEYS_BY_TYPE, TYPE_STEPS, TYPEFACE_TOKENS, VEIL_STRENGTH_TOKENS, VEIL_TOKENS, VERTICAL_ALIGN_TOKENS,
  type Block, type BlockType, type Device, type FocusToken, type PaletteSlot, type StyleTokens,
} from "../../shared/document.ts";
import { locate } from "../../document/tree.ts";
import { LEVEL_SIZES } from "../../widgets/heading/render.tsx";
import { DARK_SLOTS, isFreeColor, normalizeHex, wordsOn, type FreeColor } from "../../shared/free-colors.ts";
import { FACE_AXES, fontSizeOf, FREE_NUMBER_RANGES, hundredthsText, isFreeTypeKey, numberText, WEIGHT_NAMES, type FontSizeUnit, type FontWeight, type FreeNumberKey } from "../../shared/free-type.ts";
import { PREVIEW_WIDTHS } from "../../shared/preview-widths.ts";
import { COLUMN_GAP_DEFAULT, contrastRatio, letterWidth, slotLabel, slotTone, type TypeStep } from "../../shared/site-tokens.ts";
import { ColorPalette } from "../ColorPalette.tsx";
import { ColorPicker, type ColorPickerHandle } from "../ColorPicker.tsx";
import { previewedStyle } from "../color-preview.ts";
import { afterRender } from "../act.ts";
import { FieldFrame, MeasureField, RadioField, RadioPairField, RulerField, SizeField, type Choice, type ScopeProps } from "../controls.tsx";
import { useEditor, useEnv, useUi } from "../context.tsx";
import { backToDesktop, deviceOf, ownValue, shownValue, type OverrideDevice } from "../device-style.ts";
import { Icon } from "../icons.tsx";
import { contrastWords } from "../SiteStylePanel.tsx";
import { useBlockCommands } from "./hooks.ts";
import { spaceSteps } from "./steps.ts";
import { convertSize, FACE_FONTS, FACE_WEIGHT, faceOn, presetText, SIZE_STEP, SIZE_UNITS, sizeRange, typePreset, weightSteps, type TypePreset } from "./type.ts";

export type StyleKey = Exclude<keyof StyleTokens, "visibility">;

// The setting's name where the type means it its own way.
export function labelOf(type: BlockType, key: StyleKey): string {
  if (key === "spaceBetween") return type === "section" ? "Space between columns" : type === "gallery" ? "Space between images" : "Space between widgets";
  if (key === "color") return type === "divider" || type === "accordion" ? "Line color" : type === "steps" ? "Disc color" : type === "pricing" ? "Highlight color" : "Text color";
  if (key === "textSize") return type === "column" ? "Text size in this column" : "Text size";
  if (key === "verticalAlign") return "Vertical alignment";
  if (key === "align") return "Alignment";
  // In the Type group, the type's size is its Size.
  if (key === "fontSize") return "Size";
  // Under the Veil, its Strength.
  if (key === "veilStrength") return "Strength";
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
// does not draw either, goes with the text size, and free type after it,
// in the order type is set in: size, weight, the space between the
// letters and the lines, and how wide the letters are.
const DISPLAY_ORDER: readonly StyleKey[] = [
  "spaceInside", "spaceAbove", "spaceBelow", "spaceBetween", "background", "veil", "veilStrength", "focus", "textSize", "typeface",
  "fontSize", "fontWeight", "letterSpacing", "lineHeight", "letterWidth", "verticalAlign", "align", "color", "aspect", "motion",
];

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

// A value as the panel says it: a token by its name, free type in its
// words; none, the theme's default, or for free type the preset.
const valueWord = (key: StyleKey, value: string | null) => (value === null ? (isFreeTypeKey(key) ? "the preset" : "the theme’s default") : settingWords(key, value));

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
    ? `Desktop and ${words.other} use ${valueWord(key, desktop)}${ring}.`
    : `Desktop uses ${valueWord(key, desktop)}${ring}; ${DEVICE_WORDS[words.other].plural} have their own, ${settingWords(key, other)}.`;
  return <><strong>{words.name} override: {settingWords(key, own)}</strong>{key === "spaceInside" ? " on all four sides" : ""}. {rest}</>;
}

// On the desktop, the values a block has of its own elsewhere: "Tablets
// have their own: L."
function elsewhereWords(style: unknown, key: StyleKey): string | undefined {
  const own = (["tablet", "phone"] as const).flatMap((device) => {
    const value = ownValue(style, device, key);
    return value === null ? [] : [`${DEVICE_WORDS[device].name}s have their own: ${settingWords(key, value)}.`];
  });
  return own.length > 0 ? own.join(" ") : undefined;
}

// The control of the field a click came from, for the focus to go back to
// once the button it came from is gone: the ruler, the box typed in, or
// the radio chosen.
// A field drawn anew (two alignments joined into one) is found again by
// its label.
function focusFieldOf(event: MouseEvent<HTMLElement>): void {
  const field = event.currentTarget.closest(".field");
  const label = field?.querySelector(":scope > .label, :scope > .label-row > .label")?.textContent ?? null;
  const tray = field?.closest(".sidebar") ?? document;
  afterRender(() => {
    const now = field?.isConnected ? field : [...tray.querySelectorAll(".field")].find((f) => f.querySelector(":scope > .label, :scope > .label-row > .label")?.textContent === label);
    now?.querySelector<HTMLElement>("[role=slider], input, [role=radio][tabindex='0']")?.focus();
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
    // A section's picture shows with no veil, at the strength a veil has
    // when none is named, from its centre; a block comes into view as it
    // is, with no motion.
    case "veil":
      return block.type === "section" ? "none" : null;
    case "veilStrength":
      return block.type === "section" ? "medium" : null;
    case "focus":
      return block.type === "section" ? "center" : null;
    case "motion":
      return "none";
    default:
      return null;
  }
}

// A section's picture's focus, a grid of the nine points in reading order,
// each drawn as a dot in a frame where it stands.
const FOCUS_GRID: readonly FocusToken[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
const FOCUS_AT: Readonly<Record<FocusToken, [number, number]>> = {
  "top-left": [4.5, 4.5], top: [10, 4.5], "top-right": [15.5, 4.5],
  left: [4.5, 10], center: [10, 10], right: [15.5, 10],
  "bottom-left": [4.5, 15.5], bottom: [10, 15.5], "bottom-right": [15.5, 15.5],
};
const FOCUS_CHOICES = FOCUS_GRID.map((point) => {
  const [cx, cy] = FOCUS_AT[point];
  return {
    value: point as string,
    label: tokenName(point),
    title: tokenName(point),
    content: <svg className="focus-pic" viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="2.5" /><circle cx={cx} cy={cy} r="2.6" /></svg>,
  };
});
const VEIL_CHOICES = VEIL_TOKENS.map((veil) => ({ value: veil as string, label: settingWords("veil", veil) }));
const STRENGTH_CHOICES = VEIL_STRENGTH_TOKENS.map((strength) => ({ value: strength as string, label: tokenName(strength) }));
const MOTION_CHOICES = MOTION_TOKENS.map((motion) => ({ value: motion as string, label: tokenName(motion) }));

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
  set: (next: string | number) => ReturnType<ReturnType<typeof useBlockCommands>["setStyle"]>;
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

// The background a block stands on, where it sets none: its column's, then
// its section's, as the previewed device shows them; null for the page's.
function useBackdrop(id: string, device: ReturnType<typeof deviceOf>): string | null {
  return useEditor((s) => {
    let found = locate(s.document, id);
    while (found?.parentId) {
      const parent = locate(s.document, found.parentId);
      if (!parent) break;
      const value = shownValue(parent.block.style, device, "background");
      if (value !== null && value !== "none") return value;
      found = parent;
    }
    return null;
  });
}

// A setting the block's face does nothing with (a letter width in a face
// drawn at one width): its name, where its value comes from, and why there
// is nothing to set, in place of a control.
function NothingToSet({ label, hint, ...scoping }: { label: string; hint: ReactNode } & ScopeProps) {
  const id = useId();
  return <FieldFrame id={id} label={label} labelFor={false} hint={hint} {...scoping} errors={[]}>{null}</FieldFrame>;
}

// The block's settings of `keys`, those its type accepts.
export function StyleFields({ block, keys: wanted }: { block: Block; keys: readonly StyleKey[] }) {
  const commands = useBlockCommands(block.id);
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const { ui } = useEnv();
  // The Headings typeface's samples, as wide as the site draws it.
  const sans: CSSProperties = { fontStretch: letterWidth(siteStyle?.letterWidth).display };
  const columnStyle = useColumnStyle(block.id);
  const keys = acceptedKeys(block.type, wanted);
  const style: unknown = block.style;
  const device = deviceOf(preview);
  const backdrop = useBackdrop(block.id, device);
  // The colour whose picker is open (the palette's Custom tile).
  const [picking, setPicking] = useState<{ id: string; key: "background" | "color" } | null>(null);
  // Its picker: a choice of the same setting made beside it (a swatch,
  // Reset, Remove) drops the colour the picker still waits to keep.
  const picker = useRef<ColorPickerHandle>(null);
  const replacing = (key: StyleKey) => {
    if (picking?.id === block.id && picking.key === key) picker.current?.discard();
  };
  // The page's width on the device previewed, for a size in vw and the
  // desktop's type, which grows with it: the canvas's, else the preview's.
  const pageView = useUi((u) => u.pageView);
  const pageWidth = pageView && pageView.width > 0 ? pageView.width : device === "base" ? 1280 : PREVIEW_WIDTHS[device];
  // What the block's type is with none of its own, on the device: the
  // Type group's preset (./type.ts).
  const preset: TypePreset | null = keys.some(isFreeTypeKey)
    ? typePreset(block, device, (shownValue(style, device, "textSize") ?? inUseOf(block, "textSize", device, columnStyle) ?? "body") as TypeStep, siteStyle, pageWidth)
    : null;
  // A slot's tone or a free colour, as a colour.
  const hexOf = (value: string): string => (isFreeColor(value) ? value : slotTone(value as PaletteSlot, siteStyle?.palette).hex);
  const site = { text: slotTone("text", siteStyle?.palette).hex, background: slotTone("background", siteStyle?.palette).hex };
  // The background the block shows on the previewed device, its own or the
  // one it stands on, and the colour of its words there: its own colour, or
  // the one that background brings (tokens.css, ../../shared/free-colors.ts).
  // A colour being picked for the block is measured as the canvas draws it
  // (../color-preview.ts), so the contrast follows a drag.
  const colorPreview = useUi((u) => u.colorPreview);
  const measured = colorPreview !== null && "id" in colorPreview && colorPreview.id === block.id ? previewedStyle(style, colorPreview) : style;
  const coloursOf = (of: unknown) => {
    const ownBackground = shownValue(of, device, "background");
    const background = ownBackground !== null && ownBackground !== "none" ? ownBackground : (backdrop ?? "background");
    const ownColor = shownValue(of, device, "color");
    const paired = isFreeColor(background) ? wordsOn(background, site) : DARK_SLOTS.includes(background as PaletteSlot) ? site.background : site.text;
    return { ownBackground, ownColor, wordsHex: ownColor !== null ? hexOf(ownColor) : paired, backgroundHex: hexOf(background) };
  };
  const { ownBackground, ownColor, wordsHex, backgroundHex } = coloursOf(measured);
  // Where a picker opens: the colours as kept, never one being picked,
  // which the picker, following its value, would take for kept.
  const keptColours = coloursOf(style);

  const swatch = (slot: PaletteSlot): Choice<string> => {
    const tone = slotTone(slot, siteStyle?.palette);
    return { value: slot, label: `${slotLabel(slot)}, ${tone.label}`, color: tone.hex };
  };

  const settingOf = (key: StyleKey): Setting => {
    const label = labelOf(block.type, key);
    const base = shownValue(style, "base", key);
    const value = shownValue(style, device, key);
    const field = `/style/${device}/${key}`;
    const set = (next: string | number) => commands.setStyle(device, { [key]: next } as Parameters<typeof commands.setStyle>[1]);
    if (device === "base") {
      // Free type over its preset: unset, it is the preset, and its way
      // back is to the preset.
      const free = isFreeTypeKey(key);
      return {
        label, value, field, set, ring: null, hint: elsewhereWords(style, key),
        scoping: {
          // Reset goes once the value does: the focus goes back to the
          // setting, as after Remove.
          scope: base === null
            ? (free ? "Preset" : "Theme default")
            : (
              <button
                className="btn btn-small btn-quiet"
                type="button"
                aria-label={free ? `Back to the preset for ${label}` : `Reset ${label}`}
                onClick={(event) => {
                  replacing(key);
                  if (commands.setStyle("base", { [key]: REMOVE }) === null) focusFieldOf(event);
                }}
              >
                {free ? "Back to the preset" : "Reset"}
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
                replacing(key);
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
          case "color": {
            const free = isFreeColor(value) ? value : null;
            const open = picking?.id === block.id && picking.key === key;
            const slots = key === "background" ? SWATCH_ORDER.filter((slot) => (BACKGROUND_TOKENS as readonly string[]).includes(slot)).map(swatch) : SWATCH_ORDER.map(swatch);
            const choices: Choice<string>[] = [...(key === "background" ? [{ value: "none", label: "None" }] : []), ...slots];
            // A divider's and an accordion's colour is their lines', a
            // steps block's its discs', a pricing block's its featured
            // plan's ring and badge, not words: no contrast of words to say.
            const words = key === "color" ? !(block.type === "divider" || block.type === "accordion" || block.type === "steps" || block.type === "pricing") : true;
            const own = key === "color" ? ownColor !== null : ownBackground !== null && ownBackground !== "none";
            const start: FreeColor = free ?? normalizeHex(key === "color" ? keptColours.wordsHex : keptColours.backgroundHex) ?? "#000000";
            const check = contrastWords(contrastRatio(wordsHex, backgroundHex));
            return (
              <Fragment key={key}>
                <RadioField
                  {...common}
                  look="swatches"
                  lead="Site colours"
                  choices={choices}
                  value={value}
                  inUse={inUse}
                  onChange={(next) => {
                    replacing(key);
                    setPicking(null);
                    return set(next);
                  }}
                  extra={
                    <>
                      <ColorPalette
                        label={label}
                        value={value}
                        onPick={(color) => {
                          replacing(key);
                          setPicking(null);
                          set(color);
                        }}
                        customOpen={open}
                        onCustom={() => setPicking(open ? null : { id: block.id, key })}
                      />
                      {open && (
                        <ColorPicker
                          ref={picker}
                          label={label}
                          value={start}
                          onCommit={(color) => {
                            const refused = set(color);
                            ui.getState().setColorPreview(null);
                            return refused === null;
                          }}
                          onPreview={(color) => ui.getState().setColorPreview(color === null ? null : { id: block.id, device, key, color })}
                        />
                      )}
                    </>
                  }
                />
                {words && own && (
                  <ul className="checks" aria-label={`${label}: contrast`}>
                    <li className={check.passes ? "pass" : "fail"}>
                      <Icon name={check.passes ? "check" : "warning"} />Words on {key === "background" ? "it" : "their background"}: {check.words}
                    </li>
                  </ul>
                )}
              </Fragment>
            );
          }
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
                    content: <><span className={sample.sans ? "sans" : undefined} style={{ fontSize: `${sample.size}px`, ...(sample.sans ? sans : {}) } as CSSProperties}>Aa</span>{sample.label}</>,
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
                  content: <><span className={face === "heading" ? "sans" : undefined} style={{ fontSize: "18px", ...(face === "heading" ? sans : {}) } as CSSProperties}>Aa</span>{tokenName(face)}</>,
                }))}
                value={value}
                inUse={inUse}
                onChange={set}
              />
            );
          case "fontSize": {
            // The box holds the device's own size; with none, what is in
            // use shows as its placeholder: the desktop's on a device,
            // else the step's, in the unit in use.
            const own = fontSizeOf(device === "base" ? value : ownValue(style, device, key));
            const shown = fontSizeOf(value);
            const unit: FontSizeUnit = own?.unit ?? shown?.unit ?? "px";
            const range = sizeRange(unit);
            const inUseSize = shown?.number ?? convertSize(preset!.size, "px", unit, pageWidth);
            const clear = () => commands.setStyle(device, { fontSize: REMOVE });
            return (
              <SizeField
                key={key}
                {...common}
                hint={hint ?? "A rem is 16 px, or the visitor’s own text size. A vw is 1% of the page’s width."}
                value={own === null ? null : hundredthsText(own.hundredths)}
                unit={unit}
                units={SIZE_UNITS}
                placeholder={own === null ? (shown !== null ? hundredthsText(shown.hundredths) : presetText(inUseSize)) : undefined}
                step={SIZE_STEP[unit]}
                min={range.min}
                max={range.max}
                onCommit={(number) => (number === null ? clear() : set(`${numberText(number)}${unit}`))}
                onUnit={(next, from) => set(`${numberText(convertSize(from ?? inUseSize, unit, next as FontSizeUnit, pageWidth))}${next}`)}
              />
            );
          }
          case "fontWeight": {
            const face = preset!.face;
            const drawn = FACE_AXES[face].weights as readonly number[];
            const shownWeight = value === null ? null : Number(value);
            const steps = weightSteps(face, shownWeight);
            const lightest = drawn[0] as FontWeight;
            // A weight the face does not draw, kept from another face.
            const undrawn = shownWeight !== null && !drawn.includes(shownWeight)
              ? `${FACE_FONTS[face]} draws from ${WEIGHT_NAMES[lightest]}, ${lightest}: ${WEIGHT_NAMES[shownWeight as FontWeight]} is drawn as ${WEIGHT_NAMES[lightest]}.`
              : null;
            // On a device's own weight, the desktop's is ringed: its own,
            // else its face's.
            const desktopWeight = ring ?? (device === "base" ? null : String(FACE_WEIGHT[faceOn(block, "base")]));
            return (
              <RulerField
                key={key}
                {...common}
                hint={undrawn ?? hint}
                steps={steps}
                value={value}
                theme={String(preset!.weight)}
                themeWords="the preset’s"
                unsetText="Preset"
                ring={device !== "base" && ownValue(style, device, key) !== null ? desktopWeight : null}
                onChange={(next) => set(Number(next))}
              />
            );
          }
          case "letterSpacing":
          case "lineHeight":
          case "letterWidth": {
            const own = device === "base" ? value : ownValue(style, device, key);
            const range = FREE_NUMBER_RANGES[key as FreeNumberKey];
            const presetNumber = key === "letterSpacing" ? preset!.letterSpacing : key === "lineHeight" ? preset!.lineHeight : preset!.letterWidth;
            // A face drawn at one width: no control that would do nothing,
            // but what is so, and the way back for a width kept from
            // another face.
            if (key === "letterWidth" && presetNumber === null) {
              const why = `${FACE_FONTS.body}, the body’s typeface, is drawn at one width. Set the block in the Headings typeface to draw its letters narrower or wider${value !== null ? `; it keeps ${settingWords(key, value)} for that` : ""}.`;
              // What a change here would do is nothing: only a device's own
              // value, and its way back, are said.
              return <NothingToSet key={key} label={label} hint={why} {...scoping} note={scoping.note?.kind === "override" ? scoping.note : undefined} />;
            }
            return (
              <MeasureField
                key={key}
                {...common}
                value={own}
                placeholder={own === null ? (value ?? presetText(presetNumber ?? 0)) : undefined}
                unit={key === "letterSpacing" ? "em" : key === "letterWidth" ? "%" : undefined}
                step={key === "letterWidth" ? 0.5 : key === "lineHeight" ? 0.05 : 0.01}
                min={range.min}
                max={range.max}
                onCommit={(number) => (number === null ? commands.setStyle(device, { [key]: REMOVE }) : set(number))}
              />
            );
          }
          case "align":
            return <RadioField key={key} {...common} look="seg-icons" choices={ALIGN_CHOICES} value={value} inUse={inUse} onChange={set} />;
          case "verticalAlign":
            return <RadioField key={key} {...common} look="seg-icons" choices={VALIGN_CHOICES} value={value} inUse={inUse} onChange={set} />;
          case "aspect":
            return <RadioField key={key} {...common} look="seg" choices={ASPECT_TOKENS.map((t) => ({ value: t, label: tokenName(t) }))} value={value} inUse={inUse} onChange={set} hint={hint ?? "Crops the image to this shape; Original keeps its own."} />;
          // A section's picture (./picture.tsx): its veil, how much of it
          // the veil hides, and the point kept in view.
          case "veil":
            return <RadioField key={key} {...common} look="seg" choices={VEIL_CHOICES} value={value} inUse={inUse} onChange={set} hint={hint ?? "A layer over the picture so the words read; they take the colour that reads on it."} />;
          case "veilStrength":
            return <RadioField key={key} {...common} look="seg" choices={STRENGTH_CHOICES} value={value} inUse={inUse} onChange={set} hint={hint ?? "How much of the picture the veil hides."} />;
          case "focus":
            return <RadioField key={key} {...common} look="focus-grid" choices={FOCUS_CHOICES} value={value} inUse={inUse} onChange={set} hint={hint ?? "The part of the picture kept in view where the section crops it."} />;
          case "motion":
            return (
              <RadioField
                key={key}
                {...common}
                look="seg"
                choices={MOTION_CHOICES}
                value={value}
                inUse={inUse}
                onChange={set}
                hint={hint ?? "How it comes into view as the page scrolls to it: in Preview and on the published page, not while you edit, and never for visitors who ask for less motion."}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
