// The bottom line: the selection's path from the page, each step a button
// that selects it; what to press when nothing is selected, or to go inside
// a section or a column, or to finish a text being written, and where a
// section goes from the seam under the pointer; Block edges; the device in one click, a radio
// group the arrows move along, and the Alt+Shift digits; the page's width
// as the canvas lays it out, with its layout and the scale it is drawn at.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { canvasUi } from "./canvas-ui.ts";
import { EditorKeys } from "./keys.ts";
import { pathTo, StatusBar, widthWords } from "./StatusBar.tsx";

const crumbs = () => within(screen.getByRole("navigation", { name: "Selection" })).getAllByRole("button");

test("the path goes from the page to the selection, each step a button that selects it", () => {
  const kit = editorKit({ document: page(), selection: "b1" });
  kit.render(<StatusBar />);
  expect(crumbs().map((c) => c.textContent)).toEqual(["Page", "Hero", "Column 1", "Button"]);
  expect(crumbs().map((c) => c.getAttribute("aria-current"))).toEqual([null, null, null, "location"]);
  fireEvent.click(crumbs()[2]!);
  expect(kit.store.getState().selection).toBe("c1");
  expect(crumbs().map((c) => c.textContent)).toEqual(["Page", "Hero", "Column 1"]);
  // A column or a section: Alt and Down go inside it.
  expect(screen.getByRole("navigation", { name: "Selection" }).textContent).toContain("Select inside:");
  fireEvent.click(crumbs()[0]!);
  expect(kit.store.getState().selection).toBeNull();
  expect(crumbs().map((c) => c.getAttribute("aria-current"))).toEqual(["location"]);
  expect(screen.getByRole("navigation", { name: "Selection" }).textContent).toBe("PageNothing selected. Click a block, or pressDown arrow on the page.");
  expect(pathTo(kit.doc(), "nothing-here")).toEqual([]);
});

test("the line says what to do while a text is written, and where a section goes while the pointer is over a seam", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  kit.render(<StatusBar />);
  const line = () => screen.getByRole("navigation", { name: "Selection" }).textContent;
  act(() => kit.ui.setState({ editingText: { id: "t1", at: "end" } }));
  expect(line()).toBe("PageHeroColumn 1TextWriting.Esc to finish");
  act(() => kit.ui.setState({ editingText: null }));
  expect(line()).toBe("PageHeroColumn 1Text");
  act(() => kit.store.getState().select(null));
  act(() => canvasUi(kit.ui).getState().setSeam(1));
  expect(line()).toBe("PageNothing selected. Point between two sections to add one there.");
  act(() => canvasUi(kit.ui).getState().setSeam(null));
  expect(line()).toBe("PageNothing selected. Click a block, or pressDown arrow on the page.");
});

test("the device is one click, the arrows move along the three, and the Alt+Shift digits choose it from anywhere", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<div className="app"><StatusBar /><EditorKeys /></div>);
  const group = screen.getByRole("radiogroup", { name: "Look at the page on" });
  const radios = () => within(group).getAllByRole("radio");
  expect(radios().map((r) => [r.textContent, r.getAttribute("aria-checked"), r.tabIndex])).toEqual([["Desktop", "true", 0], ["Tablet768", "false", -1], ["Phone390", "false", -1]]);
  expect(radios()[1]!.getAttribute("title")).toBe("Tablet, 768 wide (Alt+Shift+2)");
  fireEvent.click(radios()[2]!);
  expect(kit.ui.getState().preview).toBe("phone");
  fireEvent.keyDown(radios()[2]!, { key: "ArrowRight" });
  expect(kit.ui.getState().preview).toBe("desktop");
  expect(document.activeElement).toBe(radios()[0]);
  fireEvent.keyDown(radios()[0]!, { key: "ArrowLeft" });
  expect(kit.ui.getState().preview).toBe("phone");
  // The chords, from the page: by the key's place, whatever sign it types.
  fireEvent.keyDown(document.body, { key: "@", code: "Digit2", altKey: true, shiftKey: true });
  expect(kit.ui.getState().preview).toBe("tablet");
  fireEvent.keyDown(document.body, { key: "!", code: "Digit1", altKey: true, shiftKey: true });
  expect(kit.ui.getState().preview).toBe("desktop");
  fireEvent.keyDown(document.body, { key: "#", code: "Digit3", altKey: true, shiftKey: true });
  expect(kit.ui.getState().preview).toBe("phone");
});

test("Block edges is a toggle; the page's width says its layout and its scale", () => {
  const kit = editorKit({ document: page() });
  kit.render(<StatusBar />);
  const edges = screen.getByRole("button", { name: "Block edges" });
  expect(edges.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(edges);
  expect(kit.ui.getState().blockEdges).toBe(true);
  expect(edges.getAttribute("aria-pressed")).toBe("true");
  act(() => kit.ui.getState().setPageView({ width: 1088, scale: 1 }));
  expect(document.querySelector(".sb-width")?.textContent).toBe("Page 1088 wide, desktop layout");
  expect(widthWords(800, 0.8125)).toBe("Page 800 wide, desktop layout, drawn at 81%");
  expect(widthWords(768, 1)).toBe("Page 768 wide, tablet layout");
  expect(widthWords(559, 1)).toBe("Page 559 wide, phone layout");
  expect(widthWords(390, 1)).toBe("Page 390 wide, phone layout");
});
