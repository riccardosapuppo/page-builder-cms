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
import { memo, useContext, useMemo } from "react";
import { OwnClassPrefix, type RenderContext } from "./context.ts";
import { canvasCss, checkCustomCss, scopedCss } from "../shared/custom-css.ts";
import { isFreeColor } from "../shared/free-colors.ts";
import { PageSections } from "./blocks.tsx";
import { freeColorsCss, freeColorsFor } from "./free-colors-css.ts";
import { freeTypeCss, freeTypeFor } from "./free-type-css.ts";
import { SitePart, type SiteParts } from "./theme.tsx";

// The parts of the site style the page root carries, as the API gives them
// (GET /api/site-style).
export interface SiteStyleChoice {
  palette: Readonly<Record<string, string>>;
  typeScale: string;
  letterWidth: string;
  // The site's own stylesheet; absent or "" for none.
  customCss?: string;
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

// The rules of the free type the documents of a page root draw
// (./free-type-css.ts), in a style element after the free colours';
// nothing when they draw none. The published page links the CMS's
// stylesheet of them instead (FreeType). Drawn again only when a document
// changes.
export const FreeTypeStyle = memo(
  function FreeTypeStyle({ documents }: { documents: readonly unknown[] }) {
    const css = freeTypeCss(freeTypeFor(documents));
    return css === "" ? null : <style data-free-type="">{css}</style>;
  },
  (a, b) => a.documents.length === b.documents.length && a.documents.every((document, at) => document === b.documents[at]),
);

// The site's own stylesheet (../shared/custom-css.ts), inside the site,
// after the free colours and the free type; nothing when there is none,
// or when it does not keep to the site. The published page links the
// CMS's /custom.css instead. On the canvas, its classes renamed as the
// canvas names them (OwnClassPrefix), and `leave`: the editor's own
// controls drawn in the page, which the rules must not reach (@scope's
// lower boundary).
export const CustomCssStyle = memo(function CustomCssStyle({ css, leave }: { css: string | undefined; leave?: string | undefined }) {
  const prefix = useContext(OwnClassPrefix);
  if (!css || checkCustomCss(css) !== null) return null;
  const scoped = scopedCss(prefix === "" ? css : canvasCss(css, prefix), leave);
  return scoped === "" ? null : <style data-custom-css="">{scoped}</style>;
});

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
  // The editor's controls in the page, which the site's custom CSS leaves
  // alone (CustomCssStyle); absent on a page a visitor sees.
  editorControls?: string;
}

export function PageRoot({ document, ctx, siteStyle, width, landmark = true, parts, lockedParts = false, editorControls }: PageRootProps) {
  const sections = <PageSections document={document} ctx={ctx} />;
  const quiet = useMemo<RenderContext>(() => ({ media: ctx.media }), [ctx.media]);
  const partCtx = lockedParts ? quiet : ctx;
  return (
    <div className="site" {...siteStyleAttributes(siteStyle)} style={width === undefined ? undefined : { width: `${width}px` }}>
      <FreeColorsStyle palette={siteStyle?.palette} documents={[document, parts?.header, parts?.footer]} />
      <FreeTypeStyle documents={[document, parts?.header, parts?.footer]} />
      <CustomCssStyle css={siteStyle?.customCss} leave={editorControls} />
      <div className="sw">
        {parts && <SitePart kind="header" document={parts.header} ctx={partCtx} locked={lockedParts} />}
        {landmark ? <main>{sections}</main> : <div className="sw-main">{sections}</div>}
        {parts && <SitePart kind="footer" document={parts.footer} ctx={partCtx} locked={lockedParts} />}
      </div>
    </div>
  );
}
