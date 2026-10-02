// The canvas: the page drawn by the published page's renderer (../render)
// with the published page's stylesheets, on the approved design's bench
// (design/shots/editor.png). The page root is as wide as the device
// previewed (the canvas, a tablet, a phone), and the page's container
// queries lay it out for that width, as a visitor's device would.
//
// What the editor adds to the page is drawn inside each block's root
// (../render/context.ts, useDecoration): the selection's marks and its
// floating bar (move, duplicate, delete), the hover outline, the outlines
// of the section and columns around the selection, an empty column's
// place. Each block subscribes to its own part of the state, so a new
// selection redraws the blocks it concerns and no others.
//
// The page's own links, buttons and disclosures do nothing here: a click
// selects the block it falls in.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useStore } from "zustand";
import { makeDelete, makeDuplicate, makeInsert, makeInsertSection } from "../document/commands.ts";
import { blockName, plural } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { Decoration, RawBlock, RenderContext } from "../render/context.ts";
import { PageRoot } from "../render/page.tsx";
import type { ImageRef, PageDocument } from "../shared/document.ts";
import { PREVIEW_WIDTHS } from "../shared/preview-widths.ts";
import { LAYOUT_BREAKPOINTS } from "../shared/site-tokens.ts";
import { runMade, useEditor, useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { focusBlock, useInsert } from "./insert.ts";
import { mediaResolver } from "./media.ts";
import { ImagePicker } from "./pickers.tsx";
import { PRESET_LABELS, presetSection, type Preset } from "./presets.ts";

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

function useDecoration(block: RawBlock): Decoration | undefined {
  const { store, ui } = useEnv();
  const id = typeof block.id === "string" ? block.id : null;
  const relation = useStore(store, (s) => relationOf(s.document, s.selection, id));
  const hovered = useStore(ui, (u) => id !== null && u.hover === id);
  const name = useStore(store, (s) => nameOf(s.document, id));
  if (id === null) return undefined;
  const kind = block.type === "section" ? "section" : block.type === "column" ? "column" : "widget";
  const columns = block.type === "section" && Array.isArray(block.children) ? block.children.length : 0;
  const empty = block.type === "column" && Array.isArray(block.children) && block.children.length === 0;
  return {
    attributes: {
      role: "group",
      "aria-roledescription": kind,
      "aria-label": name,
      tabIndex: relation === "selected" || relation === "entry" ? 0 : -1,
      "data-editor-selected": relation === "selected" ? "true" : undefined,
    },
    after: <Marks id={id} kind={kind} name={name} relation={relation} hovered={hovered} columns={columns} empty={empty} />,
  };
}

interface MarksProps {
  id: string;
  kind: "section" | "column" | "widget";
  name: string;
  relation: Relation;
  hovered: boolean;
  columns: number;
  empty: boolean;
}

function Marks({ id, kind, name, relation, hovered, columns, empty }: MarksProps) {
  const { store, ui, newId } = useEnv();
  const select = (target: string) => {
    store.getState().select(target);
    ui.setState({ tray: "edit" });
    focusBlock(target);
  };
  const act = (command: "duplicate" | "delete") => {
    const doc = store.getState().document;
    const result = runMade(store, command === "duplicate" ? makeDuplicate(doc, id, newId) : makeDelete(doc, id));
    if (!result.ok) {
      ui.getState().say(result.error.message);
      return;
    }
    ui.getState().say(null);
    const focus = result.outcome.focus;
    if (focus) focusBlock(focus.id);
    else document.querySelector<HTMLElement>(".canvas")?.focus();
  };
  return (
    <>
      {empty && <div className="col-empty">Empty column</div>}
      {relation === "selected" && (
        <div className="ov ov-sel">
          <i className="br br-tl" /><i className="br br-tr" /><i className="br br-bl" /><i className="br br-br" />
          <div className="ov-bar" role="toolbar" aria-label={name}>
            <span className="ov-grip" aria-hidden="true"><Icon name="grip" /></span>
            <span className="ov-name">{kind === "section" ? "Section" : name}</span>
            <button type="button" aria-label={`Duplicate ${name}`} title="Duplicate" onClick={() => act("duplicate")}><Icon name="duplicate" /></button>
            <button type="button" aria-label={`Delete ${name}`} title="Delete" onClick={() => act("delete")}><Icon name="trash" /></button>
          </div>
        </div>
      )}
      {relation !== "selected" && hovered && (
        <div className="ov ov-hover" aria-hidden="true"><span className="ov-label">{name}</span></div>
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
  const { store, ui } = useEnv();
  const document = useEditor((s) => s.document);
  const preview = useUi((u) => u.preview);
  const media = useUi((u) => u.media);
  const siteStyle = useUi((u) => u.siteStyle);
  const frame = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

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

  const pick = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    if (!element || element.closest(".ov-bar, .ov-tab")) return;
    const root = element.closest<HTMLElement>("[data-block-id]");
    const id = root?.dataset.blockId ?? null;
    store.getState().select(id);
    ui.setState({ tray: "edit", notice: null });
  };

  const shown = width ?? measured;
  return (
    <main
      className="canvas"
      aria-label="Page canvas"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) pick(null);
      }}
    >
      <WidthRule preview={preview} width={shown} fixed={width !== undefined} />
      <div
        ref={frame}
        className={`frame${width !== undefined ? " frame-fixed" : ""}`}
        style={width !== undefined ? ({ width: `${width}px` } as CSSProperties) : undefined}
        onClickCapture={(event) => {
          const element = event.target instanceof Element ? event.target : null;
          if (element?.closest(".ov-bar, .ov-tab, .invite")) return;
          // A link or a disclosure of the page does nothing on the canvas.
          event.preventDefault();
          pick(event.target);
        }}
        onFocus={(event) => {
          const element = event.target;
          if (!(element instanceof HTMLElement) || element.dataset.blockId === undefined) return;
          if (store.getState().selection !== element.dataset.blockId) store.getState().select(element.dataset.blockId);
        }}
        onPointerOver={(event) => {
          const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-id]") : null;
          const id = element?.dataset.blockId ?? null;
          if (ui.getState().hover !== id) ui.getState().setHover(id);
        }}
        onPointerLeave={() => ui.getState().setHover(null)}
      >
        {document.sections.length === 0
          ? <Invite />
          : <PageRoot document={document} ctx={ctx} siteStyle={siteStyle} landmark={false} {...(width === undefined ? {} : { width })} />}
      </div>
    </main>
  );
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
        <div className="invite-layouts" role="group" aria-label="Add a section">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className="layout-btn" onClick={() => insertMade(makeInsertSection(store.getState().document, n, 0, newId))}>
              <span className="layout-pic" style={{ "--n": n } as CSSProperties}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
              {n} {plural("column", n)}
            </button>
          ))}
        </div>
        <h3 className="invite-sub" id="invite-presets">Or start from a ready-made section</h3>
        <div className="invite-presets" role="group" aria-labelledby="invite-presets">
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
