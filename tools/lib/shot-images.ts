// The pictures docs/images/ holds, in the one place that names them: what
// `npm run shots` (tools/shots.ts) makes, and what the README may show.
// checkImages reads the folder back and says what is wrong with it, so a
// picture that is missing, truncated, of another size, too large, left over
// from a name that is gone, or named in the README without being made, is
// found before a reader meets it (tools/lib/shot-images.test.ts runs it on the
// committed folder).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, crc32 } from "node:zlib";
import { frameImages, pixelsDiffering, readGif } from "./gif.ts";

export const IMAGES_DIR = "docs/images";

export interface ImageSpec {
  file: string;
  kind: "png" | "gif";
  // In pixels, as the file holds them.
  width: number;
  height: number;
  // A picture smaller than this is a blank page or an error page; one
  // larger is more than the README should carry.
  minBytes: number;
  maxBytes: number;
  // A GIF's frames, at least.
  minFrames?: number;
  shows: string;
  // false for a picture made with the README's but not shown there.
  readme?: false;
}

export const IMAGES: readonly ImageSpec[] = [
  { file: "editor.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the editor with the home page open, its heading selected, the Outline and the settings beside the page" },
  { file: "editor-phone.png", kind: "png", width: 780, height: 1688, minBytes: 60_000, maxBytes: 600_000, shows: "the editor on a 390 by 844 phone, drawn at twice the pixels: the hero's heading selected, its settings risen from the bar at the foot" },
  { file: "assistant.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the Assistant after writing a page from the sample written by hand: its four sections on the canvas and in its drawer, its heading selected" },
  { file: "header.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the site's header open in the editor as a page is, its menu selected, the home page dimmed under it" },
  { file: "published-desktop.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the home page as the CMS serves it to a desktop window" },
  { file: "published-phone.png", kind: "png", width: 780, height: 1688, minBytes: 60_000, maxBytes: 600_000, shows: "the same page on a 390 by 844 phone, drawn at twice the pixels" },
  { file: "history.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the editor's History: this session, a version kept under a name, and the published one" },
  { file: "form-responses.png", kind: "png", width: 1440, height: 900, minBytes: 40_000, maxBytes: 400_000, shows: "Form responses, with a visitor's answer opened" },
  { file: "demo.png", kind: "png", width: 1440, height: 900, minBytes: 60_000, maxBytes: 400_000, shows: "the browser demo after Publish, with its bottom line" },
  { file: "demo-preview.png", kind: "png", width: 1200, height: 627, minBytes: 40_000, maxBytes: 1_000_000, readme: false, shows: "the browser demo as a shared link previews it (Open Graph, builder/build/demo.ts): the editor on the example site's home page, its heading selected" },
  { file: "publish.gif", kind: "gif", width: 960, height: 600, minBytes: 60_000, maxBytes: 2_000_000, minFrames: 8, shows: "a heading changed in the editor and published on Rails, then the served page with the change" },
];

// A file that may sit in the folder beside the pictures.
const ALLOWED_BESIDE = new Set(["README.md"]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// A PNG read through: its signature, every chunk's length and checksum,
// the header first and the end last, and image data that inflates to
// exactly the rows the header promises. Returns the size, or throws.
export function readPng(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) throw new Error("it is not a PNG: the signature is wrong");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let header: { width: number; height: number; channels: number } | null = null;
  const data: Uint8Array[] = [];
  let ended = false;
  while (at < bytes.length) {
    if (ended) throw new Error("bytes follow the PNG's end chunk");
    if (at + 12 > bytes.length) throw new Error("the PNG stops inside a chunk");
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) throw new Error(`the PNG stops inside its ${type} chunk`);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)) throw new Error(`the checksum of the ${type} chunk is wrong`);
    if (header === null) {
      if (type !== "IHDR" || length !== 13) throw new Error("the first chunk is not the header");
      const [depth, color, , , interlace] = [body[8]!, body[9]!, body[10]!, body[11]!, body[12]!];
      if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) throw new Error(`the PNG is not 8-bit RGB or RGBA without interlacing (depth ${depth}, color type ${color}, interlace ${interlace})`);
      header = { width: view.getUint32(at + 8), height: view.getUint32(at + 12), channels: color === 2 ? 3 : 4 };
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      ended = true;
    }
    at += 12 + length;
  }
  if (header === null) throw new Error("the PNG has no chunks");
  if (!ended) throw new Error("the PNG has no end chunk");
  const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
  let to = 0;
  for (const part of data) {
    joined.set(part, to);
    to += part.length;
  }
  const rows = inflateSync(joined);
  const expected = header.height * (1 + header.width * header.channels);
  if (rows.length !== expected) throw new Error(`the image data is ${rows.length} bytes, ${header.width} x ${header.height} needs ${expected}`);
  return { width: header.width, height: header.height };
}

