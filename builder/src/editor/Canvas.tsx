// The canvas: the page drawn by the published page's renderer (../render)
// with the published page's stylesheets, on the approved design's bench
// (design/shots/editor.png). The page root is as wide as the device
// previewed (the canvas, a tablet, a phone), and the page's container
// queries lay it out for that width, as a visitor's device would.
//
// What the editor adds to the page is drawn inside each block's root
// (../render/context.ts, useDecoration): the selection's marks and its
// floating bar (grip, duplicate, delete), the hover outline, the outlines
// of the section and columns around the selection, an empty column's
// place. Each block subscribes to its own part of the state, so a new
// selection redraws the blocks it concerns and no others.
//
// While a block is dragged (./drag/DragLayer.tsx) the canvas draws the
// store's preview, a separate page with the block where it would land,
// and each block draws its part of the drag (./drag/marks.ts): the
// dragged block as the drop indicator, the container it would land in
// framed, those that cannot take it shaded. Every block, and the page
// itself, is a drop target of the drag library; the selected block is its
// source, picked up by the bar's grip or by Space.
//
// The page's own links, buttons and disclosures do nothing here: a click
// selects the block it falls in, a right click opens its menu.
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { makeDelete, makeDuplicate, makeInsert, makeInsertSection } from "../document/commands.ts";
import { blockName, plural } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { Decoration, RawBlock, RenderContext } from "../render/context.ts";
import { PageRoot, siteStyleAttributes, type SiteStyleChoice } from "../render/page.tsx";
import { SiteFooter, SiteHeader } from "../render/theme.tsx";
import type { ImageRef, PageDocument } from "../shared/document.ts";
import type { EditorState } from "../store/editor-store.ts";
import { PREVIEW_WIDTHS } from "../shared/preview-widths.ts";
import { LAYOUT_BREAKPOINTS } from "../shared/site-tokens.ts";
import { focusBlock, runCommand } from "./act.ts";
import { openBlockMenu } from "./BlockMenu.tsx";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { collisionPriority, SELECTION_SENSORS, SELECTION_SOURCE, useDraggable, useDropTarget } from "./drag/dnd.ts";
import { containerMark, dragMarkOf, draggedOf, type DragMark } from "./drag/marks.ts";
import { PAGE_TARGET, roleOf } from "./drag/place.ts";
import { Icon } from "./icons.tsx";
import { useInsert } from "./insert.ts";
import { mediaResolver } from "./media.ts";
import { ImagePicker } from "./pickers.tsx";
import { PRESET_LABELS, presetSection, type Preset } from "./presets.ts";
import { useOptionalSession } from "./session.tsx";

// How a block stands to the selection, for the marks it draws.
type Relation =
  | "selected"
  // The section the selection is in.
  | "around"
  // The column that holds the selected widget.
  | "parent"
  // Another column of the section the selection is in.
  | "column"
  // Nothing is selected and this is the first block: the canvas's one Tab stop.
  | "entry"
  | null;

export function relationOf(doc: PageDocument, selection: string | null, id: string | null): Relation {
  if (id === null) return null;
  if (selection === null) return doc.sections[0]?.id === id ? "entry" : null;
  if (selection === id) return "selected";
  const selected = locate(doc, selection);
  const here = locate(doc, id);
  if (!selected || !here) return null;
  if (selected.path.length < 2) return null;
  const sectionId = doc.sections[selected.path[0] ?? -1]?.id;
  if (here.block.type === "section") return here.block.id === sectionId ? "around" : null;
  if (here.block.type === "column" && here.parentId === sectionId) return selected.parentId === id ? "parent" : "column";
  return null;
}

// The canvas's name for a block (the navigator's): "Hero", "Column 1", "Heading".
function nameOf(doc: PageDocument, id: string | null): string {
  if (id === null) return "";
  const block = locate(doc, id)?.block;
  if (!block) return "";
  return blockName(doc, id);
}

// ------------------------------------------------------------ decoration

