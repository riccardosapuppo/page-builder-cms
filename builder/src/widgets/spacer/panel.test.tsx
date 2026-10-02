// The spacer's panel: its height on the spacing ruler, moved by the arrow
// keys or a step, changes the page by the spacer's props command; the
// server's 422 on the size shows on the ruler.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("the ruler moves the spacer's height a step at a time", () => {
  const kit = editorKit({ document: widgetPage(), selection: "spacer" });
  kit.render(<BlockPanel id="spacer" />);
  const ruler = screen.getByRole("slider", { name: "Height" });
  expect(ruler.getAttribute("aria-valuetext")).toBe("M");
  fireEvent.keyDown(ruler, { key: "ArrowRight" });
  expect(kit.block("spacer")?.props).toEqual({ size: "l" });
  expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Changed Spacer size in Widgets" });
  fireEvent.keyDown(ruler, { key: "Home" });
  expect(kit.block("spacer")?.props).toEqual({ size: "none" });
  expect(screen.getByRole("slider", { name: "Height" }).getAttribute("aria-valuetext")).toBe("None");
});

test("the server's 422 on the size shows on the ruler", () => {
  const kit = editorKit({ document: widgetPage(), selection: "spacer" });
  kit.render(<BlockPanel id="spacer" />);
  act(() => kit.refuse("spacer", "/props/size", "enum", "is not a spacing step"));
  const ruler = screen.getByRole("slider", { name: "Height" });
  expect(ruler.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(ruler)).toContain("is not a spacing step");
});
