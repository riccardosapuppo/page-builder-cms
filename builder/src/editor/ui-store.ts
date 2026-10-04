// What the interface agrees on besides the page itself: which block the
// pointer is over, the width the canvas previews and the width it lays the
// page out at, which drawer is open and what the sidebar shows, the media
// library and the site style the canvas draws with, the errors of the last
// save the server refused, whether the shortcuts window or the About
// window is open, and the text typed in a field and not handed over yet. A
// vanilla zustand store, like the editor's own (../store), so each part of
// the interface subscribes to the one value it draws and nothing else
// redraws.
//
// The page document, the selection and the history are not here: they are
// the editor store's, changed only by its commands.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { BlockFieldError, MediaItem, Site, SiteStyle } from "../storage/adapter.ts";
import { PendingText } from "./pending.ts";
import type { TextEditing, TextTools } from "./rich/tools.ts";

export const PREVIEWS = ["desktop", "tablet", "phone"] as const;
export type Preview = (typeof PREVIEWS)[number];

export const PANEL_TABS = ["content", "style", "advanced"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

// What the sidebar shows: the settings of the page and of the selection
// (its Page and Block tabs), or the site style, a level below Page.
export type Tray = "edit" | "site-style";

// The top bar's drawers, floating over the left of the canvas, one open at
// a time (./Drawer.tsx).
export const DRAWERS = ["insert", "outline", "history"] as const;
export type Drawer = (typeof DRAWERS)[number];

// The page as the canvas lays it out: its width (its own, not the canvas's
// when it is drawn smaller) and the scale it is drawn at, for the bottom
// line's words.
export interface PageView {
  width: number;
  scale: number;
}

// A link a notice offers, opened in a new tab (the live page, after a
// publish).
export interface NoticeLink {
  href: string;
  label: string;
}

export interface BlockMenuAt {
  x: number;
  y: number;
  from: "canvas" | "navigator";
}

export interface UiState {
  hover: string | null;
  preview: Preview;
  tray: Tray;
  panelTab: PanelTab;
  // The sidebar is shown; hidden, the canvas takes its room.
  sidebarOpen: boolean;
  drawer: Drawer | null;
  // Every block's edges drawn on the canvas (the bottom line's Block edges).
  blockEdges: boolean;
  pageView: PageView | null;
  media: ReadonlyMap<string, MediaItem>;
  // Images a page names that the library did not have, while it is read
  // again for them (./library/service.ts, ensure).
  mediaLooking: ReadonlySet<string>;
  siteStyle: SiteStyle | null;
  // The theme's header and footer, drawn around the page on the canvas.
  site: Site | null;
  // The last refused save's errors, each on its block and field.
  serverErrors: readonly BlockFieldError[];
  // One sentence about what just happened, or why nothing did, and a link
  // it may offer.
  notice: string | null;
  noticeLink: NoticeLink | null;
  // The keyboard shortcuts window (./ShortcutsDialog.tsx) is open.
  shortcutsOpen: boolean;
  // The About window (./AboutDialog.tsx) is open.
  aboutOpen: boolean;
  // The drawer open is the history (./HistoryPanel.tsx), kept beside
  // `drawer` for the parts that ask only that; its "Save version" asks for
  // a name.
  historyOpen: boolean;
  namingVersion: boolean;
  // The block this tab copied last, as the clipboard carries it: what the
  // block's menu pastes when the browser will not read the clipboard.
  copied: string | null;
  // The selected block's menu, open at a point of the window, opened from
  // the canvas or from the navigator.
  blockMenu: BlockMenuAt | null;
  // A block being dragged, by the mouse or the keyboard (the store holds
  // the drag itself), and the live region's last word on a drag that ended.
  dragMode: "pointer" | "keyboard" | null;
  dragSaid: string;
  // The text typed in a panel's field or in a text on the canvas and not
  // handed over yet. The same object for the life of the store: holding
  // text draws nothing.
  pending: PendingText;
  // The text block edited on the canvas, and where its caret started; the
  // state and commands of its editor, for the formatting buttons on the
  // block's bar (./rich/tools.ts).
  editingText: TextEditing | null;
  textTools: TextTools | null;

  setHover(id: string | null): void;
  setPreview(preview: Preview): void;
  setTray(tray: Tray): void;
  setPanelTab(tab: PanelTab): void;
  setSidebarOpen(open: boolean): void;
  // Opens a drawer, the one open closing; null closes it. Leaving the
  // history closes its name field too.
  setDrawer(drawer: Drawer | null): void;
  setBlockEdges(on: boolean): void;
  setPageView(view: PageView | null): void;
  setMedia(items: readonly MediaItem[]): void;
  setSiteStyle(style: SiteStyle | null): void;
  setSite(site: Site | null): void;
  setServerErrors(errors: readonly BlockFieldError[]): void;
  say(notice: string | null, link?: NoticeLink | null): void;
  setShortcutsOpen(open: boolean): void;
  setAboutOpen(open: boolean): void;
  // The history's drawer opened, or closed if it is the one open.
  setHistoryOpen(open: boolean): void;
  setNamingVersion(naming: boolean): void;
  setBlockMenu(menu: BlockMenuAt | null): void;
}

export type UiStore = StoreApi<UiState>;

export function createUiStore(initial: Partial<Pick<UiState, "preview" | "tray" | "panelTab" | "sidebarOpen" | "drawer" | "siteStyle" | "site">> = {}): UiStore {
  const drawer = initial.drawer ?? null;
  return createStore<UiState>()((set, get) => ({
    hover: null,
    preview: initial.preview ?? "desktop",
    tray: initial.tray ?? "edit",
    panelTab: initial.panelTab ?? "content",
    sidebarOpen: initial.sidebarOpen ?? true,
    drawer,
    blockEdges: false,
    pageView: null,
    media: new Map(),
    mediaLooking: new Set(),
    siteStyle: initial.siteStyle ?? null,
    site: initial.site ?? null,
    serverErrors: [],
    notice: null,
    noticeLink: null,
    shortcutsOpen: false,
    aboutOpen: false,
    historyOpen: drawer === "history",
    namingVersion: false,
    copied: null,
    blockMenu: null,
    dragMode: null,
    dragSaid: "",
    pending: new PendingText(),
    editingText: null,
    textTools: null,

    setHover: (hover) => set({ hover }),
    setPreview: (preview) => set({ preview }),
    setTray: (tray) => set({ tray }),
    setPanelTab: (panelTab) => set({ panelTab }),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setDrawer: (next) => set(next === "history" ? { drawer: next, historyOpen: true } : { drawer: next, historyOpen: false, namingVersion: false }),
    setBlockEdges: (blockEdges) => set({ blockEdges }),
    // The same width and scale again change nothing, so nothing redraws.
    setPageView: (pageView) => set((state) => (state.pageView?.width === pageView?.width && state.pageView?.scale === pageView?.scale ? {} : { pageView })),
    setMedia: (items) => set({ media: new Map(items.map((item) => [item.id, item])) }),
    setSiteStyle: (siteStyle) => set({ siteStyle }),
    setSite: (site) => set({ site }),
    setServerErrors: (serverErrors) => set({ serverErrors }),
    say: (notice, link = null) => set({ notice, noticeLink: notice === null ? null : link }),
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    setHistoryOpen: (open) => {
      if (open) get().setDrawer("history");
      else if (get().drawer === "history") get().setDrawer(null);
    },
    setNamingVersion: (namingVersion) => set({ namingVersion }),
    setBlockMenu: (blockMenu) => set({ blockMenu }),
  }));
}
