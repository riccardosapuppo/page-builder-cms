// The palette of ready colours under a colour's choices (./ColorPalette.tsx):
// a hue kept at a click; held down, or with the keymap's key, its shades,
// a shade kept at a click and the click that ends the hold keeping
// nothing; the hue of the colour in use drawn in that shade and pressed, a
// colour of no hue pressing Custom; the arrows along the tiles, Esc closing
// the shades back onto their hue.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { FreeColor } from "../shared/free-colors.ts";
import { ColorPalette } from "./ColorPalette.tsx";
import { entry, entryKeysText } from "./keymap.ts";

function draw(value: string | null = "primary") {
  const picked: FreeColor[] = [];
  let customs = 0;
  const kit = editorKit({ document: page() });
  function Field() {
    const [now, setNow] = useState<string | null>(value);
    const [open, setOpen] = useState(false);
    return (
      <ColorPalette
        label="Background"
        value={now}
        onPick={(color) => {
          picked.push(color);
          setNow(color);
        }}
        customOpen={open}
        onCustom={() => {
          customs += 1;
          setOpen(!open);
        }}
      />
    );
  }
  kit.render(<Field />);
  const group = () => screen.getByRole("group", { name: "Background: swatches" });
  return { kit, picked, customs: () => customs, group };
}

test("nineteen hues and the picker's tile, the hint naming the key from the keymap; a click keeps a hue's 500", () => {
  const { picked, group } = draw();
  const tiles = within(group()).getAllByRole("button");
  expect(tiles).toHaveLength(20);
  expect(tiles.map((tile) => tile.getAttribute("aria-label")).slice(0, 3)).toEqual(["Red", "Pink", "Purple"]);
  expect(tiles.at(-1)!.getAttribute("aria-label")).toBe("A colour of its own");
  expect(screen.getByText(new RegExp(`press ${entryKeysText(entry("shades")).replace("+", "\\+")} on it`))).toBeTruthy();
  fireEvent.click(within(group()).getByRole("button", { name: "Teal" }));
  expect(picked).toEqual(["#009688"]);
  // The colour in use is that hue's, pressed.
  expect(within(group()).getByRole("button", { name: "Teal 500" }).getAttribute("aria-pressed")).toBe("true");
});

test("held down, a hue shows its shades and the click that ends the hold keeps nothing; a shade is kept at a click", async () => {
  const { kit, picked, group } = draw();
  const indigo = within(group()).getByRole("button", { name: "Indigo" });
  fireEvent.pointerDown(indigo, { button: 0 });
  await act(() => kit.clock.advance(450));
  fireEvent.pointerUp(indigo);
  fireEvent.click(indigo);
  expect(picked).toEqual([]);
  const shades = screen.getByRole("group", { name: "Indigo shades" });
  expect(within(shades).getAllByRole("button")).toHaveLength(14);
  expect(indigo.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(within(shades).getByRole("button", { name: "Indigo 100" }));
  expect(picked).toEqual(["#c5cae9"]);
  // The hue is drawn in the shade in use, named and pressed by it.
  const tile = within(group()).getByRole("button", { name: "Indigo 100" });
  expect(tile.getAttribute("aria-pressed")).toBe("true");
  expect(tile.style.getPropertyValue("--c")).toBe("#c5cae9");
  // A press let go before the time, or one that leaves the tile, is a click.
  const red = within(group()).getByRole("button", { name: "Red" });
  fireEvent.pointerDown(red, { button: 0 });
  await act(() => kit.clock.advance(200));
  fireEvent.pointerUp(red);
  fireEvent.click(red);
  expect(picked.at(-1)).toBe("#f44336");
});

test("a held press that leaves its tile keeps nothing, and the next click on any colour still keeps it", async () => {
  const { kit, picked, group } = draw();
  const lime = within(group()).getByRole("button", { name: "Lime" });
  fireEvent.pointerDown(lime, { button: 0 });
  await act(() => kit.clock.advance(500));
  fireEvent.pointerLeave(lime);
  fireEvent.click(within(group()).getByRole("button", { name: "Amber" }));
  expect(picked).toEqual(["#ffc107"]);
});

test("a colour of no hue presses the picker's tile, which names it and opens the picker", () => {
  const { customs, group } = draw("#123456");
  const custom = within(group()).getByRole("button", { name: "Custom, #123456" });
  expect(custom.getAttribute("aria-pressed")).toBe("true");
  expect(within(group()).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true")).toEqual([custom]);
  expect(custom.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(custom);
  expect(customs()).toBe(1);
  expect(custom.getAttribute("aria-expanded")).toBe("true");
});

test("one Tab stop: the arrows go along the tiles, ten to a row; the keymap's key shows the shades on the 500, Esc closes them onto their hue", () => {
  const { group } = draw();
  const tiles = () => within(group()).getAllByRole("button");
  expect(tiles().filter((tile) => tile.tabIndex === 0)).toHaveLength(1);
  tiles()[0]!.focus();
  fireEvent.keyDown(tiles()[0]!, { key: "ArrowRight" });
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Pink");
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Lime");
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement?.getAttribute("aria-label")).toBe("A colour of its own");
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  const red = document.activeElement as HTMLElement;
  expect(red.getAttribute("aria-label")).toBe("Red");
  fireEvent.keyDown(red, { key: "Enter", shiftKey: true });
  const shades = screen.getByRole("group", { name: "Red shades" });
  expect(within(shades).getAllByRole("button").filter((b) => b.tabIndex === 0).map((b) => b.getAttribute("aria-label"))).toEqual(["Red 500"]);
  fireEvent.keyDown(within(shades).getByRole("button", { name: "Red 500" }), { key: "Escape" });
  expect(screen.queryByRole("group", { name: "Red shades" })).toBeNull();
  expect(document.activeElement).toBe(within(group()).getByRole("button", { name: "Red" }));
});
