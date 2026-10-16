// What the Shop screen (./ShopScreen.tsx) reads and writes through, given
// by the shell on its storage adapter when the adapter keeps a shop
// (capability shop) and the collections it sells from (capability
// collections), and null when it does not: then neither the mark's menu
// nor the phone's More draws a way to the screen, since there would be
// nothing behind it. A test gives a storage of its own making the same way.
import { createContext, useContext } from "react";
import type { StorageAdapter } from "../../storage/adapter.ts";

// The shop's settings and its orders, and the collections, which the
// settings choose the products and their price among.
export type ShopStorage = Pick<StorageAdapter, "getShop" | "setShop" | "listOrders" | "getOrder" | "refreshOrder" | "listCollections">;

const ShopContext = createContext<ShopStorage | null>(null);

export const ShopProvider = ShopContext.Provider;

export function useShopStorage(): ShopStorage | null {
  return useContext(ShopContext);
}

// The adapter itself when it keeps a shop and collections, null otherwise.
export function shopOf(adapter: StorageAdapter): ShopStorage | null {
  return adapter.capabilities.shop && adapter.capabilities.collections ? adapter : null;
}
