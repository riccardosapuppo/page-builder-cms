// A page as the published layout holds it (cms/app/views/layouts/public.html.erb):
// .site, the page root, carrying the site style; .sw inside it; the sections
// in main. The page's stylesheets (../shared/site.css) set their container
// queries on .site, so a root 768 or 375 pixels wide lays out as a tablet or
// a phone, whatever the window's width: the canvas needs no iframe.
//
// The theme's header and footer are not drawn: they are the server's
// (cms/config/site.yml), the same on every page, and no API gives them.
import type { RenderContext } from "./context.ts";
import { PageSections } from "./blocks.tsx";

// The parts of the site style the page root carries, as the API gives them
// (GET /api/site-style).
export interface SiteStyleChoice {
  palette: Readonly<Record<string, string>>;
  typeScale: string;
  choices: {
    palette: Readonly<Record<string, ReadonlyArray<{ color: string }>>>;
    typeScales: ReadonlyArray<{ name: string }>;
  };
}

// data-<slot>="<tone>" for every palette slot whose tone is one of the
// slot's curated tones, and data-type-scale: tokens.css gives each tone a
// rule on that attribute, so the style reaches the page with no inline
// style. A value the choices do not list is left out, and the slot keeps
// its default tone: SiteHelper#site_style_data.
export function siteStyleAttributes(style: SiteStyleChoice | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const [slot, tones] of Object.entries(style.choices.palette)) {
    const tone = Object.hasOwn(style.palette, slot) ? style.palette[slot] : undefined;
    if (tone !== undefined && tones.some((t) => t.color === tone)) out[`data-${slot}`] = tone;
  }
  if (style.choices.typeScales.some((t) => t.name === style.typeScale)) out["data-type-scale"] = style.typeScale;
  return out;
}

interface PageRootProps {
  document: unknown;
  ctx: RenderContext;
  siteStyle?: SiteStyleChoice | null;
  // The page root's width in pixels (768 for a tablet, 375 for a phone);
  // absent, it takes the width it is given.
  width?: number;
  // A <main> landmark around the sections, as on the page; the canvas, a
  // part of the editor's own page, passes false and gets a plain block.
  landmark?: boolean;
}

export function PageRoot({ document, ctx, siteStyle, width, landmark = true }: PageRootProps) {
  const sections = <PageSections document={document} ctx={ctx} />;
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)} style={width === undefined ? undefined : { width: `${width}px` }}>
      <div className="sw">{landmark ? <main>{sections}</main> : <div className="sw-main">{sections}</div>}</div>
    </div>
  );
}
