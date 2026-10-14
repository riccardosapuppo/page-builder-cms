// A block's style settings, in the Block tab's groups: only the settings
// the block's type accepts, each from the site's tokens, each by the style
// command on the base; a reset takes the key out. Previewing a tablet or a
// phone, they write that device's values, say of each whether it is the
// device's own or the desktop's, and Remove takes the device's key out,
// the focus back on the setting.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { COMMIT_AFTER_MS } from "../controls.tsx";
import { BlockPanel } from "./EditPanel.tsx";

// The settings' names in the groups that hold style keys, top to bottom.
const NAMES = (container: HTMLElement) => [...container.querySelectorAll(".grp:not([data-group=content]):not([data-group=shown]) .field > .label, .grp:not([data-group=content]):not([data-group=shown]) .field > .label-row > .label")].map((e) => e.textContent);

test("each type shows the settings it accepts and no other, in the groups that name them", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  const { container, rerender } = kit.render(<BlockPanel id="image" />);
  expect(groupNames()).toEqual(["Image", "Shape", "Shown on"]);
  openGroups("Shape");
  expect(NAMES(container)).toEqual(["Crop"]);
  rerender(<BlockPanel id="button" />);
  expect(groupNames()).toEqual(["Button", "Colors", "Alignment", "Shown on"]);
  openGroups("Colors", "Alignment");
  expect(NAMES(container)).toEqual(["Background", "Text color", "Alignment"]);
  rerender(<BlockPanel id="video" />);
  expect(groupNames()).toEqual(["Video", "Shown on"]);
  expect(NAMES(container)).toEqual([]);
});

test("a column's settings come in the approved layout's groups and order: space, background, type and colour, placement", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  const { container } = kit.render(<BlockPanel id="c1" />);
  expect(groupNames()).toEqual(["Spacing", "Background", "Text size and color", "Alignment", "Shown on"]);
  openGroups("Background", "Text size and color", "Alignment");
  expect(NAMES(container)).toEqual(["Space inside", "Space between widgets", "Background", "Text size in this column", "Text color", "Alignment"]);
  // The design's Alignment: vertical, then horizontal, side by side.
  expect([...container.querySelectorAll(".pair .label")].map((e) => e.textContent)).toEqual(["Vertical alignment", "Horizontal alignment"]);
});

test("a choice sets the base value, in the site's colours, and Reset takes it out, the focus back on the setting", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  openGroups("Colors");
  const background = () => within(screen.getByRole("radiogroup", { name: "Background" }));
  const primary = background().getByRole("radio", { name: "Primary, Signal" });
  expect(primary.getAttribute("style")).toContain("#C2352B");
  fireEvent.click(primary);
  expect(kit.block("button")?.style).toEqual({ base: { background: "primary" } });
  expect(kit.lastCommand()?.label).toBe("Set Background to Primary, Button in Widgets");
  fireEvent.click(screen.getByRole("button", { name: "Reset Background" }));
  expect(kit.block("button")?.style).toEqual({ base: {} });
  expect(kit.lastCommand()?.label).toBe("Cleared Background, Button in Widgets");
  // Reset is gone with the value: the focus is on the setting, its value
  // in use chosen.
  await waitFor(() => expect(document.activeElement).toBe(background().getByRole("radio", { name: "Accent, Buoy" })));

  // The site's own tone for a slot, where the site style has another.
  act(() => kit.ui.getState().setSiteStyle({ palette: { primary: "site-harbour" }, typeScale: "balanced", letterWidth: "normal", updatedAt: null, choices: { palette: {}, typeScales: [], letterWidths: [] } }));
  expect(background().getByRole("radio", { name: "Primary, Harbour" }).getAttribute("style")).toContain("#1D4E6F");
});

