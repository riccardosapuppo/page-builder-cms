// The gallery's Content tab: its images in order, each with its alt text
// or the mark that it is decorative, moved up or down or removed one at a
// time; and more images added from the library or an address. Each of
// these is one of the gallery's own item commands, so the history names
// the image ("Moved image 2 in Gallery").
import { useMemo, useState } from "react";
import { REMOVE } from "../../document/commands.ts";
import type { Json } from "../../document/json.ts";
import { ServerErrors, TextField, Toggle } from "../../editor/controls.tsx";
import { useUi } from "../../editor/context.tsx";
import { Icon } from "../../editor/icons.tsx";
import { mediaResolver } from "../../editor/media.ts";
import { useBlockCommands, type BlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { ImagePicker } from "../../editor/pickers.tsx";
import { blockImage } from "../../render/media.tsx";
import type { ImageRef } from "../../shared/document.ts";

// The schema's most images in one gallery.
const MAX_ITEMS = 24;

function GalleryContent({ block }: ContentProps<"gallery">) {
  const commands = useBlockCommands(block.id);
  const [adding, setAdding] = useState(false);
  const items = block.props.items;
  return (
    <>
      <div className="field">
        <span className="label">Images</span>
        <ol className="items">
          {items.map((item, index) => (
            <GalleryItem key={index} blockId={block.id} item={item} index={index} count={items.length} commands={commands} />
          ))}
        </ol>
        <ServerErrors blockId={block.id} fields={["/props/items"]} />
        {items.length < MAX_ITEMS && (
          <button className="btn btn-secondary btn-block" type="button" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
            <Icon name="plus" />Add images
          </button>
        )}
      </div>
      {adding && (
        <ImagePicker
          multiple
          title="Add images"
          confirm="Add images"
          onClose={() => setAdding(false)}
          onPick={(refs) => {
            const error = commands.insertItems(items.length, refs as unknown as Json[]);
            if (!error) setAdding(false);
            return error;
          }}
        />
      )}
    </>
  );
}

interface ItemProps {
  blockId: string;
  item: ImageRef;
  index: number;
  count: number;
  commands: BlockCommands;
}

function GalleryItem({ blockId, item, index, count, commands }: ItemProps) {
  const media = useUi((u) => u.media);
  const shown = useMemo(() => blockImage(item, mediaResolver(media)), [item, media]);
  const [describing, setDescribing] = useState(false);
  const decorative = item.decorative === true && !describing;
  const libraryAlt = item.mediaId !== undefined ? (media.get(item.mediaId)?.alt ?? "") : "";
  const n = index + 1;
  const at = `/props/items/${index}`;
  return (
    <li className="item">
      <div className="item-head">
        <span>Image {n}</span>
        <span className="item-tools">
          <button className="ibtn ibtn-small" type="button" aria-label={`Move image ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
          <button className="ibtn ibtn-small" type="button" aria-label={`Move image ${n} down`} title="Move down" disabled={index === count - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
          <button className="ibtn ibtn-small" type="button" aria-label={`Remove image ${n}`} title="Remove" disabled={count === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
        </span>
      </div>
      {shown ? <img className="item-thumb" src={shown.src} alt="" /> : <p className="hint">Not in the media library any more.</p>}
      <ServerErrors blockId={blockId} fields={[`${at}/mediaId`, `${at}/url`]} rules={{ kind: "imageUrl" }} />
      <TextField
        label={`Alt text, image ${n}`}
        multiline
        rows={2}
        value={decorative ? "" : (item.alt ?? "")}
        disabled={decorative}
        blockId={blockId}
        field={`${at}/alt`}
        rules={{ kind: "line", maxLength: 300 }}
        onCommit={(alt) => {
          const error = commands.setItem(index, item.decorative === true ? { alt, decorative: REMOVE } : { alt });
          if (!error) setDescribing(false);
          return error;
        }}
      />
      <Toggle
        label="Decorative"
        checked={decorative}
        blockId={blockId}
        field={`${at}/decorative`}
        onChange={(on) => {
          if (on) {
            setDescribing(false);
            return commands.setItem(index, { decorative: true, alt: REMOVE });
          }
          if (libraryAlt.trim() !== "") return commands.setItem(index, { alt: libraryAlt, decorative: REMOVE });
          setDescribing(true);
          return null;
        }}
      />
    </li>
  );
}

export const panel: WidgetPanel<"gallery"> = { Content: GalleryContent };
