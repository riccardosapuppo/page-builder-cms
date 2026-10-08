// node tools/seed-images.ts
//
// Renders the example site's illustrations, drawn as SVG for the design
// (design/img/), to the PNG files the seed uploads into the media library
// (example-site/images/, each named in example-site/site.json, from the
// SVG of the same name). The library takes no SVG, since an SVG is a
// document that can carry script, so the seed uploads what a person would:
// a raster image.
//
// Each file is drawn at the size its SVG declares, one CSS pixel per unit,
// by Chromium headless (Playwright 1.62.1, already in the browser cache), in
// a page that loads nothing but the SVG file. The PNGs are committed; this
// script remakes them after an illustration changes. Two runs on the same
// Chromium give the same pixels (checked by --check, which renders to a
// temporary folder and compares the bytes).
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "design", "img");
const target = join(root, "example-site", "images");

// The illustrations the seed's pages show, as site.json lists them. The
// map and the video poster are not among them: the page draws its own
// cards for those, in CSS.
const site = JSON.parse(readFileSync(join(root, "example-site", "site.json"), "utf8")) as { images: Array<{ file: string }> };
const NAMES = site.images.map((image) => {
  if (dirname(image.file) !== "images" || !image.file.endsWith(".png")) throw new Error(`site.json names ${image.file}, not a PNG in images/`);
  return basename(image.file, ".png");
});

const check = process.argv.includes("--check");
const out = check ? mkdtempSync(join(tmpdir(), "seed-images-")) : target;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let differences = 0;
try {
  for (const name of NAMES) {
    const file = join(source, `${name}.svg`);
    const svg = readFileSync(file, "utf8");
    const width = Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)?.[1]);
    const height = Number(/<svg[^>]*\sheight="(\d+)"/.exec(svg)?.[1]);
    if (!width || !height) throw new Error(`${name}.svg declares no width and height`);

    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on("request", (request) => {
      if (request.url() !== pathToFileURL(file).href) throw new Error(`${name}.svg asked for ${request.url()}`);
    });
    await page.goto(pathToFileURL(file).href);
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
    await page.close();

    const path = join(out, `${name}.png`);
    writeFileSync(path, png);
    if (check) {
      const committed = join(target, `${name}.png`);
      const same = existsSync(committed) && readFileSync(committed).equals(png);
      if (!same) differences += 1;
      console.log(`${same ? "same" : "DIFFERS"} ${name}.png (${width}x${height}, ${png.length} bytes)`);
    } else {
      console.log(`wrote example-site/images/${name}.png (${width}x${height}, ${png.length} bytes)`);
    }
  }
} finally {
  await browser.close();
  if (check) rmSync(out, { recursive: true, force: true });
}

if (check) {
  console.log(differences === 0 ? `RESULT: ${NAMES.length} images, all as committed` : `RESULT: ${differences} image(s) differ from the committed ones`);
  process.exit(differences === 0 ? 0 : 1);
}
