// The weights and widths the Type group offers each face (./free-type.ts,
// FACE_AXES), held to the fonts the page draws with (cms/app/assets/fonts):
// each font's variation axes, read from its file, and the @font-face rules
// of site.css that name the same ranges. A face that drew another range
// would leave the panel offering a weight or a width it does not draw.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { expect, test } from "vitest";
import { cmsFonts, cmsStylesheets } from "../../build/paths.ts";
import { FACE_AXES, FONT_WEIGHTS } from "./free-type.ts";

// The tables of a WOFF2 file are numbered by a list of known tags; the
// font's variations are its fvar table, which WOFF2 keeps as it is.
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx",
  "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix",
  "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak",
  "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

// A font's variation axes, by tag: { wght: [100, 900], wdth: [62, 125] }.
function axesOf(file: string): Record<string, [number, number]> {
  const bytes = readFileSync(join(cmsFonts, file));
  let at = 48;
  const varint = () => {
    let value = 0;
    for (let k = 0; k < 5; k++) {
      const byte = bytes[at++]!;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error(`${file}: a length past five bytes`);
  };
  const tables: Array<{ tag: string; length: number }> = [];
  for (let k = bytes.readUInt16BE(12); k > 0; k--) {
    const flags = bytes[at++]!;
    let tag = KNOWN_TAGS[flags & 0x3f]!;
    if ((flags & 0x3f) === 63) {
      tag = bytes.toString("latin1", at, at + 4);
      at += 4;
    }
    const version = flags >> 6;
    let length = varint();
    if (tag === "glyf" || tag === "loca" ? version === 0 : version !== 0) length = varint();
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + bytes.readUInt32BE(20)));
  let offset = 0;
  for (const table of tables) {
    if (table.tag === "fvar") {
      const fvar = data.subarray(offset, offset + table.length);
      const axes: Record<string, [number, number]> = {};
      for (let k = 0; k < fvar.readUInt16BE(8); k++) {
        const axis = fvar.readUInt16BE(4) + k * fvar.readUInt16BE(10);
        axes[fvar.toString("latin1", axis, axis + 4)] = [fvar.readInt32BE(axis + 4) / 65536, fvar.readInt32BE(axis + 12) / 65536];
      }
      return axes;
    }
    offset += table.length;
  }
  throw new Error(`${file} has no variation axes`);
}

test("each face offers the weights its font draws, and a letter width only where it has a width axis", () => {
  const archivo = axesOf("archivo-variable.woff2");
  const serif = axesOf("source-serif-4-variable.woff2");
  const italic = axesOf("source-serif-4-variable-italic.woff2");
  expect(archivo).toEqual({ wght: [100, 900], wdth: [62, 125] });
  expect(serif).toEqual({ wght: [200, 900], opsz: [8, 60] });
  expect(italic).toEqual({ wght: [200, 900], opsz: [8, 60] });
  const within = ([low, high]: [number, number]) => FONT_WEIGHTS.filter((weight) => weight >= low && weight <= high);
  expect([...FACE_AXES.heading.weights]).toEqual(within(archivo.wght!));
  expect([...FACE_AXES.body.weights]).toEqual(within(serif.wght!));
  expect(FACE_AXES.heading.width).toBe("wdth" in archivo);
  expect(FACE_AXES.body.width).toBe("wdth" in serif || "wdth" in italic);
  // The schema's letter widths lie on Archivo's axis.
  expect(62.5).toBeGreaterThanOrEqual(archivo.wdth![0]);
  expect(125).toBeLessThanOrEqual(archivo.wdth![1]);
  // And site.css names the same ranges, for the browser to draw them.
  const site = readFileSync(join(cmsStylesheets, "site.css"), "utf8");
  expect(site).toContain('font-family: "Archivo"; src: url("archivo-variable.woff2") format("woff2"); font-weight: 100 900; font-stretch: 62% 125%;');
  expect(site).toContain('font-family: "Source Serif 4"; src: url("source-serif-4-variable.woff2") format("woff2"); font-weight: 200 900; font-style: normal;');
});
