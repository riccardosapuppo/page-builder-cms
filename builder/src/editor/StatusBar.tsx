// The bottom line under the canvas (the approved layout, design/layout/,
// section 7 of its NOTES): on the left, where the person is, the
// selection's path from the page down, each step a button that selects
// it, and a hint for what to do next (the pointer over a seam, a text
// being written); while a block moves, the live region's sentence in its
// place, the line drawn graphite. On the right, how the page is looked
// at: Block edges, the device in one click (Desktop, Tablet 768, Phone
// 390) and the page's width as the canvas lays it out, always shown.
//
// The live region is one element for the life of the editor, so a screen
// reader follows it: it says where the dragged block will land, and how
// the drag ended (./drag/DragLayer.tsx).
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { PageDocument } from "../shared/document.ts";
import { DESKTOP_MIN, PREVIEW_WIDTHS } from "../shared/preview-widths.ts";
import { LAYOUT_BREAKPOINTS } from "../shared/site-tokens.ts";
import { useCanvasUi } from "./canvas-ui.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { dropSentence } from "./drag/DragLayer.tsx";
import { draggedOf } from "./drag/marks.ts";
import { Icon } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, entryKeysText, type KeyAction } from "./keymap.ts";
import { useCoarsePointer } from "./layout-mode.ts";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { PREVIEWS, type Preview, type UiStore } from "./ui-store.ts";

// The page down to a block: its section, its column, the block.
export function pathTo(doc: PageDocument, id: string | null): string[] {
  const path: string[] = [];
  for (let at = id; at !== null; at = locate(doc, at)?.parentId ?? null) {
    if (!locate(doc, at)) return [];
    path.unshift(at);
  }
  return path;
}

// "Page 1088 wide, desktop layout", "drawn at 81%" when the page is drawn
// smaller to fit the canvas: the layout the page's container queries give
// that width (560 and 800, tokens.json's container breakpoints).
export function widthWords(width: number, scale: number): string {
  const layout = width >= LAYOUT_BREAKPOINTS.tablet ? "desktop" : width >= LAYOUT_BREAKPOINTS.phone ? "tablet" : "phone";
  return `Page ${width} wide, ${layout} layout${scale < 1 ? `, drawn at ${Math.round(scale * 100)}%` : ""}`;
}

const DEVICES: Readonly<Record<Preview, { name: string; width: number | null; action: KeyAction; title: string }>> = {
  desktop: { name: "Desktop", width: null, action: "deviceDesktop", title: `Desktop: the full width of the canvas, drawn smaller when that is under ${DESKTOP_MIN}` },
  tablet: { name: "Tablet", width: PREVIEW_WIDTHS.tablet, action: "deviceTablet", title: `Tablet, ${PREVIEW_WIDTHS.tablet} wide` },
  phone: { name: "Phone", width: PREVIEW_WIDTHS.phone, action: "devicePhone", title: `Phone, ${PREVIEW_WIDTHS.phone} wide` },
};

