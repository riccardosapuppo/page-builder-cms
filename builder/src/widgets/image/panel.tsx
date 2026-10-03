// The image's Content tab: the picture with Replace image, and its alt
// text, or the mark that it is decorative and needs none. The source and
// the text change together when the image is replaced, so the page never
// holds a picture with another picture's description.
import { useMemo, useState } from "react";
import { REMOVE, type Updates } from "../../document/commands.ts";
import { ServerErrors, TextField, Toggle } from "../../editor/controls.tsx";
import { useUi } from "../../editor/context.tsx";
import { mediaResolver } from "../../editor/media.ts";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { ImagePicker } from "../../editor/pickers.tsx";
import { blockImage } from "../../render/media.tsx";
import type { ImageRef } from "../../shared/document.ts";

// The props that make an image (or a gallery item) show `next`, whatever
// source and text it had before.
export function imageUpdates(next: ImageRef): Updates {
  return {
    ...("mediaId" in next && next.mediaId !== undefined ? { mediaId: next.mediaId, url: REMOVE } : { url: next.url ?? "", mediaId: REMOVE }),
    ...(next.decorative === true ? { decorative: true, alt: REMOVE } : { alt: next.alt ?? "", decorative: REMOVE }),
  };
}

function ImageContent({ block }: ContentProps<"image">) {
  const commands = useBlockCommands(block.id);
  const media = useUi((u) => u.media);
  // An image this tab has not seen yet, while the library is read again.
  const looking = useUi((u) => block.props.mediaId !== undefined && u.mediaLooking.has(block.props.mediaId));
  const shown = useMemo(() => blockImage(block.props, mediaResolver(media)), [block.props, media]);
  const [picking, setPicking] = useState(false);
  // Turning "Decorative" off needs alt text before the page can take it:
  // the field opens for it, and the text, once written, replaces the mark.
  const [describing, setDescribing] = useState(false);
  const decorative = block.props.decorative === true && !describing;
  const libraryAlt = block.props.mediaId !== undefined ? (media.get(block.props.mediaId)?.alt ?? "") : "";
  return (
    <>
      <div className="field">
        <span className="label">Image</span>
        {shown ? <img className="thumb-wide" src={shown.src} alt="" /> : <p className="hint">{looking ? "Looking for the image in the media library…" : "The image is not in the media library any more."}</p>}
        <button className="btn btn-secondary btn-block" type="button" onClick={() => setPicking(true)}>Replace image</button>
        <ServerErrors blockId={block.id} fields={["/props/mediaId", "/props/url"]} rules={{ kind: "imageUrl" }} />
      </div>
      <TextField
        label="Alt text"
        multiline
        rows={3}
        value={decorative ? "" : (block.props.alt ?? "")}
        disabled={decorative}
        blockId={block.id}
        field="/props/alt"
        rules={{ kind: "line", maxLength: 300 }}
        hint="What the image shows, for people who cannot see it."
        onCommit={(alt) => {
          const error = commands.setProps(block.props.decorative === true ? { alt, decorative: REMOVE } : { alt });
          if (!error) setDescribing(false);
          return error;
        }}
      />
      <div className="field">
        <Toggle
          label="Decorative"
          checked={decorative}
          blockId={block.id}
          field="/props/decorative"
          onChange={(on) => {
            if (on) {
              setDescribing(false);
              return commands.setProps({ decorative: true, alt: REMOVE });
            }
            if (libraryAlt.trim() !== "") return commands.setProps({ alt: libraryAlt, decorative: REMOVE });
            setDescribing(true);
            return null;
          }}
        />
        <p className="hint">A decorative image adds nothing to the text: screen readers skip it.</p>
      </div>
      {picking && (
        <ImagePicker
          confirm="Replace image"
          onClose={() => setPicking(false)}
          onPick={([next]) => {
            if (!next) return null;
            const error = commands.setProps(imageUpdates(next));
            if (!error) setPicking(false);
            return error;
          }}
        />
      )}
    </>
  );
}

export const panel: WidgetPanel<"image"> = { Content: ImageContent };
