// The picker a "+" opens on the canvas (design/layout/shots/add.png and
// shots-extra/insert-at-seam.png): the "+" first opens the yellow
// insertion line at its place (./Canvas.tsx draws it), then this small
// window beside the line offers only what fits there: the widgets in a
// column; at a seam between sections, a section of 1 to 4 columns or a
// ready-made one. A non-modal dialog: its search takes the focus, the
// arrows move between its keys, Enter adds, Esc closes and gives the focus
// back to the "+" (or to what opened it), a press elsewhere closes it.
//
// What it adds goes in by ONE command made at the place (makeInsert, as
// the Insert drawer's do), the new block selected and focused; a widget
// that needs an image or a video asks for it first, as Insert does.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { makeInsert, makeInsertSection } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import { plural } from "../document/labels.ts";
import type { ImageRef, VideoProvider, WidgetBlock } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { LAYOUT, WIDGETS } from "../widgets/registry.ts";
import { newWidget, type AnyWidgetDefinition, type InputOf } from "../widgets/types.ts";
import { afterRender } from "./act.ts";
import { canvasUi, useCanvasUi, type InsertPlace } from "./canvas-ui.ts";
import { useEditor, useEnv, type EditorEnv } from "./context.tsx";
import { openDrawer } from "./Drawer.tsx";
import { Icon } from "./icons.tsx";
import { useInsert } from "./insert.ts";
import { placeExists, placeKey, placeWords, type PlaceWords } from "./insert-place.ts";
import { ImagePicker, VideoPicker } from "./pickers.tsx";
import { PRESET_PICTURES } from "./preset-pictures.tsx";
import { PRESET_LABELS, presetSection, PRESETS, type Preset } from "./presets.ts";

// What takes the focus back when the picker closes: the "+" that opened
// it, drawn again by then (found by its data-plus), or the element that
// had the focus (the block, for the "+" key; the clamp's key, for its
// menu's Insert after).
let returnTo: { plus: string } | { element: HTMLElement } | null = null;

export function openInserter(env: Pick<EditorEnv, "ui">, place: InsertPlace, from: Element | null): void {
  const plus = from instanceof HTMLElement ? from.closest<HTMLElement>("[data-plus]")?.dataset.plus : undefined;
  const active = document.activeElement;
  const element = from instanceof HTMLElement ? from : active instanceof HTMLElement && active !== document.body ? active : null;
  returnTo = plus ? { plus } : element ? { element } : null;
  env.ui.getState().setBlockMenu(null);
  env.ui.getState().setHover(null);
  canvasUi(env.ui).getState().setInserting(place);
}

export function closeInserter(env: Pick<EditorEnv, "ui">, focusBack: boolean): void {
  canvasUi(env.ui).getState().setInserting(null);
  const back = returnTo;
  returnTo = null;
  if (!focusBack) return;
  afterRender(() => {
    const element = back === null ? null : "plus" in back ? document.querySelector<HTMLElement>(`.canvas [data-plus="${back.plus}"]`) : back.element.isConnected ? back.element : null;
    // Nothing left to go back to: the canvas's one Tab stop.
    (element ?? document.querySelector<HTMLElement>(".canvas [data-block-id][tabindex='0']") ?? document.querySelector<HTMLElement>(".canvas"))?.focus({ preventScroll: true });
  });
}

// The picker's id, which its "+" names (aria-controls): the editor's own
// ids hold an underscore, which no section's anchor can.
export const PICKER_ID = "canvas_picker";

export function InsertPicker() {
  const place = useCanvasUi((s) => s.inserting);
  return place ? <Picker key={placeKey(place)} place={place} /> : null;
}

const matching = (label: string, query: string) => query.trim() === "" || label.toLowerCase().includes(query.trim().toLowerCase());

// The keys of the picker, row by row as they are laid out: the arrows go
// along a row and to the same place in the row above or below.
const ROW = { widgets: 3, layouts: 4, presets: 3 } as const;

// Where the picker stands, in the canvas's own coordinates (it scrolls
// with the page): beside the yellow line, on the side with room for it,
// or, at a seam, above the line, to the right of its "+".
interface PickerPlace {
  style: CSSProperties;
  // Which side of the line it stands on, for its leader, and the leader's
  // height in it.
  side: "right" | "left" | "over";
  leader: number;
}

