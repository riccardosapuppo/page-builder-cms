// The text widget's panel: plain paragraphs written in the panel become
// the widget's document by its props command; formatted text is kept until
// the person chooses to edit it as plain text; the server's 422 on the
// document shows on the Text field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { makeSetProps } from "../../document/commands.ts";
import type { Json } from "../../document/json.ts";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import type { TextProps } from "../../shared/document.ts";
import { plainText } from "./plain.ts";

test("paragraphs and line breaks written in the panel become the text's document", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  kit.render(<BlockPanel id="text" />);
  const field = screen.getByLabelText("Text");
  expect((field as HTMLTextAreaElement).value).toBe("Text");
  fireEvent.change(field, { target: { value: "Meet at the slipway.\nBring tea.\n\nSwims start at slack water." } });
  fireEvent.blur(field);
  expect(kit.block("text")?.props).toEqual({
    doc: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Meet at the slipway." }, { type: "hardBreak" }, { type: "text", text: "Bring tea." }] },
        { type: "paragraph", content: [{ type: "text", text: "Swims start at slack water." }] },
      ],
    },
  });
  expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Changed Text in Widgets" });
});

test("formatted text is kept as it is until the person edits it as plain text", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  const formatted = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold", marks: [{ type: "bold" }] }, { type: "text", text: " water." }] }] };
  const made = makeSetProps(kit.doc(), "text", { doc: formatted as unknown as Json });
  if (!made.ok) throw new Error(made.error.message);
  kit.store.getState().dispatch(made.command);
  kit.render(<BlockPanel id="text" />);

  expect(screen.queryByLabelText("Text")).toBeNull();
  expect(screen.getByText("Cold").tagName).toBe("STRONG");
  fireEvent.click(screen.getByRole("button", { name: "Edit as plain text" }));
  const field = screen.getByLabelText("Text");
  expect((field as HTMLTextAreaElement).value).toBe("Cold water.");
  // Leaving the field unchanged changes nothing.
  fireEvent.blur(field);
  expect(plainText((kit.block("text")!.props as TextProps).doc)).toBeNull();
  fireEvent.change(field, { target: { value: "Cold water, warm tea." } });
  fireEvent.blur(field);
  expect(plainText((kit.block("text")!.props as TextProps).doc)).toBe("Cold water, warm tea.");
});

test("the server's 422 on the text's document shows on the Text field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "text" });
  kit.render(<BlockPanel id="text" />);
  act(() => kit.refuse("text", "/props/doc", "pattern", "does not match the pattern"));
  const field = screen.getByLabelText("Text");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(field)).toContain("Write at least one visible character.");
});
