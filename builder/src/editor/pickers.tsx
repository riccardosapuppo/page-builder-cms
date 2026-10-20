// What three widgets need before they can be added (../widgets/types.ts,
// `needs`): an image, at least one image, or a video. A new block is valid
// from the moment it exists, and an image is not valid without its source
// and its alt text, so the Insert drawer asks first.
//
// Images come from the media library (./library/MediaLibrary.tsx), where
// they can also be uploaded, or from another site's https:// address; each
// with its alt text or the mark that it is decorative.
import { useId, useState, type ReactNode } from "react";
import type { CommandError } from "../document/check.ts";
import type { ImageRef, VideoProvider } from "../shared/document.ts";
import { describedBy, ErrorList } from "./controls.tsx";
import { Dialog } from "./dialog.tsx";
import { explain } from "./errors.ts";
import { MediaLibrary } from "./library/MediaLibrary.tsx";

// ------------------------------------------------------------ images

interface ImagePickerProps {
  // What placing the images does, on the library's button: "Add image",
  // "Use image" (the design's, replacing an image), "Add images", "Add
  // section".
  confirm: string;
  // Several images (a gallery) or one.
  multiple?: boolean;
  // Hands the images over; null when they were placed, the refusal otherwise.
  onPick: (images: ImageRef[]) => CommandError | null;
  onClose: () => void;
  // Where the block will land, said under the window: a "+" picker's place,
  // or a dropped key's (./InsertPicker.tsx).
  where?: ReactNode;
  // The yellow line of that place, which the window stands beside and
  // never over (./place-dialog.ts).
  beside?: string;
  // An image of the library and no other: an entry's (./collections/),
  // which the collection schema takes from the library only.
  libraryOnly?: boolean;
  // A picture drawn as decorative whatever it shows (a section's, behind
  // its words): placing it asks for no alt text.
  decorative?: boolean;
}

export function ImagePicker({ confirm, multiple = false, onPick, onClose, where, beside, libraryOnly = false, decorative = false }: ImagePickerProps) {
  return <MediaLibrary purpose={{ kind: "pick", confirm, multiple, onPick, ...(where ? { where } : {}), ...(beside ? { beside } : {}), ...(libraryOnly ? { libraryOnly } : {}), ...(decorative ? { decorative } : {}) }} onClose={onClose} />;
}

// ------------------------------------------------------------ video

// A video's provider and id, from the address of the video's page or from
// the id alone. The address is read, never stored: the page keeps the
// provider and the id, and the renderers build the player's address.
export function parseVideo(text: string, current: VideoProvider | null = null): { provider: VideoProvider; videoId: string } | null {
  const value = text.trim();
  if (value === "") return null;
  if (/^[0-9]{1,12}$/.test(value) && !(current === "youtube" && value.length === 11)) return { provider: "vimeo", videoId: value };
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return { provider: "youtube", videoId: value };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return youtube(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const fromQuery = url.searchParams.get("v");
    if (fromQuery) return youtube(fromQuery);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") return youtube(parts[1]);
    return null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const number = parts.find((part) => /^[0-9]{1,12}$/.test(part));
    return number ? { provider: "vimeo", videoId: number } : null;
  }
  return null;
}

function youtube(id: string | undefined): { provider: VideoProvider; videoId: string } | null {
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", videoId: id } : null;
}

export const VIDEO_HINT = "Paste the address of the video’s page, or its id. Only the id is kept; the page asks the provider for the video when a visitor clicks it.";

interface VideoPickerProps {
  onPick: (video: { provider: VideoProvider; videoId: string; title: string }) => CommandError | null;
  onClose: () => void;
  // As the image picker's.
  where?: ReactNode;
  beside?: string;
}

export function VideoPicker({ onPick, onClose, where, beside }: VideoPickerProps) {
  const id = useId();
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("Video");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => {
    const video = parseVideo(address);
    if (!video) {
      setProblem("That is not the address of a video, or a video id, that the page can show.");
      return;
    }
    const error = onPick({ ...video, title });
    if (!error) return;
    const finding = error.errors?.[0];
    setProblem(finding ? explain(finding.keyword, finding.message, { kind: "line", maxLength: 120 }, finding.limit) : error.message);
  };
  const errors = problem ? [problem] : [];
  return (
    <Dialog
      title="Add a video"
      onClose={onClose}
      beside={beside}
      note={where ? <p className="hint">{where}</p> : undefined}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark" type="button" onClick={submit}>Add video</button>
        </>
      }
    >
      <div className="field" style={{ marginTop: 0 }}>
        <label className="label" htmlFor={`${id}-address`}>Video address or id</label>
        <input
          id={`${id}-address`}
          className="input"
          type="text"
          spellCheck={false}
          value={address}
          aria-invalid={errors.length > 0 ? true : undefined}
          aria-describedby={describedBy(`${id}-address`, VIDEO_HINT, errors)}
          onChange={(e) => setAddress(e.target.value)}
        />
        <p className="hint" id={`${id}-address-hint`}>{VIDEO_HINT}</p>
        <ErrorList id={`${id}-address-error`} errors={errors} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} className="input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="hint">Names the player for screen readers, and captions its card on the page.</p>
      </div>
    </Dialog>
  );
}
