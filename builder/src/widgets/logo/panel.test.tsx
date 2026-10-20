// The logo's panel: its name, and, with a name, the site's mark beside it
// or not. Off, the name alone, a word mark (mark false); on again, the mark
// is back (no mark key). With no name there is no such switch: the mark is
// drawn alone, whatever mark says.
// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("with a name, the mark beside it is a switch: off, a word mark; on, the mark again", () => {
  const kit = editorKit({ document: widgetPage(), selection: "logo" });
  kit.render(<BlockPanel id="logo" />);
  const mark = screen.getByRole("switch", { name: "The site's mark beside it" }) as HTMLInputElement;
  expect(mark.checked).toBe(true);
  fireEvent.click(mark);
  expect(kit.block("logo")?.props).toEqual({ name: "Site name", mark: false });
  expect((screen.getByRole("switch", { name: "The site's mark beside it" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("switch", { name: "The site's mark beside it" }));
  expect(kit.block("logo")?.props).toEqual({ name: "Site name" });
});

test("with no name there is no switch: the mark stands alone", () => {
  const document = widgetPage();
  const logo = document.sections[0]!.children[0]!.children.find((block) => block.type === "logo")!;
  logo.props = {};
  const kit = editorKit({ document, selection: "logo" });
  kit.render(<BlockPanel id="logo" />);
  expect(screen.queryByRole("switch", { name: "The site's mark beside it" })).toBeNull();
});
