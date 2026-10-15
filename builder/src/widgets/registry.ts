// Every widget, in the Insert drawer's order (the approved design's: Basic,
// Media, Content, Forms; then Site, the header's and footer's blocks; a
// widget made after the design last in its group, as stats is in
// Content), and the renderer of each type. registry.test.ts
// holds the list to the schema's widget types, one definition each.
//
// Adding a widget is one commit: the schema's branch, its folder here
// with its definition, renderer, icon, panel and accessibility test, a
// line below, the server's partial, and its traps in contract/fixtures;
// README.md here lists every place, with the form as the example.
import type { ComponentType } from "react";
import type { BlockRenderProps } from "../render/context.ts";
import type { WidgetType } from "../shared/document.ts";
import { accordion } from "./accordion/definition.ts";
import { button } from "./button/definition.ts";
import { divider } from "./divider/definition.ts";
import { form } from "./form/definition.ts";
import { gallery } from "./gallery/definition.ts";
import { heading } from "./heading/definition.ts";
import { iconbox } from "./iconbox/definition.ts";
import { image } from "./image/definition.ts";
import { logo } from "./logo/definition.ts";
import { map } from "./map/definition.ts";
import { menu } from "./menu/definition.ts";
import { quote } from "./quote/definition.ts";
import { spacer } from "./spacer/definition.ts";
import { stats } from "./stats/definition.ts";
import { text } from "./text/definition.ts";
import type { AnyWidgetDefinition, IconData } from "./types.ts";
import { video } from "./video/definition.ts";

export const WIDGETS: readonly AnyWidgetDefinition[] = [
  heading, text, image, button, divider, spacer,
  gallery, video, map,
  iconbox, quote, accordion, stats,
  form,
  logo, menu,
];

export const WIDGET_RENDERERS: ReadonlyMap<string, ComponentType<BlockRenderProps>> = new Map(WIDGETS.map((w) => [w.type, w.render]));

export function widgetDefinition(type: WidgetType): AnyWidgetDefinition {
  const found = WIDGETS.find((w) => w.type === type);
  if (!found) throw new Error(`no widget is registered for ${type}`);
  return found;
}

// The panel's Layout group, which adds structure, not a widget: a section,
// as the approved design names it, and the choice of how many columns it
// starts with, each drawn as Lucide's frame of as many columns (square,
// then columns-2 to columns-4, ../editor/lucide/).
export const LAYOUT = {
  section: { label: "Section" },
  columns: [
    { count: 1, label: "1 column", icon: { lucide: "square", shapes: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }]] } satisfies IconData },
    { count: 2, label: "2 columns", icon: { lucide: "columns-2", shapes: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M12 3v18" }]] } satisfies IconData },
    {
      count: 3,
      label: "3 columns",
      icon: { lucide: "columns-3", shapes: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M9 3v18" }], ["path", { d: "M15 3v18" }]] } satisfies IconData,
    },
    {
      count: 4,
      label: "4 columns",
      icon: {
        lucide: "columns-4",
        shapes: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M7.5 3v18" }], ["path", { d: "M12 3v18" }], ["path", { d: "M16.5 3v18" }]],
      } satisfies IconData,
    },
  ],
} as const;
