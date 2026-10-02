// The quote's panel: the words and who said them change the page by the
// quote's props command, an empty attribution taking the key out; the
// server's 422 on the attribution shows on its field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("the words and who said them change the quote", () => {
  const kit = editorKit({ document: widgetPage(), selection: "quote" });
  kit.render(<BlockPanel id="quote" />);
  const text = screen.getByLabelText("Quote");
  fireEvent.change(text, { target: { value: "I came for the cold water\nand stayed for the tea." } });
  fireEvent.blur(text);
  const who = screen.getByLabelText("Who said it");
  fireEvent.change(who, { target: { value: "A member since last winter" } });
  fireEvent.blur(who);
  expect(kit.block("quote")?.props).toEqual({ text: "I came for the cold water\nand stayed for the tea.", attribution: "A member since last winter" });
  expect(kit.lastCommand()?.label).toBe("Changed Quote attribution in Widgets");

  fireEvent.change(who, { target: { value: "" } });
  fireEvent.blur(who);
  expect(kit.block("quote")?.props).toEqual({ text: "I came for the cold water\nand stayed for the tea." });
});

test("the server's 422 on the attribution shows on the Who said it field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "quote" });
  kit.render(<BlockPanel id="quote" />);
  act(() => kit.refuse("quote", "/props/attribution", "pattern", "does not match the pattern"));
  const who = screen.getByLabelText("Who said it");
  expect(who.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(who)).toContain("Write at least one visible character, on one line.");
  expect(screen.getByLabelText("Quote").getAttribute("aria-invalid")).toBeNull();
});
