// What the interface agrees on besides the page itself: which block the
// pointer is over, the width the canvas previews and the width it lays the
// page out at, which drawer is open and what the sidebar shows, the media
// library, the site style and settings, the header and footer the canvas
// draws around a page and the page it draws around a header or footer, the
// errors of the last save the server refused, whether the shortcuts window
// or the About
// window is open, and the text typed in a field and not handed over yet. A
// vanilla zustand store, like the editor's own (../store), so each part of
// the interface subscribes to the one value it draws and nothing else
// redraws.
//
// The page document, the selection and the history are not here: they are
// the editor store's, changed only by its commands.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { PageDocument } from "../shared/document.ts";
import type { BlockFieldError, MediaItem, Site, SiteStyle } from "../storage/adapter.ts";
import type { ColorPreview } from "./color-preview.ts";
import { PendingText } from "./pending.ts";
import type { TextEditing, TextTools } from "./rich/tools.ts";

export const PREVIEWS = ["desktop", "tablet", "phone"] as const;
export type Preview = (typeof PREVIEWS)[number];

// The sidebar's two tabs (./Sidebar.tsx). They follow the selection, Block
// for a block and Page for none; a tab chosen by hand holds for the
// selection it was chosen with, and the next selection is followed again.
export type SideTab = "page" | "block";
export interface SideTabPick {
  tab: SideTab;
  selection: string | null;
}

// Which of the sidebar's groups are open (./panels/groups.tsx), by whose
// they are (a block's type, or "page") and the group's id: only those the
// person opened or closed, the others drawn as their panel first draws
// them. The shell keeps it in the browser, for this person
// (./open-groups.ts).
export type OpenGroups = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

// What the sidebar shows: the settings of the page and of the selection
// (its Page and Block tabs), or, a level below Page, the site style.
export type Tray = "edit" | "site-style";

// The site's header and footer as the canvas draws them around a page: each
// part's draft as the storage last gave it, or as it was edited last in
// this tab; null until it is read.
export interface PartsShown {
  header: PageDocument | null;
  footer: PageDocument | null;
}

// The page drawn around a part, and the way back to it.
export interface AroundPart {
  id: number;
  title: string;
  document: PageDocument;
}

// The top bar's drawers, one open at a time (./Drawer.tsx): Insert floats
// over the left of the canvas; Outline and History push the page aside.
export const DRAWERS = ["insert", "outline", "history"] as const;
export type Drawer = (typeof DRAWERS)[number];

// Whether a drawer takes its room from the canvas (the page is narrower, or
// drawn smaller) rather than floating over it.
export const pushes = (drawer: Drawer | null): boolean => drawer === "outline" || drawer === "history";

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
  sideTab: SideTabPick | null;
  openGroups: OpenGroups;
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
  // A colour shown on the canvas while it is picked (./color-preview.ts).
  colorPreview: ColorPreview | null;
  // The site's settings: its time zone.
  site: Site | null;
  // The header and footer drawn around a page on the canvas.
  parts: PartsShown;
  // The page drawn, dimmed and locked, around the header or footer being
  // edited: the page opened last, as it was then; null before any.
  aroundPart: AroundPart | null;
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
  // the canvas or from the Outline.
  blockMenu: BlockMenuAt | null;
  // A block being dragged, by the mouse or the keyboard (the store holds
  // the drag itself), and the live region's last word on a drag that ended.
  dragMode: "pointer" | "keyboard" | null;
  dragSaid: string;
  // What a key being dragged asks for once it is dropped ("its images"),
  // for the live region; null for a block that needs nothing first.
  dragAsks: string | null;
  // The text typed in a panel's field or in a text on the canvas and not
  // handed over yet. The same object for the life of the store: holding
  // text draws nothing.
  pending: PendingText;
  // The text block edited on the canvas, and where its caret started; the
  // state and commands of its editor, for the formatting buttons in the
  // block's clamp (./rich/tools.ts).
  editingText: TextEditing | null;
  textTools: TextTools | null;

  setHover(id: string | null): void;
  setPreview(preview: Preview): void;
  setSideTab(pick: SideTabPick | null): void;
  setGroupOpen(owner: string, group: string, open: boolean): void;
  setSidebarOpen(open: boolean): void;
  // Opens a drawer, the one open closing; null closes it. Leaving the
  // history closes its name field too.
  setDrawer(drawer: Drawer | null): void;
  setBlockEdges(on: boolean): void;
  setPageView(view: PageView | null): void;
  setMedia(items: readonly MediaItem[]): void;
  setSiteStyle(style: SiteStyle | null): void;
  setColorPreview(preview: ColorPreview | null): void;
  setSite(site: Site | null): void;
  setParts(parts: Partial<PartsShown>): void;
  setAroundPart(page: AroundPart | null): void;
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

export function createUiStore(initial: Partial<Pick<UiState, "preview" | "tray" | "sideTab" | "openGroups" | "sidebarOpen" | "drawer" | "siteStyle" | "site" | "parts" | "aroundPart">> = {}): UiStore {
  const drawer = initial.drawer ?? null;
  return createStore<UiState>()((set, get) => ({
    hover: null,
    preview: initial.preview ?? "desktop",
    tray: initial.tray ?? "edit",
    sideTab: initial.sideTab ?? null,
    openGroups: initial.openGroups ?? {},
    sidebarOpen: initial.sidebarOpen ?? true,
    drawer,
    blockEdges: false,
    pageView: null,
    media: new Map(),
    mediaLooking: new Set(),
    siteStyle: initial.siteStyle ?? null,
    colorPreview: null,
    site: initial.site ?? null,
    parts: initial.parts ?? { header: null, footer: null },
    aroundPart: initial.aroundPart ?? null,
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
    dragAsks: null,
    pending: new PendingText(),
    editingText: null,
    textTools: null,

    setHover: (hover) => set({ hover }),
    setPreview: (preview) => set({ preview }),
    setSideTab: (sideTab) => set({ sideTab }),
    // The same again changes nothing, so nothing is drawn or kept again.
    setGroupOpen: (owner, group, open) => set((state) => (state.openGroups[owner]?.[group] === open ? {} : { openGroups: { ...state.openGroups, [owner]: { ...state.openGroups[owner], [group]: open } } })),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setDrawer: (next) => set(next === "history" ? { drawer: next, historyOpen: true } : { drawer: next, historyOpen: false, namingVersion: false }),
    setBlockEdges: (blockEdges) => set({ blockEdges }),
    // The same width and scale again change nothing, so nothing redraws.
    setPageView: (pageView) => set((state) => (state.pageView?.width === pageView?.width && state.pageView?.scale === pageView?.scale ? {} : { pageView })),
    setMedia: (items) => set({ media: new Map(items.map((item) => [item.id, item])) }),
    setSiteStyle: (siteStyle) => set({ siteStyle }),
    setColorPreview: (colorPreview) => set({ colorPreview }),
    setSite: (site) => set({ site }),
    setParts: (parts) => set((state) => ({ parts: { ...state.parts, ...parts } })),
    setAroundPart: (aroundPart) => set({ aroundPart }),
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
