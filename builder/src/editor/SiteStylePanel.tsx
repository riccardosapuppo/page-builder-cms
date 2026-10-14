// Site style (design/shots/site-style.png): the one screen that changes the
// site's tokens, the tone of each palette slot and the type scale, for
// every page. Each slot offers its curated tones (the CMS's choices, from
// schema/tokens.json) and a colour of the site's own, picked or typed
// (ColorPicker.tsx), says in words how the colour reads where the site
// uses it, warning where it reads poorly but keeping it, and can go back
// to the tone a new site has. A change shows on
// the canvas at once and goes to the CMS through the session, which says
// here whether it was kept: the published pages follow from the next
// request, since they read the style when they are drawn.
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SiteStyle } from "../storage/adapter.ts";
import { isFreeColor, normalizeHex, type FreeColor } from "../shared/free-colors.ts";
import { contrastRatio, defaultTone, letterWidth, PALETTE_SLOTS, slotLabel, typeScale } from "../shared/site-tokens.ts";
import type { PaletteSlot } from "../shared/document.ts";
import { ColorPalette } from "./ColorPalette.tsx";
import { ColorPicker, type ColorPickerHandle } from "./ColorPicker.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { paletteName } from "./palette.ts";
import { useSession } from "./session.tsx";

// Where the site puts each slot, as the contrast it needs: the words a band
// in the slot carries (tokens.css: the Background slot's colour on Text,
// Primary and Muted, the Text slot's on the others), and the slot as words
// on the Background, a slot's tone against another slot's.
const CHECKS: Readonly<Record<PaletteSlot, ReadonlyArray<{ label: string; fg: PaletteSlot | "tone"; bg: PaletteSlot | "tone" }>>> = {
  text: [
    { label: "Body text on the background", fg: "tone", bg: "background" },
    { label: "Words on a band in it", fg: "background", bg: "tone" },
  ],
  background: [
    { label: "Body text on it", fg: "text", bg: "tone" },
    { label: "Button text on Primary", fg: "tone", bg: "primary" },
  ],
  primary: [
    { label: "Button text on it", fg: "background", bg: "tone" },
    { label: "Links on the background", fg: "tone", bg: "background" },
  ],
  accent: [{ label: "Button text on it", fg: "text", bg: "tone" }],
  soft: [{ label: "Text on a band in it", fg: "text", bg: "tone" }],
  muted: [
    { label: "Captions on the background", fg: "tone", bg: "background" },
    { label: "Words on a band in it", fg: "background", bg: "tone" },
  ],
};

// "8.9 to 1, easy to read". Cut, not rounded, to one decimal: 4.48 is not
// 4.5. WCAG's AA asks 4.5 of text, AAA 7.
export function contrastWords(ratio: number): { words: string; passes: boolean } {
  const shown = (Math.floor(ratio * 10) / 10).toFixed(1);
  if (ratio >= 7) return { words: `${shown} to 1, easy to read`, passes: true };
  if (ratio >= 4.5) return { words: `${shown} to 1, readable`, passes: true };
  if (ratio >= 3) return { words: `${shown} to 1, for large text only`, passes: false };
  return { words: `${shown} to 1, hard to read`, passes: false };
}

// "about a third", from a step's ratio (1.333).
export function ratioWords(ratio: number): string {
  const parts: Array<[number, string]> = [[0.2, "a fifth"], [0.25, "a quarter"], [1 / 3, "a third"], [0.4, "two fifths"], [0.5, "a half"]];
  const extra = ratio - 1;
  const [, words] = parts.reduce((best, part) => (Math.abs(part[0] - extra) < Math.abs(best[0] - extra) ? part : best));
  return words;
}

// The sample "Aa" of each step, at a size the sidebar can hold, in the
// design's sizes.
const SAMPLE_PX = [26, 23, 20, 17, 16, 14, 12] as const;

