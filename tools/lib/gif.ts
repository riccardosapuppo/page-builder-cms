// The README's GIF: an encoder over gifenc (MIT, pure JavaScript) and a
// reader that decodes what it wrote. A GIF is checked by reading it back,
// header, frames and pixels, never by trusting the encoder that made it.
//
// The encoder writes a frame whole, with a palette of its own, when much of
// the picture changed from the one before (a page replaced by another), and
// otherwise only what changed: the pixels that are the same are written as
// one reserved, transparent palette entry and the previous frame is left in
// place under them. A run of one value costs the file almost nothing, so
// the editor's frames, which differ by a line of text and a status, take a
// few kilobytes each.
import gifenc from "gifenc";

const { GIFEncoder, quantize, applyPalette } = gifenc;

type Color = [number, number, number];

export interface Frame {
  // Width x height x 4 bytes, red, green, blue, alpha. The array must own
  // its buffer (gifenc reads the whole ArrayBuffer, not a view's part of it).
  rgba: Uint8Array;
  delayMs: number;
}

export interface Encoded {
  bytes: Uint8Array;
  // How many frames were written whole, with a palette of their own, and
  // how many as what changed.
  whole: number;
  delta: number;
}

// The palette entry no picture uses: the pixels a delta frame leaves as
// they were.
const UNCHANGED = 255;
// A frame that changes more of the picture than this is written whole.
const WHOLE_ABOVE = 0.4;

function words(rgba: Uint8Array): Uint32Array {
  if (rgba.byteOffset % 4 !== 0 || rgba.length % 4 !== 0) throw new Error("the pixels are not a whole number of RGBA words");
  return new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length / 4);
}

// How many pixels differ between two images of the same size.
export function pixelsDiffering(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error(`images of ${a.length / 4} and ${b.length / 4} pixels cannot be compared`);
  const x = words(a);
  const y = words(b);
  let count = 0;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) count += 1;
  return count;
}

export function encodeGif(frames: readonly Frame[], width: number, height: number): Encoded {
  if (frames.length === 0) throw new Error("a GIF needs at least one frame");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 0xffff || height > 0xffff) throw new Error(`a GIF of ${width} by ${height} cannot be made`);
  const gif = GIFEncoder();
  let palette: Color[] = [];
  let before: Uint32Array | null = null;
  let whole = 0;
  let delta = 0;
  for (const [number, frame] of frames.entries()) {
    if (frame.rgba.length !== width * height * 4) throw new Error(`frame ${number + 1} holds ${frame.rgba.length / 4} pixels, not ${width} x ${height}`);
    const now = words(frame.rgba);
    let changed = now.length;
    if (before) {
      changed = 0;
      for (let i = 0; i < now.length; i += 1) if (now[i] !== before[i]) changed += 1;
    }
    if (before === null || changed / now.length > WHOLE_ABOVE) {
      // 255 colors, so the last entry is never a picture's.
      palette = quantize(frame.rgba, UNCHANGED).map((c): Color => [c[0], c[1], c[2]]);
      while (palette.length < 256) palette.push([0, 0, 0]);
      gif.writeFrame(applyPalette(frame.rgba, palette.slice(0, UNCHANGED)), width, height, { palette, delay: frame.delayMs, repeat: 0 });
      whole += 1;
    } else {
      const index = applyPalette(frame.rgba, palette.slice(0, UNCHANGED));
      for (let i = 0; i < now.length; i += 1) if (now[i] === before[i]) index[i] = UNCHANGED;
      gif.writeFrame(index, width, height, { palette, delay: frame.delayMs, transparent: true, transparentIndex: UNCHANGED, dispose: 1 });
      delta += 1;
    }
    before = now;
  }
  gif.finish();
  return { bytes: gif.bytes().slice(), whole, delta };
}

export interface GifFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  delayMs: number;
  // 0 or 1: leave it; 2: clear it to the background; 3: put back what was there.
  disposal: number;
  // The palette entry the frame draws nothing for, or null.
  clearIndex: number | null;
  localPalette: boolean;
  // Red, green, blue for each entry.
  palette: Uint8Array;
  // One palette entry for each pixel of the frame, row by row.
  indices: Uint8Array;
}

