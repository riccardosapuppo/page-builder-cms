// The Insert drawer (the approved layout, design/layout/shots-extra/
// insert-drawer-1280.png): the catalogue of everything that can be added,
// with a search over it, in two tabs. Blocks: a new section by its number
// of columns, then the widgets as named keys in their groups. Sections:
// the ready-made sections the empty page offers too. Above them, a
// sentence says where a click puts a block. Each group is a labelled group
// of buttons; Enter or a click adds where the selection says (./insert.ts),
// and every key, a block or a section, dragged onto the page adds where it
// is dropped (./drag/DragLayer.tsx, ./tiles.ts): by the mouse, or picked up
// by Space where Enter would add it and moved with the arrows. The new
// block is made, with its ids, when the drag begins.
//
// At its foot, a sentence says the page's own "+" add where they sit
// (./InsertPicker.tsx): the drawer is the catalogue, the "+" the way. A
// header or a footer holds no form, so neither offers one there; only a
// collection's template is offered This entry, its Field block, and, in
// the template of the collection the shop sells from while the shop is on,
// Add to cart; and a Collection list only where the storage keeps
// collections, naming the first of them as it comes (./insert.ts,
// insertableWidgets, widgetInput).
//
// Three widgets need something first (an image, images, a video), and so
// does the ready-made section with a picture: their key asks for it, then
// adds the block with it. Dragged, such a key is dropped as no command: the
// place is kept, and its window opens there (./InsertPicker.tsx), which
// adds the block at that place, or nothing.
import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { makeInsert, makeInsertSection } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { ImageRef, PageDocument, VideoProvider, WidgetBlock } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { LAYOUT } from "../widgets/registry.ts";
import { newWidget, WIDGET_GROUPS, type AnyWidgetDefinition, type InputOf } from "../widgets/types.ts";
import { useEditor, useEnv } from "./context.tsx";
import { TILE_SENSORS, useDraggable } from "./drag/dnd.ts";
import { Icon } from "./icons.tsx";
import { insertableWidgets, insertTarget, useInsert, useSellsHere, widgetInput } from "./insert.ts";
import { useCoarsePointer } from "./layout-mode.ts";
import { ImagePicker, VideoPicker } from "./pickers.tsx";
import { PRESET_PICTURES } from "./preset-pictures.tsx";
import { PRESET_LABELS, presetSection, PRESETS, type Preset } from "./presets.ts";
import { useOpenKind, useOptionalSession } from "./session.tsx";
import { DRAG_WORDS, presetTile, sectionTile, widgetTile, type TileSource } from "./tiles.ts";