test("a swatch or Reset chosen in the pause after the picker's arrows wins: the colour waiting is not kept over it", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  openGroups("Colors");
  const pick = () => {
    fireEvent.click(within(screen.getByRole("group", { name: "Background: swatches" })).getByRole("button", { name: "A colour of its own" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Background: saturation and brightness" }), { key: "ArrowDown", shiftKey: true });
  };
  // A swatch: the picker closes, and keeps nothing of its own.
  pick();
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Background" })).getByRole("radio", { name: "Primary, Signal" }));
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.block("button")?.style).toEqual({ base: { background: "primary" } });
  expect(screen.queryByRole("slider", { name: "Background: saturation and brightness" })).toBeNull();
  // Reset: the picker stays, and keeps nothing after the pause.
  pick();
  fireEvent.click(screen.getByRole("button", { name: "Reset Background" }));
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.block("button")?.style).toEqual({ base: {} });
  expect(kit.lastCommand()?.label).toBe("Cleared Background, Button in Widgets");
});

test("a colour typed in the picker, on a block with none of its own, is kept at Enter, though the panel shows it as it is typed", () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  openGroups("Colors");
  fireEvent.click(within(screen.getByRole("group", { name: "Background: swatches" })).getByRole("button", { name: "A colour of its own" }));
  const hex = screen.getByLabelText("Background: hex");
  fireEvent.change(hex, { target: { value: "#123456" } });
  expect(kit.ui.getState().colorPreview).toMatchObject({ id: "button", key: "background", color: "#123456" });
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(kit.block("button")?.style).toEqual({ base: { background: "#123456" } });
});

test("a colour waiting after the picker's arrows is handed over before another page replaces this one, and keeps nothing on that page", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  const view = kit.render(<BlockPanel id="button" />);
  openGroups("Colors");
  fireEvent.click(within(screen.getByRole("group", { name: "Background: swatches" })).getByRole("button", { name: "A colour of its own" }));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Background: saturation and brightness" }), { key: "ArrowDown", shiftKey: true });
  expect(kit.ui.getState().pending.waiting).toBe(1);
  // What the editor does before it opens another page (App's openPage).
  act(() => {
    kit.ui.getState().pending.deliver();
  });
  const picked = kit.block("button")?.style as { base: { background?: string } } | undefined;
  expect(picked?.base.background).toMatch(/^#[0-9a-f]{6}$/);
  expect(kit.ui.getState().pending.waiting).toBe(0);
  // The other page has a block of the same id: the panel goes, and keeps
  // nothing there, then or after the pause.
  act(() => kit.store.getState().load(widgetPage()));
  view.unmount();
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.block("button")?.style).toEqual({ base: {} });
});

// A setting's field, by its label, and what the field says beside and under it.
const fieldOf = (label: string) => screen.getAllByText(label, { selector: ".label" })[0]!.closest<HTMLElement>(".field")!;
const scopeOf = (label: string) => fieldOf(label).querySelector(".scope")?.textContent;

