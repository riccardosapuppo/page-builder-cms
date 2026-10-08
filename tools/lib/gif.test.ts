// node --test tools/lib/gif.test.ts
//
// The GIF encoder and its reader, on pictures small enough to hold in a
// test: what is written is read back with the header, the frames, their
// delays and the pixels the screen shows after each; a frame that changes
// little is written as what changed, and one that changes much whole; and a
// file that is cut short, has another signature, has bytes after its
// trailer or has damaged image data is refused or shows other pixels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeGif, frameImages, pixelsDiffering, readGif, type Frame } from "./gif.ts";

const WIDTH = 64;
const HEIGHT = 40;
const PAPER: [number, number, number] = [240, 240, 232];
const INK: [number, number, number] = [30, 90, 70];
const SUN: [number, number, number] = [240, 160, 48];

function picture(paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b] = paint(x, y);
      rgba.set([r, g, b, 255], (y * WIDTH + x) * 4);
    }
  }
  return rgba;
}

// A square of ink on paper, with its corner at (left, 10).
const square = (left: number) => picture((x, y) => (x >= left && x < left + 10 && y >= 10 && y < 20 ? INK : PAPER));
// Another picture altogether: stripes of sun and ink.
const stripes = () => picture((x) => (x % 8 < 4 ? SUN : INK));

const FRAMES: Frame[] = [
  { rgba: square(8), delayMs: 100 },
  { rgba: square(14), delayMs: 200 },
  { rgba: square(20), delayMs: 300 },
  { rgba: stripes(), delayMs: 400 },
];

// The largest difference in one channel between two pictures.
function farthest(a: Uint8Array, b: Uint8Array): number {
  let most = 0;
  for (let i = 0; i < a.length; i += 1) most = Math.max(most, Math.abs(a[i]! - b[i]!));
  return most;
}

test("the header, the frames, their delays and the loop read back as they were written", () => {
  const { bytes, whole, delta } = encodeGif(FRAMES, WIDTH, HEIGHT);
  const gif = readGif(bytes);
  assert.equal(gif.version, "89a");
  assert.deepEqual([gif.width, gif.height], [WIDTH, HEIGHT]);
  assert.equal(gif.frames.length, 4);
  assert.deepEqual(gif.frames.map((frame) => frame.delayMs), [100, 200, 300, 400]);
  assert.equal(gif.loops, 0, "plays forever");
  assert.deepEqual([whole, delta], [2, 2]);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), "GIF89a");
  assert.equal(bytes.at(-1), 0x3b, "ends with the trailer");
});

test("the screen after each frame is the picture it was made from, to the palette's precision", () => {
  const gif = readGif(encodeGif(FRAMES, WIDTH, HEIGHT).bytes);
  const shown = frameImages(gif);
  assert.equal(shown.length, 4);
  for (const [number, image] of shown.entries()) {
    assert.ok(farthest(image, FRAMES[number]!.rgba) <= 8, `frame ${number + 1} is off by ${farthest(image, FRAMES[number]!.rgba)}`);
  }
});

test("a frame that changes little is written as what changed, one that changes much whole", () => {
  const gif = readGif(encodeGif(FRAMES, WIDTH, HEIGHT).bytes);
  const [first, second, , third] = gif.frames as [typeof gif.frames[0], typeof gif.frames[0], typeof gif.frames[0], typeof gif.frames[0]];
  assert.equal(first.clearIndex, null);
  assert.equal(second.clearIndex, 255);
  assert.equal(second.disposal, 1, "the frame under it stays");
  const left = second.indices.filter((entry) => entry !== 255).length;
  assert.ok(left > 0 && left < 0.2 * WIDTH * HEIGHT, `${left} of ${WIDTH * HEIGHT} pixels written`);
  assert.equal(third.clearIndex, null);
  assert.ok(third.localPalette, "a palette of its own");
});

test("a frame equal to the one before it is written as nothing but the unchanged entry", () => {
  const gif = readGif(encodeGif([FRAMES[0]!, { rgba: FRAMES[0]!.rgba.slice(), delayMs: 50 }], WIDTH, HEIGHT).bytes);
  assert.ok(gif.frames[1]!.indices.every((entry) => entry === 255));
  assert.equal(pixelsDiffering(frameImages(gif)[0]!, frameImages(gif)[1]!), 0);
});

test("pixelsDiffering counts the pixels that are not the same", () => {
  assert.equal(pixelsDiffering(square(8), square(8)), 0);
  assert.equal(pixelsDiffering(square(8), square(14)), 2 * 6 * 10);
  assert.throws(() => pixelsDiffering(new Uint8Array(8), new Uint8Array(12)), /cannot be compared/);
});

test("frames of another size than the GIF's, or none at all, are refused", () => {
  assert.throws(() => encodeGif([], WIDTH, HEIGHT), /at least one frame/);
  assert.throws(() => encodeGif([{ rgba: new Uint8Array(16), delayMs: 10 }], WIDTH, HEIGHT), /holds 4 pixels/);
  assert.throws(() => encodeGif(FRAMES, 0, HEIGHT), /cannot be made/);
});

test("a file with another signature, cut short, with bytes after the trailer, or with no trailer is refused", () => {
  const { bytes } = encodeGif(FRAMES, WIDTH, HEIGHT);
  const other = bytes.slice();
  other.set([0x50, 0x4e, 0x47], 0);
  assert.throws(() => readGif(other), /not a GIF/);
  assert.throws(() => readGif(bytes.subarray(0, 5)), /ends inside its signature/);
  assert.throws(() => readGif(bytes.subarray(0, Math.floor(bytes.length / 2))), /GIF ends inside|before its end code/);
  assert.throws(() => readGif(bytes.subarray(0, bytes.length - 1)), /GIF ends inside a block/);
  assert.throws(() => readGif(new Uint8Array([...bytes, 0, 0])), /bytes follow the GIF's trailer/);
  const unknown = bytes.slice();
  unknown[unknown.length - 1] = 0x99;
  assert.throws(() => readGif(unknown), /is not an image, an extension or the trailer/);
});

test("damaged image data is refused, or shows pixels other than the picture's", () => {
  const { bytes } = encodeGif(FRAMES, WIDTH, HEIGHT);
  const last = frameImages(readGif(bytes)).at(-1)!;
  // The last 40 bytes before the trailer are the last frame's image data,
  // changed one at a time.
  let refused = 0;
  let different = 0;
  for (let at = bytes.length - 41; at < bytes.length - 1; at += 1) {
    const damaged = bytes.slice();
    damaged[at] = damaged[at]! ^ 0xff;
    try {
      const shown = frameImages(readGif(damaged));
      if (shown.length !== 4 || pixelsDiffering(shown[3]!, last) > 0) different += 1;
    } catch {
      refused += 1;
    }
  }
  assert.ok(refused + different >= 35, `${refused} refused and ${different} different of 40 damaged bytes`);
});
