// A new site's frame (./README.md, "A new site from a brief"): its header
// and its footer, built here from the direction (./direction.ts), never
// written freely by a model, in the site's own blocks, as the starters of
// cms/config/parts are made:
// - the header, on the background's band, one row that never stacks: the
//   site's name as a word mark (a logo with mark false) linking home, a
//   menu of the new site's pages, and the call to action as a button in
//   the primary colour, which leads to the home page's form or its first
//   section (actionOf);
// - the footer, on the text's band: the name, the tagline under it, and
//   the pages again, beside them on a wide screen and under them on a
//   tablet or a phone.
// Each is held to a part's rules by the storage as any draft is: no form
// and no anchor in either. A header that stayed at the top of the window
// keeps doing so.
import type { ColumnBlock, PageDocument, SectionBlock, WidgetBlock } from "../shared/document.ts";
import { line } from "./build.ts";

// A page of the new site as its frame links it: its title and its path.
export interface FramePage {
  title: string;
  path: string;
}

// The call to action of the header: its words and where it leads.
export interface FrameAction {
  label: string;
  href: string;
}

// A menu's link and the logo's name take 40 characters, a button's 80.
const LINK = 40;
const BUTTON = 80;
const TAGLINE = 300;

const widget = (id: string, block: Pick<WidgetBlock, "type" | "props"> & { style?: object }): WidgetBlock =>
  ({ id, type: block.type, props: block.props, children: [], style: { base: block.style ?? {} } }) as WidgetBlock;
const column = (id: string, children: WidgetBlock[]): ColumnBlock => ({ id, type: "column", props: {}, children, style: { base: { verticalAlign: "middle" } } });
const links = (pages: readonly FramePage[]) => pages.map((page) => ({ label: line(page.title, LINK) || page.path, href: page.path }));

// A frame with no page made (the new site stopped before its first) has no
// menu, a menu holding one link at least.
export function headerOf(site: { name: string; action: FrameAction; pages: readonly FramePage[]; sticky?: boolean }): PageDocument {
  const menu = site.pages.length > 0;
  const header: SectionBlock = {
    id: "header",
    type: "section",
    props: { label: "Header", columnWidths: menu ? "fit:1:fit" : "1:fit", stack: "never" },
    children: [
      column("header-brand", [widget("header-logo", { type: "logo", props: { name: line(site.name, LINK), mark: false } })]),
      ...(menu ? [column("header-links", [widget("header-menu", { type: "menu", props: { label: "Main", items: links(site.pages) }, style: { align: "right" } })])] : []),
      column("header-action", [widget("header-button", { type: "button", props: { label: line(site.action.label, BUTTON), href: site.action.href }, style: { background: "primary" } })]),
    ],
    style: { base: { background: "background" } },
  };
  return { schemaVersion: 1, title: "Header", ...(site.sticky ? { sticky: true as const } : {}), sections: [header] };
}

export function footerOf(site: { name: string; tagline: string; pages: readonly FramePage[] }): PageDocument {
  const tagline = line(site.tagline, TAGLINE);
  const brand: WidgetBlock[] = [widget("footer-logo", { type: "logo", props: { name: line(site.name, LINK), mark: false } })];
  if (tagline !== "") brand.push(widget("footer-text", { type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: tagline }] }] } }, style: { textSize: "small" } }));
  const menu = site.pages.length > 0;
  // Two columns of one width: a menu folds on the width its block is given,
  // which a column as wide as what it holds would not give it. Stacked on
  // a tablet and a phone, the menu lines up with the name.
  const footer: SectionBlock = {
    id: "footer",
    type: "section",
    props: { label: "Footer" },
    children: [
      { ...column("footer-brand", brand), style: { base: { verticalAlign: "middle", spaceBetween: "s" } } },
      ...(menu ? [column("footer-links", [{ ...widget("footer-menu", { type: "menu", props: { label: "Footer", items: links(site.pages) } }), style: { base: { align: "right" }, tablet: { align: "left" } } } as WidgetBlock])] : []),
    ],
    style: { base: { background: "text" } },
  };
  return { schemaVersion: 1, title: "Footer", sections: [footer] };
}

// Where the header's call to action leads on the home page at `path`: the
// section that holds its form, by that section's anchor, or else the page
// itself, its first section.
export function actionOf(path: string, home: PageDocument | null): string {
  const form = home?.sections.find((section) => section.children.some((col) => col.children.some((block) => block.type === "form")));
  return form?.props.anchor ? `${path}#${form.props.anchor}` : path;
}
