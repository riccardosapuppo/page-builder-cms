// The section's and the column's panels: a section's columns and their
// widths change by the column commands, keeping every widget, and its
// label and anchor by its props command, in Name and link; a column's
// panel opens on its Spacing, which sets its space; the server's 422 shows
// on the field it names, for both.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import type { SectionBlock } from "../../shared/document.ts";
import { PART_ANCHOR } from "../../shared/validate.ts";
import { BlockPanel } from "./EditPanel.tsx";

test("a section's columns and their widths change by the column commands", () => {
  const kit = editorKit({ document: page(), selection: "hero" });
  kit.render(<BlockPanel id="hero" />);
  expect(groupNames()).toEqual(["Columns", "Background", "Spacing", "Shown on", "Name and link"]);
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
  // Closed, Columns says how many and how they share the width.
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  expect(describedText(screen.getByRole("button", { name: "Columns" }))).toBe("1, equal");
});

test("a section's label and anchor change by its props command, in Name and link", () => {
  const kit = editorKit({ document: widgetPage(), selection: "widgets" });
  kit.render(<BlockPanel id="widgets" />);
  expect(describedText(screen.getByRole("button", { name: "Name and link" }))).toBe("Widgets");
  openGroups("Name and link");
  const label = screen.getByLabelText("Section label");
  fireEvent.change(label, { target: { value: "Join" } });
  fireEvent.blur(label);
  expect(kit.block("widgets")?.props).toEqual({ label: "Join" });
  expect(kit.lastCommand()?.label).toBe("Renamed section to Join");

  const anchor = screen.getByLabelText("Anchor id");
  fireEvent.change(anchor, { target: { value: "#join" } });
  fireEvent.blur(anchor);
  expect(kit.block("widgets")?.props).toEqual({ label: "Join", anchor: "join" });
  expect(screen.getByText("Links to #join scroll to this section.")).toBeTruthy();

  fireEvent.change(anchor, { target: { value: "Join Us" } });
  fireEvent.blur(anchor);
  expect(describedText(anchor)).toContain("Lowercase letters, digits and hyphens, starting with a letter.");
  expect(kit.block("widgets")?.props).toEqual({ label: "Join", anchor: "join" });
  fireEvent.click(screen.getByRole("button", { name: "Name and link" }));
  expect(describedText(screen.getByRole("button", { name: "Name and link" }))).toBe("Join, #join");
});

test("in a header or footer, Name and link has no Anchor id, but for an anchor the section was given elsewhere, there to be cleared", () => {
  const header = { id: 7, kind: "header" as const, slug: null, home: false, published: null, revision: 0, links: { preview: "/preview/7", live: null } };
  const plain = editorKit({ document: widgetPage(), selection: "widgets", session: { current: header } });
  const first = plain.render(<BlockPanel id="widgets" />);
  openGroups("Name and link");
  expect(screen.getByLabelText("Section label")).toBeTruthy();
  expect(screen.queryByLabelText("Anchor id")).toBeNull();
  first.unmount();

  const document = widgetPage();
  document.sections[0]!.props = { label: "Widgets", anchor: "join" };
  const given = editorKit({ document, selection: "widgets", session: { current: header } });
  given.render(<BlockPanel id="widgets" />);
  openGroups("Name and link");
  const anchor = screen.getByLabelText("Anchor id");
  expect(describedText(anchor)).toContain(PART_ANCHOR);
  fireEvent.change(anchor, { target: { value: "" } });
  fireEvent.blur(anchor);
  expect(given.block("widgets")?.props).toEqual({ label: "Widgets" });
  expect(screen.queryByLabelText("Anchor id")).toBeNull();
});

test("a column's panel opens on its Spacing, whose ruler sets its space", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.render(<BlockPanel id="c1" />);
  expect(screen.getByRole("button", { name: "Spacing" }).getAttribute("aria-expanded")).toBe("true");
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

  act(() => kit.store.getState().select("c1"));
  kit.render(<BlockPanel id="c1" />);
  act(() => kit.refuse("c1", "/style/base/spaceInside", "enum", "is not a spacing step"));
  const inside = screen.getByRole("slider", { name: "Space inside" });
  expect(describedText(inside)).toContain("is not a spacing step");
});

test("the server's 422 on the anchor opens Name and link, and shows on the Anchor id field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "widgets" });
  kit.render(<BlockPanel id="widgets" />);
  expect(screen.queryByLabelText("Anchor id")).toBeNull();
  act(() => kit.refuse("widgets", "/props/anchor", "uniqueAnchor", "Another section of the page has the anchor join."));
  const anchor = screen.getByLabelText("Anchor id");
  expect(anchor.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(anchor)).toContain("Another section of the page has the anchor join.");
});