test("on the desktop the settings write the base, and name the values a block has of its own on a tablet or a phone", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.render(<BlockPanel id="c1" />);
  openGroups("Alignment");
  expect(document.querySelector(".device-note")).toBeNull();
  expect(within(fieldOf("Space inside")).getByText("Tablets have their own: L.")).toBeTruthy();
  expect(within(fieldOf("Alignment")).getByText("Tablets have their own: Center.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Right" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m", align: "right" }, tablet: { spaceInside: "l", align: "center" } });
  expect(kit.lastCommand()?.label).toBe("Set Alignment to Right, Column 1 in Hero");
});

test("previewing a tablet, the settings edit the tablet's values, each said as the tablet's own or from the desktop", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  expect(document.querySelector(".device-note")?.textContent).toBe("Editing for tablet. Changes to its look apply to tablets only.");
  openGroups("Alignment", "Background");

  // Space inside: L of its own, the desktop's M marked with a ring.
  expect(scopeOf("Space inside")).toBe("Tablet only");
  expect(fieldOf("Space inside").querySelector(".scope")?.classList.contains("scope-device")).toBe(true);
  const space = within(fieldOf("Space inside")).getByRole("slider");
  expect(space.getAttribute("aria-valuetext")).toBe("L");
  expect(fieldOf("Space inside").querySelector(".ruler-ghost")?.getAttribute("data-step")).toBe("m");
  expect(describedText(space)).toBe("Tablet override: L on all four sides. Desktop and phone use M, marked with a ring.");
  // Alignment: Center of its own; the desktop sets none. The vertical one
  // is the desktop's: each says its own beside its name.
  expect([...fieldOf("Alignment").querySelectorAll(".pair .scope")].map((e) => e.textContent)).toEqual(["From desktop", "Tablet only"]);
  expect(within(fieldOf("Alignment")).getByRole("radio", { name: "Center" }).getAttribute("aria-checked")).toBe("true");
  expect(fieldOf("Alignment").querySelector(".override p")?.textContent).toBe("Tablet override: Center. Desktop and phone use the theme’s default.");
  // Space between: set nowhere, the theme's own L, said as the theme's.
  expect(scopeOf("Space between widgets")).toBe("From desktop");
  expect(within(fieldOf("Space between widgets")).getByRole("slider").getAttribute("aria-valuetext")).toBe("L, the theme’s default");
  // Background: the desktop's, until changed here.
  expect(scopeOf("Background")).toBe("From desktop");
  expect(fieldOf("Background").querySelector(".scope")?.getAttribute("title")).toBe("Tablets use the desktop value until you change it here");
  const background = within(fieldOf("Background")).getByRole("radiogroup");
  expect(describedText(background)).toBe("A change here applies to tablets only.");

  // A change writes the tablet's value; the base stays.
  fireEvent.click(within(background).getByRole("radio", { name: "Primary, Signal" }));
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m" }, tablet: { spaceInside: "l", align: "center", background: "primary" } });
  expect(kit.lastCommand()?.label).toBe("Set Background to Primary on tablet, Column 1 in Hero");
  expect(scopeOf("Background")).toBe("Tablet only");
  fireEvent.keyDown(space, { key: "ArrowRight" });
  expect(kit.block("c1")?.style).toMatchObject({ base: { spaceInside: "m" }, tablet: { spaceInside: "xl" } });
});

test("Remove takes the tablet's key out, never the desktop's value written in its place, and the last one the tablet's part", async () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  openGroups("Alignment");
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

test("previewing a phone, the settings edit the phone's values, which never take the tablet's", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ preview: "phone" });
  const { rerender } = kit.render(<BlockPanel id="c1" />);
  // The tablet's L is the tablet's alone: the phone shows the desktop's M.
  expect(scopeOf("Space inside")).toBe("From desktop");
  expect(within(fieldOf("Space inside")).getByRole("slider").getAttribute("aria-valuetext")).toBe("M");
  fireEvent.keyDown(within(fieldOf("Space inside")).getByRole("slider"), { key: "ArrowLeft" });
  expect(kit.block("c1")?.style).toEqual({ base: { spaceInside: "m" }, tablet: { spaceInside: "l", align: "center" }, phone: { spaceInside: "s" } });
  expect(fieldOf("Space inside").querySelector(".override p")?.textContent).toBe("Phone override: S on all four sides. Desktop uses M, marked with a ring; tablets have their own, L.");

  rerender(<BlockPanel id="h1" />);
  expect(document.querySelector(".device-note")?.textContent).toBe("Editing for phone. Changes to its look apply to phones only; its words are the same everywhere.");
  openGroups("Size and color");
  expect(scopeOf("Text size")).toBe("Phone only");
  expect(fieldOf("Text size").querySelector(".override p")?.textContent).toBe("Phone override: Heading 1. Desktop and tablet use Display.");
});

