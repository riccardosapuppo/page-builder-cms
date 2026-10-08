// The media library's rules for a file: which it refuses before reading
// it and why, the size an image is drawn at, which images move and so go
// up as they are, the name of an image written in another format, and the
// sentences for what the CMS refuses.
import { expect, test } from "vitest";
import { MAX_UPLOAD_BYTES, type Invalid } from "../../storage/adapter.ts";
import { bytesText, fitWithin, MAX_LONG_SIDE, MAX_SOURCE_BYTES, moves, refusalBeforeReading, renamed, uploadRefusal } from "./files.ts";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

test("an SVG, a file of another kind, an empty one and one too big to open are refused, each saying why", () => {
  expect(refusalBeforeReading(file("logo.svg", "image/svg+xml"))).toMatch(/^SVG images are not taken: an SVG is a document that can carry script/);
  // Named .svg with no type the browser knows: still an SVG.
  expect(refusalBeforeReading(file("logo.SVG", ""))).toMatch(/^SVG images are not taken/);
  expect(refusalBeforeReading(file("notes.txt", "text/plain"))).toBe("It is a file of type text/plain. The library takes JPEG, PNG, WebP and GIF images.");
  expect(refusalBeforeReading(file("photo", ""))).toBe("It is a file of no known type. The library takes JPEG, PNG, WebP and GIF images.");
  expect(refusalBeforeReading(file("empty.png", "image/png", 0))).toBe("The file is empty.");
  expect(refusalBeforeReading(file("huge.jpg", "image/jpeg", MAX_SOURCE_BYTES + 5 * 1024 * 1024))).toBe("It is 55 MB; the editor opens images up to 50 MB to make them ready.");
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    expect(refusalBeforeReading(file("ok", type, MAX_SOURCE_BYTES))).toBeNull();
  }
});

test("an image is drawn at most 2400 pixels on its long side, its proportions kept, and never made larger", () => {
  expect(MAX_LONG_SIDE).toBe(2400);
  expect(fitWithin(6000, 4000)).toEqual({ width: 2400, height: 1600, resized: true });
  expect(fitWithin(3024, 4032)).toEqual({ width: 1800, height: 2400, resized: true });
  expect(fitWithin(5000, 5000)).toEqual({ width: 2400, height: 2400, resized: true });
  // A sliver keeps a pixel.
  expect(fitWithin(100_000, 10)).toEqual({ width: 2400, height: 1, resized: true });
  expect(fitWithin(2400, 900)).toEqual({ width: 2400, height: 900, resized: false });
  expect(fitWithin(40, 30)).toEqual({ width: 40, height: 30, resized: false });
  // Over many sizes: the long side is 2400, the short one within half a
  // pixel of its exact share.
  for (let w = 2401; w < 9000; w += 997) {
    for (let h = 50; h < 9000; h += 1231) {
      const fit = fitWithin(w, h);
      const [long, short, fitShort] = w >= h ? [w, h, fit.height] : [h, w, fit.width];
      expect(Math.max(fit.width, fit.height)).toBe(2400);
      expect(Math.abs(fitShort - (short * 2400) / long)).toBeLessThanOrEqual(0.5);
    }
  }
});

