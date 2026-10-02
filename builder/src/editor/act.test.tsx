// Every command the interface runs goes one way (./act.ts): the text still
// waiting in a panel's field is handed over first, as a command of its
// own; then the command, made from the page as it is then; then the focus,
// where the command's result says: the neighbour after a delete, the new
// block after an insert or a duplicate, the block touched after an undo.
// @vitest-environment jsdom
import { act as react, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { makeDelete, makeDuplicate } from "../document/commands.ts";
import { runCommand, runRedo, runUndo } from "./act.ts";
import { Canvas } from "./Canvas.tsx";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { BlockPanel } from "./panels/EditPanel.tsx";

const focused = () => (document.activeElement as HTMLElement | null)?.dataset.blockId;

test("text still being typed goes in first, as its own command, then the command asked for", async () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  const text = screen.getByLabelText("Text");
  fireEvent.focus(text);
  fireEvent.change(text, { target: { value: "Winter swims" } });
  // No pause, no blur: the text is still the field's alone.
  expect(kit.block("h1")?.props).toMatchObject({ text: "Winter series" });
  expect(kit.ui.getState().pending.waiting).toBe(1);

  react(() => {
    runCommand(kit.env, (doc) => makeDelete(doc, "b1"), "canvas");
  });
  expect(kit.store.getState().past.map((entry) => entry.command.label)).toEqual(["Changed Heading in Hero", "Deleted Button in Hero"]);
  expect(kit.block("h1")?.props).toMatchObject({ text: "Winter swims" });
  expect(kit.ui.getState().pending.waiting).toBe(0);
  // The field's own timer finds nothing left to hand over.
  await react(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(kit.store.getState().past).toHaveLength(2);
});

test("an undo hands the waiting text over too, and undoes the command before it", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<BlockPanel id="h1" />);
  react(() => {
    runCommand(kit.env, (doc) => makeDuplicate(doc, "b1", kit.env.newId), "canvas");
  });
  const text = screen.getByLabelText("Text");
  fireEvent.focus(text);
  fireEvent.change(text, { target: { value: "Winter swims" } });
  react(() => {
    runUndo(kit.env, "canvas");
  });
  // The text was handed over, then undone: what was typed last goes first.
  expect(kit.block("h1")?.props).toMatchObject({ text: "Winter series" });
  expect(kit.store.getState().past.map((entry) => entry.command.label)).toEqual(["Duplicated Button in Hero"]);
  react(() => {
    runRedo(kit.env, "canvas");
  });
  expect(kit.block("h1")?.props).toMatchObject({ text: "Winter swims" });
});

test("the focus goes to the neighbour after a delete, the copy after a duplicate, the block touched after an undo", async () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  kit.render(<Canvas />);

  react(() => {
    runCommand(kit.env, (doc) => makeDelete(doc, "t1"), "canvas");
  });
  // The block now in its place.
  await waitFor(() => expect(focused()).toBe("b1"));
  expect(kit.store.getState().selection).toBe("b1");

  react(() => {
    runCommand(kit.env, (doc) => makeDuplicate(doc, "b1", kit.env.newId), "canvas");
  });
  await waitFor(() => expect(focused()).toBe("n1"));

  react(() => {
    runUndo(kit.env, "canvas");
  });
  // The duplicate is gone: the block where it was, its neighbour.
  await waitFor(() => expect(focused()).toBe("b1"));
  react(() => {
    runUndo(kit.env, "canvas");
  });
  // The deleted text is back, and has the focus.
  await waitFor(() => expect(focused()).toBe("t1"));
});

test("a refusal is said, and neither the page nor the focus moves", async () => {
  const kit = editorKit({ document: page(), selection: "c3" });
  kit.render(<Canvas />);
  const before = kit.doc();
  let refusal: unknown;
  react(() => {
    refusal = runCommand(kit.env, (doc) => makeDelete(doc, "c3"), "canvas");
  });
  expect(refusal).toMatchObject({ reason: "empty" });
  expect(kit.doc()).toBe(before);
  expect(kit.ui.getState().notice).toBe("Join must keep at least 1 column.");
});
