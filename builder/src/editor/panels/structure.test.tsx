// The section's and the column's panels: a section's columns and their
// widths change by the column commands, keeping every widget; a column's
// panel says what it holds, and its Style tab sets its space; the server's
// 422 shows on the field it names, for both.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import type { SectionBlock } from "../../shared/document.ts";
import { BlockPanel } from "./EditPanel.tsx";

test("a section's columns and their widths change by the column commands", () => {
  const kit = editorKit({ document: page(), selection: "hero" });
  kit.render(<BlockPanel id="hero" />);
  expect(screen.getByRole("radio", { name: "2:1" }).getAttribute("aria-checked")).toBe("true");

  fireEvent.click(screen.getByRole("radio", { name: "3:2" }));
  expect(kit.block("hero")?.props).toMatchObject({ columnWidths: "3:2" });
  expect(kit.lastCommand()).toMatchObject({ kind: "columnWidths", label: "Set the column widths of Hero to 3:2" });

  fireEvent.click(screen.getByRole("radio", { name: "Equal" }));
  expect(kit.block("hero")?.props).not.toHaveProperty("columnWidths");

  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  const section = kit.block("hero") as SectionBlock;
  expect(section.children.map((c) => c.id)).toEqual(["c1", "c2", "n1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "columns", label: "Changed Hero to 3 columns" });
  // Three columns take the three-column presets.
  expect(screen.getByRole("radio", { name: "1:2:1" })).toBeTruthy();

  // One column keeps every widget, in the column that stays.
  fireEvent.click(screen.getByRole("radio", { name: "1" }));
  const one = kit.block("hero") as SectionBlock;
  expect(one.children).toHaveLength(1);
  expect(one.children[0]?.children.map((w) => w.id)).toEqual(["h1", "t1", "b1", "i1"]);
  expect(screen.queryByRole("radiogroup", { name: "Column widths" })).toBeNull();
});

test("a column's panel says what it holds, and its Style tab sets its space", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.render(<BlockPanel id="c1" />);
  expect(screen.getByText(/This column holds 3 widgets/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Style" }));
  const inside = screen.getByRole("slider", { name: "Space inside" });
  expect(inside.getAttribute("aria-valuetext")).toBe("M");
  fireEvent.keyDown(inside, { key: "ArrowRight" });
  expect(kit.block("c1")?.style).toMatchObject({ base: { spaceInside: "l" }, tablet: { spaceInside: "l", align: "center" } });
  expect(kit.lastCommand()).toMatchObject({ kind: "style", label: "Set Space inside to L, Column 1 in Hero" });
});

test("the server's 422 shows on the section's widths and on the column's space", () => {
  const kit = editorKit({ document: page(), selection: "hero" });
  kit.render(<BlockPanel id="hero" />);
  act(() => kit.refuse("hero", "/props/columnWidths", "enum", "is not a preset for 2 columns"));
  const widths = screen.getByRole("radiogroup", { name: "Column widths" });
  expect(widths.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(widths)).toContain("is not a preset for 2 columns");
  expect(screen.getByRole("radiogroup", { name: "Columns" }).getAttribute("aria-invalid")).toBeNull();

  act(() => {
    kit.store.getState().select("c1");
    kit.ui.getState().setPanelTab("style");
  });
  kit.render(<BlockPanel id="c1" />);
  act(() => kit.refuse("c1", "/style/base/spaceInside", "enum", "is not a spacing step"));
  const inside = screen.getByRole("slider", { name: "Space inside" });
  expect(describedText(inside)).toContain("is not a spacing step");
});
