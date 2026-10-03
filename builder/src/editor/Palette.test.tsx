// The widget panel: its groups are labelled groups of buttons, in the
// approved design's order; the search narrows them; Enter or a click on a
// tile adds the widget where the selection says, selects it and shows its
// panel; a widget that needs an image asks for it first; a page with no
// section says where widgets go.
// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { ColumnBlock, PageDocument, SectionBlock } from "../shared/document.ts";
import { LeftTray } from "./LeftTray.tsx";

const groups = () => screen.queryAllByRole("group").filter((g) => g.closest(".group") && g.parentElement?.classList.contains("group"));

test("the groups are labelled groups of buttons, in the design's order", () => {
  const kit = editorKit({ document: page() });
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
  const named = groups().map((g) => [g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent, within(g).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)]);
  expect(named).toEqual([
    ["Layout", ["Section", "1 column", "2 columns", "3 columns", "4 columns"]],
    ["Basic", ["Heading", "Text", "Image", "Button", "Divider", "Spacer"]],
    ["Media", ["Gallery", "Video", "Map"]],
    ["Content", ["Icon box", "Quote", "Accordion"]],
  ]);
});

test("the search keeps the tiles whose name or group it matches", () => {
  const kit = editorKit({ document: page() });
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
  const search = screen.getByRole("searchbox", { name: "Search widgets" });
  fireEvent.change(search, { target: { value: "ACC" } });
  expect(groups().flatMap((g) => within(g).getAllByRole("button").map((b) => b.textContent))).toEqual(["Accordion"]);
  fireEvent.change(search, { target: { value: "media" } });
  expect(groups().flatMap((g) => within(g).getAllByRole("button").map((b) => b.textContent))).toEqual(["Gallery", "Video", "Map"]);
  fireEvent.change(search, { target: { value: "carousel" } });
  expect(groups()).toEqual([]);
  expect(screen.getByRole("status").textContent).toBe("No widget is called “carousel”.");
});

// A tile is a button: Enter on it is its click in a browser, which jsdom
// does not do; e2e/editor.spec.ts presses Enter in Chromium.
test("a tile adds the widget after the selected one, selects it and shows its panel", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
  fireEvent.click(screen.getByRole("button", { name: "Quote" }));
  const column = kit.doc().sections[0]?.children[0] as ColumnBlock;
  expect(column.children.map((w) => w.type)).toEqual(["heading", "text", "quote", "button"]);
  const added = column.children[2]!;
  expect(kit.store.getState().selection).toBe(added.id);
  expect(kit.lastCommand()).toMatchObject({ kind: "insert", label: "Added Quote to Column 1 in Hero" });
  expect(kit.ui.getState().tray).toBe("edit");
  expect(screen.getByRole("tab", { name: "Edit" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByLabelText("Quote")).toBeTruthy();
});

test("a section goes after the selection's section, with the columns asked for", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
  fireEvent.click(screen.getByRole("button", { name: "3 columns" }));
  const sections = kit.doc().sections;
  expect(sections.map((s) => s.id)).toEqual(["hero", sections[1]!.id, "join"]);
  expect(sections[1]!.children).toHaveLength(3);
  expect(kit.store.getState().selection).toBe(sections[1]!.id);
});

test("Image asks for its image first, then adds it with that image", () => {
  const kit = editorKit({ document: page(), selection: "c3" });
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
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
  kit.ui.getState().setTray("add");
  kit.render(<LeftTray />);
  fireEvent.click(screen.getByRole("button", { name: "Heading" }));
  expect(kit.doc().sections).toEqual([]);
  expect(kit.ui.getState().notice).toBe("Widgets go inside a column, so the section comes first: add one from Layout.");
});
