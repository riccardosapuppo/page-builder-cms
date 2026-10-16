// The context the render contract draws a fixture with, as the server's
// goldens are drawn (cms/test/contract/goldens_test.rb): the media stub
// (./media.tsx, contractMedia), and what the fixture's Collection lists
// and Field blocks draw from, read from the fixture itself, the twin of
// ContractContent (cms/test/support/contract_content.rb). A fixture may
// hold, beside its document's members, "collections" (the collections its
// lists name, by id, each with its published entries), "entry" (the entry
// a template is drawn with) and "shop" (the shop's settings); without them
// every list has no collection, every field no entry, and every price is
// a number.
import { isObject } from "../document/json.ts";
import type { ListedCollection, RenderContext, ShownEntry, ShownShop } from "./context.ts";
import { contractMedia } from "./media.tsx";

export function contractContext(fixture: unknown): RenderContext {
  const listed = isObject(fixture) && Array.isArray(fixture.collections) ? fixture.collections.filter(isObject) : [];
  const collections = new Map<unknown, ListedCollection>(listed.map((collection) => [collection.id, collection as unknown as ListedCollection]));
  const entry = isObject(fixture) ? (fixture.entry as ShownEntry | null | undefined) : undefined;
  const shop = isObject(fixture) ? (fixture.shop as ShownShop | null | undefined) : undefined;
  return { media: contractMedia, collections: (id) => collections.get(id) ?? null, entry: entry ?? null, shop: shop ?? null };
}
