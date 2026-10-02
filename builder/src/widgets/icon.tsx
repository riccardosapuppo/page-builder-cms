// A widget's tile icon, drawn from its IconData. The chrome's stylesheet
// sets stroke, fill and size by class (.i, .i-tile in the approved design).
import { createElement } from "react";
import type { IconData } from "./types.ts";

// SVG's hyphenated presentation attributes, as React names them.
const reactName = (name: string): string => name.replace(/-([a-z])/g, (_whole, letter: string) => letter.toUpperCase());

export function WidgetIcon({ icon, className = "i i-tile" }: { icon: IconData; className?: string }) {
  return (
    <svg className={className} viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      {icon.shapes.map(([element, attributes], index) =>
        createElement(element, { key: index, ...Object.fromEntries(Object.entries(attributes).map(([name, value]) => [reactName(name), value])) }),
      )}
    </svg>
  );
}
