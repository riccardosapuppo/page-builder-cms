// Advanced, the last group of every block's panel (./advanced.tsx): the
// block's CSS classes, typed as a person types them and kept as the page
// keeps them; its anchor on any block but a section, whose anchor is in
// Name and link; a class the theme uses, and an anchor the page has
// already, refused at their field with the rule's words, nothing kept;
// what the group says closed.
// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { advancedWords, anchorOf, classNamesOf } from "./advanced.tsx";
import { BlockPanel } from "./EditPanel.tsx";

type Kit = ReturnType<typeof editorKit>;
const own = (kit: Kit, id: string) => kit.block(id)?.props as { className?: string; anchor?: string };
const write = (field: HTMLElement, text: string) => {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
};
const advanced = (): HTMLElement => screen.getByRole("button", { name: "Advanced" }).closest<HTMLElement>(".grp")!;

test("class names are kept as the page keeps them, whatever the person types between them; an anchor without its #", () => {
  expect(classNamesOf(" .hero, big  .Lede ")).toBe("hero big Lede");
  expect(classNamesOf(" , . ")).toBe("");
  expect(anchorOf(" #prices ")).toBe("prices");
});

test("Advanced closes a widget's panel: its classes and its anchor kept, said closed, and taken out by nothing", () => {
  const kit = editorKit({ document: page(), selection: "b1" });
  kit.render(<BlockPanel id="b1" />);
  expect(groupNames().at(-1)).toBe("Advanced");
  expect(advancedWords(kit.block("b1")!)).toBe("No class or anchor");
  openGroups("Advanced");
  write(within(advanced()).getByLabelText("CSS classes"), ".join-cta, big");
  expect(own(kit, "b1").className).toBe("join-cta big");
  write(within(advanced()).getByLabelText("Anchor id"), "#cta");
  expect(own(kit, "b1").anchor).toBe("cta");
  expect(advancedWords(kit.block("b1")!)).toBe(".join-cta .big, #cta");
  write(within(advanced()).getByLabelText("CSS classes"), " ");
  expect(own(kit, "b1").className).toBeUndefined();
});

test("a class the theme uses is refused at its field, with the rule's words, and nothing is kept", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  openGroups("Advanced");
  const classes = within(advanced()).getByLabelText("CSS classes");
  write(classes, "lede Hide-desktop");
  expect(own(kit, "h1").className).toBeUndefined();
  expect(describedText(classes)).toContain("The class \"Hide-desktop\" is one the theme uses");
});

test("an anchor another block of the page has is refused at its field, and nothing is kept", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  openGroups("Advanced");
  const anchor = within(advanced()).getByLabelText("Anchor id");
  write(anchor, "join");
  expect(own(kit, "h1").anchor).toBeUndefined();
  expect(describedText(anchor)).toMatch(/already used by/);
});

test("a section's Advanced holds its classes alone: its anchor is in Name and link", () => {
  const kit = editorKit({ document: page(), selection: "join" });
  kit.render(<BlockPanel id="join" />);
  expect(groupNames().slice(-2)).toEqual(["Name and link", "Advanced"]);
  openGroups("Advanced");
  expect(within(advanced()).queryByLabelText("Anchor id")).toBeNull();
  write(within(advanced()).getByLabelText("CSS classes"), "band");
  expect(own(kit, "join").className).toBe("band");
  expect(advancedWords(kit.block("join")!)).toBe(".band");
});