// A key of the catalogue: a button, and the source of a drag.
function Tile({ id, tile, className, label, title, popup, describedBy, onClick, children }: {
  id: string;
  tile: TileSource;
  className?: string;
  label?: string;
  title?: string;
  popup?: boolean;
  describedBy: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { ref, isDragSource } = useDraggable({ id, data: tile, sensors: TILE_SENSORS });
  // While its block is dragged, the key leaves a dashed place in the
  // drawer, so the person sees what they took.
  const classes = [className, isDragSource ? "is-sel" : null].filter(Boolean).join(" ") || undefined;
  return (
    <button ref={ref} className={classes} type="button" aria-label={label} title={title} aria-haspopup={popup ? "dialog" : undefined} aria-describedby={describedBy} data-draggable="" onClick={onClick}>
      {children}
    </button>
  );
}

const matches = (label: string, query: string) => label.toLowerCase().includes(query.trim().toLowerCase());

const TABS = ["blocks", "sections"] as const;
type Tab = (typeof TABS)[number];
const TAB_NAMES: Readonly<Record<Tab, string>> = { blocks: "Blocks", sections: "Sections" };
const NEW_SECTION = "New section, by number of columns";

// Where a click puts a block, in words: after the selection, as a paste
// goes; with nothing selected, at the end of the page's last column; a
// section selected holds no block of its own. With a finger, a tap, and a
// key held before it is dragged (./drag/dnd.ts, TILE_SENSORS).
export function whereWords(doc: PageDocument, selection: string | null, touch = false): ReactNode {
  const drag = touch ? "hold a key and drag it to any column" : "drag to any column";
  const press = touch ? "Tap" : "Click";
  const at = insertTarget(doc, "heading", selection);
  const column = at?.parentId ? locate(doc, at.parentId) : undefined;
  if (!at || !column || column.block.type !== "column" || column.parentId === null) {
    return doc.sections.length === 0 ? "Blocks go inside a column: add a section first." : `Select a column, or a block in one, to add there; or ${drag}.`;
  }
  const place = `${blockName(doc, column.block.id)} of ${blockName(doc, column.parentId)}`;
  const before = column.block.children[at.index - 1];
  if (selection === null) return <>{press} to add at the end of {place}, or {drag}.</>;
  if (!before) return <>{press} to add at the top of {place}, or {drag}.</>;
  return <>{press} to add after <strong>{blockName(doc, before.id)}</strong> in {place}, or {drag}.</>;
}

export function Palette() {
  const { store, ui, newId } = useEnv();
  const { insertBlock, insertMade } = useInsert();
  const doc = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const kind = useOpenKind();
  const collections = useOptionalSession()?.capabilities.collections ?? false;
  const sells = useSellsHere();
  const touch = useCoarsePointer();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("blocks");
  const [asking, setAsking] = useState<AnyWidgetDefinition | "picture" | null>(null);
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // A new widget with an id the page does not have.
  const make = <T extends AnyWidgetDefinition>(definition: T, input: unknown): WidgetBlock => {
    const blockId = idDraw(store.getState().document, newId)();
    return newWidget(definition as never, blockId, input as never) as WidgetBlock;
  };
  const addWidget = (definition: AnyWidgetDefinition) => {
    if (definition.needs !== null) {
      setAsking(definition);
      return;
    }
    insertBlock(make(definition, widgetInput(definition, ui.getState().siteEntries)));
  };
  // Where a key picked up by the keyboard starts: where Enter would add
  // its block, by the selection as it is when the drag begins.
  const sectionAt = (page: PageDocument) => insertTarget(page, "section", store.getState().selection)?.index ?? page.sections.length;
  const widgetStart = (definition: AnyWidgetDefinition) => (page: PageDocument) => insertTarget(page, definition.type, store.getState().selection);
  const sectionStart = (page: PageDocument) => ({ parentId: null, index: sectionAt(page) });
  const addSection = (columns: number) => {
    const page = store.getState().document;
    insertMade(makeInsertSection(page, columns, sectionAt(page), newId));
  };
  const addPreset = (preset: Preset, image?: ImageRef) => {
    const page = store.getState().document;
    return insertMade(makeInsert(page, presetSection(page, preset, newId, image), { parentId: null, index: sectionAt(page) }));
  };

  const layoutShown = query.trim() === "" || matches(NEW_SECTION, query) || /^\s*[1-4]\s*$/.test(query);
  const groups = WIDGET_GROUPS.map((group) => ({
    ...group,
    widgets: insertableWidgets(kind, collections, sells).filter((w) => w.group === group.id && (query.trim() === "" || matches(w.label, query) || matches(group.label, query))),
  })).filter((group) => group.widgets.length > 0);
  const presets = PRESETS.filter((preset) => query.trim() === "" || matches(PRESET_LABELS[preset], query) || matches("Ready-made section", query));
  const blocksFound = layoutShown || groups.length > 0;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = TABS[(index + 1) % TABS.length]!;
    setTab(next);
    tabRefs.current[TABS.indexOf(next)]?.focus();
  };

  return (
    <>
      <div className="drawer-tools">
        <label className="search" htmlFor={`${id}-search`}>
          <Icon name="search" />
          <input id={`${id}-search`} type="search" placeholder="Search blocks and sections" aria-label="Search blocks and sections" data-autofocus value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="dtabs" role="tablist" aria-label="Insert">
          {TABS.map((t, index) => (
            <button
              key={t}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${id}-${t}`}
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {TAB_NAMES[t]}
            </button>
          ))}
        </div>
        <p className="drawer-where">{tab === "blocks" ? whereWords(doc, selection, touch) : "A ready-made section goes after the selection’s section, or at the end of the page."}</p>
      </div>

      <div className="drawer-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === "blocks" && layoutShown && (
          <>
            <h3 className="group-title" id={`${id}-layout`}>{NEW_SECTION}</h3>
            <div className="colpick" role="group" aria-labelledby={`${id}-layout`}>
              {LAYOUT.columns.map((choice) => (
                <Tile key={choice.count} id={`tile:columns-${choice.count}`} label={choice.label} title={choice.label} tile={sectionTile(choice.count, newId, sectionStart)} describedBy={`${id}-drag`} onClick={() => addSection(choice.count)}>
                  <WidgetIcon icon={choice.icon} /><span aria-hidden="true">{choice.count}</span>
                </Tile>
              ))}
            </div>
          </>
        )}

        {tab === "blocks" && groups.map((group) => (
          <Fragment key={group.id}>
            <h3 className="group-title" id={`${id}-${group.id}`}>{group.label}</h3>
            <div className="bitems" role="group" aria-labelledby={`${id}-${group.id}`}>
              {group.widgets.map((definition) => (
                <Tile
                  key={definition.type}
                  id={`tile:${definition.type}`}
                  className="bitem"
                  popup={definition.needs !== null}
                  tile={widgetTile(definition, newId, widgetStart(definition), () => widgetInput(definition, ui.getState().siteEntries))}
                  describedBy={`${id}-drag`}
                  onClick={() => addWidget(definition)}
                >
                  <WidgetIcon icon={definition.icon} className="i" /><span>{definition.label}</span>
                </Tile>
              ))}
            </div>
          </Fragment>
        ))}
        {tab === "blocks" && !blocksFound && <p className="palette-none" role="status">No block is called “{query.trim()}”.{presets.length > 0 ? " Sections has one." : ""}</p>}

        {tab === "sections" && presets.length > 0 && (
          <>
            <h3 className="group-title" id={`${id}-presets`}>Ready-made sections</h3>
            <div className="drawer-presets" role="group" aria-labelledby={`${id}-presets`}>
              {presets.map((preset) => (
                <Tile key={preset} id={`tile:preset-${preset}`} className="preset" popup={preset === "picture"} tile={presetTile(preset, newId, sectionStart)} describedBy={`${id}-drag`} onClick={() => (preset === "picture" ? setAsking("picture") : void addPreset(preset))}>
                  {PRESET_PICTURES[preset]}<span>{PRESET_LABELS[preset]}</span>
                </Tile>
              ))}
            </div>
          </>
        )}
        {tab === "sections" && presets.length === 0 && <p className="palette-none" role="status">No ready-made section is called “{query.trim()}”.{blocksFound ? " Blocks has one." : ""}</p>}
      </div>
      <p id={`${id}-drag`} hidden>{DRAG_WORDS}</p>
      <p className="drawer-foot">On the page, the round <span className="ins-glyph" role="img" aria-label="plus"><Icon name="plus" /></span> buttons add right where they sit, and offer only what fits there.</p>

      {asking === "picture" && (
        <ImagePicker
          confirm="Add section"
          onClose={() => setAsking(null)}
          onPick={([image]) => {
            const refusal = image ? addPreset("picture", image) : null;
            if (refusal === null) setAsking(null);
            return refusal;
          }}
        />
      )}
      {asking && asking !== "picture" && (asking.needs === "image" || asking.needs === "images") && (
        <ImagePicker
          confirm={asking.needs === "image" ? "Add image" : "Add gallery"}
          multiple={asking.needs === "images"}
          onClose={() => setAsking(null)}
          onPick={(images: ImageRef[]) => {
            const input: InputOf["image"] | InputOf["gallery"] = asking.needs === "image" ? images[0]! : (images as unknown as InputOf["gallery"]);
            const refusal = insertBlock(make(asking, input));
            if (refusal === null) setAsking(null);
            return refusal;
          }}
        />
      )}
      {asking && asking !== "picture" && asking.needs === "video" && (
        <VideoPicker
          onClose={() => setAsking(null)}
          onPick={(video: { provider: VideoProvider; videoId: string; title: string }) => {
            const block = make(asking, { provider: video.provider, videoId: video.videoId });
            if (block.type === "video") block.props = { ...block.props, title: video.title };
            const refusal = insertBlock(block);
            if (refusal === null) setAsking(null);
            return refusal;
          }}
        />
      )}
    </>
  );
}
