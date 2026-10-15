// Every widget's accessibility test (./a11y.ts), in the Insert drawer's
// order. registry.test.ts holds this list to the registry: one for each
// widget type, none missing.
import type { WidgetA11y } from "./a11y.ts";
import { A11Y as heading } from "./heading/a11y.ts";
import { A11Y as text } from "./text/a11y.ts";
import { A11Y as button } from "./button/a11y.ts";
import { A11Y as divider } from "./divider/a11y.ts";
import { A11Y as spacer } from "./spacer/a11y.ts";
import { A11Y as image } from "./image/a11y.ts";
import { A11Y as gallery } from "./gallery/a11y.ts";
import { A11Y as video } from "./video/a11y.ts";
import { A11Y as map } from "./map/a11y.ts";
import { A11Y as iconbox } from "./iconbox/a11y.ts";
import { A11Y as quote } from "./quote/a11y.ts";
import { A11Y as accordion } from "./accordion/a11y.ts";
import { A11Y as stats } from "./stats/a11y.ts";
import { A11Y as steps } from "./steps/a11y.ts";
import { A11Y as pricing } from "./pricing/a11y.ts";
import { A11Y as form } from "./form/a11y.ts";
import { A11Y as logo } from "./logo/a11y.ts";
import { A11Y as menu } from "./menu/a11y.ts";

export const WIDGET_A11Y: readonly WidgetA11y[] = [heading, text, image, button, divider, spacer, gallery, video, map, iconbox, quote, accordion, stats, steps, pricing, form, logo, menu];
