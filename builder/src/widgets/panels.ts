// Every widget's panel, by type: each one lives in its widget's folder,
// next to its definition (./<widget>/panel.tsx). Kept apart from
// registry.ts, which the render contract and the random-page agreement
// check load: the renderer has no use for the editor's controls.
import type { WidgetPanel } from "../editor/panels/types.ts";
import type { WidgetType } from "../shared/document.ts";
import { panel as accordion } from "./accordion/panel.tsx";
import { panel as button } from "./button/panel.tsx";
import { panel as divider } from "./divider/panel.tsx";
import { panel as form } from "./form/panel.tsx";
import { panel as gallery } from "./gallery/panel.tsx";
import { panel as heading } from "./heading/panel.tsx";
import { panel as iconbox } from "./iconbox/panel.tsx";
import { panel as image } from "./image/panel.tsx";
import { panel as logo } from "./logo/panel.tsx";
import { panel as map } from "./map/panel.tsx";
import { panel as menu } from "./menu/panel.tsx";
import { panel as quote } from "./quote/panel.tsx";
import { panel as spacer } from "./spacer/panel.tsx";
import { panel as stats } from "./stats/panel.tsx";
import { panel as text } from "./text/panel.tsx";
import { panel as video } from "./video/panel.tsx";

export const WIDGET_PANELS: { readonly [T in WidgetType]: WidgetPanel<T> } = {
  heading, text, image, button, divider, spacer, gallery, video, map, iconbox, quote, accordion, stats, form, logo, menu,
};
