// The stats block's panel: each figure's value and label, their moves,
// removals and new figures change the page by the block's item commands,
// one figure at least and eight at most; the server's 422 on one value
// shows on that value's field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

const items = (kit: ReturnType<typeof editorKit>) => (kit.block("stats")!.props as { items: unknown[] }).items;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

test("figures are written, added, moved and removed one at a time", () => {
  const kit = editorKit({ document: widgetPage(), selection: "stats" });
  kit.render(<BlockPanel id="stats" />);

  const value = screen.getByLabelText("Value 1");
  fireEvent.change(value, { target: { value: "14" } });
  fireEvent.blur(value);
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed figure 1 in Stats in Widgets" });
  const label = screen.getByLabelText("Label 3");
  fireEvent.change(label, { target: { value: "Who come back for more" } });
  fireEvent.blur(label);
  expect(items(kit)).toEqual([
    { value: "14", label: "Years on the water" },
    { value: "300+", label: "Swimmers each season" },
    { value: "98%", label: "Who come back for more" },
  ]);

  fireEvent.click(button("Add a figure"));
  expect(items(kit)[3]).toEqual({ value: "100", label: "What it counts" });
  expect(kit.lastCommand()?.label).toBe("Added a figure to Stats in Widgets");

  fireEvent.click(button("Move figure 4 up"));
  expect(items(kit).map((item) => (item as { value: string }).value)).toEqual(["14", "300+", "100", "98%"]);
  expect(kit.lastCommand()?.label).toBe("Moved figure 4 in Stats in Widgets");

  fireEvent.click(button("Remove figure 2"));
  expect(items(kit).map((item) => (item as { value: string }).value)).toEqual(["14", "100", "98%"]);
  expect(kit.lastCommand()?.label).toBe("Removed figure 2 from Stats in Widgets");
});

test("a stats block keeps one figure at least and takes eight at most", () => {
  const kit = editorKit({ document: widgetPage(), selection: "stats" });
  kit.render(<BlockPanel id="stats" />);

  fireEvent.click(button("Remove figure 3"));
  fireEvent.click(button("Remove figure 2"));
  expect(items(kit)).toEqual([{ value: "12", label: "Years on the water" }]);
  // The last one cannot go, nor move anywhere.
  expect(button("Remove figure 1").disabled).toBe(true);
  expect(button("Move figure 1 up").disabled).toBe(true);
  expect(button("Move figure 1 down").disabled).toBe(true);

  for (let count = 1; count < 8; count++) fireEvent.click(button("Add a figure"));
  expect(items(kit)).toHaveLength(8);
  // Eight is the most: the panel offers no ninth.
  expect(screen.queryByRole("button", { name: "Add a figure" })).toBeNull();
  expect(button("Remove figure 8").disabled).toBe(false);
});

test("the server's 422 on the first value shows on that value's field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "stats" });
  kit.render(<BlockPanel id="stats" />);
  act(() => kit.refuse("stats", "/props/items/0/value", "maxLength", "is longer than 24 characters"));
  const value = screen.getByLabelText("Value 1");
  expect(value.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(value)).toContain("Up to 24 characters.");
  expect(screen.getByLabelText("Label 1").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByLabelText("Value 2").getAttribute("aria-invalid")).toBeNull();
});
