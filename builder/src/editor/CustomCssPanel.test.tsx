// Custom CSS, beside Site style (./CustomCssPanel.tsx): the stylesheet
// checked after a pause in the writing, or when the field is left, and kept
// with the rest of the site style once it keeps to the site; what does not
// keep to the site said with its line, and nothing kept until it is put
// right; what waits for its pause when the panel goes, kept; a stylesheet
// whose save fails kept in its field and as a draft, to be sent again.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createStore, useStore } from "zustand";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { SiteStyle, SiteStyleChange } from "../storage/adapter.ts";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { CustomCssPanel } from "./CustomCssPanel.tsx";
import { emptySession, SessionProvider, type StyleSave } from "./session.tsx";

const style = (customCss: string): SiteStyle => ({
  palette: { primary: "site-signal" },
  typeScale: "balanced",
  letterWidth: "normal",
  customCss,
  updatedAt: null,
  kept: null,
  choices: { palette: {}, typeScales: [], letterWidths: [] },
});

function draw(start = "") {
  const changes: SiteStyleChange[] = [];
  // The session as the editor's: the style shows a change at once.
  const kit = editorKit({
    document: page(),
    session: {
      saveSiteStyle: (change) => {
        changes.push(change);
        const { kept: _kept, ...rest } = change;
        kit.ui.getState().setSiteStyle({ ...kit.ui.getState().siteStyle!, ...rest });
      },
    },
  });
  kit.ui.getState().setSiteStyle(style(start));
  const view = kit.render(<CustomCssPanel onClose={() => {}} />);
  return { kit, changes, view, field: () => screen.getByLabelText("Rules") };
}

test("the stylesheet is kept with the rest of the site style after a pause in the writing", async () => {
  const { kit, changes, field } = draw();
  fireEvent.change(field(), { target: { value: ".hero { color: red; }" } });
  expect(changes).toEqual([]);
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(changes).toEqual([{ palette: { primary: "site-signal" }, typeScale: "balanced", letterWidth: "normal", customCss: ".hero { color: red; }" }]);
  // Leaving the field with nothing new keeps nothing more.
  fireEvent.blur(field());
  expect(changes).toHaveLength(1);
});

test("what does not keep to the site is said with its line, and nothing is kept until it is put right", async () => {
  const { kit, changes, field } = draw(".a { color: red; }");
  expect((field() as HTMLTextAreaElement).value).toBe(".a { color: red; }");
  fireEvent.change(field(), { target: { value: ".a { color: red; }\n}" } });
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(changes).toEqual([]);
  expect(screen.getByText(/^Line 2: This \} closes nothing\./)).toBeTruthy();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(field(), { target: { value: ".a { color: blue; }" } });
  fireEvent.blur(field());
  expect(changes.map((change) => change.customCss)).toEqual([".a { color: blue; }"]);
  expect(screen.queryByText(/closes nothing/)).toBeNull();
});

test("what waits for its pause is held as a field's text is: what asks for the page's edits hands it over first", () => {
  const { kit, changes, field } = draw();
  fireEvent.change(field(), { target: { value: ".c { margin: 0; }" } });
  expect(kit.ui.getState().pending.waiting).toBe(1);
  act(() => {
    kit.ui.getState().pending.deliver();
  });
  expect(changes.map((change) => change.customCss)).toEqual([".c { margin: 0; }"]);
  expect(kit.ui.getState().pending.waiting).toBe(0);
});

test("what waits for its pause is kept when the panel goes", () => {
  const { changes, field, view } = draw();
  fireEvent.change(field(), { target: { value: ".b { margin: 0; }" } });
  view.unmount();
  expect(changes.map((change) => change.customCss)).toEqual([".b { margin: 0; }"]);
});

// A session whose saves the test answers, as the editor's does (App.tsx,
// saveSiteStyle): the style shown at once, put back when the save fails.
function drawSaving(start: string) {
  const changes: SiteStyleChange[] = [];
  const kit = editorKit({ document: page() });
  kit.ui.getState().setSiteStyle(style(start));
  // The style the site last kept, and how its save went.
  let kept = style(start);
  const saves = createStore<{ styleSave: StyleSave }>()(() => ({ styleSave: { phase: "idle" } }));
  function Saving() {
    const styleSave = useStore(saves, (s) => s.styleSave);
    const session = emptySession({
      styleSave,
      saveSiteStyle: (change) => {
        changes.push(change);
        const { kept: _kept, ...rest } = change;
        kit.ui.getState().setSiteStyle({ ...kit.ui.getState().siteStyle!, ...rest });
        saves.setState({ styleSave: { phase: "saving" } });
      },
    });
    return <SessionProvider value={session}><CustomCssPanel onClose={() => {}} /></SessionProvider>;
  }
  kit.render(<Saving />);
  const answer = (ok: boolean) => act(() => {
    if (ok) kept = kit.ui.getState().siteStyle!;
    else kit.ui.getState().setSiteStyle(kept);
    saves.setState({ styleSave: ok ? { phase: "saved" } : { phase: "failed", message: "Not saved, the site keeps its style as it was: the network is down." } });
  });
  return { kit, changes, answer, field: () => screen.getByLabelText("Rules") as HTMLTextAreaElement };
}

test("a stylesheet whose save fails stays in its field and as a draft, the tab's close warned, the canvas on the one kept; Try again sends it again", async () => {
  const { kit, changes, answer, field } = drawSaving(".a { color: red; }");
  fireEvent.change(field(), { target: { value: ".a { color: blue; }" } });
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(changes.map((change) => change.customCss)).toEqual([".a { color: blue; }"]);
  // On its way, it is a draft: closing the tab now warns.
  expect(kit.ui.getState().customCssDraft).toBe(".a { color: blue; }");
  answer(false);
  expect(field().value).toBe(".a { color: blue; }");
  expect(kit.ui.getState().customCssDraft).toBe(".a { color: blue; }");
  expect(kit.ui.getState().siteStyle?.customCss).toBe(".a { color: red; }");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(changes.map((change) => change.customCss)).toEqual([".a { color: blue; }", ".a { color: blue; }"]);
  answer(true);
  expect(kit.ui.getState().customCssDraft).toBeNull();
  expect(field().value).toBe(".a { color: blue; }");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});
