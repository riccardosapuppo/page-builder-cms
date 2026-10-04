// The Block tab's groups (design/layout/): named after what they hold, in
// the layout's order for each type; every style setting a type accepts in
// exactly one of them; closed, each says its value in words, and which
// device has values of its own; which are open is the person's, per block
// type; a value the server refused opens the group that holds it.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { BLOCK_TYPES, STYLE_KEYS_BY_TYPE } from "../../shared/document.ts";
import { BlockPanel } from "./EditPanel.tsx";
import { styleGroupKeys } from "./groups.tsx";

const head = (name: string) => screen.getByRole("button", { name });
const says = (name: string) => describedText(head(name));

test("every style setting a type accepts is in exactly one of its groups, and every style group holds one", () => {
  for (const type of BLOCK_TYPES) {
    const groups = styleGroupKeys(type);
    const held = groups.flatMap((g) => g.keys);
    const accepted = (STYLE_KEYS_BY_TYPE[type] as readonly string[]).filter((key) => key !== "visibility");
    expect([...held].sort(), type).toEqual([...accepted].sort());
    expect(new Set(held).size, type).toBe(held.length);
    for (const group of groups) expect(group.keys.length, `${type} ${group.id}`).toBeGreaterThan(0);
  }
});

test("each type's groups are named after what they hold, in the layout's order, the first one open", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  const { rerender } = kit.render(<BlockPanel id="heading" />);
  const expected: Record<string, string[]> = {
    widgets: ["Columns", "Background", "Spacing", "Shown on", "Name and link"],
    col: ["Spacing", "Background", "Text size and color", "Alignment", "Shown on"],
    heading: ["Text", "Size and color", "Alignment", "Shown on"],
    text: ["Text", "Size and color", "Alignment", "Shown on"],
    quote: ["Quote", "Size and color", "Alignment", "Shown on"],
    image: ["Image", "Shape", "Shown on"],
    button: ["Button", "Colors", "Alignment", "Shown on"],
    divider: ["Line color", "Shown on"],
    accordion: ["Questions", "Line color", "Shown on"],
    spacer: ["Height", "Shown on"],
    video: ["Video", "Shown on"],
    map: ["Map", "Shown on"],
    gallery: ["Images", "Spacing", "Shown on"],
    iconbox: ["Icon box", "Text color", "Alignment", "Shown on"],
  };
  for (const [id, names] of Object.entries(expected)) {
    rerender(<BlockPanel id={id} />);
    expect(groupNames(), id).toEqual(names);
    const open = [...document.querySelectorAll(".grp-head")].map((h) => h.getAttribute("aria-expanded"));
    expect(open, id).toEqual(names.map((_, index) => String(index === 0)));
  }
});

test("closed, a group says its value in words: the theme's in use where the block sets none, a tone by the site's name", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  const { rerender } = kit.render(<BlockPanel id="h1" />);
  expect(says("Size and color")).toBe("Display, theme color Phone differs");
  expect(says("Alignment")).toBe("Left");
  expect(says("Shown on")).toBe("Every device");
  fireEvent.click(head("Text"));
  expect(says("Text")).toBe("Winter series");
  // Open, it says nothing of its value: its settings show it.
  fireEvent.click(head("Text"));
  expect(says("Text")).toBe("");

  rerender(<BlockPanel id="b1" />);
  expect(says("Colors")).toBe("Buoy, theme text");
  rerender(<BlockPanel id="c1" />);
  fireEvent.click(head("Spacing"));
  expect(says("Spacing")).toBe("Inside M Tablet differs");
  expect(says("Background")).toBe("None");
  expect(says("Text size and color")).toBe("Body, theme color");
  expect(says("Alignment")).toBe("Top, left Tablet differs");
  rerender(<BlockPanel id="hero" />);
  fireEvent.click(head("Columns"));
  expect(says("Columns")).toBe("2, 2:1");
  expect(says("Spacing")).toBe("Above Section L");
  expect(says("Name and link")).toBe("Hero");
  rerender(<BlockPanel id="i1" />);
  expect(says("Shape")).toBe("4:3");
  rerender(<BlockPanel id="q1" />);
  expect(says("Size and color")).toBe("Heading 3, theme color");
  rerender(<BlockPanel id="g1" />);
  fireEvent.click(head("Images"));
  expect(says("Images")).toBe("2 images");
  expect(says("Spacing")).toBe("Theme default");

  // A colour the block sets is said by the site's name for its tone, with
  // a dot of it.
  rerender(<BlockPanel id="d1" />);
  fireEvent.click(screen.getByRole("radio", { name: "Primary, Sea" }));
  fireEvent.click(head("Line color"));
  expect(says("Line color")).toBe("Sea");
  expect(head("Line color").querySelector<HTMLElement>(".sum-dot")?.style.getPropertyValue("--c")).toBe("#1E5B4C");
});

