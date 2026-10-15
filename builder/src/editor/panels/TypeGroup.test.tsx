// The Type group of a heading, a text and a quote: their own size, weight,
// letter spacing, line height and letter width over the preset (the step's
// and the face's), after Size and color. Each value is one command on the
// device previewed, said in the history's words; closed, the group says
// the values set; a value refused is marked on its field; Back to the
// preset takes the value out; a tablet's value is its own, From desktop
// until then; the weights offered and the letter width follow what the
// block's face draws.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { COMMIT_AFTER_MS } from "../controls.tsx";
import { BlockPanel } from "./EditPanel.tsx";

const head = (name: string) => screen.getByRole("button", { name });
const says = (name: string) => describedText(head(name));
const field = (label: string) => screen.getByRole("textbox", { name: label });
// Typed into a field, kept with Enter, and the field left, as a person
// moves on to the next.
const typeIn = (label: string, text: string) => {
  const box = field(label);
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
  fireEvent.blur(box);
};
const weight = () => screen.getByRole("slider", { name: "Weight" });
// A block's style on the desktop.
const baseOf = (kit: ReturnType<typeof editorKit>, id: string) => (kit.block(id)!.style as { base: Record<string, unknown> }).base;

test("a heading, a text and a quote have a Type group after Size and color, saying Preset while they set none", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  const { rerender } = kit.render(<BlockPanel id="heading" />);
  for (const id of ["heading", "text", "quote"]) {
    rerender(<BlockPanel id={id} />);
    const names = groupNames();
    expect(names.indexOf("Type"), id).toBe(names.indexOf("Size and color") + 1);
    expect(says("Type"), id).toBe("Preset");
  }
  // Nothing else has one.
  rerender(<BlockPanel id="button" />);
  expect(groupNames()).not.toContain("Type");
});

test("each value is one command on the desktop, said in the history's words, and the closed group says them", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Type");
  const style = () => baseOf(kit, "heading");

  typeIn("Size", "48");
  expect(style().fontSize).toBe("48px");
  expect(kit.lastCommand()?.label).toBe("Set Type size to 48 px, Heading in Widgets");
  // A unit chosen keeps the size, in that unit: 48 px on a page 1280 wide.
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Size: unit" })).getByRole("radio", { name: "vw" }));
  expect(style().fontSize).toBe("3.75vw");
  expect(field("Size")).toHaveProperty("value", "3.75");
  // A size typed and not kept yet is kept first, then converted: 2.5 vw is
  // 32 px, 2 rem.
  fireEvent.focus(field("Size"));
  fireEvent.change(field("Size"), { target: { value: "2.5" } });
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Size: unit" })).getByRole("radio", { name: "px" }));
  expect(style().fontSize).toBe("32px");
  expect(kit.store.getState().past.at(-2)?.command.label).toBe("Set Type size to 2.5 vw, Heading in Widgets");
  fireEvent.blur(field("Size"));
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Size: unit" })).getByRole("radio", { name: "rem" }));
  expect(style().fontSize).toBe("2rem");
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Size: unit" })).getByRole("radio", { name: "vw" }));
  expect(style().fontSize).toBe("2.5vw");

  // The weight, from the face's preset, Bold, one step up.
  expect(weight().getAttribute("aria-valuetext")).toBe("Bold, 700, the preset’s");
  fireEvent.keyDown(weight(), { key: "ArrowRight" });
  expect(style().fontWeight).toBe(800);
  expect(kit.lastCommand()?.label).toBe("Set Weight to 800, Heading in Widgets");

  typeIn("Letter spacing", "-0,02");
  expect(style().letterSpacing).toBe(-0.02);
  expect(kit.lastCommand()?.label).toBe("Set Letter spacing to \u22120.02 em, Heading in Widgets");
  typeIn("Line height", "0.95");
  typeIn("Letter width", "80");
  expect(style()).toEqual({ fontSize: "2.5vw", fontWeight: 800, letterSpacing: -0.02, lineHeight: 0.95, letterWidth: 80 });
  // Every change one step of the history, each by a command: the size
  // typed twice, its four units, the four other values.
  expect(kit.store.getState().past.length).toBe(10);

  fireEvent.click(head("Type"));
  expect(says("Type")).toBe("2.5 vw, 800, \u22120.02 em, 0.95, 80 %");
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.store.getState().past.length).toBe(10);
});

