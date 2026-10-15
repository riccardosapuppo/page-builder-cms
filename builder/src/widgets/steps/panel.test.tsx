// The steps block's panel: each step's title and text, their moves,
// removals and new steps change the page by the block's item commands, two
// steps at least and ten at most, a text keeping its line breaks; the
// server's 422 on one title shows on that title's field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

const items = (kit: ReturnType<typeof editorKit>) => (kit.block("steps")!.props as { items: unknown[] }).items;
const titles = (kit: ReturnType<typeof editorKit>) => items(kit).map((item) => (item as { title: string }).title);
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

test("steps are written, added, moved and removed one at a time", () => {
  const kit = editorKit({ document: widgetPage(), selection: "steps" });
  kit.render(<BlockPanel id="steps" />);

  const title = screen.getByLabelText("Title 1");
  fireEvent.change(title, { target: { value: "Write to us" } });
  fireEvent.blur(title);
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed step 1 in Steps in Widgets" });
  const text = screen.getByLabelText("Text 3");
  fireEvent.change(text, { target: { value: "Stay on if it suits you.\nWe swim all year." } });
  fireEvent.blur(text);
  expect(items(kit)).toEqual([
    { title: "Write to us", text: "Tell us what you would like to do and when." },
    { title: "Try it", text: "Come along once, with someone to show you how." },
    { title: "Join", text: "Stay on if it suits you.\nWe swim all year." },
  ]);

  fireEvent.click(button("Add a step"));
  expect(items(kit)[3]).toEqual({ title: "A step", text: "What happens in it." });
  expect(kit.lastCommand()?.label).toBe("Added a step to Steps in Widgets");

  fireEvent.click(button("Move step 4 up"));
  expect(titles(kit)).toEqual(["Write to us", "Try it", "A step", "Join"]);
  expect(kit.lastCommand()?.label).toBe("Moved step 4 in Steps in Widgets");

  fireEvent.click(button("Remove step 2"));
  expect(titles(kit)).toEqual(["Write to us", "A step", "Join"]);
  expect(kit.lastCommand()?.label).toBe("Removed step 2 from Steps in Widgets");
});

test("a steps block keeps two steps at least and takes ten at most", () => {
  const kit = editorKit({ document: widgetPage(), selection: "steps" });
  kit.render(<BlockPanel id="steps" />);

  fireEvent.click(button("Remove step 3"));
  expect(titles(kit)).toEqual(["Get in touch", "Try it"]);
  // Two are the fewest: neither can go, and they still move.
  expect(button("Remove step 1").disabled).toBe(true);
  expect(button("Remove step 2").disabled).toBe(true);
  expect(button("Move step 1 down").disabled).toBe(false);

  for (let count = 2; count < 10; count++) fireEvent.click(button("Add a step"));
  expect(items(kit)).toHaveLength(10);
  // Ten is the most: the panel offers no eleventh.
  expect(screen.queryByRole("button", { name: "Add a step" })).toBeNull();
  expect(button("Remove step 10").disabled).toBe(false);
});

test("the server's 422 on the first title shows on that title's field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "steps" });
  kit.render(<BlockPanel id="steps" />);
  act(() => kit.refuse("steps", "/props/items/0/title", "maxLength", "is longer than 120 characters"));
  const title = screen.getByLabelText("Title 1");
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(title)).toContain("Up to 120 characters.");
  expect(screen.getByLabelText("Text 1").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByLabelText("Title 2").getAttribute("aria-invalid")).toBeNull();
});
