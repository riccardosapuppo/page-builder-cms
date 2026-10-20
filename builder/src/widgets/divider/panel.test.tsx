// The divider's panel: no content of its own, so its first group is Line
// color, open, where its line's colour changes by the style command; the
// server's 422 on that colour shows on the Line color field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("the divider's one setting is its first group, Line color, which sets it", () => {
  const kit = editorKit({ document: widgetPage(), selection: "divider" });
  kit.render(<BlockPanel id="divider" />);
  expect(groupNames()).toEqual(["Line color", "Motion", "Shown on", "Advanced"]);
  expect(screen.getByRole("button", { name: "Line color" }).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "Muted, Slate" }));
  expect(kit.block("divider")?.style).toEqual({ base: { color: "muted" } });
  expect(kit.lastCommand()).toMatchObject({ kind: "style", label: "Set Color to Muted, Divider in Widgets" });
  // Closed, it says the colour by the site's name for it.
  fireEvent.click(screen.getByRole("button", { name: "Line color" }));
  expect(describedText(screen.getByRole("button", { name: "Line color" }))).toBe("Slate");
});

test("the server's 422 on the divider's colour shows on the Line color field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "divider" });
  kit.render(<BlockPanel id="divider" />);
  act(() => kit.refuse("divider", "/style/base/color", "enum", "is not one of the palette's slots"));
  const group = screen.getByRole("radiogroup", { name: "Line color" });
  expect(group.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(group)).toContain("is not one of the palette's slots");
});
