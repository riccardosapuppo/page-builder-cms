// An image made ready to go up, in the browser (the rules are ./files.ts):
// decoded turned the way its camera said (createImageBitmap's
// imageOrientation "from-image" applies the EXIF orientation), drawn again
// at most MAX_LONG_SIDE pixels on its long side, and written in its own
// format. An image that moves goes up as it is, once its size is known.
//
// The CMS has no image library (no libvips, a stage 1 decision), so this
// is the one place an image is ever made smaller. Only a real browser can
// run it: the media library's browser tests upload through it.
import { encodingFor, fitWithin, isImageType, MAX_LONG_SIDE, moves, refusalBeforeReading, renamed, TYPE_NAMES } from "./files.ts";

export interface Prepared {
  file: File;
  // Its size in pixels, as the CMS is told it: the CMS measures nothing.
  width: number;
  height: number;
  // Whether it was drawn smaller than it came.
  resized: boolean;
}

export type Preparation = { ok: true; image: Prepared } | { ok: false; reason: string };
export type Prepare = (file: File) => Promise<Preparation>;

// How much of a file is read to know whether it moves: a PNG's colour
// profile comes before its animation chunk, and can be large.
const HEAD_BYTES = 256 * 1024;

export const prepareImage: Prepare = async (file) => {
  const refused = refusalBeforeReading(file);
  if (refused) return { ok: false, reason: refused };
  const type = file.type;
  if (!isImageType(type)) return { ok: false, reason: "The library takes JPEG, PNG, WebP and GIF images." };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: `It could not be read as a ${TYPE_NAMES[type]} image: the file may be damaged.` };
  }
  try {
    const { width, height } = bitmap;
    if (type === "image/gif" || moves(type, new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer()))) {
      if (Math.max(width, height) > MAX_LONG_SIDE) {
        return {
          ok: false,
          reason: `An image that moves goes up as it is, to keep its frames, so it must be at most ${MAX_LONG_SIDE} pixels on its long side; this one is ${width} × ${height}. Make it smaller first.`,
        };
      }
      return { ok: true, image: { file, width, height, resized: false } };
    }
    const size = fitWithin(width, height);
    const encoding = encodingFor(type);
    let blob: Blob;
    try {
      blob = await draw(bitmap, size, encoding);
    } catch (error) {
      return { ok: false, reason: `The browser could not draw it again: ${error instanceof Error ? error.message : String(error)}` };
    }
    // A browser that cannot write the format asked for writes PNG.
    const written = isImageType(blob.type) ? blob.type : encoding.type;
    const ready = new File([blob], renamed(file.name, written), { type: written, lastModified: file.lastModified });
    return { ok: true, image: { file: ready, width: size.width, height: size.height, resized: size.resized } };
  } finally {
    bitmap.close();
  }
};

type Size = { width: number; height: number };

async function draw(bitmap: ImageBitmap, size: Size, encoding: { type: string; quality?: number }): Promise<Blob> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    paint(canvas.getContext("2d"), bitmap, size);
    return await canvas.convertToBlob(encoding);
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  paint(canvas.getContext("2d"), bitmap, size);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the canvas gave no file"))), encoding.type, encoding.quality);
  });
}

function paint(context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null, bitmap: ImageBitmap, size: Size): void {
  if (!context) throw new Error("the browser gave no canvas to draw on");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
}
