// The button's panel: its text and its link change the page by the
// button's props command; the server's 422 shows on the field it names.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("text and link change the button", () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  const text = screen.getByLabelText("Text");
  fireEvent.change(text, { target: { value: "Join a trial swim" } });
  fireEvent.keyDown(text, { key: "Enter" });
  expect(kit.block("button")?.props).toEqual({ label: "Join a trial swim", href: "#" });
  expect(kit.lastCommand()?.label).toBe("Changed Button text in Widgets");

  const link = screen.getByLabelText("Link");
  fireEvent.change(link, { target: { value: " #join " } });
  fireEvent.blur(link);
  expect(kit.block("button")?.props).toEqual({ label: "Join a trial swim", href: "#join" });
  expect(kit.lastCommand()?.label).toBe("Changed Button link in Widgets");
});

test("a button needs its text: an empty one is refused on the field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  const text = screen.getByLabelText("Text");
  fireEvent.change(text, { target: { value: "   " } });
  fireEvent.blur(text);
  expect(kit.block("button")?.props).toMatchObject({ label: "Button" });
  expect(describedText(text)).toContain("Write at least one visible character, on one line.");
});

test("the server's 422 on the button's link shows on the Link field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "button" });
  kit.render(<BlockPanel id="button" />);
  act(() => kit.refuse("button", "/props/href", "pattern", "does not match the pattern"));
  const link = screen.getByLabelText("Link");
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect(screen.getByLabelText("Text").getAttribute("aria-invalid")).toBeNull();
});
