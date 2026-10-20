// A new site's frame (./frame.ts): the header and the footer built from the
// direction in the site's own blocks, each held to a part's rules as the
// storage holds a part's draft. The header: the name as a word mark, the
// pages in its menu in their order, the call to action in the primary
// colour, one row on the background's band; a header that stayed at the
// top of the window keeps doing so. The footer: the name, the tagline, the
// pages again, on the text's band. The call to action leads to the home
// page's form, by its section's anchor, or to its first section.
import { describe, expect, test } from "vitest";
import type { PageDocument } from "../shared/document.ts";
import { validatePart } from "../shared/validate.ts";
import { actionOf, footerOf, headerOf, type FramePage } from "./frame.ts";

const PAGES: FramePage[] = [
  { title: "Home", path: "/iron-forge" },
  { title: "Classes", path: "/classes" },
  { title: "Membership and prices for every kind of member", path: "/membership" },
];

// A part's blocks by type, in page order.
const blocks = (document: PageDocument) => document.sections.flatMap((section) => section.children.flatMap((column) => column.children));

describe("the header", () => {
  const header = headerOf({ name: "Iron Forge", action: { label: "Book a free session", href: "/iron-forge" }, pages: PAGES });

  test("a part's document, held to a part's rules", () => {
    const checked = validatePart(header);
    expect(checked.valid ? [] : checked.errors).toEqual([]);
    expect(header.sticky).toBeUndefined();
  });

  test("the name as a word mark, the pages in the menu in their order, a title cut to a link's 40 characters, and the call to action in the primary colour", () => {
    expect(blocks(header).map((block) => [block.type, block.props, block.style.base])).toEqual([
      ["logo", { name: "Iron Forge", mark: false }, {}],
      ["menu", { label: "Main", items: [
        { label: "Home", href: "/iron-forge" },
        { label: "Classes", href: "/classes" },
        { label: "Membership and prices for every kind…", href: "/membership" },
      ] }, { align: "right" }],
      ["button", { label: "Book a free session", href: "/iron-forge" }, { background: "primary" }],
    ]);
  });

  test("one row that never stacks, on the background's band", () => {
    const [section] = header.sections;
    expect(section!.props).toEqual({ label: "Header", columnWidths: "fit:1:fit", stack: "never" });
    expect(section!.style.base).toEqual({ background: "background" });
  });

  test("a header that stayed at the top of the window keeps doing so", () => {
    expect(headerOf({ name: "Iron Forge", action: { label: "Join", href: "/iron-forge" }, pages: PAGES, sticky: true }).sticky).toBe(true);
  });
});

describe("the footer", () => {
  test("the name, the tagline in small type, and the pages again, on the text's band, held to a part's rules", () => {
    const footer = footerOf({ name: "Iron Forge", tagline: "Strength, cardio and coaching under one roof", pages: PAGES });
    const checked = validatePart(footer);
    expect(checked.valid ? [] : checked.errors).toEqual([]);
    expect(blocks(footer).map((block) => block.type)).toEqual(["logo", "text", "menu"]);
    expect(blocks(footer)[1]!.props).toEqual({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Strength, cardio and coaching under one roof" }] }] } });
    expect(blocks(footer)[1]!.style.base).toEqual({ textSize: "small" });
    expect((blocks(footer)[2]!.props as { items: unknown[] }).items).toHaveLength(3);
    expect(footer.sections[0]!.style.base).toEqual({ background: "text" });
    // Two columns of one width, so the menu has the room it folds on; under
    // the name on a tablet or a phone, lined up with it.
    expect(footer.sections[0]!.props).toEqual({ label: "Footer" });
    expect(blocks(footer)[2]!.style).toEqual({ base: { align: "right" }, tablet: { align: "left" } });
  });

  test("with no tagline, no text", () => {
    expect(blocks(footerOf({ name: "Iron Forge", tagline: "  ", pages: PAGES })).map((block) => block.type)).toEqual(["logo", "menu"]);
  });
});

test("with no page made, a header and a footer with no menu, each still a part's document", () => {
  const header = headerOf({ name: "Iron Forge", action: { label: "Join", href: "/" }, pages: [] });
  const footer = footerOf({ name: "Iron Forge", tagline: "Strength", pages: [] });
  for (const part of [header, footer]) {
    const checked = validatePart(part);
    expect(checked.valid ? [] : checked.errors).toEqual([]);
  }
  expect(blocks(header).map((block) => block.type)).toEqual(["logo", "button"]);
  expect(header.sections[0]!.props.columnWidths).toBe("1:fit");
  expect(blocks(footer).map((block) => block.type)).toEqual(["logo", "text"]);
});

describe("where the call to action leads", () => {
  const page = (sections: PageDocument["sections"]): PageDocument => ({ schemaVersion: 1, title: "Home", sections });
  const section = (anchor: string | null, type: "form" | "heading") => ({
    id: `s-${type}`, type: "section" as const, props: anchor ? { anchor } : {},
    children: [{ id: `c-${type}`, type: "column" as const, props: {}, style: { base: {} }, children: [{ id: `w-${type}`, type, props: {}, children: [], style: { base: {} } }] }],
    style: { base: {} },
  }) as PageDocument["sections"][number];

  test("to the section that holds the home page's form, by its anchor", () => {
    expect(actionOf("/iron-forge", page([section(null, "heading"), section("join", "form")]))).toBe("/iron-forge#join");
  });

  test("to the home page's first section where its form's section has no anchor, or it has no form, or it was not written", () => {
    expect(actionOf("/iron-forge", page([section(null, "form")]))).toBe("/iron-forge");
    expect(actionOf("/iron-forge", page([section("top", "heading")]))).toBe("/iron-forge");
    expect(actionOf("/iron-forge", null)).toBe("/iron-forge");
  });
});
