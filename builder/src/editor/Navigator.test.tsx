// The Outline drawer: a tree of the page (tree, treeitem, aria-level,
// aria-expanded), in step with the selection both ways, moved through with
// the keys of the ARIA tree pattern; and the page's headings, in order.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { makeSetStyle, REMOVE } from "../document/commands.ts";
import { Navigator } from "./Navigator.tsx";

const item = (name: string) => screen.getByRole("treeitem", { name });
const rows = () => screen.getAllByRole("treeitem").map((i) => `${i.getAttribute("aria-level")} ${i.getAttribute("aria-label")}${i.hasAttribute("aria-expanded") ? ` ${i.getAttribute("aria-expanded") === "true" ? "open" : "closed"}` : ""}`);

test("the tree shows the sections closed, each with its count, and the totals", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  expect(screen.getByRole("tree", { name: "Page structure" })).toBeTruthy();
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

test("a block selected closes the rows off its path, as the design shows; one reached by the tree's arrows leaves them open", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  act(() => kit.store.getState().select("b1"));
  act(() => kit.store.getState().select("q1"));
  expect(rows()).toEqual([
    "1 Hero closed", "1 Join open", "2 Column 1 open", "3 Divider", "3 Quote: Cold, then glad.", "3 Gallery: 2 images",
  ]);
  // The arrows: the rows stay as they were, under the keys.
  fireEvent.keyDown(item("Join"), { key: "ArrowUp" });
  expect(kit.store.getState().selection).toBe("hero");
  expect(rows().slice(0, 2)).toEqual(["1 Hero closed", "1 Join open"]);
  // A click on a row: its path alone stays open.
  fireEvent.click(within(item("Join")).getByText("Join"));
  fireEvent.click(within(item("Hero")).getByText("Hero"));
  expect(rows()).toEqual(["1 Hero closed", "1 Join closed"]);
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

test("a block with values of its own on a tablet or a phone carries the device's glyph, said as the row's description", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  act(() => kit.store.getState().select("h1"));
  const flagged = () => screen.getAllByRole("treeitem").flatMap((row) => {
    const flags = row.querySelector(":scope > .t-row > .t-flags");
    return flags ? [`${row.getAttribute("aria-label")}: ${row.getAttribute("aria-describedby") === flags.id ? describedText(row) : "not described"} (${flags.querySelectorAll("svg").length})`] : [];
  });
  // Column 1 has tablet values (its space inside, its alignment), the
  // heading a phone one (its size).
  expect(flagged()).toEqual(["Column 1: Has a tablet override (1)", "Heading: Winter series: Has a phone override (1)"]);
  const both = makeSetStyle(kit.doc(), "c1", "phone", { align: "left" });
  if (!both.ok) throw new Error(both.error.message);
  act(() => {
    kit.store.getState().dispatch(both.command);
  });
  expect(flagged()[0]).toBe("Column 1: Has tablet and phone overrides (2)");
  // Its values taken back, the flag goes.
  for (const [device, key] of [["tablet", "spaceInside"], ["tablet", "align"], ["phone", "align"]] as const) {
    const back = makeSetStyle(kit.doc(), "c1", device, { [key]: REMOVE });
    if (!back.ok) throw new Error(back.error.message);
    act(() => {
      kit.store.getState().dispatch(back.command);
    });
  }
  expect(flagged()).toEqual(["Heading: Winter series: Has a phone override (1)"]);
  expect(item("Column 1").hasAttribute("aria-describedby")).toBe(false);
});

test("Headings lists the page's headings in order and by level; one chosen is selected; the arrows go back to Blocks", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  const blocks = screen.getByRole("tab", { name: "Blocks" });
  expect(blocks.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Headings" }));
  expect(screen.queryByRole("tree")).toBeNull();
  const list = screen.getByRole("list", { name: "Headings" });
  expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual(["H1Winter series"]);
  fireEvent.click(within(list).getByRole("button", { name: /Winter series/ }));
  expect(kit.store.getState().selection).toBe("h1");
  expect(within(list).getByRole("button", { name: /Winter series/ }).getAttribute("aria-current")).toBe("true");
  // The tab stop is the chosen tab; Left or Right reaches the other.
  const headings = screen.getByRole("tab", { name: "Headings" });
  expect(headings.tabIndex).toBe(0);
  fireEvent.keyDown(headings, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Blocks" }));
  expect(screen.getByRole("tree", { name: "Page structure" })).toBeTruthy();
});

test("the row the drawer gives the focus to when it opens is the tree's one Tab stop", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Navigator />);
  act(() => kit.store.getState().select("q1"));
  const marked = screen.getAllByRole("treeitem").filter((row) => row.hasAttribute("data-autofocus"));
  expect(marked.map((row) => row.getAttribute("aria-label"))).toEqual(["Quote: Cold, then glad."]);
  expect(marked[0]!.tabIndex).toBe(0);
});
