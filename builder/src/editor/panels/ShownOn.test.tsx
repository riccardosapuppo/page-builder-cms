// The Shown on group: hiding on tablets or phones by the style command on
// that device, stored only where it differs from the base; said closed in
// words; and on the device previewed, that the canvas leaves the block out.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { makeSetStyle } from "../../document/commands.ts";
import { BlockPanel } from "./EditPanel.tsx";
import { shownOnWords } from "./ShownOn.tsx";

test("hiding on a tablet or a phone is that device's value, and only where it differs from the base", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Shown on");
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

test("hidden on the device previewed, the group says the canvas leaves the block out", () => {
  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<BlockPanel id="heading" />);
  openGroups("Shown on");
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Hide on tablet" }));
  expect(kit.block("heading")?.style).toEqual({ base: {}, tablet: { visibility: "hidden" } });
  expect(screen.getByRole("status").textContent).toBe("Hidden on tablets: the canvas leaves it out while you preview a tablet, as a visitor’s tablet does.");
  // Shown on phones: nothing to say there.
  act(() => kit.ui.setState({ preview: "phone" }));
  expect(screen.queryByRole("status")).toBeNull();
});

test("closed, the group says on which devices the block shows", () => {
  expect(shownOnWords({ base: {} })).toBe("Every device");
  expect(shownOnWords({ base: {}, phone: { visibility: "hidden" } })).toBe("Desktop and tablet");
  expect(shownOnWords({ base: {}, tablet: { visibility: "hidden" }, phone: { visibility: "hidden" } })).toBe("Desktop only");
  expect(shownOnWords({ base: { visibility: "hidden" }, tablet: { visibility: "visible" } })).toBe("Tablet only");
  expect(shownOnWords({ base: { visibility: "hidden" } })).toBe("No device");

  const kit = editorKit({ document: widgetPage(), selection: "heading" });
  kit.render(<BlockPanel id="heading" />);
  const head = screen.getByRole("button", { name: "Shown on" });
  expect(describedText(head)).toBe("Every device");
  openGroups("Shown on");
  fireEvent.click(screen.getByRole("switch", { name: "Hide on phone" }));
  fireEvent.click(head);
  expect(describedText(head)).toBe("Desktop and tablet");
});
