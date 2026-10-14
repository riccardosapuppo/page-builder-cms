// The grip at the top of a sheet on a phone's window (./layout-mode.ts,
// narrow), where the drawers and the settings rise from the bar at the
// foot: a press makes the sheet as tall as the window allows, or back; a
// drag down past a thumb's width closes it, and a drag up makes it tall.
// The sheet follows the finger down while it moves. The sheet's own close
// key stays, for a keyboard and a screen reader. On a phone's window only.
import { useRef } from "react";
import { useEnv, useUi } from "./context.tsx";
import { useLayoutMode } from "./layout-mode.ts";

// How far a drag goes before it closes the sheet, or changes its height.
const CLOSE_AT = 72;
const STEP_AT = 32;

const sheetOf = (element: Element): HTMLElement | null => element.closest<HTMLElement>(".drawer, .sidebar");

export function SheetGrip({ name, onClose }: { name: string; onClose: () => void }) {
  const { ui } = useEnv();
  const tall = useUi((u) => u.sheetTall);
  const narrow = useLayoutMode() === "narrow";
  const from = useRef<number | null>(null);
  const moved = useRef(false);
  if (!narrow) return null;

  // The drag ends where the finger left the glass, or nowhere (cancelled).
  const end = (element: HTMLElement, y: number | null) => {
    const start = from.current;
    from.current = null;
    const sheet = sheetOf(element);
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.translate = "";
    }
    if (start === null || y === null || !moved.current) return;
    const by = y - start;
    if (by > CLOSE_AT) onClose();
    else if (by < -STEP_AT) ui.getState().setSheetTall(true);
    else if (by > STEP_AT && tall) ui.getState().setSheetTall(false);
  };

  return (
    <button
      type="button"
      className="sheet-grip"
      aria-label={`${name}: full height`}
      aria-pressed={tall}
      title={tall ? "Drag down to make it shorter, or further to close it" : "Drag up to make it taller, down to close it"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        from.current = event.clientY;
        moved.current = false;
        const sheet = sheetOf(event.currentTarget);
        if (sheet) sheet.style.transition = "none";
      }}
      onPointerMove={(event) => {
        if (from.current === null) return;
        const by = event.clientY - from.current;
        if (Math.abs(by) > 6) moved.current = true;
        const sheet = sheetOf(event.currentTarget);
        if (sheet && moved.current) sheet.style.translate = by > 0 ? `0 ${by}px` : "";
      }}
      onPointerUp={(event) => end(event.currentTarget, event.clientY)}
      onPointerCancel={(event) => end(event.currentTarget, null)}
      onClick={() => {
        // A drag is not a press.
        if (moved.current) {
          moved.current = false;
          return;
        }
        ui.getState().setSheetTall(!tall);
      }}
    />
  );
}
