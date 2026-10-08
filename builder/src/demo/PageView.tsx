// A page as the demo shows it in a tab of its own, where the full system's
// CMS would serve it: the draft as it would be published (Preview), or the
// page as it was published in this browser (Publish). The same renderer as
// the canvas and the same markup as the CMS's page (../render/), with the
// theme's header and footer and the site style, the images from the
// browser's library.
//
// The demo serves nothing, so the page says so in one line above it, and
// what would leave for the server stays here:
// - a form is not sent: under it, one line says what the full system does
//   with its answers, and sending says it again;
// - a link to another page of the site ("/winter-series", "/") opens that
//   page as the demo draws it, published if it is, its draft if not; one
//   to a page this browser does not have says so, rather than leave for an
//   address the demo's host does not serve.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { mediaResolver } from "../editor/media.ts";
import { PUBLISHED_IN_BROWSER } from "../editor/App.tsx";
import { PageRoot } from "../render/page.tsx";
import type { Decoration, RawBlock, RenderContext } from "../render/context.ts";
import type { MediaItem, PageSummary, Site, SiteStyle, StorageAdapter } from "../storage/adapter.ts";
import { isStorageError } from "../storage/adapter.ts";
import { DemoLine } from "./DemoLine.tsx";
import { previewAddress, publishedAddress, type View } from "./views.ts";

export const PREVIEW_LINE = "The draft, as it would be published. In the full system, Rails draws this preview and never stores it.";
export const NOT_PUBLISHED_LINE = "This page is not published in this browser yet: Publish in the editor shows it here.";
export const FORM_LINE = "In the full system, Rails keeps these answers for the CMS's Form responses.";
export const FORM_NOT_SENT = "Not sent: in the full system, Rails keeps these answers for the CMS's Form responses.";

type Shown =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; document: unknown; title: string; line: string; pages: readonly PageSummary[]; site: Site; style: SiteStyle; media: ReadonlyMap<string, MediaItem> };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

async function read(adapter: StorageAdapter, view: View): Promise<Shown> {
  const [page, pages, site, style, media] = await Promise.all([
    adapter.getPage(view.pageId), adapter.listPages(), adapter.getSite(), adapter.getSiteStyle(), adapter.listMedia(),
  ]);
  const library = new Map(media.map((item) => [item.id, item]));
  if (view.kind === "preview") {
    return { kind: "ready", document: page.draft.document, title: page.draft.document.title, line: PREVIEW_LINE, pages, site, style, media: library };
  }
  if (!page.published) return { kind: "failed", message: NOT_PUBLISHED_LINE };
  const version = await adapter.getVersion(view.pageId, page.published.versionNumber);
  return { kind: "ready", document: version.document, title: version.document.title, line: PUBLISHED_IN_BROWSER, pages, site, style, media: library };
}

// The line under a form, which sending says again, as news.
function FormLine() {
  const line = useRef<HTMLParagraphElement>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const form = line.current?.parentElement?.querySelector("form");
    if (!form) return;
    // The browser checks the fields first, as on the page: only a form it
    // would send gets here.
    const hold = (event: SubmitEvent) => {
      event.preventDefault();
      setSent(true);
    };
    form.addEventListener("submit", hold);
    return () => form.removeEventListener("submit", hold);
  }, []);
  return <p ref={line} className="demo-form-line chrome" role="status">{sent ? FORM_NOT_SENT : FORM_LINE}</p>;
}

const FORM_DECORATION: Decoration = { after: <FormLine /> };
const useDecoration = (block: RawBlock): Decoration | undefined => (block.type === "form" ? FORM_DECORATION : undefined);

// The page of the site a path names, as the site's links give it: "/" for
// the home page, "/<slug>" for the others; a fragment or a query is left
// out.
export function pageAt(pages: readonly PageSummary[], href: string): PageSummary | null {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  if (path === "/" || path === "") return pages.find((page) => page.home) ?? null;
  const slug = path.replace(/^\/+|\/+$/g, "");
  return pages.find((page) => page.slug === slug || page.published?.slug === slug) ?? null;
}

export function PageView({ adapter, view }: { adapter: StorageAdapter; view: View }) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    read(adapter, view).then(
      (result) => current && setShown(result),
      (error: unknown) => current && setShown({ kind: "failed", message: `This page could not be shown: ${describe(error)}` }),
    );
    return () => {
      current = false;
    };
  }, [adapter, view]);

  useEffect(() => {
    document.body.classList.add("demo-page");
    return () => document.body.classList.remove("demo-page");
  }, []);
  useEffect(() => {
    if (shown.kind === "ready") document.title = shown.title || "Untitled page";
  }, [shown]);

  const ctx = useMemo<RenderContext | null>(() => (shown.kind === "ready" ? { media: mediaResolver(shown.media), useDecoration } : null), [shown]);

  // A link to a page of the site opens it as the demo draws it.
  const follow = (event: MouseEvent<HTMLElement>) => {
    if (shown.kind !== "ready" || event.defaultPrevented || event.button !== 0) return;
    const link = (event.target as Element).closest?.("a[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    const page = pageAt(shown.pages, href);
    if (!page) {
      setSaid(`There is no page at ${href.split(/[?#]/, 1)[0]} in this browser.`);
      return;
    }
    // The section the link names comes along ("/#swims"): on the page
    // shown, the browser only scrolls to it.
    const fragment = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    window.location.assign(new URL((page.published ? publishedAddress(page.id) : previewAddress(page.id)) + fragment, window.location.href).href);
  };

  return (
    <>
      <aside className="demo-bar chrome" aria-label="About this page">
        <p>{shown.kind === "ready" ? shown.line : shown.kind === "failed" ? shown.message : "Opening the page…"}</p>
        <p className="demo-bar-said" role="status">{said}</p>
      </aside>
      {shown.kind === "ready" && ctx && (
        <div onClick={follow}>
          <PageRoot document={shown.document} ctx={ctx} siteStyle={shown.style} site={shown.site} />
        </div>
      )}
      <DemoLine />
    </>
  );
}
