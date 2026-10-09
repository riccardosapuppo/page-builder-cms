// The notice under the page ("Published.", with a link to the page, and
// Dismiss): closing it from the keyboard must not leave the focus on the
// document, where the next Tab starts again at the top of the page. It goes
// back to the control the person came from (reached by a walk with Tab,
// where the walk set out from), else to Publish, else to the page; a focus
// that already moved on is left alone.
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { EditorProvider } from "./context.tsx";
import { Notice } from "./App.tsx";

function setUp() {
  const kit = editorKit({ document: page() });
  render(
    <EditorProvider env={kit.env}>
      <button className="split-main" type="button">Publish</button>
      <button type="button">Outline</button>
      <main className="canvas" tabIndex={-1} aria-label="Page canvas" />
      <a href="https://example.org/source">Source</a>
      <Notice />
    </EditorProvider>,
  );
  const say = () => act(() => kit.ui.getState().say("Published in this browser.", { href: "https://example.org/", label: "View published page" }));
  return { kit, say, dismiss: () => screen.getByRole("button", { name: "Dismiss" }) };
}

test("Dismiss, with Enter, gives the focus back to the control it came from", async () => {
  const { kit, say, dismiss } = setUp();
  const outline = screen.getByRole("button", { name: "Outline" });
  outline.focus();
  say();
  dismiss().focus();
  expect(document.activeElement).toBe(dismiss());
  fireEvent.click(dismiss());
  expect(kit.ui.getState().notice).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(outline));
});

test("with nowhere it came from, the focus goes to Publish, and with no Publish to the page, never to the document", async () => {
  const { say, dismiss } = setUp();
  say();
  dismiss().focus();
  fireEvent.click(dismiss());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Publish" })));
  expect(document.activeElement).not.toBe(document.body);

  document.body.innerHTML = "";
  const kit = editorKit({ document: page() });
  render(
    <EditorProvider env={kit.env}>
      <main className="canvas" tabIndex={-1} aria-label="Page canvas" />
      <Notice />
    </EditorProvider>,
  );
  act(() => kit.ui.getState().say("Published.", null));
  screen.getByRole("button", { name: "Dismiss" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Page canvas")));
});

// A step of a walk with Tab, as the browser takes it: the key goes to the
// control the focus is on, then the focus moves on to the next.
function tab(to: HTMLElement) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab" });
  to.focus();
}

test("Dismiss reached by a walk with Tab gives the focus back to where the walk set out from, not to the control that ends the page", async () => {
  const { say, dismiss } = setUp();
  const publish = screen.getByRole("button", { name: "Publish" });
  const outline = screen.getByRole("button", { name: "Outline" });
  const source = screen.getByRole("link", { name: "Source" });
  for (const key of ["Enter", " "]) {
    publish.focus();
    fireEvent.keyDown(publish, { key: "Enter" });
    say();
    tab(outline);
    // Shift alone, as for a step back, is no choice either.
    fireEvent.keyDown(outline, { key: "Shift" });
    tab(source);
    tab(screen.getByRole("link", { name: /View published page/ }));
    tab(dismiss());
    fireEvent.keyDown(dismiss(), { key });
    fireEvent.click(dismiss());
    await waitFor(() => expect(document.activeElement).toBe(publish));
  }
  // A walk that stopped on a control, where a key was pressed, set out
  // again from there.
  publish.focus();
  say();
  tab(outline);
  fireEvent.keyDown(outline, { key: "ArrowDown" });
  tab(source);
  tab(dismiss());
  fireEvent.click(dismiss());
  await waitFor(() => expect(document.activeElement).toBe(outline));
});

test("a click on Dismiss after a walk with Tab gives the focus back to where the walk stopped", async () => {
  const { say, dismiss } = setUp();
  const publish = screen.getByRole("button", { name: "Publish" });
  const outline = screen.getByRole("button", { name: "Outline" });
  publish.focus();
  say();
  tab(outline);
  fireEvent.pointerDown(dismiss());
  dismiss().focus();
  fireEvent.click(dismiss());
  await waitFor(() => expect(document.activeElement).toBe(outline));
});

test("a focus that already moved on, to a field or a button, is left where it is", async () => {
  const { say, dismiss } = setUp();
  say();
  const outline = screen.getByRole("button", { name: "Outline" });
  dismiss().focus();
  fireEvent.click(dismiss());
  outline.focus();
  await new Promise((done) => setTimeout(done, 50));
  expect(document.activeElement).toBe(outline);
});
