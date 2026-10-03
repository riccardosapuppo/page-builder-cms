// The Style tab: only the settings the block's type accepts, each from the
// site's tokens, each by the style command on the base; a reset takes the
// key out; previewing a tablet, it says it still writes every device's
// value and names the block's own tablet value.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { BlockPanel } from "./EditPanel.tsx";

const NAMES = (container: HTMLElement) => [...container.querySelectorAll(".field > .label, .field > .label-row > .label")].map((e) => e.textContent);

test("each type shows the settings it accepts and no other", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  kit.ui.getState().setPanelTab("style");
  const { container, rerender } = kit.render(<BlockPanel id="image" />);
  expect(NAMES(container)).toEqual(["Crop"]);
  rerender(<BlockPanel id="button" />);
  expect(NAMES(container)).toEqual(["Background", "Text color", "Alignment"]);
  rerender(<BlockPanel id="video" />);
  expect(NAMES(container)).toEqual([]);
  expect(screen.getByText("This widget has no style settings of its own.")).toBeTruthy();
});

test("a column's settings come in the approved design's order: space, then background, then type and placement", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.getState().setPanelTab("style");
  const { container } = kit.render(<BlockPanel id="c1" />);
  expect(NAMES(container)).toEqual(["Space inside", "Space between widgets", "Background", "Text size in this column", "Text color", "Alignment", "Vertical alignment"]);
});

test("a choice sets the base value, in the site's colours, and Reset takes it out", () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.ui.getState().setPanelTab("style");
  kit.render(<BlockPanel id="button" />);
  const background = () => within(screen.getByRole("radiogroup", { name: "Background" }));
  const primary = background().getByRole("radio", { name: "Primary, Sea" });
  expect(primary.getAttribute("style")).toContain("#1E5B4C");
  fireEvent.click(primary);
  expect(kit.block("button")?.style).toEqual({ base: { background: "primary" } });
  expect(kit.lastCommand()?.label).toBe("Set Background to Primary, Button in Widgets");
  fireEvent.click(screen.getByRole("button", { name: "Reset Background" }));
  expect(kit.block("button")?.style).toEqual({ base: {} });
  expect(kit.lastCommand()?.label).toBe("Cleared Background, Button in Widgets");

  // The site's own tone for a slot, where the site style has another.
  act(() => kit.ui.getState().setSiteStyle({ palette: { primary: "site-harbour" }, typeScale: "balanced", updatedAt: null, choices: { palette: {}, typeScales: [] } }));
  expect(background().getByRole("radio", { name: "Primary, Harbour" }).getAttribute("style")).toContain("#1D4E6F");
});

test("previewing a tablet, the tab still writes the base and names the block's tablet value", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ panelTab: "style", preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  expect(screen.getByText(/The settings here apply on every device/)).toBeTruthy();
  expect(screen.getByText("On tablets this block has its own value: L.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Right" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m", align: "right" }, tablet: { spaceInside: "l", align: "center" } });
});
