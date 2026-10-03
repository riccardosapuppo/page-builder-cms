// The Style tab: only the settings the block's type accepts, each from the
// site's tokens, each by the style command on the base; a reset takes the
// key out. Previewing a tablet or a phone, it writes that device's values,
// says of each whether it is the device's own or the desktop's, and its
// Remove takes the device's key out, the focus back on the setting.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
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

// A setting's field, by its label, and what the field says beside and under it.
const fieldOf = (label: string) => screen.getAllByText(label, { selector: ".label" })[0]!.closest<HTMLElement>(".field")!;
const scopeOf = (label: string) => fieldOf(label).querySelector(".scope")?.textContent;

test("on the desktop the tab writes the base, and names the values a block has of its own on a tablet or a phone", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ panelTab: "style" });
  kit.render(<BlockPanel id="c1" />);
  expect(document.querySelector(".device-note")).toBeNull();
  expect(within(fieldOf("Space inside")).getByText("Tablets have their own: L.")).toBeTruthy();
  expect(within(fieldOf("Alignment")).getByText("Tablets have their own: Center.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Right" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m", align: "right" }, tablet: { spaceInside: "l", align: "center" } });
  expect(kit.lastCommand()?.label).toBe("Set Alignment to Right, Column 1 in Hero");
});

test("previewing a tablet, the tab edits the tablet's values, each said as the tablet's own or from the desktop", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ panelTab: "style", preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  expect(document.querySelector(".device-note")?.textContent).toBe("Editing for tablet. Changes you make now apply to tablets only.");

  // Space inside: L of its own, the desktop's M marked with a ring.
  expect(scopeOf("Space inside")).toBe("Tablet only");
  expect(fieldOf("Space inside").querySelector(".scope")?.classList.contains("scope-device")).toBe(true);
  const space = within(fieldOf("Space inside")).getByRole("slider");
  expect(space.getAttribute("aria-valuetext")).toBe("L");
  expect(fieldOf("Space inside").querySelector(".ruler-ghost")?.getAttribute("data-step")).toBe("m");
  expect(describedText(space)).toBe("Tablet override: L on all four sides. Desktop and phone use M, marked with a ring.");
  // Alignment: Center of its own; the desktop sets none.
  expect(scopeOf("Alignment")).toBe("Tablet only");
  expect(within(fieldOf("Alignment")).getByRole("radio", { name: "Center" }).getAttribute("aria-checked")).toBe("true");
  expect(fieldOf("Alignment").querySelector(".override p")?.textContent).toBe("Tablet override: Center. Desktop and phone use the theme’s default.");
  // Background: the desktop's, until changed here.
  expect(scopeOf("Background")).toBe("From desktop");
  expect(fieldOf("Background").querySelector(".scope")?.getAttribute("title")).toBe("Tablets use the desktop value until you change it here");
  const background = within(fieldOf("Background")).getByRole("radiogroup");
  expect(describedText(background)).toBe("A change here applies to tablets only.");

  // A change writes the tablet's value; the base stays.
  fireEvent.click(within(background).getByRole("radio", { name: "Primary, Sea" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m" }, tablet: { spaceInside: "l", align: "center", background: "primary" } });
  expect(kit.lastCommand()?.label).toBe("Set Background to Primary on tablet, Column 1 in Hero");
  expect(scopeOf("Background")).toBe("Tablet only");
  fireEvent.keyDown(space, { key: "ArrowRight" });
  expect(kit.block("c1")?.style).toMatchObject({ base: { spaceInside: "m" }, tablet: { spaceInside: "xl" } });
});

test("Remove takes the tablet's key out, never the desktop's value written in its place, and the last one the tablet's part", async () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ panelTab: "style", preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  fireEvent.click(screen.getByRole("button", { name: "Remove the tablet override of Space inside" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m" }, tablet: { align: "center" } });
  expect(kit.lastCommand()?.label).toBe("Cleared Space inside on tablet, Column 1 in Hero");
  expect(scopeOf("Space inside")).toBe("From desktop");
  // The button is gone: the focus goes to the setting's own control.
  const space = within(fieldOf("Space inside")).getByRole("slider");
  await waitFor(() => expect(document.activeElement).toBe(space));
  expect(space.getAttribute("aria-valuetext")).toBe("M");
  fireEvent.click(screen.getByRole("button", { name: "Remove the tablet override of Alignment" }));
  const style = kit.block("c1")!.style as unknown as Record<string, unknown>;
  expect(style).toEqual({ base: { spaceInside: "m" } });
  expect(Object.hasOwn(style, "tablet")).toBe(false);
  await waitFor(() => expect(document.activeElement).toBe(within(fieldOf("Alignment")).getAllByRole("radio")[0]));
  expect(screen.queryByRole("button", { name: /^Remove the tablet override/ })).toBeNull();
});

test("previewing a phone, the tab edits the phone's values, which never take the tablet's", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ panelTab: "style", preview: "phone" });
  const { rerender } = kit.render(<BlockPanel id="c1" />);
  // The tablet's L is the tablet's alone: the phone shows the desktop's M.
  expect(scopeOf("Space inside")).toBe("From desktop");
  expect(within(fieldOf("Space inside")).getByRole("slider").getAttribute("aria-valuetext")).toBe("M");
  fireEvent.keyDown(within(fieldOf("Space inside")).getByRole("slider"), { key: "ArrowLeft" });
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m" }, tablet: { spaceInside: "l", align: "center" }, phone: { spaceInside: "s" } });
  expect(fieldOf("Space inside").querySelector(".override p")?.textContent).toBe("Phone override: S on all four sides. Desktop uses M, marked with a ring; tablets have their own, L.");

  rerender(<BlockPanel id="h1" />);
  expect(scopeOf("Text size")).toBe("Phone only");
  expect(fieldOf("Text size").querySelector(".override p")?.textContent).toBe("Phone override: Heading 1. Desktop and tablet use Display.");
});
