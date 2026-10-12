// The site's header and footer as the canvas and the demo draw them
// (./theme.tsx): each part's sections in its own element, header or
// footer, and nothing at all for a part with no section; locked on the
// canvas, inert and marked as the site's part. The blocks a header is made
// of: a menu longer than its block carries the step it folds below, as the
// CMS's does; a menu with no link has no Menu to open; a link the page's
// rules refuse is left out; a logo with a name is one link home. That the
// whole matches the CMS's layout, element for element, is
// ../../test/theme.rails.test.tsx's to show.
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import type { RenderContext } from "./context.ts";
import { SitePart, type PartKind } from "./theme.tsx";

type Raw = Record<string, unknown>;
const ctx: RenderContext = { media: () => null };
const starter = (kind: PartKind): Raw => JSON.parse(readFileSync(join(repoRoot, "cms", "config", "parts", `${kind}.json`), "utf8")) as Raw;

// The part as drawn, in an element of its own.
const drawn = (kind: PartKind, document: unknown, locked = false): HTMLElement => {
  const host = window.document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<SitePart kind={kind} document={document} ctx={ctx} locked={locked} />);
  return host;
};

// A part of one section holding these widgets in its one column.
const part = (...widgets: Raw[]): Raw => ({
  schemaVersion: 1,
  title: "Header",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: widgets }] }],
});
const menu = (...links: Array<[string, string]>): Raw => ({
  id: "m", type: "menu", props: { label: "Main", items: links.map(([label, href]) => ({ label, href })) }, children: [], style: { base: {} },
});
const DESIGN: Array<[string, string]> = [["Swims", "/#swims"], ["Gallery", "/#gallery"], ["Meet us", "/#meet"], ["Questions", "/#questions"]];

test("a part's sections are drawn in its own element, and a part with no section draws nothing, not even its element", () => {
  const header = drawn("header", starter("header")).firstElementChild!;
  expect(header.tagName).toBe("HEADER");
  expect(header.className).toBe("sw-header");
  expect([...header.querySelectorAll(":scope > [data-block-type=section]")].map((s) => s.getAttribute("data-block-id"))).toEqual(["header"]);
  const footer = drawn("footer", starter("footer")).firstElementChild!;
  expect(footer.tagName).toBe("FOOTER");
  expect(footer.className).toBe("sw-footer");
  expect(drawn("header", { ...starter("header"), sections: [] }).innerHTML).toBe("");
  expect(drawn("footer", null).innerHTML).toBe("");
});

test("locked, on the canvas, a part is inert and says it is the site's part; otherwise neither", () => {
  const locked = drawn("footer", starter("footer"), true).firstElementChild!;
  expect(locked.hasAttribute("inert")).toBe(true);
  expect(locked.getAttribute("data-theme-part")).toBe("footer");
  const open = drawn("footer", starter("footer")).firstElementChild!;
  expect(open.hasAttribute("inert")).toBe(false);
  expect(open.hasAttribute("data-theme-part")).toBe(false);
});

test("the design's four links fold in a block narrower than 360; a fifth link moves the step up", () => {
  const four = drawn("header", part(menu(...DESIGN))).querySelector(".w-menu")!;
  expect(four.getAttribute("data-fold")).toBe("360");
  expect(four.querySelector("nav")!.getAttribute("aria-label")).toBe("Main");
  expect([...four.querySelectorAll(".w-menu-links a")].map((a) => a.textContent)).toEqual(["Swims", "Gallery", "Meet us", "Questions"]);
  expect([...four.querySelectorAll(".sw-menu-sheet a")].map((a) => a.getAttribute("href"))).toEqual(["/#swims", "/#gallery", "/#meet", "/#questions"]);
  expect(four.querySelector(".w-menu-fold summary")!.textContent).toBe("Menu");
  const five = drawn("header", part(menu(...DESIGN, ["Contact", "/contact"]))).querySelector(".w-menu")!;
  expect(five.getAttribute("data-fold")).toBe("440");
});

test("a link the page's rules refuse is left out, and with no link left there is no Menu to open and nothing to fold", () => {
  const some = drawn("header", part(menu(["Run", "javascript:alert(1)"], ["Swims", "/#swims"]))).querySelector(".w-menu")!;
  expect([...some.querySelectorAll(".w-menu-links a")].map((a) => a.textContent)).toEqual(["Swims"]);
  const none = drawn("header", part(menu(["Run", "javascript:alert(1)"]))).querySelector(".w-menu")!;
  expect(none.querySelector(".w-menu-links")!.children).toHaveLength(0);
  expect(none.querySelector(".w-menu-fold")).toBeNull();
  expect(none.hasAttribute("data-fold")).toBe(false);
});

test("a logo with a name is one link home, the mark beside the name; without one, the mark alone, hidden as a whole", () => {
  const logo = (props: Raw): Element => drawn("header", part({ id: "l", type: "logo", props, children: [], style: { base: {} } })).querySelector(".w-logo")!;
  const named = logo({ name: "Slack Water" });
  expect(named.getAttribute("aria-hidden")).toBe(null);
  expect(named.querySelector("a.w-logo-link")!.getAttribute("href")).toBe("/");
  expect(named.querySelector("a.w-logo-link span")!.textContent).toBe("Slack Water");
  expect(named.querySelector("a.w-logo-link svg.sw-brand-mark")).not.toBeNull();
  const bare = logo({});
  expect(bare.getAttribute("aria-hidden"), "the block, hidden as a whole").toBe("true");
  expect(bare.querySelector("a")).toBeNull();
  expect(bare.querySelector("svg.sw-brand-mark")).not.toBeNull();
});