// A PNG's chunks, as bytes: [length][name][data][crc], the crc left zero.
function png(...chunks: Array<[string, number]>): Uint8Array {
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [name, length] of chunks) {
    const chunk = new Uint8Array(12 + length);
    new DataView(chunk.buffer).setUint32(0, length);
    chunk.set([...name].map((c) => c.charCodeAt(0)), 4);
    parts.push(chunk);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function webp(flags: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  bytes.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
  bytes.set([..."VP8X"].map((c) => c.charCodeAt(0)), 12);
  bytes[20] = flags;
  return bytes;
}

test("a GIF, an animated WebP and an animated PNG move; a still WebP, PNG or JPEG does not", () => {
  expect(moves("image/gif", new Uint8Array(0))).toBe(true);
  expect(moves("image/webp", webp(0x02))).toBe(true);
  expect(moves("image/webp", webp(0x02 | 0x10))).toBe(true);
  expect(moves("image/webp", webp(0x10))).toBe(false);
  // An acTL after a large colour profile is still found; one after the
  // pixels begin is not the animation's.
  expect(moves("image/png", png(["IHDR", 13], ["iCCP", 3000], ["acTL", 8], ["IDAT", 10]))).toBe(true);
  expect(moves("image/png", png(["IHDR", 13], ["IDAT", 10], ["acTL", 8]))).toBe(false);
  expect(moves("image/png", png(["IHDR", 13], ["IDAT", 10], ["IEND", 0]))).toBe(false);
  expect(moves("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
});

test("an image written in another format than its name says takes that format's name", () => {
  expect(renamed("dawn.jpg", "image/jpeg")).toBe("dawn.jpg");
  expect(renamed("dawn.JPEG", "image/jpeg")).toBe("dawn.JPEG");
  expect(renamed("dawn.webp", "image/png")).toBe("dawn.png");
  expect(renamed("no-extension", "image/png")).toBe("no-extension.png");
  expect(renamed(".hidden", "image/png")).toBe(".hidden.png");
});

test("sizes are said in bytes, KB and MB", () => {
  expect([bytesText(512), bytesText(1024), bytesText(86_016), bytesText(1_258_291), bytesText(MAX_UPLOAD_BYTES)]).toEqual(["512 bytes", "1 KB", "84 KB", "1.2 MB", "10 MB"]);
});

const invalid = (keyword: string, message: string, pointer = "/file"): Invalid => ({ kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [{ pointer, keyword, blockPointer: null, message }] });

test("with no CMS (the browser demo), the refusals are this browser's storage's, said without blaming a CMS", () => {
  const sent = { size: 17 * 1024 * 1024, type: "image/png" };
  expect(uploadRefusal(invalid("maximum", "must be at most 10485760"), sent, true)).toBe(
    "This browser keeps images up to 10 MB: ready to go up it is 17 MB. Save it as JPEG or WebP, or crop it, and upload it again.",
  );
  expect(uploadRefusal(invalid("enum", "must be one of image/jpeg, image/png, image/webp, image/gif"), sent, true)).toBe("This browser keeps JPEG, PNG, WebP and GIF images only.");
  expect(uploadRefusal(invalid("contentMismatch", "is not the image/png image it claims to be"), sent, true)).toBe(
    "Its bytes are not the PNG image it says it is. The file may be damaged, or renamed from another kind.",
  );
  expect(uploadRefusal(invalid("notUploaded", "was never uploaded"), sent, true)).toBe("The file was never uploaded.");
  expect(uploadRefusal(invalid("maximum", "must be at most 10000", "/width"), sent, true)).toBe("Width must be at most 10000.");
  expect(uploadRefusal({ kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [] }, sent, true)).toBe("The request is not valid.");
});

test("the CMS's refusals are said as the CMS's, with what the editor knows of the file", () => {
  const sent = { size: 17 * 1024 * 1024, type: "image/png" };
  expect(uploadRefusal(invalid("maximum", "must be at most 10485760"), sent)).toBe(
    "The CMS refused it: ready to go up it is 17 MB, and the CMS takes images up to 10 MB. Save it as JPEG or WebP, or crop it, and upload it again.",
  );
  expect(uploadRefusal(invalid("enum", "must be one of image/jpeg, image/png, image/webp, image/gif"), sent)).toBe("The CMS refused it: it takes JPEG, PNG, WebP and GIF images only.");
  expect(uploadRefusal(invalid("contentMismatch", "is not the image/png image it claims to be"), sent)).toBe(
    "The CMS refused it: its bytes are not the PNG image it says it is. The file may be damaged, or renamed from another kind.",
  );
  expect(uploadRefusal(invalid("notUploaded", "was never uploaded"), sent)).toBe("The CMS refused it: the file was never uploaded.");
  expect(uploadRefusal(invalid("maximum", "must be at most 10000", "/width"), sent)).toBe("The CMS refused it: width must be at most 10000.");
  expect(uploadRefusal({ kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [] }, sent)).toBe("The CMS refused it: The request is not valid.");
});
