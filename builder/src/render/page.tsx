// A page as the published layout holds it (cms/app/views/layouts/public.html.erb):
// .site, the page root, carrying the site style; .sw inside it; the sections
// in main. The page's stylesheets (../shared/site.css) set their container
// queries on .site, so a root as wide as the editor's tablet or phone
// preview (../shared/preview-widths.ts: 768 and 390) lays out as a tablet
// or a phone, whatever the window's width: the canvas needs no iframe.
//
// Given the site's parts (the header and footer pages), the root draws the
// header above the sections and the footer below them, as the layout does
// (./theme.tsx); the canvas draws them locked, with nothing of the
// editor's on their blocks. Without them it draws the sections alone, as
// the render contract compares them.
import { memo, useMemo } from "react";
import type { RenderContext } from "./context.ts";
import { isFreeColor } from "../shared/free-colors.ts";
import { PageSections } from "./blocks.tsx";
import { freeColorsCss, freeColorsFor } from "./free-colors-css.ts";
import { SitePart, type SiteParts } from "./theme.tsx";

// The parts of the site style the page root carries, as the API gives them
// (GET /api/site-style).
export interface SiteStyleChoice {
  palette: Readonly<Record<string, string>>;
  typeScale: string;
  letterWidth: string;
  choices: {
    palette: Readonly<Record<string, ReadonlyArray<{ color: string }>>>;
    typeScales: ReadonlyArray<{ name: string }>;
    letterWidths: ReadonlyArray<{ name: string }>;
  };
}

// data-<slot>="<tone>" for every palette slot whose tone is one of the
// slot's curated tones, data-type-scale and data-letter-width: tokens.css
// gives each tone a
// rule on that attribute, so the style reaches the page with no inline
// style. A value the choices do not list is left out, and the slot keeps
// its default tone: SiteHelper#site_style_data.
export function siteStyleAttributes(style: SiteStyleChoice | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const [slot, tones] of Object.entries(style.choices.palette)) {
    const tone = Object.hasOwn(style.palette, slot) ? style.palette[slot] : undefined;
    if (tone !== undefined && (tones.some((t) => t.color === tone) || isFreeColor(tone))) out[`data-${slot}`] = tone;
  }
  if (style.choices.typeScales.some((t) => t.name === style.typeScale)) out["data-type-scale"] = style.typeScale;
  if (style.choices.letterWidths.some((w) => w.name === style.letterWidth)) out["data-letter-width"] = style.letterWidth;
  return out;
}

// The rules of the free colours the documents of a page root draw
// (./free-colors-css.ts), in a style element before them; nothing when they
// draw none. The published page links the CMS's stylesheet of them instead
// (FreeColors). Drawn again only when the palette or a document changes.
export const FreeColorsStyle = memo(
  function FreeColorsStyle({ palette, documents }: { palette: SiteStyleChoice["palette"] | undefined; documents: readonly unknown[] }) {
    const css = freeColorsCss(freeColorsFor(palette, documents));
    return css === "" ? null : <style data-free-colors="">{css}</style>;
  },
  (a, b) => a.palette === b.palette && a.documents.length === b.documents.length && a.documents.every((document, at) => document === b.documents[at]),
);

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
  // The site's header and footer, drawn around the sections; locked (inert,
  // and marked as the site's parts) on the canvas.
  parts?: SiteParts | null;
  lockedParts?: boolean;
}

export function PageRoot({ document, ctx, siteStyle, width, landmark = true, parts, lockedParts = false }: PageRootProps) {
  const sections = <PageSections document={document} ctx={ctx} />;
  const quiet = useMemo<RenderContext>(() => ({ media: ctx.media }), [ctx.media]);
  const partCtx = lockedParts ? quiet : ctx;
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)} style={width === undefined ? undefined : { width: `${width}px` }}>
      <FreeColorsStyle palette={siteStyle?.palette} documents={[document, parts?.header, parts?.footer]} />
      <div className="sw">
        {parts && <SitePart kind="header" document={parts.header} ctx={partCtx} locked={lockedParts} />}
        {landmark ? <main>{sections}</main> : <div className="sw-main">{sections}</div>}
        {parts && <SitePart kind="footer" document={parts.footer} ctx={partCtx} locked={lockedParts} />}
      </div>
    </div>
  );
}