export interface Gif {
  version: "87a" | "89a";
  width: number;
  height: number;
  // How many times the animation plays: 0 forever, null when the file says
  // nothing (once).
  loops: number | null;
  frames: GifFrame[];
}

// The data of the image, from its LZW codes to one byte for each pixel.
function lzwDecode(minCodeSize: number, data: Uint8Array, pixels: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) throw new Error(`the LZW minimum code size is ${minCodeSize}, not 2 to 8`);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = new Uint8Array(pixels);
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let size = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let first = 0;
  let written = 0;
  let bits = 0;
  let held = 0;
  let at = 0;
  for (;;) {
    while (held < size) {
      if (at >= data.length) throw new Error("the image data ends before its end code");
      bits |= data[at]! << held;
      at += 1;
      held += 8;
    }
    let code = bits & ((1 << size) - 1);
    bits >>>= size;
    held -= size;
    if (code === clear) {
      size = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) break;
    if (previous === -1) {
      if (code >= clear) throw new Error(`the first code after a clear, ${code}, is not a color`);
      if (written >= pixels) throw new Error("the image data holds more pixels than the frame");
      out[written] = code;
      written += 1;
      previous = code;
      first = code;
      continue;
    }
    const given = code;
    let top = 0;
    if (code > next) throw new Error(`code ${code} is not in the table yet (${next} entries)`);
    if (code === next) {
      stack[top] = first;
      top += 1;
      code = previous;
    }
    while (code >= clear) {
      stack[top] = suffix[code]!;
      top += 1;
      code = prefix[code]!;
    }
    first = code;
    stack[top] = code;
    top += 1;
    if (next < 4096) {
      prefix[next] = previous;
      suffix[next] = first;
      next += 1;
      if (next === 1 << size && size < 12) size += 1;
    }
    previous = given;
    if (written + top > pixels) throw new Error("the image data holds more pixels than the frame");
    while (top > 0) {
      top -= 1;
      out[written] = stack[top]!;
      written += 1;
    }
  }
  if (written !== pixels) throw new Error(`the image data holds ${written} pixels, the frame ${pixels}`);
  return out;
}

