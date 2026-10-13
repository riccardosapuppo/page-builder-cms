// The palette of ready colours (./palette.ts), under a colour's other
// choices (a block's site colours, a slot's curated tones): the nineteen
// hues, each drawn in its 500, and the Custom tile, which opens the picker
// (./ColorPicker.tsx). A hue is kept at a click; held down, or with
// Shift+Enter, it shows its shades, the lightest to the darkest and the
// accents under them, each kept at a click. The hue of the colour in use is
// drawn in that very shade and ringed; a colour of no hue rings Custom.
//
// One stop for the Tab key in the hues and one in the shades: the arrows
// move along the rows, ten to a row, Home and End to the ends; Escape
// closes the shades.
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { isFreeColor, type FreeColor } from "../shared/free-colors.ts";
import { afterRender } from "./act.ts";
import { useEnv } from "./context.tsx";
import { entry, entryKeysText, matches } from "./keymap.ts";
import { mainShade, PALETTE, shadeOf } from "./palette.ts";

// How long a hue is held down before its shades show.
const HOLD_MS = 450;
// The key that shows them, from the keymap.
const SHADES = entry("shades");
const isShades = (event: KeyboardEvent) => SHADES.chords.some((chord) => matches(chord, { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }));
// Tiles to a row, the hues' and the shades'.
const COLUMNS = 10;

interface ColorPaletteProps {
  // What the colour is of ("Background", "Primary"): the groups' names.
  label: string;
  // The colour in use: a free colour, a name the palette does not hold (a
  // slot, a tone), or null.
  value: string | null;
  onPick: (color: FreeColor) => void;
  // Whether the picker is open, and the Custom tile's click.
  customOpen: boolean;
  onCustom: () => void;
}

// Where the arrows, Home and End go from a tile among `count`; null for
// any other key.
function along(event: KeyboardEvent, at: number, count: number): number | null {
  if (event.key === "Home") return 0;
  if (event.key === "End") return count - 1;
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? COLUMNS : event.key === "ArrowUp" ? -COLUMNS : 0;
  return step === 0 ? null : Math.min(count - 1, Math.max(0, at + step));
}

