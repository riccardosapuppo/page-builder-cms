// The small drawing of each ready-made section (../presets.ts), as the
// empty page's invitation and the Insert drawer's Sections tab show it
// (design/shots/empty.png).
import type { ReactNode } from "react";
import type { Preset } from "./presets.ts";

export const PRESET_PICTURES: Readonly<Record<Preset, ReactNode>> = {
  intro: <span className="preset-pic preset-intro" aria-hidden="true"><i className="pp-h" /><i className="pp-t" /><i className="pp-t pp-short" /><i className="pp-b" /></span>,
  picture: <span className="preset-pic preset-split" aria-hidden="true"><i className="pp-img" /><span><i className="pp-h" /><i className="pp-t" /><i className="pp-t pp-short" /></span></span>,
  icons: <span className="preset-pic preset-three" aria-hidden="true">{[0, 1, 2].map((n) => <span key={n}><i className="pp-dot" /><i className="pp-t" /></span>)}</span>,
};
