// What the interface agrees on besides the page itself: which block the
// pointer is over, the width the canvas previews and the width it lays the
// page out at, which drawer is open and what the sidebar shows, the media
// library, the site style and settings, the header and footer the canvas
// draws around a page and the page it draws around a header or footer, the
// errors of the last save the server refused, whether the shortcuts window,
// the About window, the Collections screen or the Shop screen is open, the
// shop's settings the canvas draws prices with, and the text typed in a
// field and not handed over yet. A vanilla zustand store, like the
// editor's own (../store), so each part of the interface subscribes to the
// one value it draws and nothing else redraws.
//
// The page document, the selection and the history are not here: they are
// the editor store's, changed only by its commands.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { PageDocument } from "../shared/document.ts";
import type { ShopSettings } from "../shared/shop.ts";
import type { BlockFieldError, MediaItem, Site, SiteStyle } from "../storage/adapter.ts";
import type { PreviewChoice, SiteEntries } from "./collections/content.ts";
import type { ColorPreview } from "./color-preview.ts";
import type { LayoutMode } from "./layout-mode.ts";
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
export type Tray = "edit" | "site-style" | "custom-css";

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

// The top bar's drawers, one open at a time (./Drawer.tsx): on a desktop
// each pushes the page aside, Insert as the Outline, History and the
// Assistant do.
export const DRAWERS = ["insert", "outline", "history", "assistant"] as const;
export type Drawer = (typeof DRAWERS)[number];

// Whether a drawer is one that pushes the page aside, from a column of the
// frame's own (drawer-push, editor.css), rather than one that floats over
// the canvas's left (drawer-float). In the wide layout every drawer pushes,
// and the canvas gives it its room (the page is narrower, or drawn
// smaller): Insert too, since the owner's report of 15 October 2026 (the
// page's left part was under it). In a tablet's or a phone's window Insert
// floats, as it always has; there no drawer takes room from the canvas
// (App.tsx), a tablet's drawing the others over it too, a phone's each as
// a sheet.
export const pushes = (drawer: Drawer | null, layout: LayoutMode): boolean => drawer !== null && (drawer !== "insert" || layout === "wide");

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

// The Collections screen (./collections/), open from the mark's menu, the
// phone's More or a template's Page tab: on a collection, and on its
// entries or its settings, or on the first.
export interface CollectionsAt {
  collectionId: number | null;
  tab?: "entries" | "settings";
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
  // In a tablet's or a phone's window (./layout-mode.ts) the drawers and
  // the sidebar stand over the canvas, and one at a time: the one opened
  // last stays, the other closes, whichever way it opened.
  onePanel: boolean;
  // A phone's sheet made as tall as the window allows (./sheet-grip.tsx).
  // A sheet opens at its own height: a drawer or the sidebar opening or
  // closing lets it go.
  sheetTall: boolean;
  pageView: PageView | null;
  media: ReadonlyMap<string, MediaItem>;
  // Images a page names that the library did not have, while it is read
  // again for them (./library/service.ts, ensure).
  mediaLooking: ReadonlySet<string>;
  siteStyle: SiteStyle | null;
  // A colour shown on the canvas while it is picked (./color-preview.ts).
  colorPreview: ColorPreview | null;
  // Custom CSS written and not kept, because it does not keep to the site
  // (./CustomCssPanel.tsx): shown again when the panel opens, and the
  // tab's close warns of it. null when there is none.
  customCssDraft: string | null;
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
  // The Collections screen is open, and where; null while it is not.
  collections: CollectionsAt | null;
  // The collections and their entries, which the canvas's lists and
  // fields draw (./collections/content.ts); null until they are read, and
  // with a storage that keeps none.
  siteEntries: SiteEntries | null;
  // The entry a template is drawn with on the canvas, picked in its Page
  // tab, by its collection; null for the first published one.
  previewEntry: { collectionId: number; choice: PreviewChoice } | null;
  // The Shop screen (./shop/) is open, from the mark's menu or the
  // phone's More.
  shopOpen: boolean;
  // The shop's settings, which the canvas draws a price and Add to cart
  // with and Insert offers Add to cart by (../shared/shop.ts); null until
  // they are read, and with a storage that keeps no shop.
  siteShop: ShopSettings | null;
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
  // Where the drag began: a row of the Outline, or the page (the canvas's
  // selection, a key of Insert or of a picker). While a row's block moves
  // over the Outline, or with the keyboard, the canvas draws it as itself
  // where it would land (live); over the canvas, as the drop line, so the
  // page never moves under the pointer.
  dragFrom: "outline" | "page" | null;
  dragLive: boolean;
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
  setSheetTall(tall: boolean): void;
  setOnePanel(on: boolean): void;
  setPageView(view: PageView | null): void;
  setMedia(items: readonly MediaItem[]): void;
  setSiteStyle(style: SiteStyle | null): void;
  setColorPreview(preview: ColorPreview | null): void;
  setCustomCssDraft(draft: string | null): void;
  setSite(site: Site | null): void;
  setParts(parts: Partial<PartsShown>): void;
  setAroundPart(page: AroundPart | null): void;
  setServerErrors(errors: readonly BlockFieldError[]): void;
  say(notice: string | null, link?: NoticeLink | null): void;
  setShortcutsOpen(open: boolean): void;
  setAboutOpen(open: boolean): void;
  setCollections(at: CollectionsAt | null): void;
  setSiteEntries(entries: SiteEntries | null): void;
  setPreviewEntry(choice: { collectionId: number; choice: PreviewChoice } | null): void;
  setShopOpen(open: boolean): void;
  setSiteShop(shop: ShopSettings | null): void;
  // The history's drawer opened, or closed if it is the one open.
  setHistoryOpen(open: boolean): void;
  setNamingVersion(naming: boolean): void;
  setBlockMenu(menu: BlockMenuAt | null): void;
}