test("on a tablet, a closed group says the tablet's values, or that they are the desktop's", () => {
  const kit = editorKit({ document: page(), selection: "c1" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<BlockPanel id="c1" />);
  fireEvent.click(head("Spacing"));
  // The tablet's own L, and its own centre beside the desktop's top.
  expect(says("Spacing")).toBe("Inside L Tablet differs");
  expect(says("Alignment")).toBe("Top, center Tablet differs");
  // Nothing set anywhere: the theme's, not the desktop's.
  expect(says("Background")).toBe("None");
  act(() => kit.ui.setState({ preview: "phone" }));
  // The phone has none of its own: the desktop's M.
  expect(says("Spacing")).toBe("Inside M, from desktop Tablet differs");
});

test("a group whose settings have a device's own value says so, open or closed, until Remove takes the key out", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.ui.setState({ preview: "phone" });
  kit.render(<BlockPanel id="h1" />);
  expect(within(head("Size and color")).getByText("Phone differs")).toBeTruthy();
  openGroups("Size and color");
  expect(says("Size and color")).toBe("Phone differs");
  fireEvent.click(screen.getByRole("button", { name: "Remove the phone override of Text size" }));
  expect(kit.block("h1")?.style).toEqual({ base: { textSize: "display" } });
  expect(head("Size and color").querySelector(".grp-dev")).toBeNull();
  expect(says("Size and color")).toBe("");
});

test("which groups are open is the person's, per block type: a heading's hold for the next heading, not for a text", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  const { rerender } = kit.render(<BlockPanel id="h1" />);
  fireEvent.click(head("Text"));
  openGroups("Alignment");
  expect(kit.ui.getState().openGroups).toEqual({ heading: { content: false, alignment: true } });
  rerender(<BlockPanel id="t1" />);
  expect(head("Text").getAttribute("aria-expanded")).toBe("true");
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("false");
  rerender(<BlockPanel id="h1" />);
  expect(head("Text").getAttribute("aria-expanded")).toBe("false");
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("true");
});

test("a value the server refused opens the group that holds it, until closed by hand; closed, the group and the panel say so", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("false");
  act(() => kit.refuse("h1", "/style/base/align", "enum", "is not an alignment"));
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("true");
  const alignment = screen.getByRole("radiogroup", { name: "Alignment" });
  expect(alignment.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(alignment)).toContain("is not an alignment");
  expect(screen.queryByText(/The server refused the last save/)).toBeNull();
  expect(says("Alignment")).toBe("Refused");
  // Closed by hand, it stays closed, says it holds the refusal, and the
  // refusal is listed above the groups.
  fireEvent.click(head("Alignment"));
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("false");
  expect(says("Alignment")).toBe("Left Refused");
  expect(screen.getByText(/The server refused the last save of this widget/)).toBeTruthy();
  expect(screen.getByText("is not an alignment")).toBeTruthy();
  // The person's own choice was not changed by the refusal.
  expect(kit.ui.getState().openGroups).toEqual({ heading: { alignment: false } });
  // A new refusal opens it again.
  act(() => kit.refuse("h1", "/style/base/align", "enum", "is still not an alignment"));
  expect(head("Alignment").getAttribute("aria-expanded")).toBe("true");
});

test("a group's head is a button named by the group, which says whether it is open and what it controls", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  const text = head("Text");
  expect(text.getAttribute("aria-expanded")).toBe("true");
  const body = document.getElementById(text.getAttribute("aria-controls") ?? "");
  expect(body?.contains(screen.getByLabelText("Text"))).toBe(true);
  const size = head("Size and color");
  expect(size.getAttribute("aria-expanded")).toBe("false");
  expect(size.hasAttribute("aria-controls")).toBe(false);
  act(() => size.focus());
  fireEvent.click(size);
  expect(size.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById(size.getAttribute("aria-controls") ?? "")?.querySelector("[role=radiogroup]")).toBeTruthy();
  // The head keeps the focus.
  expect(document.activeElement).toBe(size);
});
