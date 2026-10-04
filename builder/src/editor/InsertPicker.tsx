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
//
// Its keys are dragged as Insert's are (./tiles.ts), by the mouse or by
// Space and the arrows, to put their block somewhere else than its line;
// while one is, the picker and its line give way, and once its block is
// added elsewhere the picker closes. A key dropped that needs something
// first (an image, images, a video, a picture), from here or from
// Insert, opens the picker at the drop place with that window already
// open, which stands beside the yellow line and not over it
// (./place-dialog.ts): what the window returns is added there; Esc or
// Cancel adds nothing, closes the picker, and gives the focus back.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { makeInsert, makeInsertSection } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import { plural } from "../document/labels.ts";
import type { ImageRef, VideoProvider, WidgetBlock } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { LAYOUT, WIDGETS } from "../widgets/registry.ts";
import { newWidget, type AnyWidgetDefinition, type InputOf } from "../widgets/types.ts";
import { afterRender } from "./act.ts";
import { canvasUi, useCanvasUi, type Asking, type InsertPlace } from "./canvas-ui.ts";
import { useEditor, useEnv, type EditorEnv } from "./context.tsx";
import { TILE_SENSORS, useDraggable } from "./drag/dnd.ts";
import { openDrawer } from "./Drawer.tsx";
import { Icon } from "./icons.tsx";
import { useInsert } from "./insert.ts";
import { placeExists, placeKey, placeWords, type PlaceWords } from "./insert-place.ts";
import { ImagePicker, VideoPicker } from "./pickers.tsx";
import { PRESET_PICTURES } from "./preset-pictures.tsx";
import { PRESET_LABELS, presetSection, PRESETS, type Preset } from "./presets.ts";
import { askedWidget, DRAG_WORDS, presetTile, sectionTile, widgetTile, type TileSource } from "./tiles.ts";

// What takes the focus back when the picker closes: the "+" that opened
// it, drawn again by then (found by its data-plus), or the element that
// had the focus (the block, for the "+" key; the clamp's key, for its
// menu's Insert after; a key of Insert, dropped).
let returnTo: { plus: string } | { element: HTMLElement } | null = null;

// `asking`: a key was dropped at the place and asks for something first;
// the picker opens with its window. A key of the picker itself, dropped
// elsewhere, moves the picker, and the focus still goes back to what
// opened it in the first place.
export function openInserter(env: Pick<EditorEnv, "ui">, place: InsertPlace, from: Element | null, asking: Asking | null = null): void {
  if (!(from instanceof Element && from.closest(".picker"))) {
    const plus = from instanceof HTMLElement ? from.closest<HTMLElement>("[data-plus]")?.dataset.plus : undefined;
    const active = document.activeElement;
    const element = from instanceof HTMLElement ? from : active instanceof HTMLElement && active !== document.body ? active : null;
    returnTo = plus ? { plus } : element ? { element } : null;
  }
  env.ui.getState().setBlockMenu(null);
  env.ui.getState().setHover(null);
  canvasUi(env.ui).getState().setInserting(place, asking);
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
  const asking = useCanvasUi((s) => s.asking);
  // A drop at the very place the picker stands opens a new one, its
  // window open.
  return place ? <Picker key={`${placeKey(place)}${asking ? `:${asking.kind === "widget" ? asking.type : asking.kind}` : ""}`} place={place} dropped={asking} /> : null;
}

