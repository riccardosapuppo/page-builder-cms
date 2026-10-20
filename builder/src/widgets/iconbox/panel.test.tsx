// The icon box's panel: its icon, from the site's set of forty-eight, found
// by a search, its title and its text change the page by the icon box's
// props command; the server's 422 on the title shows on the Title field.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import { ICON_NAMES, SITE_OWN_ICONS } from "../../shared/document.ts";
import { findIcons, ICON_GROUPS, ICON_LABELS, ICON_WORDS } from "./words.ts";

describe("the icons in words", () => {
  test("every icon is in one group of the picker, the site's own first, each with a name and words of its own", () => {
    const listed = ICON_GROUPS.flatMap((group) => group.icons);
    expect([...listed].sort()).toEqual([...ICON_NAMES].sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(ICON_GROUPS[0]?.icons).toEqual([...SITE_OWN_ICONS]);
    for (const icon of ICON_NAMES) {
      expect(ICON_LABELS[icon], icon).toMatch(/^[A-Z]/);
      expect(ICON_WORDS[icon], icon).toMatch(/^[a-z][^:]+: [a-z].+[^.]$/);
    }
    expect(new Set(Object.values(ICON_LABELS)).size).toBe(ICON_NAMES.length);
  });

  test("a search keeps the icons whose name or words hold every word typed, in the picker's order", () => {
    expect(findIcons("")).toHaveLength(48);
    expect(findIcons("gym")).toEqual(["dumbbell"]);
    expect(findIcons("  WEIGHTS  ")).toEqual(["dumbbell"]);
    // A group's name finds its icons.
    expect(findIcons("people")).toEqual(["user-round", "users", "baby", "accessibility", "graduation-cap", "briefcase"]);
    expect(findIcons("two people")).toEqual(["users"]);
    expect(findIcons("cardio")).toEqual(["activity", "heart-pulse"]);
    expect(findIcons("sport cardio")).toEqual(["activity", "heart-pulse"]);
    expect(findIcons("kayak")).toEqual([]);
  });
});

test("the icons are a grid of forty-eight, found by a search that keeps the icon chosen", () => {
  const kit = editorKit({ document: widgetPage(), selection: "iconbox" });
  kit.render(<BlockPanel id="iconbox" />);
  const icons = () => screen.getByRole("radiogroup", { name: "Icon" });
  expect(icons().querySelectorAll("[role=radio] svg")).toHaveLength(48);
  const chosen = within(icons()).getByRole("radio", { checked: true }).getAttribute("aria-label")!;
  const search = screen.getByRole("searchbox", { name: "Find an icon" });
  fireEvent.change(search, { target: { value: "weights" } });
  // The icon chosen stays, before what the search found.
  expect(within(icons()).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(chosen === "Dumbbell" ? ["Dumbbell"] : [chosen, "Dumbbell"]);
  fireEvent.click(within(icons()).getByRole("radio", { name: "Dumbbell" }));
  expect(kit.block("iconbox")?.props).toMatchObject({ icon: "dumbbell" });
  expect(describedText(icons())).toContain("Chosen: Dumbbell.");
  // Nothing found: the icon chosen stays alone, and the hint says so.
  fireEvent.change(search, { target: { value: "kayak" } });
  expect(within(icons()).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(["Dumbbell"]);
  expect(describedText(icons())).toContain("No other icon is called “kayak”: Dumbbell stays chosen.");
  fireEvent.change(search, { target: { value: "" } });
  expect(icons().querySelectorAll("[role=radio]")).toHaveLength(48);
});

test("icon, title and text change the icon box", () => {
  const kit = editorKit({ document: widgetPage(), selection: "iconbox" });
  kit.render(<BlockPanel id="iconbox" />);
  const icons = screen.getByRole("radiogroup", { name: "Icon" });
  expect(icons.querySelectorAll("[role=radio] svg")).toHaveLength(48);
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
