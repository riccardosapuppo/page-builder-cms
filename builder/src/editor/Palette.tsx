// The widget panel (the left tray's Add view), as the approved design draws
// it (design/shots/drag.png): a search, then the Layout group (a section,
// and a section with one to four columns) and the widgets as tiles in
// their groups. Each group is a labelled group of buttons; Enter or a click
// on a tile adds it where the selection says (./insert.ts).
//
// Three widgets need something first (an image, images, a video): their
// tile asks for it, then adds the widget with it.
import { useId, useState } from "react";
import { makeInsertSection } from "../document/commands.ts";
import { idDraw } from "../document/ids.ts";
import type { ImageRef, VideoProvider, WidgetBlock } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { LAYOUT, WIDGETS } from "../widgets/registry.ts";
import { newWidget, WIDGET_GROUPS, type AnyWidgetDefinition, type InputOf } from "../widgets/types.ts";
import { useEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { insertTarget, useInsert } from "./insert.ts";
import { ImagePicker, VideoPicker } from "./pickers.tsx";

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
            <button className="tile tile-row" type="button" onClick={() => addSection(1)}>
              <WidgetIcon icon={LAYOUT.section.icon} /><span>{LAYOUT.section.label}</span>
            </button>
            <div className="colpick" role="group" aria-label="Add a section with">
              {LAYOUT.columns.map((choice) => (
                <button key={choice.count} type="button" aria-label={choice.label} title={choice.label} onClick={() => addSection(choice.count)}>
                  <WidgetIcon icon={choice.icon} /><span aria-hidden="true">{choice.count}</span>
                </button>
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
              <button
                key={definition.type}
                className="tile"
                type="button"
                aria-haspopup={definition.needs !== null ? "dialog" : undefined}
                onClick={() => addWidget(definition)}
              >
                <WidgetIcon icon={definition.icon} /><span>{definition.label}</span>
              </button>
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
