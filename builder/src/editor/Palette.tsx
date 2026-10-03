// The widget panel (the left tray's Add view), as the approved design draws
// it (design/shots/drag.png): a search, then the Layout group (a section,
// and a section with one to four columns) and the widgets as tiles in
// their groups. Each group is a labelled group of buttons; Enter or a click
// on a tile adds it where the selection says (./insert.ts), and a tile
// dragged onto the page adds it where it is dropped (./drag/DragLayer.tsx):
// the new block is made, with its ids, when the drag begins.
//
// Three widgets need something first (an image, images, a video): their
// tile asks for it, then adds the widget with it. Those three are added by
// Enter or a click only, since a drag would have to drop a widget that
// does not exist yet.
import { useId, useState, type ReactNode } from "react";
import { makeInsertSection, newSection } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import type { Block, ImageRef, PageDocument, VideoProvider, WidgetBlock } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { LAYOUT, WIDGETS } from "../widgets/registry.ts";
import { newWidget, WIDGET_GROUPS, type AnyWidgetDefinition, type InputOf } from "../widgets/types.ts";
import { useEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { insertTarget, useInsert } from "./insert.ts";
import { ImagePicker, VideoPicker } from "./pickers.tsx";
import { TILE_SENSORS, useDraggable } from "./drag/dnd.ts";
import type { SourceData } from "./drag/DragLayer.tsx";

// A tile: a button, and the source of a drag when it can make its block
// on its own.
function Tile({ id, make, className, label, title, popup, onClick, children }: {
  id: string;
  make: ((doc: PageDocument) => Block) | null;
  className?: string;
  label?: string;
  title?: string;
  popup?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const data: SourceData | null = make ? { kind: "tile", make } : null;
  const { ref, isDragSource } = useDraggable({ id, ...(data ? { data } : {}), disabled: data === null, sensors: TILE_SENSORS });
  // While its block is dragged, the tile leaves a dashed place in the panel
  // (design/shots/drag.png), so the person sees what they took.
  const classes = [className, isDragSource ? "is-sel" : null].filter(Boolean).join(" ") || undefined;
  return (
    <button ref={ref} className={classes} type="button" aria-label={label} title={title} aria-haspopup={popup ? "dialog" : undefined} data-draggable={data ? "" : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

const matches = (label: string, query: string) => label.toLowerCase().includes(query.trim().toLowerCase());

export function Palette() {
  const { store, newId } = useEnv();
  const { insertBlock, insertMade } = useInsert();
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<AnyWidgetDefinition | null>(null);
  const searchId = useId();
  const groupId = useId();

  // A new widget with an id the page does not have.
  const make = <T extends AnyWidgetDefinition>(definition: T, input: unknown): WidgetBlock => {
    const id = idDraw(store.getState().document, newId)();
    return newWidget(definition as never, id, input as never) as WidgetBlock;
  };
  const addWidget = (definition: AnyWidgetDefinition) => {
    if (definition.needs !== null) {
      setAsking(definition);
      return;
    }
    insertBlock(make(definition, undefined));
  };
  // What a dragged tile drops: made from the page as it is when the drag
  // begins, so its ids are free.
  const widgetMaker = (definition: AnyWidgetDefinition) => (definition.needs === null
    ? (doc: PageDocument): Block => newWidget(definition as never, idDraw(doc, newId)(), undefined as never) as WidgetBlock
    : null);
  const sectionMaker = (columns: number) => (doc: PageDocument): Block => newSection(columns, idDraw(doc, newId));
  const addSection = (columns: number) => {
    const { document, selection } = store.getState();
    const at = insertTarget(document, "section", selection);
    insertMade(makeInsertSection(document, columns, at?.index ?? document.sections.length, newId));
  };

  const layoutShown = query.trim() === "" || matches("Section", query) || matches("Columns", query) || matches("Layout", query);
  const groups = WIDGET_GROUPS.map((group) => ({
    ...group,
    widgets: WIDGETS.filter((w) => w.group === group.id && (query.trim() === "" || matches(w.label, query) || matches(group.label, query))),
  })).filter((group) => group.widgets.length > 0);

  return (
    <div className="tray-body">
      <label className="search" htmlFor={searchId}>
        <Icon name="search" />
        <input id={searchId} type="search" placeholder="Search widgets" aria-label="Search widgets" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {layoutShown && (
        <div className="group">
          <h3 className="group-title" id={`${groupId}-layout`}>Layout</h3>
          <div className="tile-section" role="group" aria-labelledby={`${groupId}-layout`}>
            <Tile id="tile:section" className="tile tile-row" make={sectionMaker(1)} onClick={() => addSection(1)}>
              <WidgetIcon icon={LAYOUT.section.icon} /><span>{LAYOUT.section.label}</span>
            </Tile>
            <div className="colpick" role="group" aria-label="Add a section with">
              {LAYOUT.columns.map((choice) => (
                <Tile key={choice.count} id={`tile:columns-${choice.count}`} label={choice.label} title={choice.label} make={sectionMaker(choice.count)} onClick={() => addSection(choice.count)}>
                  <WidgetIcon icon={choice.icon} /><span aria-hidden="true">{choice.count}</span>
                </Tile>
              ))}
            </div>
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div className="group" key={group.id}>
          <h3 className="group-title" id={`${groupId}-${group.id}`}>{group.label}</h3>
          <div className="tiles" role="group" aria-labelledby={`${groupId}-${group.id}`}>
            {group.widgets.map((definition) => (
              <Tile
                key={definition.type}
                id={`tile:${definition.type}`}
                className="tile"
                popup={definition.needs !== null}
                make={widgetMaker(definition)}
                onClick={() => addWidget(definition)}
              >
                <WidgetIcon icon={definition.icon} /><span>{definition.label}</span>
              </Tile>
            ))}
          </div>
        </div>
      ))}

      {!layoutShown && groups.length === 0 && <p className="palette-none" role="status">No widget is called “{query.trim()}”.</p>}

      {asking && (asking.needs === "image" || asking.needs === "images") && (
        <ImagePicker
          title={asking.needs === "image" ? "Add an image" : "Add a gallery"}
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
      {asking && asking.needs === "video" && (
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
    </div>
  );
}
