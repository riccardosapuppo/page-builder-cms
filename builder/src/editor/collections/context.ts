// What the Collections screen (./CollectionsScreen.tsx) reads and writes
// through, given by the shell on its storage adapter when the adapter keeps
// collections (capability collections), and null when it does not: then
// neither the mark's menu nor the phone's More draws a way to the screen,
// since there would be nothing behind it. A test gives a storage of its own
// making the same way.
import { createContext, useContext } from "react";
import type { StorageAdapter } from "../../storage/adapter.ts";

// The adapter's operations on collections and their entries. The template
// is a page: it is opened, saved and published by the page operations,
// through the shell's session, as a part is.
export type CollectionsStorage = Pick<StorageAdapter,
  | "listCollections" | "createCollection" | "getCollection" | "updateCollection" | "deleteCollection"
  | "listEntries" | "createEntry" | "getEntry" | "saveEntry" | "publishEntry" | "unpublishEntry" | "deleteEntry">;

const CollectionsContext = createContext<CollectionsStorage | null>(null);

export const CollectionsProvider = CollectionsContext.Provider;

export function useCollectionsStorage(): CollectionsStorage | null {
  return useContext(CollectionsContext);
}

// The adapter itself when it keeps collections, null otherwise.
export function collectionsOf(adapter: StorageAdapter): CollectionsStorage | null {
  return adapter.capabilities.collections ? adapter : null;
}
