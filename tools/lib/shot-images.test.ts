// node --test tools/lib/shot-images.test.ts
//
// The check of docs/images/, on folders made here: a set that is right
// passes, and each way a set can be wrong (a picture missing, cut short,
// with a bad checksum, of another size, nearly empty, too large, left over,
// a GIF with one frame, with a repeated frame, that never changes, that
// does not loop, or a README that names a picture nobody makes) is found,
// by name. A check that finds nothing is only worth as much as the faults
// it is shown to find.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { encodeGif } from "./gif.ts";
import { checkImages, readPng, type ImageSpec } from "./shot-images.ts";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// An 8-bit RGB PNG, each pixel as `paint` says, with no filtering.
function png(width: number, height: number, paint: (x: number, y: number) => number = (x, y) => (x * 7 + y * 13) % 256): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows.fill(paint(x, y), y * (1 + width * 3) + 1 + x * 3, y * (1 + width * 3) + 4 + x * 3);
  }
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array())];
  return Buffer.concat(parts);
}

const W = 48;
const H = 32;

function rgba(paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) out.set([...paint(x, y), 255], (y * W + x) * 4);
  return out;
}

const bar = (left: number) => rgba((x, y) => (x >= left && x < left + 8 && y > 8 && y < 20 ? [20, 90, 70] : [236, 236, 228]));

function gif(frames: Uint8Array[]): Uint8Array {
  return encodeGif(frames.map((image) => ({ rgba: image, delayMs: 500 })), W, H).bytes;
}

const SPECS: readonly ImageSpec[] = [
  { file: "one.png", kind: "png", width: W, height: H, minBytes: 200, maxBytes: 20_000, shows: "one" },
  { file: "story.gif", kind: "gif", width: W, height: H, minBytes: 100, maxBytes: 20_000, minFrames: 3, shows: "story" },
];

// A folder holding a right set, given to `change` to spoil, and what the
// check says of it.
function folderOf(change: (folder: string) => void = () => {}): string[] {
  const folder = mkdtempSync(join(tmpdir(), "pbc-images-test-"));
  try {
    writeFileSync(join(folder, "one.png"), png(W, H));
    writeFileSync(join(folder, "story.gif"), gif([bar(4), bar(14), bar(24), bar(34)]));
    change(folder);
    return checkImages(folder, null, SPECS);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test("a right set passes", () => {
  assert.deepEqual(folderOf(), []);
});

test("readPng gives the size of a PNG it has read through", () => {
  assert.deepEqual(readPng(png(5, 3)), { width: 5, height: 3 });
});

test("a picture that is missing, or is not a file, is named", () => {
  assert.deepEqual(folderOf((folder) => rmSync(join(folder, "one.png"))).map((p) => p.replace(/ from .*/, "")), ["one.png is missing"]);
  assert.match(folderOf((folder) => {
    rmSync(join(folder, "one.png"));
    mkdirSync(join(folder, "one.png"));
  }).join("\n"), /one\.png is not a file/);
});

test("a PNG cut short, with a bad checksum, of the wrong size, or with another signature is named", () => {
  const whole = png(W, H);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), whole.subarray(0, whole.length - 30))).join("\n"), /one\.png: /);
  const flipped = whole.slice();
  flipped[40] = flipped[40]! ^ 0xff;
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), flipped)).join("\n"), /checksum of the .+ chunk is wrong/);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), png(W + 1, H))).join("\n"), /one\.png is 49 x 32, not 48 x 32/);
  const gifBytes = gif([bar(4), bar(14), bar(24)]);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), gifBytes)).join("\n"), /signature is wrong/);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), new Uint8Array([...whole, 0, 0, 0, 0]))).join("\n"), /one\.png: /);
});

test("a picture with nothing in it, or too large, is named", () => {
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), png(W, H, () => 255))).join("\n"), /one\.png is \d+ bytes, under the 200/);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "one.png"), png(200, 200, (x, y) => ((x * 73856093) ^ (y * 19349663)) % 256))).join("\n"), /one\.png is \d+ bytes, over the 20000/);
});

test("a file in the folder that no name lists is named; README.md may sit beside the pictures", () => {
  assert.match(folderOf((folder) => writeFileSync(join(folder, "old.png"), png(W, H))).join("\n"), /old\.png is in .* and is not a picture the script makes/);
  assert.deepEqual(folderOf((folder) => writeFileSync(join(folder, "README.md"), "# Pictures\n")), []);
});

test("a GIF with too few frames, a repeated frame, no change from first to last, or no loop is named", () => {
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), gif([bar(4), bar(14)]))).join("\n"), /story\.gif has 2 frames, at least 3/);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), gif([bar(4), bar(14), bar(14), bar(24)]))).join("\n"), /frame 3 of story\.gif shows what frame 2 shows/);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), gif([bar(4), bar(14), bar(24), bar(4)]))).join("\n"), /last frame of story\.gif differs from the first in 0 pixels/);
  const once = gif([bar(4), bar(14), bar(24), bar(34)]);
  // The loop count follows the "NETSCAPE2.0" name, the sub-block size 3 and the 1.
  const at = Buffer.from(once).indexOf("NETSCAPE2.0") + 13;
  once[at] = 1;
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), once)).join("\n"), /does not loop forever \(loop count 1\)/);
  const cut = gif([bar(4), bar(14), bar(24), bar(34)]);
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), cut.subarray(0, cut.length - 1))).join("\n"), /story\.gif: the GIF ends inside/);
});

test("a GIF whose frame goes by faster than a browser plays it is named", () => {
  const fast = encodeGif([bar(4), bar(14), bar(24), bar(34)].map((image) => ({ rgba: image, delayMs: 10 })), W, H).bytes;
  assert.match(folderOf((folder) => writeFileSync(join(folder, "story.gif"), fast)).join("\n"), /frame 1 of story\.gif lasts 10 ms/);
});

test("a README that names a picture the script does not make is named, and one that names only its own is not", () => {
  const check = (readme: string) => {
    const folder = mkdtempSync(join(tmpdir(), "pbc-images-test-"));
    try {
      writeFileSync(join(folder, "one.png"), png(W, H));
      writeFileSync(join(folder, "story.gif"), gif([bar(4), bar(14), bar(24), bar(34)]));
      return checkImages(folder, readme, SPECS);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
  assert.deepEqual(check("![the editor](docs/images/one.png) and ![story](docs/images/story.gif). See docs/images/README.md."), []);
  assert.deepEqual(check("![](docs/images/two.png)"), ["the README shows docs/images/two.png, which the script does not make"]);
  assert.deepEqual(check("![](docs/images/one.PNG)"), ["the README shows docs/images/one.PNG, which the script does not make"]);
});

test("a folder that is not there is named", () => {
  assert.deepEqual(checkImages(join(tmpdir(), "pbc-images-test-nothing-here"), null, SPECS), [`${join(tmpdir(), "pbc-images-test-nothing-here")} does not exist`]);
});
