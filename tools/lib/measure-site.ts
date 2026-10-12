// The page the measurements run on: contract/fixtures/large-500.json, 500
// blocks, saved and published through the CMS's API the way the editor
// would, on a CMS the measurement started for itself.
//
// The fixture names nine library images by ids of its own ("hero-dawn",
// "g-caps"), which no library has, so the API would refuse to save it.
// The measurement uploads the nine pictures of the example site
// (example-site/images) as the editor uploads an image (a direct upload,
// then the library item) and puts the library's ids where the fixture has
// its own. Nothing else changes: the same 500 blocks, in the same order,
// with the same text, and the images are real files the server finds, signs
// an address for, and the browser can fetch.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE = join(root, "contract", "fixtures", "large-500.json");
const PICTURES = join(root, "example-site", "images");

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: Block[];
  style: Record<string, Record<string, string>>;
}

export interface Document {
  schemaVersion: number;
  title: string;
  sections: Block[];
}

export const fixtureDocument = (): Document => JSON.parse(readFileSync(FIXTURE, "utf8")) as Document;

// The blocks of the header and footer a site draws until it publishes its
// own (cms/config/parts), each a fragment of Solid Cache as a page's block
// is: the measurement publishes neither.
export const starterBlocks = (): number =>
  ["header", "footer"].reduce((n, kind) => n + countBlocks((JSON.parse(readFileSync(join(root, "cms", "config", "parts", `${kind}.json`), "utf8")) as Document).sections), 0);

export function countBlocks(blocks: readonly Block[]): number {
  return blocks.reduce((n, b) => n + 1 + countBlocks(b.children), 0);
}

// Every `mediaId` the document names, with repeats.
export function mediaIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(mediaIds);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === "mediaId" && typeof inner === "string" ? [inner] : mediaIds(inner)));
}

// The same document with each mediaId replaced by the library's id for it.
export function withLibraryIds(document: Document, library: ReadonlyMap<string, string>): Document {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => {
      if (key === "mediaId" && typeof inner === "string") {
        const id = library.get(inner);
        if (!id) throw new Error(`the library has no image for the fixture's "${inner}"`);
        return [key, id];
      }
      return [key, walk(inner)];
    }));
  };
  return walk(document) as Document;
}

async function api(base: string, method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(base + path, {
    method,
    headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 400)}`);
  return text === "" ? null : JSON.parse(text);
}

export { api };

// Uploads one PNG of example-site/images to the library, as the editor does:
// the blob, the bytes to the storage service, then the library item.
// Returns the item's id.
async function upload(base: string, name: string): Promise<string> {
  const bytes = readFileSync(join(PICTURES, `${name}.png`));
  const checksum = createHash("md5").update(bytes).digest("base64");
  const blob = await api(base, "POST", "/api/media/direct_uploads", {
    blob: { filename: `${name}.png`, content_type: "image/png", byte_size: bytes.length, checksum },
  });
  const sent = await fetch(blob.direct_upload.url, { method: "PUT", headers: blob.direct_upload.headers, body: bytes });
  if (!sent.ok) throw new Error(`the bytes of ${name}.png were refused: ${sent.status} ${await sent.text()}`);
  // The PNG header: width and height are the two numbers after "IHDR".
  const created = await api(base, "POST", "/api/media", {
    signedBlobId: blob.signed_id,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    alt: `A picture of the example site, ${name}`,
  });
  return created.id as string;
}

export interface LargePage {
  id: number;
  slug: string;
  title: string;
  document: Document;
  // The library's ids by the fixture's.
  library: Map<string, string>;
}

// Uploads the nine images, then makes a page with the 500 blocks as its
// draft and publishes it. Checks it has the 500 blocks it was made of.
export async function publishLargePage(base: string, slug = "five-hundred-blocks"): Promise<LargePage> {
  const fixture = fixtureDocument();
  const wanted = [...new Set(mediaIds(fixture))].sort();
  if (wanted.length === 0) throw new Error("the fixture names no library image: there would be nothing to upload");
  const library = new Map<string, string>();
  for (const name of wanted) library.set(name, await upload(base, name));

  const document = withLibraryIds(fixture, library);
  if (countBlocks(document.sections) !== 500) throw new Error(`the page has ${countBlocks(document.sections)} blocks, not 500`);
  const created = await api(base, "POST", "/api/pages", { title: document.title, slug });
  const id = created.page.id as number;
  const draft = await api(base, "GET", `/api/pages/${id}/draft`);
  await api(base, "PUT", `/api/pages/${id}/draft`, { revision: draft.revision, document, saveId: "measure-1" });
  await api(base, "POST", `/api/pages/${id}/publish`, {});
  return { id, slug, title: document.title, document, library };
}

// A page of four blocks (a section, a column, two headings), for the baseline a measurement is compared with.
export async function publishSmallPage(base: string, slug = "four-blocks"): Promise<{ id: number; slug: string }> {
  const document = {
    schemaVersion: 1,
    title: "Four blocks",
    sections: [{
      id: "s1", type: "section", props: { label: "Only" }, style: { base: {} },
      children: [{
        id: "s1c1", type: "column", props: {}, style: { base: {} },
        children: [
          { id: "s1c1w1", type: "heading", props: { level: 1, text: "Four blocks" }, children: [], style: { base: {} } },
          { id: "s1c1w2", type: "heading", props: { level: 2, text: "A second heading" }, children: [], style: { base: {} } },
        ],
      }],
    }],
  };
  const created = await api(base, "POST", "/api/pages", { title: document.title, slug });
  const id = created.page.id as number;
  const draft = await api(base, "GET", `/api/pages/${id}/draft`);
  await api(base, "PUT", `/api/pages/${id}/draft`, { revision: draft.revision, document, saveId: "measure-small-1" });
  await api(base, "POST", `/api/pages/${id}/publish`, {});
  return { id, slug };
}

// The ids of the widgets of the document, in page order, each with the
// text a change to it can be seen by: headings only, so that one edit is
// one word.
export function headings(document: Document): Array<{ section: number; id: string }> {
  const out: Array<{ section: number; id: string }> = [];
  document.sections.forEach((section, s) => {
    for (const column of section.children) {
      for (const widget of column.children) if (widget.type === "heading") out.push({ section: s, id: widget.id });
    }
  });
  return out;
}

// A copy of the document with one heading's text changed.
export function withHeadingText(document: Document, id: string, text: string): Document {
  const copy = JSON.parse(JSON.stringify(document)) as Document;
  let changed = 0;
  const walk = (blocks: Block[]): void => {
    for (const block of blocks) {
      if (block.id === id && block.type === "heading") {
        block.props.text = text;
        changed += 1;
      }
      walk(block.children);
    }
  };
  walk(copy.sections);
  if (changed !== 1) throw new Error(`${changed} headings have the id "${id}", not 1`);
  return copy;
}