// A key of the picker: a button its arrows go to (found by its index in
// the list), and a drag source.
function PickerKey({ id, index, tile, className, ...button }: {
  id: string;
  index: number;
  tile: TileSource;
  className: string;
  tabIndex: number;
  "aria-haspopup": "dialog" | undefined;
  "aria-describedby": string;
  onFocus: () => void;
  onClick: () => void;
  children: ReactNode;
}) {
  const { ref } = useDraggable({ id, data: tile, sensors: TILE_SENSORS });
  return <button ref={ref} type="button" className={className} data-key-index={index} data-draggable="" {...button} />;
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

function Picker({ place, dropped }: { place: InsertPlace; dropped: Asking | null }) {
  const env = useEnv();
  const { store, newId } = env;
  const doc = useEditor((s) => s.document);
  // One of its keys being dragged: the picker and its line give way
  // (canvas.css, ./Canvas.tsx).
  const dragging = useEditor((s) => s.drag !== null);
  const { insertMade } = useInsert();
  const [query, setQuery] = useState("");
  // Opened by a dropped key, the picker opens on that key's window.
  const [asking, setAsking] = useState<AnyWidgetDefinition | "picture" | null>(() => (dropped === null ? null : dropped.kind === "picture" ? "picture" : askedWidget(dropped)));
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

  // One command at the place; the picker closes once the page has it. For
  // a dropped key, the live region says so, as it says how a drag ended.
  const settle = (made: Parameters<typeof insertMade>[0]) => {
    const refusal = insertMade(made);
    if (refusal !== null) return refusal;
    const label = store.getState().past.at(-1)?.command.label;
    if (dropped && label) env.ui.setState({ dragSaid: `${label}.` });
    closeInserter(env, false);
    return null;
  };
  // The window closed without adding: back to the picker's keys; for a
  // dropped key, nothing was added, and the focus goes back to the key.
  const unask = () => {
    if (dropped === null) {
      setAsking(null);
      return;
    }
    env.ui.setState({ dragSaid: "Cancelled: nothing was added." });
    closeInserter(env, true);
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

  // A key dragged with the keyboard starts on this picker's line.
  const here = () => (place.kind === "block" ? { parentId: place.parentId, index: place.index } : { parentId: null, index: place.index });

  // The keys in reading order, each with its row and its place in it.
  const keys: Array<{ key: string; row: number; col: number; label: string; node: ReactNode; popup: boolean; press: () => void; tile: TileSource }> = [];
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
        tile: widgetTile(definition, newId, here),
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
        tile: sectionTile(choice.count, newId, here),
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
        tile: presetTile(preset, newId, here),
      };
    });
  }
  const at = Math.min(current, Math.max(0, keys.length - 1));
  // The keys are found by their place in the list, which each carries.
  const keyAt = (index: number) => box.current?.querySelector<HTMLButtonElement>(`[data-key-index="${index}"]`) ?? null;
  const go = (index: number) => {
    setCurrent(index);
    keyAt(index)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // While a key is moved with the keyboard, the arrows, Space and Esc
    // are the drag's (the drag library takes them first and marks them
    // taken): none moves to another key or closes the picker.
    if (event.defaultPrevented || store.getState().drag !== null) return;
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
    const from = target.dataset.keyIndex === undefined ? -1 : Number(target.dataset.keyIndex);
    if (!(from >= 0 && from < keys.length)) return;
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
  // Said under the window that asks for an image or a video, which covers
  // the line: where the block will land, its column named.
  const landing = <>Lands on the yellow line on the page, <Lands words={words} kind={place.kind} />{place.kind === "block" && words.lands.before ? <> in <strong>{words.lands.within}</strong></> : null}.</>;
  // That line, which the window stands beside, as the picker does, and
  // never over (./place-dialog.ts).
  const beside = place.kind === "block" ? ".canvas .ins-slot" : ".canvas .seam-line";

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
        data-giving-way={dragging ? "" : undefined}
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
                  <PickerKey
                    key={key.key}
                    id={`pick:${key.key}`}
                    index={index}
                    tile={key.tile}
                    className={place.kind === "block" ? "pkey" : group.id === "columns" ? "layout-btn" : "preset"}
                    tabIndex={index === at ? 0 : -1}
                    aria-haspopup={key.popup ? "dialog" : undefined}
                    aria-describedby={`${id}-drag`}
                    onFocus={() => setCurrent(index)}
                    onClick={key.press}
                  >
                    {key.node}
                  </PickerKey>
                );
              })}
            </div>
          </div>
        ))}
        {keys.length === 0 && <p className="picker-none" role="status">{place.kind === "block" ? "No block" : "No section"} is called “{query.trim()}”.</p>}
        <p id={`${id}-drag`} hidden>{DRAG_WORDS}</p>
        <div className="picker-foot">
          <p>Lands on the yellow line, <Lands words={words} kind={place.kind} />.</p>
          <p className="picker-keys">{place.kind === "block" ? <>Arrows choose, <kbd className="kc">Enter</kbd> adds, <kbd className="kc">Esc</kbd> closes</> : <><kbd className="kc">Esc</kbd> closes without adding anything</>}</p>
          <button className="link" type="button" onClick={() => {
            closeInserter(env, false);
            openDrawer(env, "insert");
          }}>{place.kind === "block" ? "Browse everything in Insert" : "More in Insert"}</button>
        </div>
      </div>

      {asking === "picture" && (
        <ImagePicker
          confirm="Add section"
          where={landing}
          beside={beside}
          onClose={unask}
          onPick={([image]) => (image ? addPreset("picture", image) : null)}
        />
      )}
      {asking && asking !== "picture" && (asking.needs === "image" || asking.needs === "images") && (
        <ImagePicker
          confirm={asking.needs === "image" ? "Add image" : "Add gallery"}
          multiple={asking.needs === "images"}
          where={landing}
          beside={beside}
          onClose={unask}
          onPick={(images: ImageRef[]) => addWidget(asking, asking.needs === "image" ? images[0]! : (images as unknown as InputOf["gallery"]))}
        />
      )}
      {asking && asking !== "picture" && asking.needs === "video" && (
        <VideoPicker
          where={landing}
          beside={beside}
          onClose={unask}
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
