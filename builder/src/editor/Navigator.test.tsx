// The navigator: a tree of the page (tree, treeitem, aria-level,
// aria-expanded), in step with the selection both ways, moved through with
// the keys of the ARIA tree pattern.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { makeSetStyle } from "../document/commands.ts";
import { Navigator } from "./Navigator.tsx";

const item = (name: string) => screen.getByRole("treeitem", { name });
const rows = () => screen.getAllByRole("treeitem").map((i) => `${i.getAttribute("aria-level")} ${i.getAttribute("aria-label")}${i.hasAttribute("aria-expanded") ? ` ${i.getAttribute("aria-expanded") === "true" ? "open" : "closed"}` : ""}`);

test("the tree shows the sections closed, each with its count, and the totals", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  expect(screen.getByRole("tree", { name: "Navigator" })).toBeTruthy();
  expect(rows()).toEqual(["1 Hero closed", "1 Join closed"]);
  expect(within(item("Hero")).getByText("2 columns")).toBeTruthy();
  expect(screen.getByText("2 sections, 7 widgets")).toBeTruthy();
});

test("a block selected elsewhere opens the rows down to it and is selected here", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  act(() => kit.store.getState().select("b1"));
  expect(rows()).toEqual([
    "1 Hero open", "2 Column 1 open", "3 Heading: Winter series", "3 Text: Meet at the slipway.", "3 Button: Join", "2 Column 2 closed", "1 Join closed",
  ]);
  const button = item("Button: Join");
  expect(button.getAttribute("aria-selected")).toBe("true");
  expect(button.tabIndex).toBe(0);
  expect(screen.getAllByRole("treeitem").filter((i) => i.tabIndex === 0)).toHaveLength(1);
});

test("a row chosen here selects its block, and the arrows move along the rows shown", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  fireEvent.click(within(item("Join")).getByText("Join"));
  expect(kit.store.getState().selection).toBe("join");

  const join = item("Join");
  fireEvent.keyDown(join, { key: "ArrowRight" });
  expect(join.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(join, { key: "ArrowRight" });
  expect(kit.store.getState().selection).toBe("c3");
  expect(document.activeElement).toBe(item("Column 1"));
  fireEvent.keyDown(item("Column 1"), { key: "ArrowLeft" });
  expect(kit.store.getState().selection).toBe("join");
  fireEvent.keyDown(item("Join"), { key: "ArrowUp" });
  expect(kit.store.getState().selection).toBe("hero");
  fireEvent.keyDown(item("Hero"), { key: "End" });
  expect(kit.store.getState().selection).toBe("c3");
  fireEvent.keyDown(item("Column 1"), { key: "Home" });
  expect(kit.store.getState().selection).toBe("hero");
  // Left on an open row closes it.
  fireEvent.keyDown(item("Join"), { key: "ArrowLeft" });
  expect(item("Join").getAttribute("aria-expanded")).toBe("false");
});

test("a block hidden on some device is grayed out, and a refused one says so", () => {
  const kit = editorKit({ document: page() });
  const made = makeSetStyle(kit.doc(), "join", "phone", { visibility: "hidden" });
  if (!made.ok) throw new Error(made.error.message);
  kit.store.getState().dispatch(made.command);
  kit.store.getState().select(null);
  kit.render(<Navigator />);
  expect(item("Join").classList.contains("t-hidden")).toBe(true);
  expect(item("Hero").classList.contains("t-hidden")).toBe(false);
  act(() => kit.refuse("hero", "/props/label", "maxLength", "is too long"));
  expect(screen.getByRole("treeitem", { name: "Hero, refused by the server" })).toBeTruthy();
});

test("collapsing the navigator leaves a button that opens it again", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  fireEvent.click(screen.getByRole("button", { name: "Collapse navigator" }));
  expect(screen.queryByRole("tree")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open navigator" }));
  expect(screen.getByRole("tree")).toBeTruthy();
});
