// A page as the published layout holds it (cms/app/views/layouts/public.html.erb):
// .site, the page root, carrying the site style; .sw inside it; the sections
// in main. The page's stylesheets (../shared/site.css) set their container
// queries on .site, so a root as wide as the editor's tablet or phone
// preview (../shared/preview-widths.ts: 768 and 390) lays out as a tablet
// or a phone, whatever the window's width: the canvas needs no iframe.
//
// Given the theme's parts (GET /api/site), the root draws the header above
// the sections and the footer below them, as the layout does (./theme.tsx);
// the canvas draws them locked. Without them it draws the sections alone,
// as the render contract compares them.
import type { RenderContext } from "./context.ts";
import { PageSections } from "./blocks.tsx";
import { SiteFooter, SiteHeader, type Site } from "./theme.tsx";

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
  // The page root's width in pixels (PREVIEW_WIDTHS.tablet or .phone);
  // absent, it takes the width it is given.
  width?: number;
  // A <main> landmark around the sections, as on the page; the canvas, a
  // part of the editor's own page, passes false and gets a plain block.
  landmark?: boolean;
  // The theme's header and footer, drawn around the sections; locked (inert,
  // and marked as the theme's) on the canvas.
  site?: Site | null;
  lockedTheme?: boolean;
}

export function PageRoot({ document, ctx, siteStyle, width, landmark = true, site, lockedTheme = false }: PageRootProps) {
  const sections = <PageSections document={document} ctx={ctx} />;
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)} style={width === undefined ? undefined : { width: `${width}px` }}>
      <div className="sw">
        {site && <SiteHeader site={site} locked={lockedTheme} />}
        {landmark ? <main>{sections}</main> : <div className="sw-main">{sections}</div>}
        {site && <SiteFooter site={site} locked={lockedTheme} />}
      </div>
    </div>
  );
}