export function SiteStylePanel({ onClose, onHide }: { onClose: () => void; onHide?: () => void }) {
  const style = useUi((u) => u.siteStyle);
  // A slot being picked (./color-preview.ts): its chip and the checks
  // measure the colour as the canvas draws it, so they follow a drag.
  const colorPreview = useUi((u) => u.colorPreview);
  const { ui } = useEnv();
  const session = useSession();
  const [open, setOpen] = useState<PaletteSlot | null>(null);
  // The slot whose picker is open (the palette's Custom tile), and the
  // picker: a tone, a swatch or Reset chosen beside it drops the colour it
  // still waits to keep.
  const [custom, setCustom] = useState<PaletteSlot | null>(null);
  const picker = useRef<ColorPickerHandle>(null);
  const headId = useId();
  if (!style) {
    return (
      <section className="view site-style" aria-labelledby={headId}>
        <Head id={headId} onClose={onClose} onHide={onHide} />
        <div className="tray-body"><p className="hint" role="status">The site style is not loaded yet.</p></div>
      </section>
    );
  }
  const change = (palette: Record<string, string>, scale: string, width = style.letterWidth) => session.saveSiteStyle({ palette, typeScale: scale, letterWidth: width });
  const hex = (slot: PaletteSlot, tone = style.palette[slot]) => (isFreeColor(tone) ? tone : (style.choices.palette[slot]?.find((t) => t.color === tone)?.hex ?? "#000000"));
  const drawn = (slot: PaletteSlot) => (colorPreview !== null && "slot" in colorPreview && colorPreview.slot === slot ? colorPreview.color : hex(slot));
  const scale = typeScale(style.typeScale);
  const scaleLabel = style.choices.typeScales.find((t) => t.name === style.typeScale)?.label ?? style.typeScale;
  const widths = letterWidth(style.letterWidth);

  return (
    <section className="view site-style" aria-labelledby={headId}>
      <Head id={headId} onClose={onClose} onHide={onHide} />
      <div className="tray-body">
        <h3 className="group-title">Palette</h3>
        <ul className="slots">
          {PALETTE_SLOTS.map((slot) => {
            const tones = style.choices.palette[slot] ?? [];
            const value = style.palette[slot] ?? "";
            const free = isFreeColor(value) ? value : null;
            const tone = tones.find((t) => t.color === value);
            const first = tones.find((t) => t.color === defaultTone(slot));
            const edited = first !== undefined && value !== first.color;
            const isOpen = open === slot;
            const name = (
              <span className="slot-name">
                {slotLabel(slot)}
                <small>{free ? (paletteName(free) ?? `Custom, ${free}`) : (tone?.label ?? value)}</small>
                {edited && first && <small className="slot-edited">Edited, was {first.label}</small>}
              </span>
            );
            return (
              <li key={slot} className={`slot slot-pick${isOpen ? " slot-open" : ""}`}>
                <button
                  className="slot-row"
                  type="button"
                  aria-expanded={isOpen}
                  data-autofocus={slot === "primary" ? "" : undefined}
                  title={free ?? (tone ? `${tone.label}, ${tone.hex}` : undefined)}
                  onClick={() => {
                    setOpen(isOpen ? null : slot);
                    setCustom(null);
                  }}
                >
                  <span className="slot-chip" style={{ "--c": drawn(slot) } as CSSProperties} aria-hidden="true" />
                  {name}<Icon name="chevron-down" className="i i-xs slot-chev" />
                </button>
                {isOpen && (
                  <div className="slot-editor">
                    <Tones
                      label={`${slotLabel(slot)} color`}
                      tones={tones}
                      value={value}
                      onChange={(choice) => {
                        picker.current?.discard();
                        setCustom(null);
                        change({ ...style.palette, [slot]: choice }, style.typeScale);
                      }}
                    />
                    <ColorPalette
                      label={slotLabel(slot)}
                      value={value}
                      onPick={(color) => {
                        picker.current?.discard();
                        setCustom(null);
                        change({ ...style.palette, [slot]: color }, style.typeScale);
                      }}
                      customOpen={custom === slot}
                      onCustom={() => setCustom(custom === slot ? null : slot)}
                    />
                    {custom === slot && (
                      <ColorPicker
                        ref={picker}
                        label={slotLabel(slot)}
                        value={free ?? normalizeHex(hex(slot)) ?? "#000000"}
                        onCommit={(color: FreeColor) => {
                          // The style as it is when the colour is kept, after
                          // the arrows' pause maybe: a type scale chosen in
                          // it stays.
                          const now = ui.getState().siteStyle ?? style;
                          change({ ...now.palette, [slot]: color }, now.typeScale, now.letterWidth);
                          ui.getState().setColorPreview(null);
                          // Taken at once: a save the server refuses puts the
                          // style back, and the picker follows it.
                          return true;
                        }}
                        onPreview={(color) => ui.getState().setColorPreview(color === null ? null : { slot, color })}
                      />
                    )}
                    <ul className="checks" aria-label="Contrast checks">
                      {CHECKS[slot].map((check) => {
                        const fg = drawn(check.fg === "tone" ? slot : check.fg);
                        const bg = drawn(check.bg === "tone" ? slot : check.bg);
                        const { words, passes } = contrastWords(contrastRatio(fg, bg));
                        return (
                          <li key={check.label} className={passes ? "pass" : "fail"}>
                            <Icon name={passes ? "check" : "warning"} />{check.label}: {words}
                          </li>
                        );
                      })}
                    </ul>
                    {edited && first && (
                      <div className="slot-actions">
                        <button
                          className="btn btn-small btn-secondary"
                          type="button"
                          onClick={() => {
                            picker.current?.discard();
                            setCustom(null);
                            change({ ...style.palette, [slot]: first.color }, style.typeScale);
                          }}
                        >
                          Reset to {first.label}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <h3 className="group-title" id={`${headId}-scale`}>Type scale</h3>
        <div className="field field-tight">
          <Choice
            label="Contrast between sizes"
            className="seg seg-text seg-fill"
            options={style.choices.typeScales.map((t) => ({ value: t.name, label: t.label }))}
            value={style.typeScale}
            onChange={(name) => change(style.palette, name)}
          />
        </div>
        {scale && (
          <>
            <ul className="scale" aria-labelledby={`${headId}-scale`}>
              {scale.steps.map((step, index) => (
                <li key={step.key} title={`${step.size} px in a wide window, line height ${step.lineHeight}`}>
                  <span className={`scale-aa${step.sans ? "" : " serif"}`} style={{ fontSize: `${SAMPLE_PX[index]}px`, ...(step.sans ? { fontStretch: widths.display, fontWeight: index < 3 ? 700 : 600 } : {}) }} aria-hidden="true">Aa</span>
                  <span className="scale-name">{step.label}</span>
                  <span className="scale-num"><span className="visually-hidden">: </span>{step.size}<span className="visually-hidden"> px</span></span>
                </li>
              ))}
            </ul>
            <p className="hint">{scaleLabel}: each size is about {ratioWords(scale.ratio)} larger than the next. Sizes in a wide window; a narrower one shrinks them all together.</p>
          </>
        )}

        <h3 className="group-title">Letter width</h3>
        <div className="field field-tight">
          <Choice
            label="How wide the Headings typeface is drawn"
            className="seg seg-text seg-fill"
            options={style.choices.letterWidths.map((w) => ({ value: w.name, label: w.label }))}
            value={style.letterWidth}
            onChange={(name) => change(style.palette, style.typeScale, name)}
          />
        </div>
        <p className="hint">How wide the letters of the headings, the logo, buttons and labels are drawn. Menus keep their own width.</p>
      </div>
    </section>
  );
}

// A level below the Page tab (design/layout/, the site-style state): the
// way back to it first, then the title; the sidebar's own close button,
// which hides the sidebar, as it does over the Page and Block tabs.
function Head({ id, onClose, onHide }: { id: string; onClose: () => void; onHide?: (() => void) | undefined }) {
  const { styleSave } = useSession();
  return (
    <div className="tray-head tray-head-title">
      <div>
        <button className="sb-back" type="button" aria-label="Back to Page" onClick={onClose}><Icon name="arrow-left" className="i i-xs" />Page</button>
        <h2 id={id}>Site style</h2>
        <p>Applies to every page of your site.</p>
        {styleSave.phase === "failed"
          ? <p className="error" role="alert"><Icon name="error" />{styleSave.message}</p>
          : <p className="style-save" role="status">{styleSave.phase === "saving" ? "Saving…" : styleSave.phase === "saved" ? "Saved for every page" : ""}</p>}
      </div>
      {onHide && <button className="ibtn" type="button" aria-label="Hide the sidebar" title="Hide the sidebar" onClick={onHide}><Icon name="close" /></button>}
    </div>
  );
}

// A set of choices where one is on (role radiogroup): the arrows move the
// choice, as a set of radio buttons does, and only the chosen one is a
// Tab stop.
function useRadioKeys(values: readonly string[], value: string, onChange: (value: string) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || values.length === 0) return;
    event.preventDefault();
    const at = Math.max(0, values.indexOf(value));
    const next = values[(at + step + values.length) % values.length]!;
    onChange(next);
    const group = event.currentTarget;
    requestAnimationFrame(() => [...group.querySelectorAll<HTMLElement>("[data-value]")].find((choice) => choice.dataset.value === next)?.focus());
  };
}

// A slot's curated tones, then Custom: a colour of the site's own, shown
// as the hue wheel until there is one.
function Tones({ label, tones, value, onChange }: { label: string; tones: SiteStyle["choices"]["palette"][string]; value: string; onChange: (color: string) => void }) {
  const onKeyDown = useRadioKeys(tones.map((t) => t.color), value, onChange);
  // A colour of the site's own leaves no tone checked: the first is the
  // stop for the Tab key.
  const stop = tones.some((t) => t.color === value) ? value : tones[0]?.color;
  return (
    <div className="tones" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {tones.map((tone) => {
        const on = tone.color === value;
        return (
          <button
            key={tone.color}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={tone.color === stop ? 0 : -1}
            data-value={tone.color}
            className={on ? "is-on" : undefined}
            style={{ "--c": tone.hex } as CSSProperties}
            title={`${tone.label}, ${tone.hex}`}
            onClick={() => {
              if (!on) onChange(tone.color);
            }}
          >
            <span>{tone.label}</span>
            {on && <span className="pick-check" aria-hidden="true"><Icon name="check" /></span>}
          </button>
        );
      })}
    </div>
  );
}

function Choice({ label, className, options, value, onChange }: { label: string; className: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  const onKeyDown = useRadioKeys(options.map((o) => o.value), value, onChange);
  return (
    <div className={className} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          data-value={option.value}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