test("Back to the preset takes a value out, the field showing the preset again", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Type");
  // Unset, the scope says Preset, and the field the step's own size.
  const sizeField = field("Size").closest(".field")!;
  expect(within(sizeField as HTMLElement).getByText("Preset")).toBeTruthy();
  expect(field("Size").getAttribute("placeholder")).toMatch(/^\d+(\.\d+)?$/);
  typeIn("Line height", "1.5");
  expect(baseOf(kit, "heading")).toEqual({ lineHeight: 1.5 });
  fireEvent.click(screen.getByRole("button", { name: "Back to the preset for Line height" }));
  expect(kit.block("heading")?.style).toEqual({ base: {} });
  expect(kit.lastCommand()?.label).toBe("Cleared Line height, Heading in Widgets");
  expect(field("Line height")).toHaveProperty("value", "");
  // Emptied, a field hands over none: the same way back.
  typeIn("Line height", "1.5");
  typeIn("Line height", "");
  expect(kit.block("heading")?.style).toEqual({ base: {} });
});

test("a value refused is marked on its field, and waits there until it is put right: a size beyond its unit's range, a third decimal, what is no number, a number out of its range", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Type");
  const refused = (label: string, text: string, why: string) => {
    typeIn(label, text);
    expect(field(label).getAttribute("aria-invalid"), label).toBe("true");
    expect(describedText(field(label)), label).toContain(why);
    expect(kit.block("heading")?.style, label).toEqual({ base: {} });
    // As a refused text does, it holds the page's other changes until it is
    // put right: emptied here, nothing is kept.
    expect(kit.ui.getState().pending.waiting, label).toBe(1);
    typeIn(label, "");
    expect(field(label).getAttribute("aria-invalid"), label).toBeNull();
    expect(kit.ui.getState().pending.waiting, label).toBe(0);
  };
  refused("Size", "400", "From 8 to 320 px.");
  refused("Size", "7.5", "From 8 to 320 px.");
  refused("Letter spacing", "0.025", "Write a number, with two decimals at most.");
  refused("Letter spacing", "0.6", "From -0.1 to 0.5.");
  refused("Line height", "tall", "Write a number, with two decimals at most.");
  refused("Letter width", "130", "From 62.5 to 125.");
  // Put right, it is kept, and the field is no longer marked.
  typeIn("Size", "400");
  typeIn("Size", "40");
  expect(field("Size").getAttribute("aria-invalid")).toBeNull();
  expect(baseOf(kit, "heading").fontSize).toBe("40px");
});