function checkPng(spec: ImageSpec, bytes: Uint8Array): string[] {
  try {
    const { width, height } = readPng(bytes);
    return width === spec.width && height === spec.height ? [] : [`${spec.file} is ${width} x ${height}, not ${spec.width} x ${spec.height}`];
  } catch (error) {
    return [`${spec.file}: ${(error as Error).message}`];
  }
}

// The longest a README's GIF may play, so it is a short story.
const MOST_SECONDS = 25;

function checkGif(spec: ImageSpec, bytes: Uint8Array): string[] {
  let gif;
  try {
    gif = readGif(bytes);
  } catch (error) {
    return [`${spec.file}: ${(error as Error).message}`];
  }
  const problems: string[] = [];
  if (gif.version !== "89a") problems.push(`${spec.file} is GIF${gif.version}, which has no animation`);
  if (gif.width !== spec.width || gif.height !== spec.height) problems.push(`${spec.file} is ${gif.width} x ${gif.height}, not ${spec.width} x ${spec.height}`);
  if (gif.loops !== 0) problems.push(`${spec.file} does not loop forever (loop count ${gif.loops})`);
  if (gif.frames.length < (spec.minFrames ?? 2)) problems.push(`${spec.file} has ${gif.frames.length} frames, at least ${spec.minFrames ?? 2} are the story`);
  const seconds = gif.frames.reduce((sum, frame) => sum + frame.delayMs, 0) / 1000;
  if (seconds > MOST_SECONDS) problems.push(`${spec.file} plays for ${seconds.toFixed(1)} s, more than ${MOST_SECONDS}`);
  const slow = gif.frames.findIndex((frame) => frame.delayMs < 40);
  if (slow !== -1) problems.push(`frame ${slow + 1} of ${spec.file} lasts ${gif.frames[slow]!.delayMs} ms: browsers lengthen anything under 20 ms to 100`);
  if (problems.length > 0) return problems;
  // What each frame shows: every frame must change the picture, and the
  // last must not be the first.
  const shown = frameImages(gif);
  for (let i = 1; i < shown.length; i += 1) {
    if (pixelsDiffering(shown[i - 1]!, shown[i]!) === 0) problems.push(`frame ${i + 1} of ${spec.file} shows what frame ${i} shows`);
  }
  const apart = pixelsDiffering(shown[0]!, shown.at(-1)!);
  if (apart < spec.width * spec.height * 0.001) problems.push(`the last frame of ${spec.file} differs from the first in ${apart} pixels: nothing changed`);
  return problems;
}

// What is wrong with the folder: each picture in `specs`, its file read
// through, its size in pixels and in bytes; any other file; and, given the
// README's text, any picture it names that is not one of them.
export function checkImages(folder: string, readme: string | null = null, specs: readonly ImageSpec[] = IMAGES): string[] {
  const problems: string[] = [];
  let present: string[];
  try {
    present = readdirSync(folder);
  } catch {
    return [`${folder} does not exist`];
  }
  for (const spec of specs) {
    if (!present.includes(spec.file)) {
      problems.push(`${spec.file} is missing from ${folder}`);
      continue;
    }
    const path = join(folder, spec.file);
    if (!statSync(path).isFile()) {
      problems.push(`${spec.file} is not a file`);
      continue;
    }
    const bytes = readFileSync(path);
    if (bytes.length < spec.minBytes) problems.push(`${spec.file} is ${bytes.length} bytes, under the ${spec.minBytes} of a picture with something in it`);
    if (bytes.length > spec.maxBytes) problems.push(`${spec.file} is ${bytes.length} bytes, over the ${spec.maxBytes} it may take`);
    problems.push(...(spec.kind === "png" ? checkPng(spec, bytes) : checkGif(spec, bytes)));
  }
  const known = new Set(specs.map((spec) => spec.file));
  for (const name of present) {
    if (!known.has(name) && !ALLOWED_BESIDE.has(name)) problems.push(`${name} is in ${folder} and is not a picture the script makes`);
  }
  if (readme !== null) {
    for (const match of readme.matchAll(/docs\/images\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g)) {
      if (!known.has(match[1]!) && !ALLOWED_BESIDE.has(match[1]!)) problems.push(`the README shows ${match[0]}, which the script does not make`);
    }
  }
  return problems;
}
