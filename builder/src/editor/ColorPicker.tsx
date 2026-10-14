// A colour of the site's own choosing (../shared/free-colors.ts), picked
// in the sidebar: an area of saturation and brightness over the hue, a hue
// bar, and the colour as six hex digits, typed or copied. Dragging shows
// the colour here and, through onPreview, wherever the panel shows it at
// once; it is kept (onCommit) when the pointer is let go, a pause after
// the arrow keys, or Enter or leaving the hex field, so a drag is one
// change, not one per pixel. A colour waiting for the arrows' pause is
// held as a text waiting in a field is (./pending.ts): another command, a
// drag or another page hands it over first, on the page it was picked on.
// A choice the panel makes in the pause (a swatch, Reset) drops it instead
// (discard, through the picker's ref), so it is not kept over the choice.
//
// Both the area and the bar are sliders to a keyboard: the arrows move
// them by 1 (the area's left and right the saturation, up and down the
// brightness), with Shift by 10. The palette of ready colours beside it
// is ./ColorPalette.tsx.
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv, type FreeColor, type Hsv } from "../shared/free-colors.ts";
import { useEnv } from "./context.tsx";
import { COMMIT_AFTER_MS, ErrorList } from "./controls.tsx";

// What the panel can tell its picker.
export interface ColorPickerHandle {
  // Another choice takes the colour's place: a colour still waiting to be
  // kept is dropped, and the picker shows the one kept.
  discard: () => void;
}

