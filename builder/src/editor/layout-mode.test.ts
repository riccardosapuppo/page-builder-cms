// The editor's layout from the window and the pointer (./layout-mode.ts):
// the approved layout from 1100, and with a mouse down to 700; a tablet's
// between 700 and 1099 with a finger; a phone's under 700 with either; and
// what each starts with.
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { layoutStart, useCoarsePointer, useLayoutMode } from "./layout-mode.ts";

// A window of this width, pointed at with a finger or a mouse: the media
// queries the module asks, answered as a browser would.
function windowOf(width: number, finger: boolean): void {
  const answer = (query: string): boolean => query.split(" and ").every((part) => {
    const least = /^\(min-width: ([\d.]+)px\)$/.exec(part);
    if (least) return width >= Number(least[1]);
    const most = /^\(max-width: ([\d.]+)px\)$/.exec(part);
    if (most) return width <= Number(most[1]);
    if (part === "(pointer: coarse)") return finger;
    throw new Error(`a query the test does not answer: ${part}`);
  });
  window.matchMedia = ((query: string) => ({ matches: answer(query), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
}

let kept: typeof window.matchMedia;
beforeEach(() => {
  kept = window.matchMedia;
});
afterEach(() => {
  window.matchMedia = kept;
});

test("the layout each window takes, with a finger and with a mouse", () => {
  const cases: Array<[number, boolean, string]> = [
    [1440, false, "wide"], [1100, true, "wide"], [1099, false, "wide"], [1024, false, "wide"], [700, false, "wide"],
    [1099, true, "medium"], [1024, true, "medium"], [820, true, "medium"], [700, true, "medium"],
    [699, true, "narrow"], [699, false, "narrow"], [390, true, "narrow"],
  ];
  const seen = cases.map(([width, finger]) => {
    windowOf(width, finger);
    return renderHook(() => useLayoutMode()).result.current;
  });
  expect(seen).toEqual(cases.map(([, , mode]) => mode));
});

test("a finger is told from a mouse", () => {
  windowOf(820, true);
  expect(renderHook(() => useCoarsePointer()).result.current).toBe(true);
  windowOf(820, false);
  expect(renderHook(() => useCoarsePointer()).result.current).toBe(false);
});

test("what each layout starts with: a phone the phone's page with its settings down, a tablet its settings down, both one panel at a time, the approved layout as it is", () => {
  expect(layoutStart("narrow")).toEqual({ preview: "phone", sidebarOpen: false, onePanel: true });
  expect(layoutStart("medium")).toEqual({ sidebarOpen: false, onePanel: true });
  expect(layoutStart("wide")).toEqual({});
  windowOf(390, true);
  expect(layoutStart()).toEqual({ preview: "phone", sidebarOpen: false, onePanel: true });
});

test("a browser with no media queries (a test's own) is wide", () => {
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
  expect(renderHook(() => useLayoutMode()).result.current).toBe("wide");
  expect(renderHook(() => useCoarsePointer()).result.current).toBe(false);
});
