// The heading's panel: each control changes the page through the heading's
// props command, and the server's 422 shows on the field it names.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { COMMIT_AFTER_MS } from "../../editor/controls.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("text, level and link change the heading, each by its own command", async () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);

  // Text goes in once typing pauses, as one change.
  const text = screen.getByLabelText("Text");
  fireEvent.focus(text);
  fireEvent.change(text, { target: { value: "Swim" } });
  fireEvent.change(text, { target: { value: "Swim at slack water" } });
  expect(kit.block("heading")?.props).toMatchObject({ text: "Heading" });
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.block("heading")?.props).toMatchObject({ text: "Swim at slack water" });
  expect(kit.store.getState().past).toHaveLength(1);
  expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Changed Heading in Widgets", subject: { id: "heading" } });

  fireEvent.click(screen.getByRole("radio", { name: "H1" }));
  expect(kit.block("heading")?.props).toMatchObject({ level: 1 });
  expect(kit.lastCommand()?.label).toBe("Changed Heading level in Widgets");

  const link = screen.getByLabelText("Link");
  fireEvent.change(link, { target: { value: "/join" } });
  fireEvent.blur(link);
  expect(kit.block("heading")?.props).toMatchObject({ href: "/join" });
  expect(kit.lastCommand()?.label).toBe("Changed Heading link in Widgets");

  // An empty link is no link: the key goes.
  fireEvent.change(link, { target: { value: "" } });
  fireEvent.blur(link);
  expect(kit.block("heading")?.props).not.toHaveProperty("href");
});

test("a link the rules refuse stays in the field, said as a sentence, and the page keeps the old one", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  const link = screen.getByLabelText("Link");
  fireEvent.change(link, { target: { value: "javascript:alert(1)" } });
  fireEvent.blur(link);
  expect(kit.block("heading")?.props).not.toHaveProperty("href");
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect((link as HTMLInputElement).value).toBe("javascript:alert(1)");
});

test("the server's 422 on the heading's text shows on the Text field, and on no other", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  act(() => kit.refuse("heading", "/props/text", "maxLength", "is longer than 200 characters"));
  const text = screen.getByLabelText("Text");
  expect(text.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(text)).toContain("Up to 200 characters.");
  expect(screen.getByLabelText("Link").getAttribute("aria-invalid")).toBeNull();
});