function placePicker(picker: HTMLElement, place: InsertPlace): PickerPlace | null {
  const canvas = picker.closest<HTMLElement>(".canvas");
  const line = canvas?.querySelector<HTMLElement>(place.kind === "block" ? ".ins-slot" : ".seam-line");
  const plus = canvas?.querySelector<HTMLElement>(".ins.is-open");
  if (!canvas || !line) return null;
  const view = canvas.getBoundingClientRect();
  const left = view.left + canvas.clientLeft;
  const top = view.top + canvas.clientTop;
  const right = left + canvas.clientWidth;
  const bottom = top + canvas.clientHeight;
  const at = line.getBoundingClientRect();
  const width = picker.offsetWidth;
  const height = picker.offsetHeight;
  const GAP = 28;
  const lineY = at.top + at.height / 2;
  let x: number;
  let y: number;
  let side: PickerPlace["side"] = "over";
  if (place.kind === "block") {
    if (at.right + GAP + width <= right - 8) {
      x = at.right + GAP;
      side = "right";
    } else if (at.left - GAP - width >= left + 8) {
      x = at.left - GAP - width;
      side = "left";
    } else x = right - 8 - width;
    y = lineY - height * 0.36;
  } else {
    const from = plus?.getBoundingClientRect() ?? at;
    x = Math.min(from.right + 12, right - 8 - width);
    y = lineY - 26 - height >= top + 8 ? lineY - 26 - height : lineY + 26;
  }
  x = Math.max(left + 8, x);
  y = Math.max(top + 8, Math.min(y, bottom - 8 - height));
  return { style: { left: x - left + canvas.scrollLeft, top: y - top + canvas.scrollTop }, side, leader: lineY - y };
}

