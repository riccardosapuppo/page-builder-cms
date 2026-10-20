// Pictures made for a page, finished in the browser (./makers.ts): an
// illustration's clean SVG (./svg.ts) drawn to a canvas at the size of its
// shape and kept as WebP, or PNG where the browser writes no WebP; a
// photo's bytes read for what they are and their size, and drawn smaller
// only if they are larger than the editor uploads. The SVG is drawn as an
// image, which runs no script and loads nothing, from a blob: address the
// editor's Content-Security-Policy allows for images (build/csp.ts).
// Only a real browser can run this: the Assistant's browser tests do.
import { MAX_LONG_SIDE } from "../editor/library/files.ts";
import { prepareImage } from "../editor/library/resize.ts";
import { MAX_UPLOAD_BYTES } from "../storage/adapter.ts";
import { sniffImage, type MadeType } from "./pictures.ts";

export interface Finished {
  blob: Blob;
  type: MadeType;
  width: number;
  height: number;
}

// An illustration's WebP's quality: its flat colours stay flat.
const ILLUSTRATION_QUALITY = 0.9;

export async function drawSvg(svg: string, size: { width: number; height: number }): Promise<Finished> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image(size.width, size.height);
    image.src = url;
    await image.decode();
    const blob = await paint(image, size);
    return { blob, type: blob.type === "image/webp" ? "image/webp" : "image/png", ...size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function paint(image: HTMLImageElement, size: { width: number; height: number }): Promise<Blob> {
  const draw = (context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null): void => {
    if (!context) throw new Error("the browser gave no canvas to draw on");
    context.drawImage(image, 0, 0, size.width, size.height);
  };
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    draw(canvas.getContext("2d"));
    return await canvas.convertToBlob({ type: "image/webp", quality: ILLUSTRATION_QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  draw(canvas.getContext("2d"));
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the canvas gave no file"))), "image/webp", ILLUSTRATION_QUALITY);
  });
}

// "iVBORw0…" as bytes.
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

// A photo's bytes, as the library will take them: a WebP, PNG or JPEG it
// can read, within the size the library takes, its long side at most the
// editor's.
export async function readPhoto(bytes: Uint8Array): Promise<Finished> {
  const type = sniffImage(bytes);
  if (type === null) throw new Error("it is not a WebP, PNG or JPEG picture");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error(`it is ${Math.ceil(bytes.length / (1024 * 1024))} MB, more than the library takes`);
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error("it could not be read as a picture");
  }
  const { width, height } = bitmap;
  bitmap.close();
  if (Math.max(width, height) <= MAX_LONG_SIDE) return { blob, type, width, height };
  // Larger than the editor uploads: drawn smaller, as an upload is.
  const prepared = await prepareImage(new File([blob], "photo", { type }));
  if (!prepared.ok) throw new Error(prepared.reason);
  const written = prepared.image.file.type;
  const kind: MadeType = written === "image/webp" || written === "image/png" || written === "image/jpeg" ? written : type;
  return { blob: prepared.image.file, type: kind, width: prepared.image.width, height: prepared.image.height };
}
