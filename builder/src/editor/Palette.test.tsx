// The Insert drawer: its groups are labelled groups of buttons, in the
// approved layout's order; the search narrows them; a sentence says where
// a click puts a block; Enter or a click on a key adds the widget where the
// selection says and selects it; a widget that needs an image asks for it
// first; a page with no section says where widgets go; the Sections tab
// adds a ready-made section after the selection's section. A header or a
// footer holds no form: the drawer offers none there.
// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { ColumnBlock, PageDocument, SectionBlock } from "../shared/document.ts";
import { Palette } from "./Palette.tsx";

const groups = () => screen.queryAllByRole("group").filter((g) => g.closest(".drawer-body") && g.hasAttribute("aria-labelledby"));
const where = () => document.querySelector(".drawer-where")?.textContent;

test("the groups are labelled groups of buttons, in the layout's order", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Palette />);
  const named = groups().map((g) => [document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent, within(g).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)]);
  expect(named).toEqual([
    ["New section, by number of columns", ["1 column", "2 columns", "3 columns", "4 columns"]],
    ["Basic", ["Heading", "Text", "Image", "Button", "Divider", "Spacer"]],
    ["Media", ["Gallery", "Video", "Map"]],
    ["Content", ["Icon box", "Quote", "Accordion"]],
    ["Forms", ["Form"]],
    ["Site", ["Logo", "Menu"]],
  ]);
  // The search takes the focus when the drawer opens.
  expect(screen.getByRole("searchbox", { name: "Search blocks and sections" }).hasAttribute("data-autofocus")).toBe(true);
});

test("in a header or a footer the drawer offers no form, and the Site group's blocks are there", () => {
  const header = { id: 7, kind: "header" as const, slug: null, home: false, published: null, revision: 0, links: { preview: "/preview/7", live: null } };
  const kit = editorKit({ document: page(), session: { current: header } });
  kit.render(<Palette />);
  const named = groups().map((g) => document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent);
  expect(named).toEqual(["New section, by number of columns", "Basic", "Media", "Content", "Site"]);
  expect(screen.queryByRole("button", { name: "Form" })).toBeNull();
  expect(screen.getByRole("button", { name: "Logo" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
});

test("the search keeps the keys whose name or group it matches", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Palette />);
  const search = screen.getByRole("searchbox", { name: "Search blocks and sections" });
  fireEvent.change(search, { target: { value: "ACC" } });
  expect(groups().flatMap((g) => within(g).getAllByRole("button").map((b) => b.textContent))).toEqual(["Accordion"]);
  fireEvent.change(search, { target: { value: "media" } });
  expect(groups().flatMap((g) => within(g).getAllByRole("button").map((b) => b.textContent))).toEqual(["Gallery", "Video", "Map"]);
  fireEvent.change(search, { target: { value: "carousel" } });
  expect(groups()).toEqual([]);
  expect(screen.getByRole("status").textContent).toBe("No block is called “carousel”.");
  // A ready-made section's name: Blocks says the other tab has it.
  fireEvent.change(search, { target: { value: "icon boxes" } });
  expect(screen.getByRole("status").textContent).toBe("No block is called “icon boxes”. Sections has one.");
});

test("the sentence over the keys says where a click puts a block, as the selection changes", () => {
  const kit = editorKit({ document: page() });
  const { rerender } = kit.render(<Palette />);
  expect(where()).toBe("Click to add at the end of Column 1 of Join, or drag to any column.");
  kit.store.getState().select("t1");
  rerender(<Palette />);
  expect(where()).toBe("Click to add after Text in Column 1 of Hero, or drag to any column.");
  expect(document.querySelector(".drawer-where strong")?.textContent).toBe("Text");
  kit.store.getState().select("c2");
  rerender(<Palette />);
  expect(where()).toBe("Click to add after Image in Column 2 of Hero, or drag to any column.");
  kit.store.getState().select("hero");
  rerender(<Palette />);
  expect(where()).toBe("Select a column, or a block in one, to add there; or drag to any column.");
});

// A key is a button: Enter on it is its click in a browser, which jsdom
// does not do; e2e/editor.spec.ts presses Enter in Chromium.
test("a key adds the widget after the selected one and selects it", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  // The sidebar on the site style, its Page tab chosen by hand.
  kit.ui.setState({ tray: "site-style", sideTab: { tab: "page", selection: "t1" } });
  kit.render(<Palette />);
  fireEvent.click(screen.getByRole("button", { name: "Quote" }));
  const column = kit.doc().sections[0]?.children[0] as ColumnBlock;
  expect(column.children.map((w) => w.type)).toEqual(["heading", "text", "quote", "button"]);
  const added = column.children[2]!;
  expect(kit.store.getState().selection).toBe(added.id);
  expect(kit.lastCommand()).toMatchObject({ kind: "insert", label: "Added Quote to Column 1 in Hero" });
  // Its settings show in the sidebar, whose tab follows the selection.
  expect(kit.ui.getState()).toMatchObject({ tray: "edit", sideTab: null });
});

