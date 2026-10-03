// About, opened from the mark's menu: the mark, the name with the
// repository's own version, and who made it; its Close button takes the
// focus, and Escape or Close gives it back to the menu's button. The mark's
// menu is the design's: Site style, All pages, Keyboard shortcuts, About.
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { ABOUT_LINE, AboutDialog } from "./AboutDialog.tsx";
import { TopBar } from "./TopBar.tsx";

const versionOf = (path: string) => (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { version: string }).version;

test("the editor's version is the repository's", () => {
  expect(versionOf("../../package.json")).toBe(versionOf("../../../package.json"));
  expect(ABOUT_LINE).toBe(`Page Builder CMS ${versionOf("../../../package.json")} — Developed by Riccardo Sapuppo`);
});

test("About opens from the mark's menu, says the version and the author, and closes back to the menu's button", () => {
  const kit = editorKit({ document: page() });
  kit.render(<><TopBar /><AboutDialog /></>);
  const mark = screen.getByRole("button", { name: "Page Builder CMS menu" });
  fireEvent.click(mark);
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Site style", "All pages", "Keyboard shortcuts?", "About Page Builder CMS"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "About Page Builder CMS" }));

  const dialog = screen.getByRole("dialog", { name: "About" });
  expect(dialog.querySelector(".about-line")?.textContent).toBe("Page Builder CMS 0.1.0 — Developed by Riccardo Sapuppo");
  expect(dialog.querySelector("svg.logo")?.getAttribute("width")).toBe("48");
  const close = screen.getByRole("button", { name: "Close" });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(kit.ui.getState().aboutOpen).toBe(false);
  expect(document.activeElement).toBe(mark);
});
