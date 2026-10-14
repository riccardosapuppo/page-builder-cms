// Custom CSS, beside Site style (./CustomCssPanel.tsx): the stylesheet
// checked after a pause in the writing, or when the field is left, and kept
// with the rest of the site style once it keeps to the site; what does not
// keep to the site said with its line, and nothing kept until it is put
// right; what waits for its pause when the panel goes, kept.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { SiteStyle, SiteStyleChange } from "../storage/adapter.ts";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { CustomCssPanel } from "./CustomCssPanel.tsx";

const style = (customCss: string): SiteStyle => ({
  palette: { primary: "site-signal" },
  typeScale: "balanced",
  letterWidth: "normal",
  customCss,
  updatedAt: null,
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
        kit.ui.getState().setSiteStyle({ ...kit.ui.getState().siteStyle!, ...change });
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