test("a section goes after the selection's section, with the columns asked for", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Palette />);
  fireEvent.click(screen.getByRole("button", { name: "3 columns" }));
  const sections = kit.doc().sections;
  expect(sections.map((s) => s.id)).toEqual(["hero", sections[1]!.id, "join"]);
  expect(sections[1]!.children).toHaveLength(3);
  expect(kit.store.getState().selection).toBe(sections[1]!.id);
});

test("Image asks for its image first, then adds it with that image", () => {
  const kit = editorKit({ document: page(), selection: "c3" });
  kit.render(<Palette />);
  fireEvent.click(screen.getByRole("button", { name: "Image" }));
  const dialog = screen.getByRole("dialog", { name: "Media library" });
  fireEvent.change(within(dialog).getByLabelText("Image address"), { target: { value: "https://images.example.org/slipway.jpg" } });
  fireEvent.change(within(dialog).getByLabelText(/^Alt text/), { target: { value: "The slipway" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add image" }));
  const column = (kit.doc().sections[1] as SectionBlock).children[0]!;
  expect(column.children.at(-1)).toMatchObject({ type: "image", props: { url: "https://images.example.org/slipway.jpg", alt: "The slipway" } });
});

test("with no section on the page, a widget says the section comes first, and nothing changes", () => {
  const empty: PageDocument = { schemaVersion: 1, title: "Empty", sections: [] };
  const kit = editorKit({ document: empty });
  kit.render(<Palette />);
  expect(where()).toBe("Blocks go inside a column: add a section first.");
  fireEvent.click(screen.getByRole("button", { name: "Heading" }));
  expect(kit.doc().sections).toEqual([]);
  expect(kit.ui.getState().notice).toBe("Widgets go inside a column, so the section comes first: add one by its number of columns.");
});

test("Sections: the arrows reach it, and a ready-made section goes after the selection's section", () => {
  const kit = editorKit({ document: page(), selection: "q1" });
  kit.render(<Palette />);
  const blocks = screen.getByRole("tab", { name: "Blocks" });
  expect(blocks.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(blocks, { key: "ArrowRight" });
  const sections = screen.getByRole("tab", { name: "Sections" });
  expect(sections.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(sections);
  const presets = screen.getByRole("group", { name: "Ready-made sections" });
  expect(within(presets).getAllByRole("button").map((b) => b.textContent)).toEqual(["Heading and intro", "Picture beside text", "Three icon boxes"]);
  fireEvent.click(within(presets).getByRole("button", { name: "Three icon boxes" }));
  const added = kit.doc().sections;
  expect(added.map((s) => s.id).slice(0, 2)).toEqual(["hero", "join"]);
  expect(added).toHaveLength(3);
  expect(added[2]!.children.map((c) => c.children.map((w) => w.type))).toEqual([["iconbox"], ["iconbox"], ["iconbox"]]);
  expect(kit.lastCommand()?.kind).toBe("insert");
});
