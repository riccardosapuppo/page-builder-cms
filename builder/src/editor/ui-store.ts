// What the interface agrees on besides the page itself: which block the
// pointer is over, the width the canvas previews, which tab each tray
// shows, the media library and the site style the canvas draws with, and
// the errors of the last save the server refused. A vanilla zustand store,
// like the editor's own (../store), so each part of the interface
// subscribes to the one value it draws and nothing else redraws.
//
// The page document, the selection and the history are not here: they are
// the editor store's, changed only by its commands.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { BlockFieldError, MediaItem, SiteStyle } from "../storage/adapter.ts";

export const PREVIEWS = ["desktop", "tablet", "phone"] as const;
export type Preview = (typeof PREVIEWS)[number];

export const PANEL_TABS = ["content", "style", "advanced"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export interface UiState {
  hover: string | null;
  preview: Preview;
  // The left tray: the widget panel, or the panel of the selection (of the
  // page itself when nothing is selected).
  tray: "add" | "edit";
  panelTab: PanelTab;
  navigatorOpen: boolean;
  media: ReadonlyMap<string, MediaItem>;
  siteStyle: SiteStyle | null;
  // The last refused save's errors, each on its block and field.
  serverErrors: readonly BlockFieldError[];
  // One sentence about what just happened, or why nothing did.
  notice: string | null;

  setHover(id: string | null): void;
  setPreview(preview: Preview): void;
  setTray(tray: "add" | "edit"): void;
  setPanelTab(tab: PanelTab): void;
  setNavigatorOpen(open: boolean): void;
  setMedia(items: readonly MediaItem[]): void;
  setSiteStyle(style: SiteStyle | null): void;
  setServerErrors(errors: readonly BlockFieldError[]): void;
  say(notice: string | null): void;
}

export type UiStore = StoreApi<UiState>;

export function createUiStore(initial: Partial<Pick<UiState, "preview" | "tray" | "panelTab" | "navigatorOpen">> = {}): UiStore {
  return createStore<UiState>()((set) => ({
    hover: null,
    preview: initial.preview ?? "desktop",
    tray: initial.tray ?? "edit",
    panelTab: initial.panelTab ?? "content",
    navigatorOpen: initial.navigatorOpen ?? true,
    media: new Map(),
    siteStyle: null,
    serverErrors: [],
    notice: null,

    setHover: (hover) => set({ hover }),
    setPreview: (preview) => set({ preview }),
    setTray: (tray) => set({ tray }),
    setPanelTab: (panelTab) => set({ panelTab }),
    setNavigatorOpen: (navigatorOpen) => set({ navigatorOpen }),
    setMedia: (items) => set({ media: new Map(items.map((item) => [item.id, item])) }),
    setSiteStyle: (siteStyle) => set({ siteStyle }),
    setServerErrors: (serverErrors) => set({ serverErrors }),
    say: (notice) => set({ notice }),
  }));
}
