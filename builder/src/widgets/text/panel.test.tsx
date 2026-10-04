// The text widget's panel: its Text group opens the text's editor on the
// canvas, with the caret at the end, and says how else to get there; the
// server's 422 on the text's document shows in the panel. The editing
// itself is the canvas's (../../editor/rich/, e2e/rich-text.spec.ts).
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("Edit on the page opens the text's editor on the canvas, the caret at the end", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  kit.render(<BlockPanel id="text" />);
  const button = screen.getByRole("button", { name: "Edit on the page" });
  expect(describedText(button)).toBe("Or click the text on the page, or press Enter with it selected. Select words to make them bold, italic or a link; Esc leaves the text.");
  expect(kit.ui.getState().editingText).toBeNull();
  fireEvent.click(button);
  expect(kit.ui.getState().editingText).toEqual({ id: "text", at: "end" });
  expect(kit.store.getState().selection).toBe("text");
  // The page itself is not touched by opening the editor.
  expect(kit.store.getState().past).toEqual([]);
});

test("while the text is written, its group lists the keys that work in it, from the keymap", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  kit.render(<BlockPanel id="text" />);
  expect(screen.queryByRole("list", { name: "While you write" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit on the page" }));
  const list = screen.getByRole("list", { name: "While you write" });
  expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["BoldCtrlB", "ItalicCtrlI", "Link the selected wordsCtrlK", "Leave the textEsc"]);
  expect(screen.queryByRole("button", { name: "Edit on the page" })).toBeNull();
  // Left, the group is as it was.
  act(() => kit.ui.setState({ editingText: null }));
  expect(screen.getByRole("button", { name: "Edit on the page" })).toBeTruthy();
});

test("the server's 422 on the text's document shows in the text's panel", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  kit.render(<BlockPanel id="text" />);
  act(() => kit.refuse("text", "/props/doc/content/0/content/0/marks/0/attrs/href", "pattern", "does not match the pattern"));
  expect(screen.getByText(/The server refused the last save of this widget/)).toBeTruthy();
  expect(screen.getByText("does not match the pattern")).toBeTruthy();
});