function Picker({ place }: { place: InsertPlace }) {
  const env = useEnv();
  const { store, newId } = env;
  const doc = useEditor((s) => s.document);
  const { insertMade } = useInsert();
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<AnyWidgetDefinition | "picture" | null>(null);
  const [current, setCurrent] = useState(0);
  const [position, setPosition] = useState<PickerPlace | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const words = placeWords(doc, place);
  const gone = !placeExists(doc, place);

  // The place left the page (an undo, a reload): the picker goes too.
  useEffect(() => {
    if (gone) closeInserter(env, false);
  }, [env, gone]);

  // The search takes the focus once the picker stands beside its line
  // (hidden until then, it could not take it), and again when the window
  // that asked for an image or a video closes without one.
  const placed = position !== null;
  useEffect(() => {
    if (placed && asking === null) search.current?.focus({ preventScroll: true });
  }, [placed, asking]);

  // Placed beside its line, and again as the canvas changes size.
  useLayoutEffect(() => {
    const picker = box.current;
    const canvas = picker?.closest(".canvas");
    if (!picker || !canvas) return undefined;
    const reposition = () => setPosition(placePicker(picker, place));
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(canvas);
    observer.observe(picker);
    return () => observer.disconnect();
  }, [place]);

  // A press anywhere else closes it, the focus where the press put it.
  // Not while it asks for an image or a video in a window of its own.
  useEffect(() => {
    if (asking) return undefined;
    const away = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".picker, .ins.is-open, [role=dialog][aria-modal=true]")) return;
      closeInserter(env, false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [env, asking]);

  if (gone) return null;

  // One command at the place; the picker closes once the page has it.
  const settle = (made: Parameters<typeof insertMade>[0]) => {
    const refusal = insertMade(made);
    if (refusal === null) closeInserter(env, false);
    return refusal;
  };
  const addWidget = (definition: AnyWidgetDefinition, input?: unknown) => {
    if (place.kind !== "block") return null;
    const page = store.getState().document;
    const block = newWidget(definition as never, idDraw(page, newId)(), input as never) as WidgetBlock;
    return settle(makeInsert(page, block, { parentId: place.parentId, index: place.index }));
  };
  const addSection = (columns: number) => settle(makeInsertSection(store.getState().document, columns, place.kind === "section" ? place.index : 0, newId));
  const addPreset = (preset: Preset, image?: ImageRef) => {
    const page = store.getState().document;
    return settle(makeInsert(page, presetSection(page, preset, newId, image), { parentId: null, index: place.kind === "section" ? place.index : 0 }));
  };

  const widgets = place.kind === "block" ? WIDGETS.filter((w) => matching(w.label, query)) : [];
  const layouts = place.kind === "section" ? LAYOUT.columns.filter((c) => matching(c.label, query)) : [];
  const presets = place.kind === "section" ? PRESETS.filter((p) => matching(PRESET_LABELS[p], query)) : [];

  // The keys in reading order, each with its row and its place in it.
  const keys: Array<{ key: string; row: number; col: number; label: string; node: ReactNode; popup: boolean; press: () => void }> = [];
  const lay = (group: readonly unknown[], perRow: number, rowStart: number, make: (index: number) => Omit<(typeof keys)[number], "row" | "col">) => {
    group.forEach((_, index) => keys.push({ ...make(index), row: rowStart + Math.floor(index / perRow), col: index % perRow }));
    return rowStart + Math.ceil(group.length / perRow);
  };
  if (place.kind === "block") {
    lay(widgets, ROW.widgets, 0, (index) => {
      const definition = widgets[index]!;
      return {
        key: definition.type,
        label: definition.label,
        popup: definition.needs !== null,
        node: <><WidgetIcon icon={definition.icon} className="i" />{definition.label}</>,
        press: () => (definition.needs === null ? void addWidget(definition) : setAsking(definition)),
      };
    });
  } else {
    const after = lay(layouts, ROW.layouts, 0, (index) => {
      const choice = layouts[index]!;
      return {
        key: `columns-${choice.count}`,
        label: choice.label,
        popup: false,
        node: <><span className="layout-pic" aria-hidden="true" style={{ "--n": choice.count } as CSSProperties}>{Array.from({ length: choice.count }, (_, i) => <i key={i} />)}</span>{choice.count} {plural("column", choice.count)}</>,
        press: () => void addSection(choice.count),
      };
    });
    lay(presets, ROW.presets, after, (index) => {
      const preset = presets[index]!;
      return {
        key: preset,
        label: PRESET_LABELS[preset],
        popup: preset === "picture",
        node: <>{PRESET_PICTURES[preset]}<span className="preset-name">{PRESET_LABELS[preset]}</span></>,
        press: () => (preset === "picture" ? setAsking("picture") : void addPreset(preset)),
      };
    });
  }
  const at = Math.min(current, Math.max(0, keys.length - 1));
  const keyRefs = new Map<number, HTMLButtonElement>();
  const go = (index: number) => {
    setCurrent(index);
    keyRefs.get(index)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInserter(env, true);
      return;
    }
    const target = event.target as HTMLElement;
    if (target === search.current) {
      if (event.key === "ArrowDown" && keys.length > 0) {
        event.preventDefault();
        go(0);
      } else if (event.key === "Enter" && keys.length > 0) {
        event.preventDefault();
        keys[0]!.press();
      }
      return;
    }
    const from = keys.findIndex((_, index) => keyRefs.get(index) === target);
    if (from < 0) return;
    const here = keys[from]!;
    let next: number | undefined;
    if (event.key === "ArrowRight") next = Math.min(keys.length - 1, from + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, from - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = keys.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const row = here.row + (event.key === "ArrowDown" ? 1 : -1);
      const inRow = keys.map((k, index) => ({ k, index })).filter(({ k }) => k.row === row);
      if (inRow.length === 0) {
        // Up from the first row goes back to the search.
        if (event.key === "ArrowUp") {
          event.preventDefault();
          search.current?.focus();
        }
        return;
      }
      next = (inRow.find(({ k }) => k.col === here.col) ?? inRow.at(-1)!).index;
    } else return;
    event.preventDefault();
    go(next);
  };

  const groups = place.kind === "block"
    ? [{ id: "blocks", title: "Blocks that go in a column", className: "pkeys", from: 0, to: keys.length }]
    : [
      { id: "columns", title: "Columns", className: "layouts", from: 0, to: layouts.length },
      { id: "ready", title: "Ready-made", className: "pick-presets", from: layouts.length, to: keys.length },
    ];
  const searchWords = place.kind === "block" ? "Search blocks" : "Search sections";

  return (
    <>
      <div
        ref={box}
        className={`picker chrome ${place.kind === "block" ? "picker-w" : "picker-s"}`}
        id={PICKER_ID}
        role="dialog"
        aria-labelledby={`${id}-title`}
        hidden={asking !== null}
        data-side={position?.side}
        style={position ? { ...position.style, "--leader-y": `${position.leader}px` } as CSSProperties : { visibility: "hidden" }}
        onKeyDown={onKeyDown}
      >
        <div className={`picker-head${place.kind === "section" ? " picker-head-title" : ""}`}>
          <h2 id={`${id}-title`} className={place.kind === "block" ? "visually-hidden" : undefined}>{words.title}</h2>
          <label className={`search${place.kind === "section" ? " search-small" : ""}`}>
            <Icon name="search" />
            <input ref={search} type="search" placeholder={searchWords} aria-label={searchWords} value={query} onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(0);
            }} />
          </label>
        </div>
        {groups.map((group) => group.to > group.from && (
          <div key={group.id}>
            <p className="picker-sub" id={`${id}-${group.id}`}>{group.title}</p>
            <div className={group.className} role="group" aria-labelledby={`${id}-${group.id}`}>
              {keys.slice(group.from, group.to).map((key, offset) => {
                const index = group.from + offset;
                return (
                  <button
                    key={key.key}
                    ref={(element) => {
                      if (element) keyRefs.set(index, element);
                    }}
                    type="button"
                    className={place.kind === "block" ? "pkey" : group.id === "columns" ? "layout-btn" : "preset"}
                    tabIndex={index === at ? 0 : -1}
                    aria-haspopup={key.popup ? "dialog" : undefined}
                    onFocus={() => setCurrent(index)}
                    onClick={key.press}
                  >
                    {key.node}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {keys.length === 0 && <p className="picker-none" role="status">{place.kind === "block" ? "No block" : "No section"} is called “{query.trim()}”.</p>}
        <div className="picker-foot">
          <p>Lands on the yellow line, <Lands words={words} kind={place.kind} />.</p>
          <p className="picker-keys">{place.kind === "block" ? <>Arrows choose, <kbd className="kc">Enter</kbd> adds, <kbd className="kc">Esc</kbd> closes</> : <><kbd className="kc">Esc</kbd> closes without adding anything</>}</p>
          <button className="link" type="button" onClick={() => {
            closeInserter(env, false);
            openDrawer(env.ui, "insert");
          }}>{place.kind === "block" ? "Browse everything in Insert" : "More in Insert"}</button>
        </div>
      </div>

      {asking === "picture" && (
        <ImagePicker
          confirm="Add section"
          onClose={() => setAsking(null)}
          onPick={([image]) => (image ? addPreset("picture", image) : null)}
        />
      )}
      {asking && asking !== "picture" && (asking.needs === "image" || asking.needs === "images") && (
        <ImagePicker
          confirm={asking.needs === "image" ? "Add image" : "Add gallery"}
          multiple={asking.needs === "images"}
          onClose={() => setAsking(null)}
          onPick={(images: ImageRef[]) => addWidget(asking, asking.needs === "image" ? images[0]! : (images as unknown as InputOf["gallery"]))}
        />
      )}
      {asking && asking !== "picture" && asking.needs === "video" && (
        <VideoPicker
          onClose={() => setAsking(null)}
          onPick={(video: { provider: VideoProvider; videoId: string; title: string }) => {
            if (place.kind !== "block") return null;
            const page = store.getState().document;
            const block = newWidget(asking as never, idDraw(page, newId)(), { provider: video.provider, videoId: video.videoId } as never) as WidgetBlock;
            if (block.type === "video") block.props = { ...block.props, title: video.title };
            return settle(makeInsert(page, block, { parentId: place.parentId, index: place.index }));
          }}
        />
      )}
    </>
  );
}

// "after Heading", "between Hero and What we do", "at the top of Column 1".
function Lands({ words, kind }: { words: PlaceWords; kind: InsertPlace["kind"] }) {
  const { before, after, within } = words.lands;
  if (before && after) return kind === "section" ? <>between <strong>{before}</strong> and <strong>{after}</strong></> : <>after <strong>{before}</strong></>;
  if (before) return <>after <strong>{before}</strong></>;
  if (after) return kind === "section" ? <>before <strong>{after}</strong></> : <>at the top of <strong>{within}</strong></>;
  return kind === "section" ? <>on the empty page</> : <>in <strong>{within}</strong></>;
}