// Selects a step of the path, the page itself for none: the canvas brings
// it into view, the focus stays on the step, as a navigator's row does.
function choose(ui: UiStore, select: (id: string | null) => void, id: string | null): void {
  select(id);
  ui.setState({ tray: "edit", notice: null });
  if (id !== null) document.querySelector(`.canvas [data-block-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" });
}

export function StatusBar() {
  const dragging = useEditor((s) => s.drag !== null);
  const mode = useUi((u) => u.dragMode);
  // An empty page has no block to select or to draw the edges of.
  const empty = useEditor((s) => s.document.sections.length === 0);
  const moving = dragging && mode !== null;
  return (
    <footer className={`statusbar chrome${moving ? " statusbar-moving" : ""}`}>
      {!moving && <Crumbs hints={!empty} />}
      <LiveCaption />
      <div className="sb-view">
        {!moving && !empty && <BlockEdges />}
        {!moving && <Devices />}
        <PageWidth />
      </div>
    </footer>
  );
}

function Crumbs({ hints }: { hints: boolean }) {
  const { store, ui } = useEnv();
  const doc = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const path = pathTo(doc, selection);
  const select = (id: string | null) => store.getState().select(id);
  // The pointer over a seam between sections, and a text being written:
  // the line says what to do there.
  const seam = useCanvasUi((c) => c.seam !== null);
  const touch = useCoarsePointer();
  const writing = useUi((u) => u.editingText !== null || u.textTools !== null);
  const last = path.at(-1);
  const kind = last === undefined ? null : locate(doc, last)?.block.type ?? null;
  const hint = (words: string, action: KeyAction, after = "") => (
    <span className="crumbs-hint">
      {words}
      <span className="keys-inline"><KeyCaps caps={entryCaps(entry(action))} small /></span>
      {after}
    </span>
  );
  return (
    <nav className="crumbs" aria-label="Selection">
      <ol>
        <li>
          <button type="button" className="crumb" aria-current={path.length === 0 ? "location" : undefined} title="The page: select nothing, and see the page's settings" onClick={() => choose(ui, select, null)}>
            <Icon name="page" className="i i-xs" /><span className="crumb-name">Page</span>
          </button>
        </li>
        {path.map((id, index) => (
          <li key={id}>
            <Icon name="chevron-right" className="i i-xs crumb-sep" />
            <button type="button" className="crumb" aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => choose(ui, select, id)}>
              <span className="crumb-name">{blockName(doc, id)}</span>
            </button>
          </li>
        ))}
      </ol>
      {hints && selection === null && (seam
        ? <span className="crumbs-hint">Nothing selected. Point between two sections to add one there.</span>
        : touch
          ? <span className="crumbs-hint">Nothing selected. Tap a block to select it.</span>
          : hint("Nothing selected. Click a block, or press", "selectNext", " on the page."))}
      {hints && writing && hint("Writing.", "leaveText", " to finish")}
      {hints && !writing && (kind === "section" || kind === "column") && hint("Select inside:", "selectFirstChild")}
    </nav>
  );
}

// Every block's edges drawn on the canvas, sections and columns too: a way
// of looking at the page, as the device is.
export function BlockEdges() {
  const { ui } = useEnv();
  const on = useUi((u) => u.blockEdges);
  return (
    <button className="sb-edges" type="button" aria-pressed={on} title="Show the edges of every block, sections and columns too" onClick={() => ui.getState().setBlockEdges(!on)}>
      <Icon name="edges" className="i i-xs" />
      {/* Short of room, the word goes and the button keeps its name. */}
      <span className="sb-edges-word">Block edges</span>
    </button>
  );
}

// The device, one click each: a radio group, one Tab stop, the arrows
// moving the choice along it as a radio group's do.
export function Devices() {
  const { ui } = useEnv();
  const preview = useUi((u) => u.preview);
  const set = (next: Preview) => ui.getState().setPreview(next);
  return (
    <div className="devices" role="radiogroup" aria-label="Look at the page on">
      {PREVIEWS.map((device, index) => {
        const words = DEVICES[device];
        const keys = entry(words.action);
        return (
          <button
            key={device}
            type="button"
            role="radio"
            aria-checked={preview === device}
            tabIndex={preview === device ? 0 : -1}
            data-device={device}
            aria-keyshortcuts={ariaKeyShortcuts(keys)}
            title={`${words.title} (${entryKeysText(keys)})`}
            onClick={() => set(device)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = PREVIEWS[(index + step + PREVIEWS.length) % PREVIEWS.length]!;
              set(next);
              event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-device="${next}"]`)?.focus();
            }}
          >
            <Icon name={device} className="i i-xs" />{words.name}
            {words.width !== null && <span className="dev-w">{words.width}</span>}
          </button>
        );
      })}
    </div>
  );
}

// The page's width as the canvas lays it out (./Canvas.tsx says it), and
// the scale it is drawn at.
function PageWidth() {
  const view = useUi((u) => u.pageView);
  return (
    <p className="sb-width" title={`The page changes layout at ${LAYOUT_BREAKPOINTS.phone} (tablet) and ${LAYOUT_BREAKPOINTS.tablet} (desktop)`}>
      {view && view.width > 0 ? widthWords(view.width, view.scale) : ""}
    </p>
  );
}

// Where the block will go, said and shown in the bottom line while it
// moves; quiet, kept for a screen reader, with how the drag ended.
function LiveCaption() {
  const session = useEditor((s) => s.drag);
  const mode = useUi((u) => u.dragMode);
  const said = useUi((u) => u.dragSaid);
  const asks = useUi((u) => u.dragAsks);
  const moving = session !== null && mode !== null;
  // A block from Insert or a picker is added; a block of the page moves.
  // One that needs something first asks for it where it is dropped.
  const adding = session !== null && !draggedOf(session).fromPage;
  const then = asks ? `, then choose ${asks}` : "";
  const help = mode === "keyboard"
    ? adding ? `The arrows move it, Space adds it here${then}, Esc cancels.` : "The arrows move it, Space drops it here, Esc puts it back."
    : `Release, or press Space, to ${adding ? "add" : "drop"} it${then}.${session && session.type !== "section" ? ` Shaded areas cannot hold ${session.type === "column" ? "columns" : "widgets"}.` : ""} Esc cancels.`;
  return (
    <p className={`live-caption${moving ? "" : " live-caption-quiet"}`} role="status" aria-live="polite">
      {moving ? <><strong>{dropSentence(session)}</strong><span>{help}</span></> : said}
    </p>
  );
}
