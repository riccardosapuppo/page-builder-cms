// The widths the editor previews a page at on a tablet and a phone, from
// the approved design's tokens (schema/tokens.json, breakpoints
// "device-preview"): the width the canvas gives the page root, whose
// container queries then lay it out as on that device. The desktop
// preview takes the canvas's own width.
import { breakpoints } from "../../../schema/tokens.json";

export const PREVIEW_WIDTHS: Readonly<{ tablet: number; phone: number }> = {
  tablet: breakpoints["device-preview"].tablet,
  phone: breakpoints["device-preview"].phone,
};