test("a setting the block leaves unset checks the value in use, as the design does: None and Body for a column, the column's for its text, the desktop's on a tablet", () => {
  const kit = editorKit({ document: page(), selection: "c2" });
  const { rerender } = kit.render(<BlockPanel id="c2" />);
  openGroups("Background", "Text size and color", "Alignment");
  const checked = (label: string) => within(fieldOf(label)).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label") ?? r.textContent);
  const names = (label: string) => within(fieldOf(label)).getAllByRole("radio").map((r) => (r.getAttribute("aria-label") ?? r.textContent ?? "").split(",")[0]);
  expect(checked("Background")).toEqual(["None"]);
  expect(checked("Text size in this column")).toEqual(["Body"]);
  // The swatches in the design's order, then Slate; a column's text sizes are the design's three.
  expect(names("Background")).toEqual(["None", "Background", "Soft", "Primary", "Accent", "Text", "Muted"]);
  // Under the site's colours, the palette, the picker's tile last.
  expect(within(fieldOf("Background")).getByRole("group", { name: "Background: swatches" }).lastElementChild?.getAttribute("aria-label")).toBe("A colour of its own");
  expect(names("Text size in this column")).toEqual(["Small", "Body", "Large"]);
  expect(within(fieldOf("Alignment")).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label"))).toEqual(["Top", "Left"]);
  // Choosing the value in use sets nothing; another one sets it.
  fireEvent.click(within(fieldOf("Background")).getByRole("radio", { name: "None" }));
  expect(kit.block("c2")?.style).toEqual({ base: {} });
  fireEvent.click(within(fieldOf("Text size in this column")).getByRole("radio", { name: "Large" }));
  expect(kit.block("c2")?.style).toEqual({ base: { textSize: "large" } });

  // On a tablet the desktop's value is the one in use.
  act(() => kit.ui.setState({ preview: "tablet" }));
  expect(scopeOf("Text size in this column")).toBe("From desktop");
  expect(checked("Text size in this column")).toEqual(["Large"]);
  expect(checked("Background")).toEqual(["None"]);

  // A text takes its column's size; a heading its level's.
  act(() => kit.store.getState().select("t1"));
  rerender(<BlockPanel id="t1" />);
  openGroups("Size and color");
  expect(checked("Text size")).toEqual(["Body"]);
  act(() => kit.store.getState().select("q1"));
  rerender(<BlockPanel id="q1" />);
  openGroups("Size and color");
  expect(checked("Text size")).toEqual(["Heading 3"]);
});

test("a heading, a text or a quote may be set in the other face, its type's own checked until one is chosen", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  const { container, rerender } = kit.render(<BlockPanel id="t1" />);
  openGroups("Size and color");
  const checked = () => within(fieldOf("Typeface")).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label"));
  // Beside the text size, before the colour.
  expect(NAMES(container)).toEqual(["Text size", "Typeface", "Text color"]);
  expect(within(fieldOf("Typeface")).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Body", "Headings"]);
  expect(checked()).toEqual(["Body"]);
  // Choosing the face in use sets nothing; the other one sets it.
  fireEvent.click(within(fieldOf("Typeface")).getByRole("radio", { name: "Body" }));
  expect(kit.block("t1")?.style).toEqual({ base: {} });
  fireEvent.click(within(fieldOf("Typeface")).getByRole("radio", { name: "Headings" }));
  expect(kit.block("t1")?.style).toEqual({ base: { typeface: "heading" } });
  expect(checked()).toEqual(["Headings"]);

  // A heading is in the headings' face, a quote in the body's.
  act(() => kit.store.getState().select("h1"));
  rerender(<BlockPanel id="h1" />);
  openGroups("Size and color");
  expect(checked()).toEqual(["Headings"]);
  act(() => kit.store.getState().select("q1"));
  rerender(<BlockPanel id="q1" />);
  openGroups("Size and color");
  expect(checked()).toEqual(["Body"]);
});
