// A widget's tile icon, drawn from its IconData. The chrome's stylesheet
// sets stroke, fill and size by class (.i, .i-tile in the approved design).
import { shapeElements } from "../render/drawings.tsx";
import type { IconData } from "./types.ts";

export function WidgetIcon({ icon, className = "i i-tile" }: { icon: IconData; className?: string }) {
  return (
    <svg className={className} viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      {shapeElements(icon.shapes)}
    </svg>
  );
}