interface ColorPickerProps {
  // What the colour is of ("Primary", "Background"): the controls' names.
  label: string;
  value: FreeColor;
  onCommit: (color: FreeColor) => void;
  // The colour shown while it is picked, before it is kept; null when the
  // picking stopped without keeping one.
  onPreview?: (color: FreeColor | null) => void;
  ref?: Ref<ColorPickerHandle>;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const percent = (n: number) => `${Math.round(n * 100)}%`;

export function ColorPicker({ label, value, onCommit, onPreview, ref }: ColorPickerProps) {
  const { clock, ui } = useEnv();
  const id = useId();
  // The picker's own place: the hue is kept even where the colour has none
  // (a grey), so moving to black and back does not lose it.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value)));
  const [typed, setTyped] = useState<string>(value);
  const [refused, setRefused] = useState<string | null>(null);
  const shown = rgbToHex(hsvToRgb(hsv));
  const kept = useRef<FreeColor>(value);
  const timer = useRef<unknown>(null);
  // Lets go of the colour held while it waits.
  const release = useRef<(() => void) | null>(null);
  const dragging = useRef<"area" | "hue" | null>(null);

  // The colour changed from outside (another tab, undo): the picker
  // follows, unless the person is in the middle of picking.
  useEffect(() => {
    if (dragging.current !== null || timer.current !== null || value === kept.current) return;
    kept.current = value;
    setHsv(rgbToHsv(hexToRgb(value)));
    setTyped(value);
    setRefused(null);
  }, [value]);

  const commit = useCallback((color: FreeColor) => {
    if (timer.current !== null) {
      clock.clearTimeout(timer.current);
      timer.current = null;
    }
    release.current?.();
    release.current = null;
    if (color === kept.current) {
      onPreview?.(null);
      return;
    }
    kept.current = color;
    onCommit(color);
  }, [clock, onCommit, onPreview]);

  // A new place, shown at once and kept now or after a pause.
  const move = (next: Hsv, keep: "now" | "pause" | "later") => {
    setHsv(next);
    const color = rgbToHex(hsvToRgb(next));
    setTyped(color);
    setRefused(null);
    onPreview?.(color);
    if (keep === "now") commit(color);
    else if (keep === "pause") {
      if (timer.current !== null) clock.clearTimeout(timer.current);
      release.current?.();
      release.current = ui.getState().pending.hold(() => commit(color));
      timer.current = clock.setTimeout(() => {
        timer.current = null;
        commit(color);
      }, COMMIT_AFTER_MS);
    }
  };

  // Anything waiting is kept when the picker goes, and what the canvas
  // shows of the picking goes with it.
  const latest = useRef({ shown, commit, onPreview });
  useLayoutEffect(() => {
    latest.current = { shown, commit, onPreview };
  });
  useEffect(() => () => {
    if (timer.current !== null) latest.current.commit(latest.current.shown);
    release.current?.();
    latest.current.onPreview?.(null);
  }, []);

  useImperativeHandle(ref, () => ({
    discard: () => {
      if (timer.current === null) return;
      clock.clearTimeout(timer.current);
      timer.current = null;
      release.current?.();
      release.current = null;
      setHsv(rgbToHsv(hexToRgb(kept.current)));
      setTyped(kept.current);
      setRefused(null);
      onPreview?.(null);
    },
  }), [clock, onPreview]);

  const fromArea = (event: PointerEvent<HTMLElement>, keep: "now" | "later") => {
    const box = event.currentTarget.getBoundingClientRect();
    const s = clamp((event.clientX - box.left) / box.width, 0, 1);
    const v = clamp(1 - (event.clientY - box.top) / box.height, 0, 1);
    move({ h: hsv.h, s, v }, keep);
  };
  const fromHue = (event: PointerEvent<HTMLElement>, keep: "now" | "later") => {
    const box = event.currentTarget.getBoundingClientRect();
    const h = clamp((event.clientX - box.left) / box.width, 0, 1) * 360;
    move({ ...hsv, h }, keep);
  };
  // The area and the bar, told apart by data-part.
  const read = (event: PointerEvent<HTMLElement>, keep: "now" | "later") => (event.currentTarget.dataset.part === "hue" ? fromHue : fromArea)(event, keep);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragging.current = event.currentTarget.dataset.part === "hue" ? "hue" : "area";
    read(event, "later");
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current === event.currentTarget.dataset.part) read(event, "later");
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current !== event.currentTarget.dataset.part) return;
    dragging.current = null;
    read(event, "now");
  };
  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current !== event.currentTarget.dataset.part) return;
    dragging.current = null;
    commit(rgbToHex(hsvToRgb(hsv)));
  };
  const pointer = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

  const arrows = (event: KeyboardEvent<HTMLElement>, part: "area" | "hue") => {
    const step = event.shiftKey ? 10 : 1;
    const { h, s, v } = hsv;
    let next: Hsv | null = null;
    if (part === "hue") {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") next = { h: clamp(h + step, 0, 360), s, v };
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = { h: clamp(h - step, 0, 360), s, v };
      else if (event.key === "Home") next = { h: 0, s, v };
      else if (event.key === "End") next = { h: 360, s, v };
    } else {
      if (event.key === "ArrowRight") next = { h, s: clamp(s + step / 100, 0, 1), v };
      else if (event.key === "ArrowLeft") next = { h, s: clamp(s - step / 100, 0, 1), v };
      else if (event.key === "ArrowUp") next = { h, s, v: clamp(v + step / 100, 0, 1) };
      else if (event.key === "ArrowDown") next = { h, s, v: clamp(v - step / 100, 0, 1) };
    }
    if (next === null) return;
    event.preventDefault();
    move(next, "pause");
  };

  const fromTyped = (text: string, keep: boolean) => {
    const color = normalizeHex(text);
    if (color === null) {
      // No colour yet: what is drawn is the one kept.
      onPreview?.(null);
      if (keep) setRefused("Write a colour as six hex digits, like #1d4e6f.");
      return;
    }
    setRefused(null);
    setHsv(rgbToHsv(hexToRgb(color)));
    onPreview?.(color);
    if (keep) {
      setTyped(color);
      commit(color);
    }
  };

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  return (
    <div className="cp" style={{ "--c": shown, "--hue": hueColor } as CSSProperties}>
      <div
        className="cp-area"
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturation and brightness`}
        aria-valuetext={`Saturation ${percent(hsv.s)}, brightness ${percent(hsv.v)}`}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        data-part="area"
        {...pointer}
        onKeyDown={(event) => arrows(event, "area")}
      >
        <span className="cp-thumb" style={{ left: percent(hsv.s), top: percent(1 - hsv.v) }} aria-hidden="true" />
      </div>
      <div
        className="cp-hue"
        role="slider"
        tabIndex={0}
        aria-label={`${label}: hue`}
        aria-valuetext={`${Math.round(hsv.h)} degrees`}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        data-part="hue"
        {...pointer}
        onKeyDown={(event) => arrows(event, "hue")}
      >
        <span className="cp-thumb" style={{ left: percent(hsv.h / 360) }} aria-hidden="true" />
      </div>
      <div className={`cp-hex field${refused ? " field-error" : ""}`}>
        <span className="cp-swatch" aria-hidden="true" />
        <label className="visually-hidden" htmlFor={`${id}-hex`}>{label}: hex</label>
        <input
          id={`${id}-hex`}
          className="input"
          value={typed}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? `${id}-error` : undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            fromTyped(event.target.value, false);
          }}
          onBlur={(event) => fromTyped(event.target.value, true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              fromTyped(event.currentTarget.value, true);
            }
          }}
        />
      </div>
      <ErrorList id={`${id}-error`} errors={refused ? [refused] : []} />
    </div>
  );
}
