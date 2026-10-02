// The icon box's panel: its icon, from the site's set, its title and its
// text change the page by the icon box's props command; the server's 422
// on the title shows on the Title field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("icon, title and text change the icon box", () => {
  const kit = editorKit({ document: widgetPage(), selection: "iconbox" });
  kit.render(<BlockPanel id="iconbox" />);
  const icons = screen.getByRole("radiogroup", { name: "Icon" });
  expect(icons.querySelectorAll("[role=radio] svg")).toHaveLength(8);
  fireEvent.click(screen.getByRole("radio", { name: "Cup" }));
  expect(kit.block("iconbox")?.props).toMatchObject({ icon: "cup" });
  expect(kit.lastCommand()?.label).toBe("Changed Icon in Widgets");

  // The arrows move the choice along, as in any radio group.
  fireEvent.keyDown(screen.getByRole("radio", { name: "Cup" }), { key: "ArrowRight" });
  expect(kit.block("iconbox")?.props).toMatchObject({ icon: "calendar" });

  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "Winter series" } });
  fireEvent.blur(title);
  const text = screen.getByLabelText("Text");
  fireEvent.change(text, { target: { value: "Short, cold,\nand followed by tea." } });
  fireEvent.blur(text);
  expect(kit.block("iconbox")?.props).toEqual({ icon: "calendar", title: "Winter series", text: "Short, cold,\nand followed by tea." });
});

test("the server's 422 on the title shows on the Title field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "iconbox" });
  kit.render(<BlockPanel id="iconbox" />);
  act(() => kit.refuse("iconbox", "/props/title", "maxLength", "is longer than 80 characters"));
  const title = screen.getByLabelText("Title");
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(title)).toContain("Up to 80 characters.");
});