test("on a tablet a value is the tablet's own, From desktop until then, and Remove takes it back to the desktop's", () => {
  const document = widgetPage();
  const kit = editorKit({ document, selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Type");
  // Unset, a unit chosen gives the step's own size in it: Heading 2 is
  // 42 px on a page 1280 wide.
  expect(field("Size").getAttribute("placeholder")).toBe("42");
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Size: unit" })).getByRole("radio", { name: "vw" }));
  expect(baseOf(kit, "heading").fontSize).toBe("3.28vw");
  typeIn("Size", "6");
  act(() => kit.ui.getState().setPreview("tablet"));
  // The desktop's size, in use, as the field's placeholder, in its unit.
  expect(field("Size")).toHaveProperty("value", "");
  expect(field("Size").getAttribute("placeholder")).toBe("6");
  const sizeField = field("Size").closest(".field") as HTMLElement;
  expect(within(sizeField).getByText("From desktop")).toBeTruthy();
  typeIn("Size", "4");
  expect(kit.block("heading")?.style).toEqual({ base: { fontSize: "6vw" }, tablet: { fontSize: "4vw" } });
  expect(kit.lastCommand()?.label).toBe("Set Type size to 4 vw on tablet, Heading in Widgets");
  expect(within(field("Size").closest(".field") as HTMLElement).getByText(/Tablet override: 4 vw/)).toBeTruthy();
  // A number's override, in its words, beside the desktop's preset.
  typeIn("Letter spacing", "0.05");
  expect(within(field("Letter spacing").closest(".field") as HTMLElement).getByText("Tablet override: +0.05 em", { exact: false }).closest("p")?.textContent).toBe("Tablet override: +0.05 em. Desktop and phone use the preset.");
  fireEvent.click(screen.getByRole("button", { name: "Remove the tablet override of Letter spacing" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove the tablet override of Size" }));
  expect(kit.block("heading")?.style).toEqual({ base: { fontSize: "6vw" } });
  act(() => kit.ui.getState().setPreview("desktop"));
  fireEvent.click(head("Type"));
  expect(says("Type")).toBe("6 vw");
});

test("the weights offered and the letter width follow what the block's face draws", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  const { rerender } = kit.render(<BlockPanel id="text" />);
  openGroups("Type");
  // A text is in the body's face, Source Serif 4: from Extra Light, at one
  // width, which the field says rather than offering a dead control.
  expect(weight().getAttribute("aria-valuetext")).toBe("Regular, 400, the preset’s");
  expect(weight().getAttribute("aria-valuemax")).toBe("7");
  expect(screen.queryByRole("textbox", { name: "Letter width" })).toBeNull();
  expect(screen.getByText(/Source Serif 4, the body’s typeface, is drawn at one width/)).toBeTruthy();
  fireEvent.keyDown(weight(), { key: "Home" });
  expect(baseOf(kit, "text").fontWeight).toBe(200);
  // In the headings' face, Archivo: every weight, and the width.
  openGroups("Size and color");
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Typeface" })).getByRole("radio", { name: "Headings" }));
  expect(weight().getAttribute("aria-valuemax")).toBe("8");
  expect(field("Letter width")).toBeTruthy();
  fireEvent.keyDown(weight(), { key: "Home" });
  expect(baseOf(kit, "text").fontWeight).toBe(100);
  // Back in the body's face, Thin is still shown, as Extra Light is drawn.
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Typeface" })).getByRole("radio", { name: "Body" }));
  expect(weight().getAttribute("aria-valuetext")).toBe("Thin, 100");
  expect(describedText(weight())).toContain("Source Serif 4 draws from Extra Light, 200: Thin is drawn as Extra Light.");
  rerender(<BlockPanel id="heading" />);
  openGroups("Type");
  expect(weight().getAttribute("aria-valuetext")).toBe("Bold, 700, the preset’s");
});

test("the arrows step a number from the one in use, and the pause keeps it, one command", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Type");
  const spacing = field("Letter spacing");
  // The headings' face is tracked -0.015 em: up one, to the hundredth above.
  expect(spacing.getAttribute("placeholder")).toBe("-0.015");
  fireEvent.focus(spacing);
  fireEvent.keyDown(spacing, { key: "ArrowUp" });
  expect(spacing).toHaveProperty("value", "-0.01");
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  expect(spacing).toHaveProperty("value", "0.09");
  const before = kit.store.getState().past.length;
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(baseOf(kit, "heading").letterSpacing).toBe(0.09);
  expect(kit.store.getState().past.length).toBe(before + 1);
  // Never past the range's end.
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  fireEvent.keyDown(spacing, { key: "ArrowUp", shiftKey: true });
  expect(spacing).toHaveProperty("value", "0.5");
});
