// What a block's style is on each device the editor previews, read as the
// published page's stylesheet applies it (cms tokens.css, container queries
// on the page root): a desktop takes the base; a tablet its own value, else
// the base; a phone its own value, else the base. A phone never takes the
// tablet's value: each override applies only inside its own widths (560 to
// 800 for a tablet, under 560 for a phone), so the base is the only value
// the two share.
//
// The sidebar's style settings edit the previewed device's values with
// these, the canvas measures the step the page shows, and the Outline
// flags the blocks with values of their own on a tablet or a phone.
import { REMOVE, type StyleUpdates } from "../document/commands.ts";
import { styleValue } from "../render/style.ts";
import type { Device, StyleTokens } from "../shared/document.ts";
import type { Preview } from "./ui-store.ts";

export type OverrideDevice = Exclude<Device, "base">;
export const OVERRIDE_DEVICES: readonly OverrideDevice[] = ["tablet", "phone"];

// The part of the style the style settings write while a width is previewed.
export function deviceOf(preview: Preview): Device {
  return preview === "desktop" ? "base" : preview;
}

// The value a key has on a device: its own there, else the base's; null
// when neither has one (the theme's default applies). Only values the
// schema allows count, as only those reach the page.
export function shownValue(style: unknown, device: Device, key: keyof StyleTokens): string | null {
  if (device !== "base") {
    const own = styleValue(style, device, key);
    if (own !== null) return own;
  }
  return styleValue(style, "base", key);
}

// The device's own value of a key, the override, or null when the device
// shows the base's.
export function ownValue(style: unknown, device: OverrideDevice, key: keyof StyleTokens): string | null {
  return styleValue(style, device, key);
}

// The devices on which a block has values of its own, in this order.
export function overriddenOn(style: unknown): OverrideDevice[] {
  return OVERRIDE_DEVICES.filter((device) => {
    const part = typeof style === "object" && style !== null && Object.hasOwn(style, device) ? (style as Record<string, unknown>)[device] : undefined;
    return typeof part === "object" && part !== null && Object.keys(part).some((key) => styleValue(style, device, key) !== null);
  });
}

// "Back to desktop": the device's key taken out, so the device shows the
// base again and follows it from then on. Never the base's value written
// on the device, which would look the same today and stop following the
// desktop at its next change (device-style.test.ts holds this, with that
// fault planted).
export function backToDesktop(key: keyof StyleTokens): StyleUpdates {
  return { [key]: REMOVE };
}