export function ColorPalette({ label, value, onPick, customOpen, onCustom }: ColorPaletteProps) {
  const { clock } = useEnv();
  const id = useId();
  const free = value !== null && isFreeColor(value) ? value : null;
  const chosen = free ? shadeOf(free) : null;
  const custom = free !== null && chosen === null ? free : null;
  const tiles = PALETTE.length + 1;
  // The hue whose shades are shown; the tiles the keys stand on, the
  // colour in use's until they move; a press being held (long enough, it
  // shows the shades, and the click that ends it keeps nothing).
  const [shadesOf, setShadesOf] = useState<number | null>(null);
  const [hueStop, setHueStop] = useState<number | null>(null);
  const [shadeStop, setShadeStop] = useState<number | null>(null);
  const held = useRef<{ timer: unknown; fired: boolean; at: number } | null>(null);
  const hues = useRef<HTMLDivElement>(null);
  const shades = useRef<HTMLDivElement>(null);
  const inUse = chosen ? PALETTE.indexOf(chosen.hue) : custom ? PALETTE.length : 0;
  const stop = hueStop ?? inUse;

  const showShades = (at: number | null) => {
    setShadesOf(at);
    setShadeStop(null);
  };
  const onHueDown = (event: PointerEvent<HTMLButtonElement>, at: number) => {
    if (event.button !== 0) return;
    const press = { timer: null as unknown, fired: false, at };
    press.timer = clock.setTimeout(() => {
      press.fired = true;
      showShades(at);
    }, HOLD_MS);
    held.current = press;
  };
  // A press let go on its tile ends in a click, which reads it; one that
  // left the tile, or was cancelled, ends here.
  const endHold = (leaving: boolean) => {
    const press = held.current;
    if (!press) return;
    if (!press.fired) clock.clearTimeout(press.timer);
    if (leaving || !press.fired) held.current = null;
  };
  const focusTile = (group: HTMLDivElement | null, at: number) => group?.querySelectorAll<HTMLButtonElement>("button")[at]?.focus();

  // A hue's shade the keys start on: the colour in use's, else the 500.
  const shadeIndex = (hue: number) => {
    const at = PALETTE[hue]!.shades.findIndex(([, color]) => color === free);
    return at >= 0 ? at : 5;
  };
  const onHueKeys = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (isShades(event) && at < PALETTE.length) {
      event.preventDefault();
      const open = shadesOf !== at;
      showShades(open ? at : null);
      if (open) afterRender(() => focusTile(shades.current, shadeIndex(at)));
      return;
    }
    if (event.key === "Escape" && shadesOf !== null) {
      event.preventDefault();
      event.stopPropagation();
      showShades(null);
      return;
    }
    const next = along(event, at, tiles);
    if (next === null) return;
    event.preventDefault();
    setHueStop(next);
    focusTile(hues.current, next);
  };

  const onShadeKeys = (event: KeyboardEvent<HTMLButtonElement>, at: number, hue: number) => {
    if (event.key === "Escape" || isShades(event)) {
      event.preventDefault();
      event.stopPropagation();
      showShades(null);
      setHueStop(hue);
      focusTile(hues.current, hue);
      return;
    }
    const next = along(event, at, PALETTE[hue]!.shades.length);
    if (next === null) return;
    event.preventDefault();
    setShadeStop(next);
    focusTile(shades.current, next);
  };

  const open = shadesOf === null ? null : PALETTE[shadesOf]!;
  return (
    <div className="palette">
      <p className="field-lead">Swatches</p>
      <div ref={hues} className="palette-hues" role="group" aria-label={`${label}: swatches`} aria-describedby={`${id}-hint`}>
        {PALETTE.map((hue, at) => {
          const mine = chosen?.hue === hue ? chosen : null;
          const color = mine ? (hue.shades.find(([name]) => name === mine.name)?.[1] ?? mainShade(hue)) : mainShade(hue);
          return (
            <button
              key={hue.name}
              type="button"
              style={{ "--c": color } as CSSProperties}
              aria-label={mine ? `${hue.name} ${mine.name}` : hue.name}
              aria-pressed={mine !== null}
              aria-expanded={shadesOf === at}
              aria-controls={shadesOf === at ? `${id}-shades` : undefined}
              title={`${mine ? `${hue.name} ${mine.name}` : hue.name}, ${color}`}
              tabIndex={at === stop ? 0 : -1}
              onFocus={() => setHueStop(at)}
              onPointerDown={(event) => onHueDown(event, at)}
              onPointerUp={() => endHold(false)}
              onPointerLeave={() => endHold(true)}
              onPointerCancel={() => endHold(true)}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => {
                const press = held.current;
                held.current = null;
                if (press?.fired && press.at === at) return;
                if (shadesOf !== at) showShades(null);
                onPick(color);
              }}
              onKeyDown={(event) => onHueKeys(event, at)}
            />
          );
        })}
        <button
          type="button"
          className="palette-custom"
          style={custom ? ({ "--c": custom } as CSSProperties) : undefined}
          aria-label={custom ? `Custom, ${custom}` : "A colour of its own"}
          aria-pressed={custom !== null}
          aria-expanded={customOpen}
          title={custom ? `Custom, ${custom}` : "A colour of its own: the picker"}
          tabIndex={stop === PALETTE.length ? 0 : -1}
          onFocus={() => setHueStop(PALETTE.length)}
          onClick={onCustom}
          onKeyDown={(event) => onHueKeys(event, PALETTE.length)}
        />
      </div>
      {open && shadesOf !== null && (
        <div ref={shades} className="palette-shades" id={`${id}-shades`} role="group" aria-label={`${open.name} shades`}>
          {open.shades.map(([name, color], at) => (
            <button
              key={name}
              type="button"
              style={{ "--c": color } as CSSProperties}
              aria-label={`${open.name} ${name}`}
              aria-pressed={free === color}
              title={`${open.name} ${name}, ${color}`}
              tabIndex={at === (shadeStop ?? shadeIndex(shadesOf)) ? 0 : -1}
              onFocus={() => setShadeStop(at)}
              onClick={() => onPick(color)}
              onKeyDown={(event) => onShadeKeys(event, at, shadesOf)}
            />
          ))}
        </div>
      )}
      <p className="hint" id={`${id}-hint`}>Hold a colour down, or press {entryKeysText(SHADES)} on it, for its lighter and darker shades.</p>
    </div>
  );
}
