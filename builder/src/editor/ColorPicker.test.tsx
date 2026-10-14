// A colour of the site's own, picked (./ColorPicker.tsx): a drag over the
// area shows each colour at once (onPreview) and keeps one when let go;
// the arrows keep one after a pause; the hex field keeps what is typed as
// #rrggbb, says when it is not a colour and shows the kept one again; the
// picker going keeps what waits and stops showing what was picked; a
// choice made beside it in the arrows' pause drops what waits; a colour
// the page refuses is not kept, so it can be kept again.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { FreeColor } from "../shared/free-colors.ts";
import { ColorPicker, type ColorPickerHandle } from "./ColorPicker.tsx";
import { COMMIT_AFTER_MS } from "./controls.tsx";

// refuse: the page's answer to each commit in turn, true for a refusal;
// past its end, every commit is taken.
function draw(value: FreeColor = "#ff0000", refuse: boolean[] = []) {
  const kept: FreeColor[] = [];
  const shown: Array<FreeColor | null> = [];
  const handle = createRef<ColorPickerHandle>();
  const kit = editorKit({ document: page() });
  function Field({ on }: { on: boolean }) {
    const [now, setNow] = useState<FreeColor>(value);
    return on ? (
      <ColorPicker
        ref={handle}
        label="Primary"
        value={now}
        onCommit={(color) => {
          if (refuse.length > 0 && refuse.shift()) return false;
          kept.push(color);
          setNow(color);
          return true;
        }}
        onPreview={(color) => shown.push(color)}
      />
    ) : null;
  }
  const view = kit.render(<Field on />);
  return { kit, kept, shown, handle, hide: () => view.rerender(<Field on={false} />) };
}

// jsdom lays nothing out: the area is given a box, and pointer capture.
function laidOut(element: HTMLElement, width = 200, height = 100) {
  Object.defineProperty(element, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 }) });
  Object.defineProperty(element, "setPointerCapture", { value: () => {} });
}

test("a drag over the area shows each colour at once and keeps one, when let go", () => {
  const { kept, shown } = draw();
  const area = screen.getByRole("slider", { name: "Primary: saturation and brightness" });
  laidOut(area);
  fireEvent.pointerDown(area, { button: 0, clientX: 200, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 100, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(area, { clientX: 100, clientY: 50, pointerId: 1 });
  expect(kept).toEqual([]);
  expect(shown).toEqual(["#ff0000", "#ff8080", "#804040"]);
  fireEvent.pointerUp(area, { clientX: 100, clientY: 50, pointerId: 1 });
  expect(kept).toEqual(["#804040"]);
});

test("the arrows move the colour by 1, with Shift by 10, and keep it after a pause, once", async () => {
  const { kit, kept, shown } = draw("#808080");
  const hue = screen.getByRole("slider", { name: "Primary: hue" });
  const area = screen.getByRole("slider", { name: "Primary: saturation and brightness" });
  fireEvent.keyDown(area, { key: "ArrowRight", shiftKey: true });
  fireEvent.keyDown(area, { key: "ArrowRight", shiftKey: true });
  fireEvent.keyDown(hue, { key: "End" });
  expect(shown.length).toBe(3);
  expect(kept).toEqual([]);
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kept).toEqual([shown.at(-1)]);
  expect(area.getAttribute("aria-valuetext")).toBe("Saturation 20%, brightness 50%");
});

test("the hex field keeps what is typed as #rrggbb; what is no colour is said, and the kept colour is shown again", () => {
  const { kept, shown } = draw();
  const field = screen.getByLabelText("Primary: hex");
  fireEvent.change(field, { target: { value: "1D4E6F" } });
  expect(shown.at(-1)).toBe("#1d4e6f");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(kept).toEqual(["#1d4e6f"]);
  expect((field as HTMLInputElement).value).toBe("#1d4e6f");
  fireEvent.change(field, { target: { value: "#1d4e6" } });
  expect(shown.at(-1)).toBeNull();
  fireEvent.blur(field);
  expect(screen.getByText("Write a colour as six hex digits, like #1d4e6f.")).toBeTruthy();
  expect(kept).toEqual(["#1d4e6f"]);
});

test("a choice made beside the picker in the arrows' pause drops the colour waiting: nothing kept, then or when the picker goes", async () => {
  const { kit, kept, shown, handle, hide } = draw("#808080");
  const area = screen.getByRole("slider", { name: "Primary: saturation and brightness" });
  fireEvent.keyDown(area, { key: "ArrowRight", shiftKey: true });
  expect(shown.at(-1)).not.toBe("#808080");
  act(() => handle.current!.discard());
  // What is shown is the colour kept, here and wherever the panel shows it.
  expect(shown.at(-1)).toBeNull();
  expect((screen.getByLabelText("Primary: hex") as HTMLInputElement).value).toBe("#808080");
  expect(area.getAttribute("aria-valuetext")).toBe("Saturation 0%, brightness 50%");
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  hide();
  expect(kept).toEqual([]);
});

test("the picker going keeps the colour waiting and stops showing the picking", async () => {
  const { kit, kept, shown, hide } = draw("#808080");
  // On the area: a grey takes no hue, so a move along the hue bar alone
  // would change nothing.
  fireEvent.keyDown(screen.getByRole("slider", { name: "Primary: saturation and brightness" }), { key: "ArrowRight", shiftKey: true });
  const waiting = shown.at(-1);
  expect(waiting).not.toBe("#808080");
  hide();
  expect(kept).toEqual([waiting]);
  expect(shown.at(-1)).toBeNull();
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kept).toHaveLength(1);
});

test("a colour the page refuses is not taken as kept: the same colour, kept again, reaches the page", () => {
  const { kept } = draw("#ff0000", [true]);
  const field = screen.getByLabelText("Primary: hex");
  fireEvent.change(field, { target: { value: "#1d4e6f" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(kept).toEqual([]);
  fireEvent.keyDown(field, { key: "Enter" });
  expect(kept).toEqual(["#1d4e6f"]);
});