export type UiStore = StoreApi<UiState>;

export function createUiStore(initial: Partial<Pick<UiState, "preview" | "tray" | "sideTab" | "openGroups" | "sidebarOpen" | "drawer" | "siteStyle" | "site" | "parts" | "aroundPart" | "onePanel" | "siteEntries" | "siteShop">> = {}): UiStore {
  const drawer = initial.drawer ?? null;
  const store = createStore<UiState>()((set, get) => ({
    hover: null,
    preview: initial.preview ?? "desktop",
    tray: initial.tray ?? "edit",
    sideTab: initial.sideTab ?? null,
    openGroups: initial.openGroups ?? {},
    sidebarOpen: initial.sidebarOpen ?? true,
    drawer,
    blockEdges: false,
    sheetTall: false,
    onePanel: initial.onePanel ?? false,
    pageView: null,
    media: new Map(),
    mediaLooking: new Set(),
    siteStyle: initial.siteStyle ?? null,
    colorPreview: null,
    customCssDraft: null,
    site: initial.site ?? null,
    parts: initial.parts ?? { header: null, footer: null },
    aroundPart: initial.aroundPart ?? null,
    serverErrors: [],
    notice: null,
    noticeLink: null,
    shortcutsOpen: false,
    aboutOpen: false,
    collections: null,
    siteEntries: initial.siteEntries ?? null,
    previewEntry: null,
    shopOpen: false,
    siteShop: initial.siteShop ?? null,
    historyOpen: drawer === "history",
    namingVersion: false,
    copied: null,
    blockMenu: null,
    dragMode: null,
    dragFrom: null,
    dragLive: false,
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
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen, sheetTall: false }),
    setDrawer: (next) => set(next === "history" ? { drawer: next, historyOpen: true, sheetTall: false } : { drawer: next, historyOpen: false, namingVersion: false, sheetTall: false }),
    setBlockEdges: (blockEdges) => set({ blockEdges }),
    setSheetTall: (sheetTall) => set({ sheetTall }),
    setOnePanel: (onePanel) => set({ onePanel }),
    // The same width and scale again change nothing, so nothing redraws.
    setPageView: (pageView) => set((state) => (state.pageView?.width === pageView?.width && state.pageView?.scale === pageView?.scale ? {} : { pageView })),
    setMedia: (items) => set({ media: new Map(items.map((item) => [item.id, item])) }),
    setSiteStyle: (siteStyle) => set({ siteStyle }),
    setColorPreview: (colorPreview) => set({ colorPreview }),
    setCustomCssDraft: (customCssDraft) => set({ customCssDraft }),
    setSite: (site) => set({ site }),
    setParts: (parts) => set((state) => ({ parts: { ...state.parts, ...parts } })),
    setAroundPart: (aroundPart) => set({ aroundPart }),
    setServerErrors: (serverErrors) => set({ serverErrors }),
    say: (notice, link = null) => set({ notice, noticeLink: notice === null ? null : link }),
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    setCollections: (collections) => set({ collections }),
    setSiteEntries: (siteEntries) => set({ siteEntries }),
    setPreviewEntry: (previewEntry) => set({ previewEntry }),
    setShopOpen: (shopOpen) => set({ shopOpen }),
    setSiteShop: (siteShop) => set({ siteShop }),
    setHistoryOpen: (open) => {
      if (open) get().setDrawer("history");
      else if (get().drawer === "history") get().setDrawer(null);
    },
    setNamingVersion: (namingVersion) => set({ namingVersion }),
    setBlockMenu: (blockMenu) => set({ blockMenu }),
  }));
  // One panel at a time where they share the canvas: the sidebar shown
  // while a drawer is open closes the drawer; a drawer opened, or the rule
  // taking hold, closes the sidebar.
  store.subscribe((state, before) => {
    if (!state.onePanel || state.drawer === null || !state.sidebarOpen) return;
    if (!before.sidebarOpen) store.setState({ drawer: null, historyOpen: false, namingVersion: false });
    else store.setState({ sidebarOpen: false });
  });
  return store;
}
