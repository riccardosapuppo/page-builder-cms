// The canvas: every block of the page is a group with its role described;
// a click selects the block it falls in and draws its marks and floating
// bar there and nowhere else; the bar duplicates and deletes by their
// commands; the page's links do nothing; the width previewed narrows the
// page root; an empty page offers its first section.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import { Canvas, dimensionOf, relationOf } from "./Canvas.tsx";

const root = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

test("every block is a group whose role is described, named as the navigator names it", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  expect(screen.getByRole("main", { name: "Page canvas" })).toBeTruthy();
  const described = [...document.querySelectorAll(".canvas [data-block-id]")].map((e) => `${e.getAttribute("role")} ${e.getAttribute("aria-roledescription")} ${e.getAttribute("aria-label")}`);
  expect(described).toEqual([
    "group section Hero", "group column Column 1", "group widget Heading", "group widget Text", "group widget Button", "group column Column 2", "group widget Image",
    "group section Join", "group column Column 1", "group widget Divider", "group widget Quote", "group widget Gallery",
  ]);
  // Nothing selected: the first section is the canvas's one Tab stop.
  expect([...document.querySelectorAll<HTMLElement>(".canvas [data-block-id]")].filter((e) => e.tabIndex === 0).map((e) => e.dataset.blockId)).toEqual(["hero"]);
});

test("a click selects the block it falls in, whose marks and bar are drawn there only", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  fireEvent.click(within(root("h1")).getByText("Winter series"));
  expect(kit.store.getState().selection).toBe("h1");
  expect(kit.ui.getState().tray).toBe("edit");
  const bars = screen.getAllByRole("toolbar");
  expect(bars).toHaveLength(1);
  expect(bars[0]!.getAttribute("aria-label")).toBe("Heading");
  expect(root("h1").contains(bars[0]!)).toBe(true);
  expect(root("h1").tabIndex).toBe(0);
  // The section and the columns around the selection are outlined, its own
  // column named.
  expect(root("hero").querySelector(":scope > .ov-section")?.textContent).toBe("Hero 2 columns");
  expect(root("c1").querySelector(":scope > .ov-col")?.textContent).toBe("Column 1");
  expect(root("c2").querySelector(":scope > .ov-col")?.textContent).toBe("");
  expect(root("join").querySelector(":scope > .ov-section")).toBeNull();
});

test("the page's links do nothing on the canvas and take no focus", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  const link = root("h1").querySelector("a")!;
  expect(link.tabIndex).toBe(-1);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(kit.store.getState().selection).toBe("h1");
});

test("the bar duplicates and deletes the block by their commands", () => {
  const kit = editorKit({ document: page(), selection: "b1" });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Duplicate Button" }));
  const column = () => kit.doc().sections[0]!.children[0]!.children.map((w) => w.id);
  expect(column()).toEqual(["h1", "t1", "b1", "n1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "duplicate", label: "Duplicated Button in Hero" });
  expect(kit.store.getState().selection).toBe("n1");

  fireEvent.click(screen.getByRole("button", { name: "Delete Button" }));
  expect(column()).toEqual(["h1", "t1", "b1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "delete", label: "Deleted Button in Hero" });
  // The focus goes to the neighbour, now selected.
  expect(kit.store.getState().selection).toBe("b1");
});

test("a refusal of the bar is said, and the page stays as it was", () => {
  const kit = editorKit({ document: page(), selection: "c3" });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Column 1" }));
  expect(kit.doc().sections[1]!.children).toHaveLength(1);
  expect(kit.ui.getState().notice).toBe("Join must keep at least 1 column.");
});

test("hovering a block outlines it with its name", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  fireEvent.pointerOver(within(root("q1")).getByText("Cold, then glad."));
  expect(kit.ui.getState().hover).toBe("q1");
  expect(root("q1").querySelector(":scope > .ov-hover")?.textContent).toBe("Quote");
});

test("the width previewed is the page root's, and the rule says it", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  act(() => kit.ui.getState().setPreview("tablet"));
  expect(document.querySelector<HTMLElement>(".canvas .site")!.style.width).toBe("768px");
  expect(document.querySelector(".wrule-label")?.textContent).toBe("Tablet, 768 wide");
  expect([...document.querySelectorAll(".wrule-notch")].map((n) => n.textContent)).toEqual(["Tablet layout"]);
  act(() => kit.ui.getState().setPreview("phone"));
  expect(document.querySelector<HTMLElement>(".canvas .site")!.style.width).toBe("390px");
  expect(document.querySelectorAll(".wrule-notch")).toHaveLength(0);
});

test("an empty page offers its first section", () => {
  const empty: PageDocument = { schemaVersion: 1, title: "Spring series", sections: [] };
  const kit = editorKit({ document: empty });
  kit.render(<Canvas />);
  const offers = screen.getByRole("group", { name: "Add a section" });
  fireEvent.click(within(offers).getByRole("button", { name: "2 columns" }));
  expect(kit.doc().sections).toHaveLength(1);
  expect(kit.doc().sections[0]!.children).toHaveLength(2);
  expect(kit.lastCommand()?.label).toBe("Added a section with 2 columns");
  // Its empty columns are places to click.
  expect(screen.getAllByText("Empty column")).toHaveLength(2);
});

test("a ready-made section comes with its widgets, the page's title as its heading", () => {
  const empty: PageDocument = { schemaVersion: 1, title: "Spring series", sections: [] };
  const kit = editorKit({ document: empty });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Heading and intro" }));
  const widgets = kit.doc().sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "text", "button"]);
  expect(widgets[0]!.props).toEqual({ level: 1, text: "Spring series" });
});

test("how a block stands to the selection", () => {
  const doc = page();
  expect(relationOf(doc, "h1", "h1")).toBe("selected");
  expect(relationOf(doc, "h1", "hero")).toBe("around");
  expect(relationOf(doc, "h1", "c1")).toBe("parent");
  expect(relationOf(doc, "h1", "c2")).toBe("column");
  expect(relationOf(doc, "h1", "join")).toBeNull();
  expect(relationOf(doc, "hero", "c1")).toBeNull();
  expect(relationOf(doc, null, "hero")).toBe("entry");
});

test("the dimension line names the step the previewed device shows, with the device's glyph when it is the device's own", () => {
  // Column 1: M on every device, L of its own on tablets.
  const doc = page();
  expect(dimensionOf(doc, "c1", "desktop")).toEqual({ kind: "pad", label: "M", device: null });
  expect(dimensionOf(doc, "c1", "tablet")).toEqual({ kind: "pad", label: "L", device: "tablet" });
  // A phone shows the base, never the tablet's value: the page's phone
  // rules apply under 560 only, its tablet rules from 560 to 800.
  expect(dimensionOf(doc, "c1", "phone")).toEqual({ kind: "pad", label: "M", device: null });
  // The heading's gap below is its column's Space between, the theme's L.
  expect(dimensionOf(doc, "h1", "tablet")).toEqual({ kind: "gap", label: "L", device: null });

  const kit = editorKit({ document: doc, selection: "c1" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<Canvas />);
  const line = root("c1").querySelector(":scope > .ov-pad")!;
  expect(line.textContent).toBe("L");
  expect(line.getAttribute("data-device")).toBe("tablet");
  expect(line.querySelector("svg")).not.toBeNull();
  act(() => kit.ui.setState({ preview: "phone" }));
  const phone = root("c1").querySelector(":scope > .ov-pad")!;
  expect(phone.textContent).toBe("M");
  expect(phone.hasAttribute("data-device")).toBe(false);
});
