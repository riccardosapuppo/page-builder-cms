// The media library, as the approved design draws it (design/shots/media.png):
// the images the CMS holds, newest first, with a search, three filters (all
// of them, those on this page, those with no alt text) and Upload images;
// beside them the chosen image, its size and day, its alt text and the
// mark that it is decorative; under them what the person is about to do.
//
// Opened for a block (an Image, a gallery's images, a picture beside text,
// Replace image), it hands the chosen images over as ImageRefs, each with
// its alt text or the mark that it is decorative: the schema's rule
// ($defs/imageRef in ../../../../schema/block-document.schema.json), and
// the editor's, that no image is placed without one or the other. The alt
// text written here is the library's (the text it proposes next time), and
// is copied into the block when the image is placed. Opened from the app
// menu, it looks after the library itself: upload, alt text, delete.
//
// Everything that reaches the CMS goes through the media service
// (./service.ts) and so through the storage adapter; without one (a panel's
// test) the library is only chosen from, and draws no control for the rest.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { CommandError } from "../../document/check.ts";
import type { ImageRef } from "../../shared/document.ts";
import { MAX_UPLOAD_BYTES, type MediaItem } from "../../storage/adapter.ts";
import { describedBy, ErrorList } from "../controls.tsx";
import { useEditor, useEnv, useUi } from "../context.tsx";
import { Dialog } from "../dialog.tsx";
import { explain } from "../errors.ts";
import { Icon } from "../icons.tsx";
import { useOptionalSession } from "../session.tsx";
import { useMediaService, useUploads } from "./context.tsx";
import { ACCEPT, bytesText, MAX_LONG_SIDE } from "./files.ts";
import "./library.css";
import { mediaIdsOn } from "./on-page.ts";
import type { MediaService, UploadEntry } from "./service.ts";
import { countLine, inUseSentence, metaLine } from "./words.ts";

export type LibraryPurpose =
  // Choosing images for a block: one, or several for a gallery. onPick
  // returns null once they are placed, the refusal otherwise.
  | { kind: "pick"; confirm: string; multiple: boolean; onPick: (images: ImageRef[]) => CommandError | null }
  // Looking after the library: nothing is placed.
  | { kind: "manage" };

type Filter = "all" | "page" | "missing";
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All images" },
  { id: "page", label: "On this page" },
  { id: "missing", label: "Missing alt text" },
];

// The design's own example of an alt text.
export const ALT_NEEDED = "Add alt text to use this image. Describe what it shows, for example: “Orange buoys marking the course across the bay”.";

type AltSave = { phase: "saving" } | { phase: "saved" } | { phase: "failed"; message: string };
type Deleting = { id: string; phase: "asking" | "working" } | null;

const hasAlt = (text: string) => text.trim() !== "";
// An alt text is one line: a line break typed or pasted becomes a space.
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ");

