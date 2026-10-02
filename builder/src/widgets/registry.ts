// Every widget, in the widget panel's order (the approved design's: Basic,
// Media, Content), and the renderer of each type. registry.test.ts holds
// the list to the schema's widget types, one definition each.
//
// Adding a widget is one small commit: the schema's branch, its folder
// here with its definition, renderer and icon, a line below, the server's
// partial, and its traps in contract/fixtures.
import type { ComponentType } from "react";
import type { BlockRenderProps } from "../render/context.ts";
import type { WidgetType } from "../shared/document.ts";
import { accordion } from "./accordion/definition.ts";
import { button } from "./button/definition.ts";
import { divider } from "./divider/definition.ts";
import { gallery } from "./gallery/definition.ts";
import { heading } from "./heading/definition.ts";
import { iconbox } from "./iconbox/definition.ts";
import { image } from "./image/definition.ts";
import { map } from "./map/definition.ts";
import { quote } from "./quote/definition.ts";
import { spacer } from "./spacer/definition.ts";
import { text } from "./text/definition.ts";
import type { AnyWidgetDefinition, IconData } from "./types.ts";
import { video } from "./video/definition.ts";

export const WIDGETS: readonly AnyWidgetDefinition[] = [
  heading, text, image, button, divider, spacer,
  gallery, video, map,
  iconbox, quote, accordion,
];

export const WIDGET_RENDERERS: ReadonlyMap<string, ComponentType<BlockRenderProps>> = new Map(WIDGETS.map((w) => [w.type, w.render]));

export function widgetDefinition(type: WidgetType): AnyWidgetDefinition {
  const found = WIDGETS.find((w) => w.type === type);
  if (!found) throw new Error(`no widget is registered for ${type}`);
  return found;
}

// The panel's Layout group, which adds structure, not a widget: a section,
// and the choice of how many columns it starts with. The approved design's
// w-section and w-col-1 to w-col-4 symbols.
const columnsIcon = (rects: ReadonlyArray<readonly [x: string, width: string]>, rx: string): IconData => ({
  viewBox: "0 0 20 20",
  shapes: rects.map(([x, width]) => ["rect", { x, y: "5.75", width, height: "8.5", rx }] as const),
});

export const LAYOUT = {
  section: {
    label: "Section",
    icon: {
      viewBox: "0 0 20 20",
      shapes: [
        ["rect", { x: "2.75", y: "4.75", width: "14.5", height: "10.5", rx: "1" }],
        ["path", { d: "M7.75 4.75v10.5M12.25 4.75v10.5", "stroke-dasharray": "1.5 1.5" }],
      ],
    } satisfies IconData,
  },
  columns: [
    { count: 1, label: "1 column", icon: columnsIcon([["2.75", "14.5"]], ".75") },
    { count: 2, label: "2 columns", icon: columnsIcon([["2.75", "6.625"], ["10.625", "6.625"]], ".75") },
    { count: 3, label: "3 columns", icon: columnsIcon([["2.75", "4"], ["8", "4"], ["13.25", "4"]], ".75") },
    { count: 4, label: "4 columns", icon: columnsIcon([["2.75", "2.875"], ["6.625", "2.875"], ["10.5", "2.875"], ["14.375", "2.875"]], ".5") },
  ],
} as const;