// The drag source's element, given to the block it is: the selection, or
// the block being dragged wherever the preview puts it.
const SourceRef = createContext<((element: Element | null) => void) | null>(null);

// Whether a block may take part in the drag at all, for the library: a
// place beside its siblings, or a container for the dragged block.
function useAccept(id: string | null): () => boolean {
  const { store } = useEnv();
  return useCallback(() => {
    const session = store.getState().drag;
    if (!session || id === null) return false;
    const dragged = draggedOf(session);
    return id === dragged.id || roleOf(session.base, dragged, id) !== null;
  }, [store, id]);
}

// The library's priority for a block while something is dragged: a
// container the dragged block would go into ranks below its children,
// unless it has none; a block it would stand beside keeps the default.
function priorityOf(state: EditorState, id: string | null): ReturnType<typeof collisionPriority> {
  const session = state.drag;
  if (!session || id === null) return undefined;
  const dragged = draggedOf(session);
  if (id === dragged.id) return undefined;
  const role = roleOf(session.base, dragged, id);
  if (role?.kind !== "container") return undefined;
  const children = (locate(session.preview, id)?.block.children ?? []).filter((b) => b.id !== dragged.id).length;
  return collisionPriority(children);
}

function useDecoration(block: RawBlock): Decoration | undefined {
  const { store, ui } = useEnv();
  const anonymous = useId();
  const id = typeof block.id === "string" ? block.id : null;
  const relation = useStore(store, (s) => (s.drag ? null : relationOf(s.document, s.selection, id)));
  const hovered = useStore(ui, (u) => id !== null && u.hover === id);
  const name = useStore(store, (s) => nameOf(s.drag?.preview ?? s.document, id));
  const mark = useStore(store, useShallow((s): DragMark => (s.drag && id !== null ? dragMarkOf(s.drag, s.drag.preview, id) : null)));
  const isSource = useStore(store, (s) => id !== null && (s.drag ? draggedOf(s.drag).id === id : s.selection === id));
  const priority = useStore(store, (s) => priorityOf(s, id));
  const sourceRef = useContext(SourceRef);
  const accept = useAccept(id);
  const { ref: dropRef } = useDropTarget({ id: id ?? anonymous, disabled: id === null, accept }, priority);
  const ref = useCallback((element: HTMLElement | null) => {
    dropRef(element);
    if (isSource) sourceRef?.(element);
  }, [dropRef, isSource, sourceRef]);

  if (id === null) return undefined;
  const kind = block.type === "section" ? "section" : block.type === "column" ? "column" : "widget";
  const columns = block.type === "section" && Array.isArray(block.children) ? block.children.length : 0;
  const empty = block.type === "column" && Array.isArray(block.children) && block.children.length === 0;
  const slot = mark?.kind === "slot" ? mark : null;
  return {
    ref,
    attributes: {
      role: "group",
      "aria-roledescription": kind,
      "aria-label": name,
      tabIndex: relation === "selected" || relation === "entry" || isSource ? 0 : -1,
      "data-editor-selected": relation === "selected" ? "true" : undefined,
      "data-drag-slot": slot ? slot.mode : undefined,
      "data-drag-row": slot?.row ? "true" : undefined,
    },
    after: slot
      ? <DropIndicator mode={slot.mode} label={slot.label} />
      : <Marks id={id} kind={kind} name={name} relation={relation} hovered={hovered && mark === null} columns={columns} empty={empty} mark={mark} hug={block.type === "button"} />,
  };
}

// A button is drawn as a pill inside a root as wide as its column, as on
// the published page; its hover outline and selection frame hug the pill
// (design/shots/editor.png), placed from the pill's box in the root's own
// layout (offset*, which neither scrolling nor a scaled canvas changes),
// and placed again whenever either box changes size.
function hug(mark: HTMLElement | null): (() => void) | undefined {
  const root = mark?.parentElement;
  const pill = root?.querySelector<HTMLElement>(":scope > .sw-btn");
  if (!mark || !root || !pill) return undefined;
  const place = () => {
    mark.style.setProperty("--hug-x", `${pill.offsetLeft}px`);
    mark.style.setProperty("--hug-y", `${pill.offsetTop}px`);
    mark.style.setProperty("--hug-w", `${pill.offsetWidth}px`);
    mark.style.setProperty("--hug-h", `${pill.offsetHeight}px`);
  };
  place();
  const observer = new ResizeObserver(place);
  observer.observe(root);
  observer.observe(pill);
  return () => observer.disconnect();
}

