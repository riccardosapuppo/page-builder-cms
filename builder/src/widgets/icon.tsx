// A widget's tile icon, drawn from its IconData on Lucide's grid. The
// chrome's stylesheet sets stroke, fill and size by class (.i, .i-tile).
import { shapeElements } from "../render/drawings.tsx";
import type { IconData } from "./types.ts";

export function WidgetIcon({ icon, className = "i i-tile" }: { icon: IconData; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {shapeElements(icon.shapes)}
    </svg>
  );
}
