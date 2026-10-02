// The Advanced tab: the section's label and anchor by the props command,
// and hiding on tablets or phones by the style command on that device,
// stored only where it differs from the base; the server's 422 on the
// anchor shows on the Anchor id field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { makeSetStyle } from "../../document/commands.ts";
import { BlockPanel } from "./EditPanel.tsx";

test("a section's label and anchor change by its props command", () => {
  const kit = editorKit({ document: widgetPage(), selection: "widgets" });
  kit.ui.getState().setPanelTab("advanced");
  kit.render(<BlockPanel id="widgets" />);
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
});

test("hiding on a tablet or a phone is that device's value, and only where it differs from the base", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.ui.getState().setPanelTab("advanced");
  kit.render(<BlockPanel id="heading" />);
  fireEvent.click(screen.getByRole("switch", { name: "Hide on phone" }));
  expect(kit.block("heading")?.style).toEqual({ base: {}, phone: { visibility: "hidden" } });
  expect(kit.lastCommand()).toMatchObject({ kind: "style", label: "Set Visibility to Hidden on phone, Heading in Widgets" });
  fireEvent.click(screen.getByRole("switch", { name: "Hide on phone" }));
  expect(kit.block("heading")?.style).toEqual({ base: {} });

  // Hidden everywhere by its base: showing it on tablets is a tablet value.
  const made = makeSetStyle(kit.doc(), "heading", "base", { visibility: "hidden" });
  if (!made.ok) throw new Error(made.error.message);
  act(() => {
    kit.store.getState().dispatch(made.command);
  });
  const tablet = screen.getByRole("switch", { name: "Hide on tablet" }) as HTMLInputElement;
  expect(tablet.checked).toBe(true);
  fireEvent.click(tablet);
  expect(kit.block("heading")?.style).toEqual({ base: { visibility: "hidden" }, tablet: { visibility: "visible" } });
});

test("the server's 422 on the anchor shows on the Anchor id field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "widgets" });
  kit.ui.getState().setPanelTab("advanced");
  kit.render(<BlockPanel id="widgets" />);
  act(() => kit.refuse("widgets", "/props/anchor", "uniqueAnchor", "Another section of the page has the anchor join."));
  const anchor = screen.getByLabelText("Anchor id");
  expect(anchor.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(anchor)).toContain("Another section of the page has the anchor join.");
});