// The drop indicator, one for the mouse and the keyboard: a line with the
// block's name where it will land, or, alone in its container, the frame
// of that container. The dragged block itself is drawn as it.
export function DropIndicator({ mode, label }: { mode: "line" | "frame"; label: string }) {
  return (
    <span className="drop-ui drop-slot" data-mode={mode} aria-hidden="true">
      {mode === "line" && <span className="drop-line" />}
      <span className="drop-label">{label}</span>
    </span>
  );
}

interface MarksProps {
  id: string;
  kind: "section" | "column" | "widget";
  name: string;
  relation: Relation;
  hovered: boolean;
  columns: number;
  empty: boolean;
  mark: DragMark;
  // The outline and frame hug what the block draws (a button's pill).
  hug: boolean;
}

function Marks({ id, kind, name, relation, hovered, columns, empty, mark, hug: hugs }: MarksProps) {
  const env = useEnv();
  const { store, ui, newId } = env;
  const select = (target: string) => {
    store.getState().select(target);
    ui.setState({ tray: "edit" });
    focusBlock(target);
  };
  const act = (command: "duplicate" | "delete") => {
    runCommand(env, (doc) => (command === "duplicate" ? makeDuplicate(doc, id, newId) : makeDelete(doc, id)), "canvas");
  };
  return (
    <>
      {empty && <div className="col-empty">Empty column</div>}
      {mark?.kind === "target" && <div className="ov ov-drop ov-drop-target" aria-hidden="true"><span className="ov-label">{mark.label}</span></div>}
      {mark?.kind === "open" && kind === "column" && <div className="ov ov-drop" aria-hidden="true" />}
      {mark?.kind === "shut" && (
        <div className="ov ov-veil" aria-hidden="true">
          {kind === "section" && <span className="veil-note"><Icon name="block" className="i i-xs" />{mark.note}</span>}
        </div>
      )}
      {relation === "selected" && (
        <div className={`ov ov-sel${hugs ? " ov-hug" : ""}`} ref={hugs ? hug : undefined}>
          <i className="br br-tl" /><i className="br br-tr" /><i className="br br-bl" /><i className="br br-br" />
          <div className="ov-bar" role="toolbar" aria-label={name}>
            <button type="button" className="ov-grip" data-grip aria-label={`Move ${name}: drag, or press Space to pick it up`} title="Drag to move. Or press Space to pick up."><Icon name="grip" /></button>
            <span className="ov-name">{kind === "section" ? "Section" : name}</span>
            <button type="button" aria-label={`Duplicate ${name}`} title="Duplicate (Ctrl+D)" onClick={() => act("duplicate")}><Icon name="duplicate" /></button>
            <button type="button" aria-label={`Delete ${name}`} title="Delete (Del)" onClick={() => act("delete")}><Icon name="trash" /></button>
          </div>
        </div>
      )}
      {relation !== "selected" && hovered && (
        <div className={`ov ov-hover${hugs ? " ov-hug" : ""}`} ref={hugs ? hug : undefined} aria-hidden="true"><span className="ov-label">{name}</span></div>
      )}
      {relation === "around" && (
        <div className="ov ov-section">
          <button className="ov-tab" type="button" tabIndex={-1} aria-label={`Select section ${name}`} onClick={() => select(id)}>
            {name} <em>{columns} {plural("column", columns)}</em>
          </button>
        </div>
      )}
      {(relation === "parent" || relation === "column") && (
        <div className="ov ov-col">
          {relation === "parent" && (
            <button className="ov-tab" type="button" tabIndex={-1} aria-label={`Select ${name}`} onClick={() => select(id)}>{name}</button>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------- the canvas

const PREVIEW_NAMES = { desktop: "Desktop", tablet: "Tablet", phone: "Phone" } as const;

export function Canvas() {
  const env = useEnv();
  const { store, ui } = env;
  const document = useEditor((s) => s.drag?.preview ?? s.document);
  const dragType = useEditor((s) => s.drag?.type ?? null);
  const pageMark = useEditor(useShallow((s): DragMark => (s.drag ? containerMark(s.drag, s.drag.preview, PAGE_TARGET) : null)));
  const sections = useEditor((s) => (s.drag?.preview ?? s.document).sections.length);
  const selection = useEditor((s) => s.selection);
  const preview = useUi((u) => u.preview);
  const media = useUi((u) => u.media);
  const siteStyle = useUi((u) => u.siteStyle);
  const site = useUi((u) => u.site);
  const frame = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  // The selected block, the drag's source: its element is given to it by
  // the block itself (SourceRef).
  const source = useDraggable({ id: SELECTION_SOURCE, data: { kind: "selection" }, sensors: SELECTION_SENSORS, disabled: selection === null });
  // The page itself, for a section dropped below the last one.
  const acceptPage = useAccept(PAGE_TARGET);
  const page = useDropTarget({ id: PAGE_TARGET, accept: acceptPage }, collisionPriority(sections));
  const frameRef = useCallback((element: HTMLDivElement | null) => {
    frame.current = element;
    page.ref(element);
  }, [page]);

  // The context's hook must stay the same function: the library's lookup
  // is the only part that changes, and only when the library does.
  const ctx = useMemo<RenderContext>(() => ({ media: mediaResolver(media), useDecoration }), [media]);
  const width = preview === "desktop" ? undefined : PREVIEW_WIDTHS[preview];

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    setMeasured(Math.round(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(() => setMeasured(Math.round(element.getBoundingClientRect().width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [preview]);

  // The page's links, buttons and disclosures take no focus on the canvas:
  // Tab goes from block to block's tab stop, not through the page's links.
  useEffect(() => {
    frame.current?.querySelectorAll<HTMLElement>(".site a[href], .site summary, .site button, .site input, .site textarea, .site select, .site iframe").forEach((element) => {
      if (!element.closest(".ov")) element.tabIndex = -1;
    });
  }, [document]);

  // The container a block is dragged out of keeps the height it has once
  // the block is drawn as the indicator: when the indicator goes to a
  // column further down, nothing between them moves up from under the
  // pointer, which would put the pointer past where it was aiming and the
  // indicator back where it came from, and so on.
  const origin = useEditor((s) => (s.drag?.source.kind === "block" ? (locate(s.drag.base, s.drag.source.id)?.parentId ?? null) : null));
  useLayoutEffect(() => {
    if (origin === null) return undefined;
    const element = frame.current?.querySelector<HTMLElement>(`[data-block-id="${origin}"]`);
    if (!element) return undefined;
    element.style.minHeight = `${element.getBoundingClientRect().height}px`;
    return () => {
      element.style.minHeight = "";
    };
  }, [origin]);

  // With the keyboard, the place the block would land stays in view.
  const keyboardTarget = useEditor((s) => (s.drag && ui.getState().dragMode === "keyboard" ? `${s.drag.target?.parentId ?? ""} ${s.drag.target?.index ?? ""}` : null));
  useEffect(() => {
    if (keyboardTarget === null) return;
    frame.current?.querySelector<HTMLElement>("[data-drag-slot]")?.scrollIntoView?.({ block: "nearest" });
  }, [keyboardTarget]);

  const pick = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    if (!element || element.closest(".ov-bar, .ov-tab")) return;
    const root = element.closest<HTMLElement>("[data-block-id]");
    const id = root?.dataset.blockId ?? null;
    store.getState().select(id);
    ui.setState({ tray: "edit", notice: null });
  };

  const shown = width ?? measured;
  const dragClass = dragType === null ? "" : ` canvas-drag canvas-drag-${dragType === "section" || dragType === "column" ? dragType : "widget"}`;
  return (
    <main
      className={`canvas${dragClass}`}
      aria-label="Page canvas"
      aria-describedby="canvas_keys"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) pick(null);
      }}
    >
      {/* The editor's own ids hold an underscore, which no section anchor
          can (the schema's pattern): the page drawn here gives its
          sections their anchors as ids, and an ARIA reference takes the
          first element with its id. */}
      <p id="canvas_keys" hidden>Arrow keys select the next or previous block. Space picks the selected block up to move it. Question mark lists every shortcut.</p>
      <WidthRule preview={preview} width={shown} fixed={width !== undefined} />
      <SourceRef.Provider value={source.ref}>
        <div
          ref={frameRef}
          className={`frame${width !== undefined ? " frame-fixed" : ""}${pageMark?.kind === "shut" ? " frame-shut" : ""}`}
          style={width !== undefined ? ({ width: `${width}px` } as CSSProperties) : undefined}
          onClickCapture={(event) => {
            const element = event.target instanceof Element ? event.target : null;
            if (element?.closest(".ov-bar, .ov-tab, .invite")) return;
            // A link or a disclosure of the page does nothing on the canvas.
            event.preventDefault();
            // The theme's header and footer are inert, so a click on them
            // reaches the page around them: it says why nothing happens.
            const part = themePartAt(event.currentTarget, event.clientX, event.clientY);
            if (part) {
              ui.getState().say(`The site's ${part} is the theme's, the same on every page: it is not edited here.`);
              return;
            }
            pick(event.target);
          }}
          onContextMenu={(event) => {
            const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-id]") : null;
            const id = element?.dataset.blockId;
            if (!id || store.getState().drag) return;
            openBlockMenu(env, event, id, "canvas");
          }}
          onFocus={(event) => {
            const element = event.target;
            if (!(element instanceof HTMLElement) || element.dataset.blockId === undefined || store.getState().drag) return;
            if (store.getState().selection !== element.dataset.blockId) store.getState().select(element.dataset.blockId);
          }}
          onPointerOver={(event) => {
            if (store.getState().drag) return;
            const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-id]") : null;
            const id = element?.dataset.blockId ?? null;
            if (ui.getState().hover !== id) ui.getState().setHover(id);
          }}
          onPointerLeave={() => ui.getState().setHover(null)}
        >
          {document.sections.length === 0 ? (
            <>
              {site && <ThemeAround siteStyle={siteStyle}><SiteHeader site={site} locked /></ThemeAround>}
              <Invite />
              {site && <ThemeAround siteStyle={siteStyle}><SiteFooter site={site} locked /></ThemeAround>}
            </>
          ) : <PageRoot document={document} ctx={ctx} siteStyle={siteStyle} landmark={false} site={site} lockedTheme {...(width === undefined ? {} : { width })} />}
        </div>
      </SourceRef.Provider>
    </main>
  );
}

// A page root around the theme's header or footer alone, with the site's
// style, for the empty page: the invitation to add a section sits between
// them, outside the page's stylesheets' reach.
function ThemeAround({ siteStyle, children }: { siteStyle: SiteStyleChoice | null; children: ReactNode }) {
  return <div className="site" {...siteStyleAttributes(siteStyle)}><div className="sw">{children}</div></div>;
}

// Which of the theme's parts a point of the canvas falls on, if any.
function themePartAt(frame: Element, x: number, y: number): "header" | "footer" | null {
  for (const element of frame.querySelectorAll<HTMLElement>("[data-theme-part]")) {
    const box = element.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return element.dataset.themePart === "footer" ? "footer" : "header";
  }
  return null;
}

// The canvas's width as a dimension line, notched where the page changes
// layout, each notch named under it (design/styles.css, .wrule).
function WidthRule({ preview, width, fixed }: { preview: keyof typeof PREVIEW_NAMES; width: number; fixed: boolean }) {
  const notches = [
    { x: LAYOUT_BREAKPOINTS.phone, label: "Tablet layout" },
    { x: LAYOUT_BREAKPOINTS.tablet, label: "Desktop layout" },
  ].filter((n) => width > 0 && n.x < width);
  return (
    <div
      className={`wrule${fixed ? " frame-fixed" : ""}`}
      style={fixed ? { width: `${width}px` } : undefined}
      aria-hidden="true"
      title={`The page changes layout at ${LAYOUT_BREAKPOINTS.phone} (tablet) and ${LAYOUT_BREAKPOINTS.tablet} (desktop)`}
    >
      <span className="wrule-line" />
      {notches.map((n) => (
        <span key={n.x} className={`wrule-notch${n.x + 60 > width ? " wrule-notch-end" : ""}`} style={{ "--x": n.x, "--w": width } as CSSProperties}><span>{n.label}</span></span>
      ))}
      <span className="wrule-label">{PREVIEW_NAMES[preview]}{width > 0 ? `, ${width} wide` : ""}</span>
    </div>
  );
}

// ------------------------------------------------------- the empty page

function Invite() {
  const { store, newId } = useEnv();
  const { insertMade } = useInsert();
  const [picking, setPicking] = useState(false);
  const canPublish = useOptionalSession()?.capabilities.publish ?? false;
  const addPreset = (preset: Preset, image?: ImageRef) => {
    const doc = store.getState().document;
    return insertMade(makeInsert(doc, presetSection(doc, preset, newId, image), { parentId: null, index: doc.sections.length }));
  };
  const pictures: Record<Preset, ReactNode> = {
    intro: <span className="preset-pic preset-intro" aria-hidden="true"><i className="pp-h" /><i className="pp-t" /><i className="pp-t pp-short" /><i className="pp-b" /></span>,
    picture: <span className="preset-pic preset-split" aria-hidden="true"><i className="pp-img" /><span><i className="pp-h" /><i className="pp-t" /><i className="pp-t pp-short" /></span></span>,
    icons: <span className="preset-pic preset-three" aria-hidden="true">{[0, 1, 2].map((n) => <span key={n}><i className="pp-dot" /><i className="pp-t" /></span>)}</span>,
  };
  return (
    <div className="invite chrome">
      <div className="invite-zone">
        <h2>Start this page with a section</h2>
        <p>A section is a band across the page. Pick its columns; you can change them later.</p>
        {canPublish && <p className="invite-publish"><Icon name="info" className="i i-xs" />Publish turns on once the page has a section. An empty page has nothing to publish.</p>}
        <div className="invite-layouts" role="group" aria-label="Add a section">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className="layout-btn" onClick={() => insertMade(makeInsertSection(store.getState().document, n, 0, newId))}>
              <span className="layout-pic" style={{ "--n": n } as CSSProperties}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
              {n} {plural("column", n)}
            </button>
          ))}
        </div>
        <h3 className="invite-sub" id="invite_presets">Or start from a ready-made section</h3>
        <div className="invite-presets" role="group" aria-labelledby="invite_presets">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="preset"
              aria-haspopup={preset === "picture" ? "dialog" : undefined}
              onClick={() => (preset === "picture" ? setPicking(true) : addPreset(preset))}
            >
              {pictures[preset]}<span>{PRESET_LABELS[preset]}</span>
            </button>
          ))}
        </div>
        <p className="invite-alt"><Icon name="block" className="i i-xs" />Widgets go inside a column, so the section comes first; then add them from Add, on the left.</p>
      </div>
      {picking && (
        <ImagePicker
          title="Picture beside text"
          confirm="Add section"
          onClose={() => setPicking(false)}
          onPick={([image]) => {
            const refusal = image ? addPreset("picture", image) : null;
            if (refusal === null) setPicking(false);
            return refusal;
          }}
        />
      )}
    </div>
  );
}