// A GIF read whole, every block of it. Throws on anything the format does
// not allow: a signature that is not one, a file that stops inside a block,
// a frame outside the screen, no trailer, LZW data that does not fill its
// frame.
export function readGif(bytes: Uint8Array): Gif {
  let at = 0;
  const need = (count: number, what: string) => {
    if (at + count > bytes.length) throw new Error(`the GIF ends inside ${what}`);
  };
  const u8 = (what: string): number => {
    need(1, what);
    const value = bytes[at]!;
    at += 1;
    return value;
  };
  const u16 = (what: string): number => u8(what) | (u8(what) << 8);
  const blocks = (what: string): Uint8Array => {
    const parts: Uint8Array[] = [];
    for (;;) {
      const size = u8(what);
      if (size === 0) break;
      need(size, what);
      parts.push(bytes.subarray(at, at + size));
      at += size;
    }
    const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let to = 0;
    for (const part of parts) {
      joined.set(part, to);
      to += part.length;
    }
    return joined;
  };

  need(6, "its signature");
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") throw new Error(`not a GIF: it starts with ${JSON.stringify(signature)}`);
  at = 6;
  const width = u16("the screen descriptor");
  const height = u16("the screen descriptor");
  const packed = u8("the screen descriptor");
  u8("the screen descriptor");
  u8("the screen descriptor");
  if (width === 0 || height === 0) throw new Error(`the GIF's screen is ${width} by ${height}`);
  let global: Uint8Array | null = null;
  if (packed & 0x80) {
    const length = 3 * (1 << ((packed & 7) + 1));
    need(length, "the global color table");
    global = bytes.slice(at, at + length);
    at += length;
  }

  const frames: GifFrame[] = [];
  let loops: number | null = null;
  // The graphic control extension waiting for the next image.
  let control: { delayMs: number; disposal: number; clearIndex: number | null } = { delayMs: 0, disposal: 0, clearIndex: null };
  for (;;) {
    const block = u8("a block");
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = u8("an extension");
      if (label === 0xf9) {
        const size = u8("the graphic control extension");
        if (size !== 4) throw new Error(`a graphic control extension of ${size} bytes, not 4`);
        const flags = u8("the graphic control extension");
        const delay = u16("the graphic control extension");
        const clear = u8("the graphic control extension");
        if (u8("the graphic control extension") !== 0) throw new Error("the graphic control extension has no terminator");
        control = { delayMs: delay * 10, disposal: (flags >> 2) & 7, clearIndex: flags & 1 ? clear : null };
      } else {
        const first = u8("an extension");
        // Back up over the first sub-block's size byte to read it whole.
        at -= 1;
        const data = blocks("an extension");
        if (label === 0xff && first === 11 && String.fromCharCode(...data.subarray(0, 11)) === "NETSCAPE2.0" && data[11] === 1) {
          // The sub-blocks joined: the name, then 1 and the loop count.
          loops = data[12]! | (data[13]! << 8);
        }
      }
      continue;
    }
    if (block !== 0x2c) throw new Error(`block 0x${block.toString(16)} at byte ${at - 1} is not an image, an extension or the trailer`);
    const left = u16("an image descriptor");
    const top = u16("an image descriptor");
    const frameWidth = u16("an image descriptor");
    const frameHeight = u16("an image descriptor");
    const flags = u8("an image descriptor");
    if (flags & 0x40) throw new Error("an interlaced frame: the encoder writes none");
    if (left + frameWidth > width || top + frameHeight > height) throw new Error(`frame ${frames.length + 1} (${frameWidth} x ${frameHeight} at ${left}, ${top}) reaches outside the ${width} x ${height} screen`);
    let palette = global;
    const localPalette = Boolean(flags & 0x80);
    if (localPalette) {
      const length = 3 * (1 << ((flags & 7) + 1));
      need(length, "a local color table");
      palette = bytes.slice(at, at + length);
      at += length;
    }
    if (!palette) throw new Error(`frame ${frames.length + 1} has no color table, local or global`);
    const minCodeSize = u8("an image's code size");
    const data = blocks("image data");
    frames.push({
      left, top, width: frameWidth, height: frameHeight,
      delayMs: control.delayMs, disposal: control.disposal, clearIndex: control.clearIndex,
      localPalette, palette, indices: lzwDecode(minCodeSize, data, frameWidth * frameHeight),
    });
    control = { delayMs: 0, disposal: 0, clearIndex: null };
  }
  if (at !== bytes.length) throw new Error(`${bytes.length - at} bytes follow the GIF's trailer`);
  return { version: signature === "GIF87a" ? "87a" : "89a", width, height, loops, frames };
}

// What the screen shows after each frame, as RGBA: each frame drawn over
// the last, its transparent entry leaving what was there, and its disposal
// applied before the next.
export function frameImages(gif: Gif): Uint8Array[] {
  const screen = new Uint8Array(gif.width * gif.height * 4);
  const shown: Uint8Array[] = [];
  for (const [number, frame] of gif.frames.entries()) {
    const kept = frame.disposal === 3 ? screen.slice() : null;
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const entry = frame.indices[y * frame.width + x]!;
        if (entry === frame.clearIndex) continue;
        const color = entry * 3;
        if (color + 2 >= frame.palette.length) throw new Error(`frame ${number + 1} uses palette entry ${entry}, which its table does not have`);
        const to = ((frame.top + y) * gif.width + frame.left + x) * 4;
        screen[to] = frame.palette[color]!;
        screen[to + 1] = frame.palette[color + 1]!;
        screen[to + 2] = frame.palette[color + 2]!;
        screen[to + 3] = 255;
      }
    }
    shown.push(screen.slice());
    if (frame.disposal === 2) {
      for (let y = 0; y < frame.height; y += 1) screen.fill(0, ((frame.top + y) * gif.width + frame.left) * 4, ((frame.top + y) * gif.width + frame.left + frame.width) * 4);
    } else if (kept) {
      screen.set(kept);
    }
  }
  return shown;
}
