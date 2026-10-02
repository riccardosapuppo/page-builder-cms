// What three widgets need before they can be added (../widgets/types.ts,
// `needs`): an image, at least one image, or a video. A new block is valid
// from the moment it exists, and an image is not valid without its source
// and its alt text, so the widget panel asks first.
//
// Images come from the media library the CMS already holds, or from
// another site's https:// address. Uploading is the media library's, which
// is not part of this picker.
import { useId, useState } from "react";
import type { CommandError } from "../document/check.ts";
import type { ImageRef, VideoProvider } from "../shared/document.ts";
import type { MediaItem } from "../storage/adapter.ts";
import { describedBy, ErrorList } from "./controls.tsx";
import { useUi } from "./context.tsx";
import { Dialog } from "./dialog.tsx";
import { explain } from "./errors.ts";
import { Icon } from "./icons.tsx";

// ------------------------------------------------------------ images

interface Draft {
  source: { mediaId: string } | { url: string } | null;
  alt: string;
  decorative: boolean;
}

function refOf(draft: Draft): ImageRef | null {
  if (!draft.source) return null;
  const text = draft.decorative ? { decorative: true as const } : { alt: draft.alt };
  return "mediaId" in draft.source ? { mediaId: draft.source.mediaId, ...text } : { url: draft.source.url, ...text };
}

interface ImagePickerProps {
  title: string;
  confirm: string;
  // Several images (a gallery) or one.
  multiple?: boolean;
  // Hands the images over; null when they were placed, the refusal otherwise.
  onPick: (images: ImageRef[]) => CommandError | null;
  onClose: () => void;
}

export function ImagePicker({ title, confirm, multiple = false, onPick, onClose }: ImagePickerProps) {
  const media = useUi((u) => u.media);
  const library = [...media.values()];
  const id = useId();
  const [picked, setPicked] = useState<Draft[]>([]);
  const [address, setAddress] = useState("");
  const [addressAlt, setAddressAlt] = useState("");
  const [addressDecorative, setAddressDecorative] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isPicked = (item: MediaItem) => picked.some((p) => p.source !== null && "mediaId" in p.source && p.source.mediaId === item.id);
  const toggle = (item: MediaItem) => {
    const draft: Draft = { source: { mediaId: item.id }, alt: item.alt, decorative: false };
    if (multiple) setPicked((list) => (isPicked(item) ? list.filter((p) => !(p.source && "mediaId" in p.source && p.source.mediaId === item.id)) : [...list, draft]));
    else setPicked(isPicked(item) ? [] : [draft]);
  };
  const update = (index: number, change: Partial<Draft>) => setPicked((list) => list.map((p, i) => (i === index ? { ...p, ...change } : p)));

  const submit = () => {
    const drafts = [...picked];
    if (address.trim() !== "") drafts.push({ source: { url: address.trim() }, alt: addressAlt, decorative: addressDecorative });
    const refs = drafts.map(refOf).filter((r): r is ImageRef => r !== null);
    if (refs.length === 0) {
      setProblem(multiple ? "Choose at least one image, or give an address." : "Choose an image, or give an address.");
      return;
    }
    if (!multiple && refs.length > 1) {
      setProblem("Choose one image: from the library or from an address, not both.");
      return;
    }
    const error = onPick(refs);
    if (!error) return;
    const finding = error.errors?.[0];
    if (!finding) {
      setProblem(error.message);
      return;
    }
    const isUrl = finding.pointer.endsWith("/url");
    const isAlt = finding.pointer.endsWith("/alt");
    const sentence = explain(finding.keyword, finding.message, { kind: isUrl ? "imageUrl" : "line", maxLength: isAlt ? 300 : 2048 }, finding.limit);
    setProblem(`${isAlt ? "Alt text: " : isUrl ? "Address: " : ""}${sentence}`);
  };

  return (
    <Dialog
      title={title}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark" type="button" onClick={submit}>{confirm}</button>
        </>
      }
    >
      <h3 className="group-title" id={`${id}-lib`}>From the media library</h3>
      {library.length === 0 ? (
        <p className="hint">The media library has no images yet.</p>
      ) : (
        <ul className="media-pick" role={multiple ? "group" : "radiogroup"} aria-labelledby={`${id}-lib`}>
          {library.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role={multiple ? undefined : "radio"}
                aria-checked={multiple ? undefined : isPicked(item)}
                aria-pressed={multiple ? isPicked(item) : undefined}
                aria-label={item.alt || item.filename}
                title={item.filename}
                onClick={() => toggle(item)}
              >
                <img src={item.url} alt="" />
                {isPicked(item) && <span className="pick-check" aria-hidden="true"><Icon name="check" /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.map((draft, index) => {
        const item = draft.source && "mediaId" in draft.source ? media.get(draft.source.mediaId) : undefined;
        return (
          <AltFields
            key={item?.id ?? index}
            name={multiple ? `Alt text for ${item?.filename ?? `image ${index + 1}`}` : "Alt text"}
            alt={draft.alt}
            decorative={draft.decorative}
            onAlt={(alt) => update(index, { alt })}
            onDecorative={(decorative) => update(index, { decorative })}
          />
        );
      })}
      <h3 className="group-title" style={{ marginTop: 20 }}>Or from another site</h3>
      <div className="field" style={{ marginTop: 0 }}>
        <label className="label" htmlFor={`${id}-url`}>Image address</label>
        <input id={`${id}-url`} className="input" type="text" spellCheck={false} placeholder="https://" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      {address.trim() !== "" && (
        <AltFields name="Alt text" alt={addressAlt} decorative={addressDecorative} onAlt={setAddressAlt} onDecorative={setAddressDecorative} />
      )}
      <ErrorList id={`${id}-problem`} errors={problem ? [problem] : []} />
    </Dialog>
  );
}

function AltFields({ name, alt, decorative, onAlt, onDecorative }: { name: string; alt: string; decorative: boolean; onAlt: (alt: string) => void; onDecorative: (decorative: boolean) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{name}</label>
      <textarea id={id} className="input" rows={2} value={decorative ? "" : alt} disabled={decorative} aria-describedby={`${id}-hint`} onChange={(e) => onAlt(e.target.value)} />
      <p className="hint" id={`${id}-hint`}>What the image shows, for people who cannot see it.</p>
      <label className="check">
        <input type="checkbox" checked={decorative} onChange={(e) => onDecorative(e.target.checked)} />
        <span>Decorative: it adds nothing to the text, and screen readers skip it</span>
      </label>
    </div>
  );
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
}

export function VideoPicker({ onPick, onClose }: VideoPickerProps) {
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
