// How the canvas fits each device's page into the room it has.
import { describe, expect, test } from "vitest";
import { DESKTOP_MIN, fitPreview, PREVIEW_WIDTHS } from "./preview-widths.ts";

describe("fitPreview", () => {
  test("the widths come from the tokens: the desktop layout from 800, tablet 768, phone 390", () => {
    expect([DESKTOP_MIN, PREVIEW_WIDTHS.tablet, PREVIEW_WIDTHS.phone]).toEqual([800, 768, 390]);
  });

  test("with room enough, desktop fills the canvas and the devices take their widths, none scaled", () => {
    expect(fitPreview("desktop", 820)).toEqual({ width: undefined, scale: 1 });
    expect(fitPreview("desktop", DESKTOP_MIN)).toEqual({ width: undefined, scale: 1 });
    expect(fitPreview("tablet", 820)).toEqual({ width: 768, scale: 1 });
    expect(fitPreview("phone", 660)).toEqual({ width: 390, scale: 1 });
  });

  test("in a canvas narrower than the page, the page keeps its width and is drawn smaller to fit", () => {
    // A 1280 window: the canvas has 660 for the page.
    const desktop = fitPreview("desktop", 660);
    expect(desktop.width).toBe(800);
    expect(desktop.scale).toBeCloseTo(0.825, 4);
    expect(desktop.scale * 800).toBeLessThanOrEqual(660);
    const tablet = fitPreview("tablet", 660);
    expect(tablet.width).toBe(768);
    expect(tablet.scale * 768).toBeLessThanOrEqual(660);
    expect(tablet.scale * 768).toBeGreaterThan(659.9);
  });

  test("before the canvas is measured, nothing is scaled", () => {
    expect(fitPreview("desktop", 0)).toEqual({ width: undefined, scale: 1 });
    expect(fitPreview("tablet", 0)).toEqual({ width: 768, scale: 1 });
  });
});
