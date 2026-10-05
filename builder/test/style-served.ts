// A page the CMS serves, with the site style the CMS stores as it served
// it, for the suites of the "rails" project. Those suites share one CMS,
// and the storage contract (src/storage/contract.ts), run at the same time
// by another file, changes the site style for a moment to see that it can,
// then puts it back: a page served in that moment carries the other style,
// which is no fault of the CMS. So the stored style is read before the page
// is served and after it, and the page is served again until nothing
// changed the style in between (the same updatedAt both times, which every
// change moves on); the page served then must carry that style, and a CMS
// that serves another one is seen whenever it runs.
import type { SiteStyle, StorageAdapter } from "../src/storage/adapter.ts";

export async function servedWithStyle<T>(adapter: Pick<StorageAdapter, "getSiteStyle">, serve: () => Promise<T>, tries = 5): Promise<{ served: T; stored: SiteStyle }> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const before = await adapter.getSiteStyle();
    const served = await serve();
    const after = await adapter.getSiteStyle();
    if (before.updatedAt === after.updatedAt) return { served, stored: after };
  }
  throw new Error(`the site style changed while the page was served, ${tries} times running`);
}
