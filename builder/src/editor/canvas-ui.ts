// What the canvas's own controls agree on, beside the interface's store
// (./ui-store.ts): the place a "+" opened its picker at, the seam between
// two sections the pointer is over, and how the block's menu was opened
// (the clamp's head, its More, or a right click). One store for each
// interface store, made the first time it is asked for, so every editor
// (and every test's) has its own and nothing else has to carry it.
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useEnv } from "./context.tsx";
import type { UiStore } from "./ui-store.ts";

// Where a "+" adds: a widget at a place of a column, or a section at a
// place of the page.
export type InsertPlace =
  | { kind: "block"; parentId: string; index: number }
  | { kind: "section"; index: number };

// Which of the block's menus is open: the head's (the moves, then all of
// More's), or More's (what a right click opens too).
export type MenuKind = "block" | "more";

export interface CanvasUiState {
  inserting: InsertPlace | null;
  // The seam the pointer is over: 0 above the first section, n below the
  // n-th.
  seam: number | null;
  menuKind: MenuKind;
  // The clamp's key the menu was opened from, which takes the focus back.
  menuFrom: "head" | "more" | null;
  setInserting(place: InsertPlace | null): void;
  setSeam(seam: number | null): void;
  setMenu(kind: MenuKind, from: "head" | "more" | null): void;
}

export type CanvasUiStore = StoreApi<CanvasUiState>;

const stores = new WeakMap<UiStore, CanvasUiStore>();

export function canvasUi(ui: UiStore): CanvasUiStore {
  let store = stores.get(ui);
  if (!store) {
    store = createStore<CanvasUiState>()((set) => ({
      inserting: null,
      seam: null,
      menuKind: "more",
      menuFrom: null,
      setInserting: (inserting) => set({ inserting }),
      // The same seam again changes nothing, so nothing redraws.
      setSeam: (seam) => set((state) => (state.seam === seam ? {} : { seam })),
      setMenu: (menuKind, menuFrom) => set({ menuKind, menuFrom }),
    }));
    stores.set(ui, store);
  }
  return store;
}

export function useCanvasUi<T>(selector: (state: CanvasUiState) => T): T {
  return useStore(canvasUi(useEnv().ui), selector);
}
