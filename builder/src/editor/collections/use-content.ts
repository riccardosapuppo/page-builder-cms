// The collections and entries the canvas draws (./content.ts), for the
// panels of the blocks that draw them: a Collection list's collection, and
// the collection of the template open, whose fields a Field block names.
import type { Collection, Entry } from "../../storage/adapter.ts";
import { useUi } from "../context.tsx";
import { useOptionalSession } from "../session.tsx";

export interface CollectionShown {
  collection: Collection;
  entries: readonly Entry[];
}

// The collection of that id and its entries; null for none, or while the
// collections are not read yet.
export function useSiteCollection(id: number | null | undefined): CollectionShown | null {
  const site = useUi((u) => u.siteEntries);
  const collection = id === null || id === undefined ? undefined : site?.collections.find((one) => one.id === id);
  return site && collection ? { collection, entries: site.entries.get(collection.id) ?? [] } : null;
}

// Every collection the storage keeps, oldest first; none while they are
// not read yet.
export function useSiteCollections(): readonly Collection[] {
  return useUi((u) => u.siteEntries?.collections) ?? [];
}

// The collection whose template is open on the canvas; null for any other
// page.
export function useTemplateCollection(): CollectionShown | null {
  const current = useOptionalSession()?.current;
  return useSiteCollection(current?.kind === "template" ? current.collection?.id : null);
}
