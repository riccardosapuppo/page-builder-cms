// A page the CMS serves, with the site style the CMS stores as it served
// it (and, below, with the site's parts as they stood), for the suites of
// the "rails" project. Those suites share one CMS,
// and the storage contract (src/storage/contract.ts), run at the same time
// by another file, changes the site style for a moment to see that it can,
// then puts it back: a page served in that moment carries the other style,
// which is no fault of the CMS. So the stored style is read before the page
// is served and after it, and the page is served again until nothing
// changed the style in between (the same updatedAt both times, which every
// change moves on); the page served then must carry that style, and a CMS
// that serves another one is seen whenever it runs.
import type { PageSummary, SiteStyle, StorageAdapter } from "../src/storage/adapter.ts";

export async function servedWithStyle<T>(adapter: Pick<StorageAdapter, "getSiteStyle">, serve: () => Promise<T>, tries = 5): Promise<{ served: T; stored: SiteStyle }> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const before = await adapter.getSiteStyle();
    const served = await serve();
    const after = await adapter.getSiteStyle();
    if (before.updatedAt === after.updatedAt) return { served, stored: after };
  }
  throw new Error(`the site style changed while the page was served, ${tries} times running`);
}

// The same for the site's header and footer: every page draws what each
// part published, or its starter, and a suite run at the same time may
// publish one (the example site's does). The page is served again until
// the parts' published versions held still around it, and comes with the
// parts as they stood.
export async function servedWithParts<T>(adapter: Pick<StorageAdapter, "listParts">, serve: () => Promise<T>, tries = 5): Promise<{ served: T; parts: PageSummary[] }> {
  const live = (parts: readonly PageSummary[]) => JSON.stringify(parts.map((part) => [part.kind, part.published?.versionNumber ?? null]));
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const before = await adapter.listParts();
    const served = await serve();
    const after = await adapter.listParts();
    if (live(before) === live(after)) return { served, parts: after };
  }
  throw new Error(`the header or footer was published while the page was served, ${tries} times running`);
}