export function MediaLibrary({ purpose, onClose }: { purpose: LibraryPurpose; onClose: () => void }) {
  const { ui, clock } = useEnv();
  const service = useMediaService();
  const session = useOptionalSession();
  const media = useUi((u) => u.media);
  const library = useMemo(() => [...media.values()], [media]);
  const uploads = useUploads(service);
  const page = useEditor((s) => s.document);
  const onPage = useMemo(() => mediaIdsOn(page), [page]);
  const id = useId();
  const picking = purpose.kind === "pick";
  const multiple = purpose.kind === "pick" && purpose.multiple;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // The images chosen, in the order they were; and the one beside the grid.
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  // The tile the arrows start from, the one tab stop of the grid.
  const [active, setActive] = useState<string | null>(null);
  const [alts, setAlts] = useState<ReadonlyMap<string, string>>(new Map());
  const [decorative, setDecorative] = useState<ReadonlySet<string>>(new Set());
  const [altSaves, setAltSaves] = useState<ReadonlyMap<string, AltSave>>(new Map());
  const [address, setAddress] = useState("");
  const [addressAlt, setAddressAlt] = useState("");
  const [addressDecorative, setAddressDecorative] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [deleteSaid, setDeleteSaid] = useState<{ id: string; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  // The image shown and the alt texts typed, as the latest render has them,
  // for an upload that finishes later.
  const latest = useRef({ current, alts });
  useLayoutEffect(() => {
    latest.current = { current, alts };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Another tab may have changed the library since the editor read it.
  useEffect(() => {
    if (!service) return;
    void service.refresh().then((why) => {
      if (why && mounted.current) setNote(why);
    });
  }, [service]);

  const itemOf = (imageId: string | null): MediaItem | undefined => (imageId === null ? undefined : media.get(imageId));
  const altOf = (imageId: string): string => alts.get(imageId) ?? media.get(imageId)?.alt ?? "";
  const ready = (imageId: string) => decorative.has(imageId) || hasAlt(altOf(imageId));

  // An image deleted, here or in another tab, is no longer chosen.
  const live = chosen.filter((imageId) => media.has(imageId));
  const shownItem = itemOf(current);
  // Details drawn for another image, or for none, take their fields with
  // them: a focus that was in them goes to the images, never to the page
  // behind the dialog, where no key would reach the dialog.
  const shownId = shownItem?.id ?? null;
  useLayoutEffect(() => {
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    (grid.current?.querySelector<HTMLElement>("[data-media-id][tabindex='0']") ?? uploadButton.current)?.focus();
  }, [shownId]);

  const needle = query.trim().toLowerCase();
  const shown = library.filter((item) => {
    if (filter === "page" && !onPage.has(item.id)) return false;
    if (filter === "missing" && hasAlt(item.alt)) return false;
    return needle === "" || item.filename.toLowerCase().includes(needle) || item.alt.toLowerCase().includes(needle);
  });
  const missing = library.filter((item) => !hasAlt(item.alt)).length;
  const sending = uploads.filter((entry) => entry.phase !== "failed").length;
  const tabStop = shown.some((item) => item.id === active) ? active : (shown.find((item) => live.includes(item.id))?.id ?? shown[0]?.id ?? null);

  // ------------------------------------------------------- choosing

  const choose = (imageId: string) => {
    setProblem(null);
    setActive(imageId);
    if (!picking || !multiple) {
      setChosen([imageId]);
      setCurrent(imageId);
      return;
    }
    if (live.includes(imageId)) {
      const rest = live.filter((other) => other !== imageId);
      setChosen(rest);
      setCurrent(current === imageId ? (rest.at(-1) ?? null) : current);
    } else {
      setChosen([...live, imageId]);
      setCurrent(imageId);
    }
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, "left" | "right" | "up" | "down" | "first" | "last"> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "first", End: "last",
    };
    const way = keys[event.key];
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-media-id]");
    if (!way || !from || !grid.current) return;
    event.preventDefault();
    const tiles = [...grid.current.querySelectorAll<HTMLElement>("[data-media-id]")];
    const next = neighbour(tiles, from, way);
    if (!next) return;
    const nextId = next.dataset.mediaId!;
    next.focus();
    // A radio follows the focus; a checkbox waits for Space.
    if (multiple) setActive(nextId);
    else choose(nextId);
  };

  // ------------------------------------------------------- alt text

  const saveAlt = (imageId: string) => {
    const item = media.get(imageId);
    const text = alts.get(imageId);
    if (!service || !item || text === undefined || text === item.alt) return;
    setAltSaves((saves) => new Map(saves).set(imageId, { phase: "saving" }));
    void service.setAlt(imageId, text).then((outcome) => {
      if (!mounted.current) return;
      setAltSaves((saves) => new Map(saves).set(imageId, outcome.ok ? { phase: "saved" } : { phase: "failed", message: outcome.message }));
      if (outcome.ok) setAlts((map) => (map.get(imageId) === text ? withoutKey(map, imageId) : map));
    });
  };

  // ------------------------------------------------------- uploading

  const upload = (files: readonly File[]) => {
    if (!service || files.length === 0) return;
    setNote(null);
    // What comes in is shown whatever was filtered.
    setFilter("all");
    setQuery("");
    service.upload(files, (item) => {
      if (!mounted.current) return;
      // A gallery takes each image uploaded for it.
      if (multiple) setChosen((list) => [...list.filter((other) => other !== item.id), item.id]);
      // The person at work on the image shown (in its details, or with its
      // alt text typed and not yet kept) keeps it: the new one is said,
      // not shown in its place, which would take the field from under the
      // typing.
      const shown = latest.current.current;
      const busy = shown !== null && shown !== item.id && (details.current?.contains(document.activeElement) === true || latest.current.alts.has(shown));
      if (busy) {
        setNote(`“${item.filename}” is in the library now.`);
        return;
      }
      setActive(item.id);
      if (picking && !multiple) setChosen([item.id]);
      setCurrent(item.id);
    });
  };

  const onDragOver = (event: DragEvent) => {
    if (!service || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropping(true);
  };
  const onDrop = (event: DragEvent) => {
    setDropping(false);
    if (!service || event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    upload([...event.dataTransfer.files]);
  };

  // ------------------------------------------------------- deleting

  const remove = async (imageId: string) => {
    if (!service) return;
    const item = media.get(imageId);
    setDeleting({ id: imageId, phase: "working" });
    setDeleteSaid(null);
    // The CMS knows which pages show an image from their saved drafts: the
    // edits waiting are saved first, so an image just placed counts.
    ui.getState().pending.deliver();
    const settled = await session?.autosave?.flush();
    if (!mounted.current) return;
    if (settled && settled.phase !== "saved") {
      setDeleting(null);
      setDeleteSaid({ id: imageId, text: "Not deleted: this page has changes the CMS has not saved yet, and one may show this image. Try again once the top bar says Saved." });
      return;
    }
    const outcome = await service.remove(imageId);
    if (!mounted.current) return;
    setDeleting(null);
    if (outcome.ok) {
      setChosen((list) => list.filter((other) => other !== imageId));
      setCurrent((shownId) => (shownId === imageId ? null : shownId));
      setNote(`“${item?.filename ?? "The image"}” was deleted from the library.`);
      // Its details are gone with it: the focus goes back to the images.
      requestAnimationFrame(() => (grid.current?.querySelector<HTMLElement>("[data-media-id][tabindex='0']") ?? uploadButton.current)?.focus());
      return;
    }
    setDeleteSaid({ id: imageId, text: "inUse" in outcome ? inUseSentence(outcome.inUse, session?.pages ?? []) : outcome.message });
  };

  // ------------------------------------------------------- placing

  const addressReady = address.trim() !== "" && (addressDecorative || hasAlt(addressAlt));
  const unready = live.filter((imageId) => !ready(imageId));
  const reason = !picking
    ? null
    : live.length === 0
      ? address.trim() === "" ? (multiple ? "Choose images, or upload them." : "Choose an image, or upload one.") : addressReady ? null : "Add alt text to use this image."
      : unready.length === 0
        ? null
        : live.length === 1 ? "Add alt text to use this image." : `Add alt text to ${unready.length === 1 ? "one image" : `${unready.length} images`} chosen, or mark ${unready.length === 1 ? "it" : "them"} decorative.`;

  const place = () => {
    if (purpose.kind !== "pick") return;
    if (reason !== null) {
      // The first image that needs its alt text is shown, its field ready.
      const first = unready[0];
      if (first) setCurrent(first);
      requestAnimationFrame(() => document.getElementById(`${id}-alt`)?.focus());
      return;
    }
    const refs: ImageRef[] = live.length > 0
      ? live.map((imageId) => (decorative.has(imageId) ? { mediaId: imageId, decorative: true } : { mediaId: imageId, alt: altOf(imageId).trim() }))
      : [addressDecorative ? { url: address.trim(), decorative: true } : { url: address.trim(), alt: addressAlt.trim() }];
    // The alt text written here is also the library's, from now on.
    for (const imageId of live) if (!decorative.has(imageId)) saveAlt(imageId);
    const error = purpose.onPick(refs);
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

  // ------------------------------------------------------- drawing

  const hint = service?.imageVariants === false
    ? `Images you upload are available on every page. The CMS makes no smaller copies of them, so each is resized here first, to ${MAX_LONG_SIDE} px at most on its long side.`
    : "Images you upload are available on every page.";
  const reasonId = `${id}-reason`;

  return (
    <Dialog
      title="Media library"
      className="dlg-media"
      bodyClassName="media-main"
      closeLabel="Close media library"
      tools={<p className="dlg-count" aria-live="polite">{countLine(library.length, missing, sending)}</p>}
      onClose={onClose}
      footer={
        <>
          <p className="hint">{hint}</p>
          {reason !== null && <p className="foot-reason" id={reasonId}>{reason}</p>}
          <button className="btn btn-secondary" type="button" onClick={onClose}>{picking ? "Cancel" : "Close"}</button>
          {purpose.kind === "pick" && (
            <button className="btn btn-primary" type="button" aria-disabled={reason !== null ? true : undefined} aria-describedby={reason !== null ? reasonId : undefined} onClick={place}>
              {purpose.confirm}
            </button>
          )}
        </>
      }
    >
      <div className="dlg-toolbar">
        <label className="search search-inline">
          <Icon name="search" />
          <input type="search" placeholder="Search by name or alt text" aria-label="Search images" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="seg seg-text" role="radiogroup" aria-label="Show">
          {FILTERS.map((choice) => (
            <button key={choice.id} type="button" role="radio" aria-checked={filter === choice.id} onClick={() => setFilter(choice.id)}>
              {choice.label}
              {choice.id === "missing" && missing > 0 && <span className="seg-count">{missing}</span>}
            </button>
          ))}
        </div>
        {service && (
          <>
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden aria-label="Images to upload" onChange={(e) => {
              upload([...(e.target.files ?? [])]);
              e.target.value = "";
            }} />
            <button ref={uploadButton} className="btn btn-secondary" type="button" onClick={() => fileInput.current?.click()}><Icon name="upload" />Upload images</button>
          </>
        )}
      </div>
      {note && <p className="media-note" role="status"><Icon name="info" className="i i-xs" />{note}</p>}
      <div className={`media-body${dropping ? " is-dropping" : ""}`} onDragOver={onDragOver} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
        <div className="media-grid" ref={grid}>
          {uploads.length > 0 && (
            <ul className="m-uploads" aria-label="Uploads">
              {uploads.map((entry) => <UploadTile key={entry.key} entry={entry} service={service!} />)}
            </ul>
          )}
          <div className="m-images" role={multiple ? "group" : "radiogroup"} aria-label="Images" onKeyDown={onGridKey}>
            {shown.map((item) => {
              const on = live.includes(item.id);
              const noAlt = !hasAlt(item.alt);
              const name = [item.filename, noAlt ? "no alt text" : null, onPage.has(item.id) ? "on this page" : null].filter(Boolean).join(", ");
              return (
                <button
                  key={item.id}
                  type="button"
                  role={multiple ? "checkbox" : "radio"}
                  aria-checked={picking ? on : current === item.id}
                  aria-label={name}
                  className={`m-item m-option${(picking ? on : current === item.id) ? " m-selected" : ""}`}
                  data-media-id={item.id}
                  tabIndex={item.id === tabStop ? 0 : -1}
                  data-autofocus={item.id === tabStop ? "" : undefined}
                  onClick={() => choose(item.id)}
                >
                  <span className="m-thumb">
                    <img src={item.url} alt="" loading="lazy" decoding="async" />
                    {(picking ? on : current === item.id) && <span className="m-check" aria-hidden="true"><Icon name="check" /></span>}
                    {noAlt && <span className="m-flag" aria-hidden="true"><Icon name="error" />No alt text</span>}
                  </span>
                  <span className="m-meta" aria-hidden="true"><span>{item.filename}</span></span>
                </button>
              );
            })}
          </div>
          {service && (
            <div className="m-item m-drop" aria-hidden="true" onClick={() => fileInput.current?.click()}>
              <div className="m-thumb">
                <Icon name="upload" />
                <span>Drop images here</span>
                <small>JPG, PNG, WebP or GIF. Sent at {MAX_LONG_SIDE} px and {bytesText(MAX_UPLOAD_BYTES)} at most</small>
              </div>
            </div>
          )}
          {shown.length === 0 && (
            <p className="m-none">
              {library.length === 0 ? (service ? "The library has no images yet. Upload one, or drop it here." : "The media library has no images yet.") : "No image matches."}
            </p>
          )}
        </div>
        <aside ref={details} className="media-details" aria-label="Selected image">
          {shownItem ? (
            <Details
              key={shownItem.id}
              id={id}
              item={shownItem}
              now={clock.now()}
              picking={picking}
              chosen={live.includes(shownItem.id)}
              alt={altOf(shownItem.id)}
              decorative={decorative.has(shownItem.id)}
              altSave={altSaves.get(shownItem.id) ?? null}
              service={service}
              deleting={deleting?.id === shownItem.id ? deleting.phase : null}
              deleteSaid={deleteSaid?.id === shownItem.id ? deleteSaid.text : null}
              onAlt={(text) => {
                setProblem(null);
                setAlts((map) => new Map(map).set(shownItem.id, oneLine(text)));
                setAltSaves((saves) => withoutKey(saves, shownItem.id));
              }}
              onAltDone={() => saveAlt(shownItem.id)}
              onDecorative={(on) => {
                setProblem(null);
                setDecorative((set) => {
                  const next = new Set(set);
                  if (on) next.add(shownItem.id);
                  else next.delete(shownItem.id);
                  return next;
                });
              }}
              onAskDelete={() => {
                setDeleteSaid(null);
                setDeleting({ id: shownItem.id, phase: "asking" });
              }}
              onKeep={() => setDeleting(null)}
              onDelete={() => void remove(shownItem.id)}
            />
          ) : picking ? (
            <>
              <p className="md-none">{multiple ? "Choose images on the left, or upload them." : "Choose an image on the left, or upload one."}</p>
              {!multiple || live.length === 0 ? (
                <>
                  <h3 className="group-title md-or">Or an image from another site</h3>
                  <div className="field">
                    <label className="label" htmlFor={`${id}-url`}>Image address</label>
                    <input id={`${id}-url`} className="input" type="text" spellCheck={false} placeholder="https://" value={address} onChange={(e) => {
                      setProblem(null);
                      setAddress(e.target.value);
                    }} />
                  </div>
                  {address.trim() !== "" && (
                    <AltFields
                      id={`${id}-alt`}
                      alt={addressAlt}
                      decorative={addressDecorative}
                      required
                      onAlt={(text) => {
                        setProblem(null);
                        setAddressAlt(oneLine(text));
                      }}
                      onDecorative={setAddressDecorative}
                    />
                  )}
                </>
              ) : null}
            </>
          ) : (
            <p className="md-none">Choose an image to see it here, with its alt text.</p>
          )}
          <ErrorList id={`${id}-problem`} errors={problem ? [problem] : []} />
        </aside>
      </div>
    </Dialog>
  );
}

function withoutKey<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

// The tile the arrows lead to: the next or previous in reading order, the
// first or the last; up and down, the nearest tile in the row above or
// below, by where the tiles are drawn.
function neighbour(tiles: readonly HTMLElement[], from: HTMLElement, way: "left" | "right" | "up" | "down" | "first" | "last"): HTMLElement | undefined {
  const at = tiles.indexOf(from);
  if (way === "first") return tiles[0];
  if (way === "last") return tiles.at(-1);
  if (way === "left") return tiles[at - 1];
  if (way === "right") return tiles[at + 1];
  const here = from.getBoundingClientRect();
  const rows = tiles
    .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
    .filter(({ box }) => (way === "down" ? box.top > here.top + 1 : box.top < here.top - 1));
  if (rows.length === 0) return undefined;
  const rowTop = way === "down" ? Math.min(...rows.map((r) => r.box.top)) : Math.max(...rows.map((r) => r.box.top));
  const row = rows.filter((r) => Math.abs(r.box.top - rowTop) <= 1);
  row.sort((a, b) => Math.abs(a.box.left - here.left) - Math.abs(b.box.left - here.left));
  return row[0]?.tile;
}

// ------------------------------------------------------- an upload

function UploadTile({ entry, service }: { entry: UploadEntry; service: MediaService }) {
  const percent = entry.total > 0 ? Math.min(100, Math.round((entry.sent / entry.total) * 100)) : 0;
  const words = entry.phase === "waiting" ? "Waiting" : entry.phase === "preparing" ? "Making it ready…" : entry.phase === "uploading" ? `Uploading, ${percent}%` : "Not added";
  const failed = entry.phase === "failed";
  return (
    <li className={`m-item ${failed ? "m-failed" : "m-uploading"}`}>
      <div className="m-thumb">
        {entry.preview ? <img src={entry.preview} alt="" /> : <Icon name={failed ? "error" : "upload"} />}
      </div>
      {!failed && (
        <div className="m-progress" role="progressbar" aria-label={`Uploading ${entry.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.phase === "uploading" ? percent : 0}>
          <span style={{ width: `${entry.phase === "uploading" ? percent : 0}%` }} />
        </div>
      )}
      <div className="m-meta">
        <span>{failed ? entry.name : words}</span>
        <button className="ibtn ibtn-small" type="button" aria-label={failed ? `Dismiss ${entry.name}` : `Cancel upload of ${entry.name}`} onClick={() => (failed ? service.dismiss(entry.key) : service.cancel(entry.key))}>
          <Icon name="close" className="i i-xs" />
        </button>
      </div>
      {failed && <p className="error" role="alert"><Icon name="error" />{`Not added: ${entry.reason ?? "it was refused."}`}</p>}
    </li>
  );
}

// ------------------------------------------------- the chosen image

interface DetailsProps {
  id: string;
  item: MediaItem;
  now: number;
  picking: boolean;
  chosen: boolean;
  alt: string;
  decorative: boolean;
  altSave: AltSave | null;
  service: MediaService | null;
  deleting: "asking" | "working" | null;
  deleteSaid: string | null;
  onAlt: (text: string) => void;
  onAltDone: () => void;
  onDecorative: (on: boolean) => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
}

function Details({ id, item, now, picking, chosen, alt, decorative, altSave, service, deleting, deleteSaid, onAlt, onAltDone, onDecorative, onAskDelete, onKeep, onDelete }: DetailsProps) {
  // Placing this image needs its alt text, or the decorative mark.
  const needed = picking && chosen && !decorative && !hasAlt(alt);
  const saveWords = altSave?.phase === "saving" ? "Saving…" : altSave?.phase === "saved" ? "Saved in the library." : null;
  const errors = [needed ? ALT_NEEDED : null, altSave?.phase === "failed" ? altSave.message : null].filter((e): e is string => e !== null);
  // Choosing, the field is the design's, with no line under it but the
  // alt text kept; looking after the library, it says what the text is for.
  const words = picking ? null : "Proposed whenever the image is placed. Images already on pages keep their own.";
  const hint = words !== null || saveWords !== null ? <>{words}{words !== null && saveWords !== null ? " " : null}{saveWords && <span className="md-saved">{saveWords}</span>}</> : null;
  return (
    <>
      <img className="md-preview" src={item.url} alt="" />
      <p className="md-name">{item.filename}</p>
      <p className="md-meta">{metaLine(item, now)}</p>
      <div className={`field${errors.length > 0 ? " field-error" : ""}`}>
        <label className="label" htmlFor={`${id}-alt`}>Alt text{picking && <> <span className="req">required</span></>}</label>
        <textarea
          id={`${id}-alt`}
          className="input"
          rows={3}
          placeholder="What does the image show?"
          value={alt}
          readOnly={!service && !picking}
          aria-required={picking && !decorative ? true : undefined}
          aria-invalid={errors.length > 0 ? true : undefined}
          aria-describedby={describedBy(`${id}-alt`, hint, errors)}
          onChange={(e) => onAlt(e.target.value)}
          onBlur={onAltDone}
          onKeyDown={(e) => {
            // One line: Enter keeps the text instead of breaking it.
            if (e.key === "Enter") {
              e.preventDefault();
              onAltDone();
            }
          }}
        />
        {hint && <p className="hint" id={`${id}-alt-hint`}>{hint}</p>}
        <ErrorList id={`${id}-alt-error`} errors={errors} />
      </div>
      {picking && (
        <label className="check">
          <input type="checkbox" checked={decorative} onChange={(e) => onDecorative(e.target.checked)} />
          <span>This image is decorative. Screen readers skip it and no alt text is needed.</span>
        </label>
      )}
      {service && <DeleteControl filename={item.filename} deleting={deleting} said={deleteSaid} onAsk={onAskDelete} onKeep={onKeep} onDelete={onDelete} />}
    </>
  );
}

// Delete, asked twice: the question takes the focus on its safe answer,
// and Keep it gives the focus back to Delete. Esc in the question is Keep
// it: it takes back the question, not the whole library around it.
function DeleteControl({ filename, deleting, said, onAsk, onKeep, onDelete }: { filename: string; deleting: "asking" | "working" | null; said: string | null; onAsk: () => void; onKeep: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  const ask = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (deleting === "asking") keep.current?.focus();
    else if (asked.current) ask.current?.focus();
    asked.current = deleting === "asking";
  }, [deleting]);
  return (
    <div className="md-delete">
      {deleting === "asking" ? (
        <div className="md-confirm" role="group" aria-label={`Delete ${filename}`} onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onKeep();
        }}>
          <p>Delete it from the library for good? The CMS keeps it while a page or a kept version shows it.</p>
          <div className="md-confirm-buttons">
            <button ref={keep} className="btn btn-small btn-secondary" type="button" onClick={onKeep}>Keep it</button>
            <button className="btn btn-small btn-danger" type="button" onClick={onDelete}>Delete</button>
          </div>
        </div>
      ) : (
        <button ref={ask} className="btn btn-small btn-quiet md-delete-btn" type="button" aria-disabled={deleting === "working" ? true : undefined} onClick={deleting === "working" ? undefined : onAsk}>
          <Icon name="trash" className="i i-xs" />{deleting === "working" ? "Deleting…" : "Delete from library"}
        </button>
      )}
      <div aria-live="polite">{said && <p className="error"><Icon name="error" />{said}</p>}</div>
    </div>
  );
}

// The alt text of an image from another site, and its decorative mark.
function AltFields({ id, alt, decorative, required, onAlt, onDecorative }: { id: string; alt: string; decorative: boolean; required: boolean; onAlt: (text: string) => void; onDecorative: (on: boolean) => void }) {
  const errors = required && !decorative && !hasAlt(alt) ? [ALT_NEEDED] : [];
  return (
    <>
      <div className={`field${errors.length > 0 ? " field-error" : ""}`}>
        <label className="label" htmlFor={id}>Alt text <span className="req">required</span></label>
        <textarea id={id} className="input" rows={3} placeholder="What does the image show?" value={alt} aria-required={!decorative ? true : undefined} aria-invalid={errors.length > 0 ? true : undefined} aria-describedby={describedBy(id, null, errors)} onChange={(e) => onAlt(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }} />
        <ErrorList id={`${id}-error`} errors={errors} />
      </div>
      <label className="check">
        <input type="checkbox" checked={decorative} onChange={(e) => onDecorative(e.target.checked)} />
        <span>This image is decorative. Screen readers skip it and no alt text is needed.</span>
      </label>
    </>
  );
}
