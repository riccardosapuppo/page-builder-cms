// What the media library takes, and how an image is made ready before it
// goes up: the rules, apart from the browser's canvas (./resize.ts), so a
// test holds them without one.
//
// - JPEG, PNG, WebP and GIF, as the CMS takes them; never SVG, a document
//   that can carry script, which the CMS refuses too.
// - The CMS makes no smaller copies of an image (the storage's
//   capabilities, imageVariants), so what goes up is what every visitor
//   downloads: the editor draws it again at most MAX_LONG_SIDE pixels on
//   its long side, keeping its proportions and turned the way its camera
//   said (EXIF orientation), in its own format. Drawn again, it leaves the
//   camera's other notes behind, its place among them.
// - An image that moves (a GIF, an animated WebP or PNG) goes up as it is:
//   drawing it again would keep its first frame only. It must fit the
//   same long side already.
import { IMAGE_TYPES, MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES, type ImageType, type Invalid } from "../../storage/adapter.ts";

// The long side, in pixels, of every image the editor uploads: wide enough
// for the page's widest image on a screen of twice the pixels, a few
// hundred kilobytes as a JPEG.
export const MAX_LONG_SIDE = 2400;
// The largest file the editor opens to draw it again: past this, the
// browser would hold hundreds of megabytes of pixels for one image.
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

// The editor's long side fits what the CMS takes.
if (MAX_LONG_SIDE > MAX_IMAGE_SIDE) throw new Error("the editor would upload images larger than the CMS takes");

export const TYPE_NAMES: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

const EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// The kinds of file the library takes, for a file input's accept.
export const ACCEPT = IMAGE_TYPES.join(",");

export function isImageType(type: string): type is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(type);
}

// "84 KB", "1.2 MB", "10 MB".
export function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

// What the file says it is, for a sentence: "a file of type text/plain",
// or "a file of no known type".
function kindOf(file: { type: string }): string {
  return file.type === "" ? "a file of no known type" : `a file of type ${file.type}`;
}

// Why the library will not take this file, said before reading a byte of
// it; null when it may try.
export function refusalBeforeReading(file: { name: string; type: string; size: number }): string | null {
  if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) {
    return "SVG images are not taken: an SVG is a document that can carry script. Save it as PNG or WebP, and upload that.";
  }
  if (!isImageType(file.type)) return `It is ${kindOf(file)}. The library takes JPEG, PNG, WebP and GIF images.`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_SOURCE_BYTES) {
    return `It is ${bytesText(file.size)}; the editor opens images up to ${bytesText(MAX_SOURCE_BYTES)} to make them ready.`;
  }
  return null;
}

// The size an image is drawn at: its own when its long side fits, else
// scaled down to MAX_LONG_SIDE on that side, proportions kept.
export function fitWithin(width: number, height: number, longest = MAX_LONG_SIDE): { width: number; height: number; resized: boolean } {
  const long = Math.max(width, height);
  if (long <= longest) return { width, height, resized: false };
  const scale = longest / long;
  return {
    width: width >= height ? longest : Math.max(1, Math.round(width * scale)),
    height: height > width ? longest : Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

const ascii = (bytes: Uint8Array, at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length));

// Whether an image moves, from its first bytes: every GIF is taken as
// moving; a WebP whose VP8X header sets the animation flag; a PNG with an
// acTL chunk before its pixels (APNG). `head` holds at least the file's
// headers; a PNG's are walked chunk by chunk until its pixels begin.
export function moves(type: ImageType, head: Uint8Array): boolean {
  switch (type) {
    case "image/gif":
      return true;
    case "image/webp":
      // RIFF, size, WEBP, then the first chunk; VP8X's flags byte follows
      // its own size. 0x02 is "animation" (the WebP container spec).
      return head.length > 20 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP" && ascii(head, 12, 4) === "VP8X" && (head[20]! & 0x02) !== 0;
    case "image/png": {
      if (head.length < 8) return false;
      let at = 8;
      while (at + 8 <= head.length) {
        const length = new DataView(head.buffer, head.byteOffset + at, 4).getUint32(0);
        const name = ascii(head, at + 4, 4);
        if (name === "acTL") return true;
        if (name === "IDAT" || name === "IEND") return false;
        at += 12 + length;
      }
      return false;
    }
    case "image/jpeg":
      return false;
  }
}

// How an image drawn again is written: in its own format, a photograph at
// 90% quality, a PNG without loss.
export function encodingFor(type: Exclude<ImageType, "image/gif">): { type: ImageType; quality?: number } {
  return type === "image/png" ? { type } : { type, quality: 0.9 };
}

// The file's name for the format it was written in: the same name when
// the browser wrote the format asked for (a browser that cannot write
// WebP writes PNG).
export function renamed(name: string, type: ImageType): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const same = extension === EXTENSIONS[type] || (type === "image/jpeg" && extension === "jpeg");
  return same ? name : `${stem}.${EXTENSIONS[type]}`;
}

// The sentence for an upload the CMS refused (a 422 at the file, or at
// another field), said as the CMS's: a refusal says who refused and why. `sent`
// is the size of what was sent, after the editor made it ready.
export function uploadRefusal(problem: Invalid, sent: { size: number; type: string }): string {
  const error = problem.errors.find((e) => e.pointer === "/file") ?? problem.errors[0];
  if (!error) return `The CMS refused it: ${problem.message}`;
  if (error.pointer === "/file") {
    switch (error.keyword) {
      case "maximum":
      case "tooLarge":
        return `The CMS refused it: ready to go up it is ${bytesText(sent.size)}, and the CMS takes images up to ${bytesText(MAX_UPLOAD_BYTES)}. Save it as JPEG or WebP, or crop it, and upload it again.`;
      case "enum":
      case "contentType":
        return "The CMS refused it: it takes JPEG, PNG, WebP and GIF images only.";
      case "contentMismatch": {
        const name = isImageType(sent.type) ? `${TYPE_NAMES[sent.type]} image` : "image";
        return `The CMS refused it: its bytes are not the ${name} it says it is. The file may be damaged, or renamed from another kind.`;
      }
      default:
        return `The CMS refused it: the file ${error.message}.`;
    }
  }
  return `The CMS refused it: ${error.pointer.slice(1)} ${error.message}.`;
}
