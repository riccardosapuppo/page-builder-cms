// The widths the editor previews a page at on a tablet and a phone, from
// the approved design's tokens (schema/tokens.json, breakpoints
// "device-preview"): the width the canvas gives the page root, whose
// container queries then lay it out as on that device. The desktop
// preview takes the canvas's own width, but never less than the page's
// desktop layout needs (breakpoints "container", "tablet-below": 800).
import { breakpoints } from "../../../schema/tokens.json";

export const PREVIEW_WIDTHS: Readonly<{ tablet: number; phone: number }> = {
  tablet: breakpoints["device-preview"].tablet,
  phone: breakpoints["device-preview"].phone,
};

// The narrowest page that lays out as a desktop.
export const DESKTOP_MIN: number = breakpoints.container["tablet-below"];

export type PreviewDevice = "desktop" | "tablet" | "phone";

// How the canvas draws the page for a device, in the room it has (its
// width less the page's margins): the page's width (undefined: the
// canvas's own) and the scale that fits it in.
// - Desktop fills the canvas, but is never narrower than DESKTOP_MIN: a
//   narrower canvas, a 1280 window's, draws the desktop page 800 wide,
//   smaller.
// - Tablet and phone take their preview widths, drawn smaller when the
//   canvas has less room than that.
// The scale is a transform: the page lays out at its true width.
export function fitPreview(preview: PreviewDevice, room: number): { width: number | undefined; scale: number } {
  const fitting = (width: number) => (room > 0 && room < width ? Math.floor((room / width) * 10_000) / 10_000 : 1);
  if (preview === "desktop") return room > 0 && room < DESKTOP_MIN ? { width: DESKTOP_MIN, scale: fitting(DESKTOP_MIN) } : { width: undefined, scale: 1 };
  const width = PREVIEW_WIDTHS[preview];
  return { width, scale: fitting(width) };
}
