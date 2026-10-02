// The divider's panel: no content of its own, so its Content tab points to
// the Style tab, where its line's colour changes by the style command; the
// server's 422 on that colour shows on the Line color field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("the Content tab says where the divider's one setting is, and the Style tab sets it", () => {
  const kit = editorKit({ document: widgetPage(), selection: "divider" });
  kit.render(<BlockPanel id="divider" />);
  expect(screen.getByText(/Its color is in the Style tab/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Style" }));
  fireEvent.click(screen.getByRole("radio", { name: "Muted, Slate" }));
  expect(kit.block("divider")?.style).toEqual({ base: { color: "muted" } });
  expect(kit.lastCommand()).toMatchObject({ kind: "style", label: "Set Color to Muted, Divider in Widgets" });
});

test("the server's 422 on the divider's colour shows on the Line color field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "divider" });
  kit.ui.getState().setPanelTab("style");
  kit.render(<BlockPanel id="divider" />);
  act(() => kit.refuse("divider", "/style/base/color", "enum", "is not one of the palette's slots"));
  const group = screen.getByRole("radiogroup", { name: "Line color" });
  expect(group.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(group)).toContain("is not one of the palette's slots");
});
