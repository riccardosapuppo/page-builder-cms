// The example site, put into the browser's storage on the demo's first
// visit as the CMS's seed puts it into the CMS (cms/db/seeds/example_site.rb):
// the same pictures, collections and pages, from ../../../example-site/,
// read when the demo is built. Each picture goes into the media library
// the way an upload does; then each collection is made, with its
// template, its entries written and published, and once every collection
// has its id, each template saved and published; then each page is made,
// its document saved as the draft with its images named by the ids the
// library gave them and its lists' collections by the ids the storage
// gave them, and published; and the home page is set. Last, the site's
// header and footer, which the storage makes from their starters (the
// example site's own, cms/config/parts), are published as they are, as
// the CMS's seed publishes them.
//
// Only into an empty site, with no page, no image and no collection: a
// site someone has worked on is never added to. The one exception is the
// seed's own work, cut short (the tab closed, the storage full): it marks
// the site while it puts things in (SeedMarks), and the next visit finds
// the mark and finishes, reusing what was already put in rather than
// adding it twice: a picture by its file name and alt, a collection by its
// prefix and an entry by its slug, a page by its address.
// Two tabs opened at once on a first visit would each find the site empty,
// so the seed holds one of the browser's locks (Web Locks, shared by the
// tabs of one origin) while it looks and puts.
//
// Editions: the demo is built again as the example site changes, and a
// browser keeps the site it was given. Each build's example site has an
// edition (a digest of its files and of the header's and footer's
// starters, which the seed publishes as they are), and the seed keeps,
// beside its mark, the edition it put in and how the site stood right
// after (the storage's own fingerprint, over every record it keeps). On a
// later visit to a build of another edition, a site that stands as it did
// then, nobody having worked on it, is let go of and the new edition put
// in: the storage reads how the site stands in the transaction that lets
// go of it, so a save from another tab that comes in between keeps it. A
// site somebody has worked on is kept, and the demo offers to start over
// with the new edition (seedExampleEdition). A site put in before editions
// were kept counts as worked on: nothing says otherwise.
//
// It lives with the storage because it reads the pictures' bytes from the
// demo's own files: only src/storage/ sends requests.
import siteFile from "../../../example-site/site.json";
import type { CollectionDefinition, EntryContent } from "../shared/collection.ts";
import type { PageDocument } from "../shared/document.ts";
import type { Collection, Invalid, StorageAdapter } from "./adapter.ts";
import type { BrowserAdapter } from "./browser.ts";
import { digest } from "./digest.ts";
import { SITE_THEME } from "virtual:site-theme";

// site.json: the site's name, its pictures, its collections (each named by
// an id, a whole number from 1 as a Collection list names one) and its
// pages, in order.
export interface ExampleSiteFile {
  name: string;
  images: Array<{ id: string; file: string; alt: string }>;
  collections: Array<{ id: number; file: string }>;
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

// A collection's file: its definition, its entries, each as the editor
// saves one, and its template's document.
export interface ExampleCollectionFile {
  collection: CollectionDefinition;
  entries: EntryContent[];
  template: PageDocument;
}

// What the seed reads: site.json, the pages' documents and the
// collections' files by their file name in site.json, and a picture's
// bytes by its file name; and the edition they make, where the build
// gives one.
export interface ExampleSource {
  site: ExampleSiteFile;
  pages: Readonly<Record<string, unknown>>;
  collections: Readonly<Record<string, unknown>>;
  image(file: string): Promise<{ bytes: Blob; width: number; height: number }>;
  edition?: string;
}

export const SEED_LOCK = "page-builder-cms:example-site";

// How far the seed got: "seeding" while it puts things in, "seeded" once
// the site is whole. Without the mark, a first visit cut short would leave
// a picture or a page, and the empty-site rule would never fill the rest.
// Kept in localStorage, which clearing a site's data empties with its
// IndexedDB; where localStorage cannot be used, the empty-site rule alone
// decides, as before.
export interface SeedMarks {
  read(): string | null;
  write(state: "seeding" | "seeded"): void;
}

export const SEED_MARK = "page-builder-cms:example-site";

export function browserMarks(): SeedMarks {
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    read() {
      try {
        return storage()?.getItem(SEED_MARK) ?? null;
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        storage()?.setItem(SEED_MARK, state);
      } catch {
        // The empty-site rule still keeps a worked-on site safe.
      }
    },
  };
}

// The ids of site.json in a document's mediaId keys, swapped for the
// library's: the twin of the seed's with_library_ids.
export function withLibraryIds(node: unknown, ids: ReadonlyMap<string, string>, file: string): unknown {
  if (Array.isArray(node)) return node.map((value) => withLibraryIds(value, ids, file));
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (key !== "mediaId") return [key, withLibraryIds(value, ids, file)];
    const id = ids.get(value as string);
    if (id === undefined) throw new Error(`example-site/${file} names the image ${JSON.stringify(value)}, which site.json does not list`);
    return [key, id];
  }));
}

// The collection each Collection list of a document names, an id of
// site.json, swapped for the id the storage gave it: the twin of the
// seed's with_collection_ids.
export function withCollectionIds(node: unknown, ids: ReadonlyMap<number, number>, file: string): unknown {
  if (Array.isArray(node)) return node.map((value) => withCollectionIds(value, ids, file));
  if (typeof node !== "object" || node === null) return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withCollectionIds(value, ids, file)])) as Record<string, unknown>;
  const props = copy.props;
  if (copy.type !== "collectionList" || typeof props !== "object" || props === null || !("collection" in props)) return copy;
  const named = (props as Record<string, unknown>).collection;
  const id = ids.get(named as number);
  if (id === undefined) throw new Error(`example-site/${file} names the collection ${JSON.stringify(named)}, which site.json does not list`);
  return { ...copy, props: { ...props, collection: id } };
}

const COLLECTION_FILE = ["collection", "entries", "template"];

// A collection's file of the build, held to its shape, every picture and
// collection its entries and its template name found in site.json: the
// twin of the seed's read_collection.
function collectionFile(source: ExampleSource, file: string, images: ReadonlyMap<string, string>, collections: ReadonlyMap<number, number>): ExampleCollectionFile {
  if (!(file in source.collections)) throw new Error(`The example site's ${file} is not in this build.`);
  const held = source.collections[file];
  const keys = typeof held === "object" && held !== null && !Array.isArray(held) ? Object.keys(held).sort() : [];
  if (keys.join() !== COLLECTION_FILE.join()) throw new Error(`example-site/${file} has the keys [${keys.map((key) => JSON.stringify(key)).join(", ")}], not collection, entries and template`);
  const read = held as ExampleCollectionFile;
  if (!Array.isArray(read.entries)) throw new Error(`example-site/${file} lists its entries as no list`);
  withLibraryIds(read.entries, images, file);
  withCollectionIds(withLibraryIds(read.template, images, file), collections, file);
  return read;
}

const refusal = (what: string, problem: Invalid): Error =>
  new Error(`The example site's ${what} was refused: ${problem.errors[0]?.message ?? problem.message}`);

// Holds the seed's lock, shared by the tabs of one origin, while `run`
// looks and puts.
function underSeedLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(SEED_LOCK, run) : run();
}

// Puts the example site in when the site is empty, or finishes a seed
// that was cut short; says which it did.
export async function seedExampleSite(adapter: StorageAdapter, source: ExampleSource, marks: SeedMarks = browserMarks()): Promise<"seeded" | "not empty"> {
  return underSeedLock(() => putIn(adapter, source, marks));
}

async function putIn(adapter: StorageAdapter, source: ExampleSource, marks: SeedMarks): Promise<"seeded" | "not empty"> {
  const mark = marks.read();
  if (mark === "seeded") return "not empty";
  const [pages, media, collections] = await Promise.all([adapter.listPages(), adapter.listMedia(), adapter.listCollections()]);
  // A seed cut short finds what it had put in, a picture by its file name
  // and alt, a collection by its prefix and an entry by its slug, a page
  // by its address, and goes on from there.
  const resuming = mark === "seeding";
  if (!resuming && (pages.length > 0 || media.length > 0 || collections.length > 0)) return "not empty";
  // Every file read, and every image and collection a document names found
  // in site.json, before anything is kept: a file missing from the build
  // stops the seed with nothing half done.
  const images = new Map(source.site.images.map((image) => [image.id, image.id]));
  const listed = new Map(source.site.collections.map((entry) => [entry.id, entry.id]));
  const held = source.site.collections.map((entry) => collectionFile(source, entry.file, images, listed));
  const prefixes = held.map((file) => file.collection.prefix);
  const twice = prefixes.find((prefix, index) => prefixes.indexOf(prefix) !== index);
  if (twice !== undefined) throw new Error(`example-site/site.json names two collections at the prefix ${twice}`);
  for (const page of source.site.pages) {
    if (!(page.file in source.pages)) throw new Error(`The example site's ${page.file} is not in this build.`);
    withCollectionIds(withLibraryIds(source.pages[page.file], images, page.file), listed, page.file);
  }
  const pictures = await Promise.all(source.site.images.map(async (image) => ({ image, read: await source.image(image.file) })));

  marks.write("seeding");
  const ids = new Map<string, string>();
  for (const { image, read } of pictures) {
    const name = image.file.slice(image.file.lastIndexOf("/") + 1);
    const kept = resuming ? media.find((item) => item.filename === name && item.alt === image.alt) : undefined;
    if (kept) {
      ids.set(image.id, kept.id);
      continue;
    }
    const file = new File([read.bytes], name, { type: read.bytes.type || "image/png" });
    const added = await adapter.uploadMedia({ file, width: read.width, height: read.height, alt: image.alt });
    if (!added.ok) throw refusal(`picture ${image.file}`, added.problem);
    ids.set(image.id, added.value.id);
  }
  // Each collection, with its template, and its entries, each written and
  // published in its file's order; then, once every collection has its
  // id, each template saved and published. What a seed cut short had put
  // in is as it left it: an entry or a template it published is not
  // published again.
  const collectionIds = new Map<number, number>();
  const templates: Array<{ file: string; held: ExampleCollectionFile; collection: Collection }> = [];
  for (const [index, listedOne] of source.site.collections.entries()) {
    const file = held[index]!;
    let collection = resuming ? collections.find((one) => one.prefix === file.collection.prefix) : undefined;
    if (!collection) {
      const created = await adapter.createCollection(file.collection);
      if (!created.ok) throw refusal(`collection ${listedOne.file}`, created.problem);
      collection = created.value;
    }
    collectionIds.set(listedOne.id, collection.id);
    const kept = resuming ? await adapter.listEntries(collection.id) : [];
    for (const content of file.entries) {
      let entry = kept.find((one) => one.slug === content.slug);
      if (!entry) {
        const created = await adapter.createEntry(collection.id, withLibraryIds(content, ids, listedOne.file) as EntryContent);
        if (!created.ok) throw refusal(`entry ${content.slug} of ${listedOne.file}`, created.problem);
        entry = created.value;
      }
      if (entry.published) continue;
      const published = await adapter.publishEntry(collection.id, entry.id, { revision: entry.revision });
      if (!published.ok) throw new Error(`The example site's entry ${content.slug} of ${listedOne.file} was not published: ${published.problem.message}`);
    }
    templates.push({ file: listedOne.file, held: file, collection });
  }
  for (const { file, held: one, collection } of templates) {
    const template = collection.template;
    if (template.published) continue;
    const document = withCollectionIds(withLibraryIds(one.template, ids, file), collectionIds, file) as PageDocument;
    const saved = await adapter.saveDraft(template.id, { revision: template.revision, saveId: `example-template-${collection.prefix}`, document });
    if (!saved.ok) throw new Error(`The example site's template of ${file} was not saved: ${saved.problem.message}`);
    const published = await adapter.publish(template.id, { revision: saved.value.revision });
    if (!published.ok) throw new Error(`The example site's template of ${file} was not published: ${published.problem.message}`);
  }
  for (const entry of source.site.pages) {
    const document = withCollectionIds(withLibraryIds(source.pages[entry.file], ids, entry.file), collectionIds, entry.file) as PageDocument;
    const kept = resuming ? pages.find((page) => page.slug === entry.slug) : undefined;
    let id: number;
    let revision: number;
    if (kept) {
      id = kept.id;
      revision = kept.revision;
    } else {
      const made = await adapter.createPage({ title: document.title, slug: entry.slug });
      if (!made.ok) throw refusal(`page ${entry.file}`, made.problem);
      id = made.value.page.id;
      revision = made.value.draft.revision;
    }
    // A page the seed published before it was cut short is as it left it.
    if (!kept?.published) {
      const saved = await adapter.saveDraft(id, { revision, saveId: `example-${entry.slug}`, document });
      if (!saved.ok) throw new Error(`The example site's page ${entry.file} was not saved: ${saved.problem.message}`);
      const published = await adapter.publish(id, { revision: saved.value.revision });
      if (!published.ok) throw new Error(`The example site's page ${entry.file} was not published: ${published.problem.message}`);
    }
    if (entry.home && !kept?.home) {
      const home = await adapter.updatePage(id, { home: true });
      if (!home.ok) throw refusal(`home page ${entry.file}`, home.problem);
    }
  }
  // A part the seed published before it was cut short is as it left it.
  for (const part of await adapter.listParts()) {
    if (part.published) continue;
    const published = await adapter.publish(part.id, { revision: part.revision });
    if (!published.ok) throw new Error(`The example site's ${part.kind} was not published: ${published.problem.message}`);
  }
  marks.write("seeded");
  return "seeded";
}

// ------------------------------------------------------------- editions

// The edition a browser was given, and how its site stood right after.
export interface EditionRecord {
  edition: string;
  fingerprint: string;
}

export interface EditionMarks {
  read(): EditionRecord | null;
  write(record: EditionRecord): void;
  clear(): void;
}

export const EDITION_MARK = "page-builder-cms:example-site-edition";

// Kept in localStorage beside the seed's mark, and emptied with it.
export function browserEditions(): EditionMarks {
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    read() {
      try {
        const held = JSON.parse(storage()?.getItem(EDITION_MARK) ?? "null") as unknown;
        if (typeof held !== "object" || held === null) return null;
        const { edition, fingerprint } = held as Record<string, unknown>;
        return typeof edition === "string" && typeof fingerprint === "string" ? { edition, fingerprint } : null;
      } catch {
        return null;
      }
    },
    write(record) {
      try {
        storage()?.setItem(EDITION_MARK, JSON.stringify(record));
      } catch {
        // Without it the next edition is offered, never forced.
      }
    },
    clear() {
      try {
        storage()?.removeItem(EDITION_MARK);
      } catch {
        // Nothing kept, nothing to clear.
      }
    },
  };
}

// The edition of an example site: its site.json, its documents (its pages
// and its collections' files, by their file names), its pictures by the
// addresses a build gives them, which change with their bytes, and the
// header's and footer's starters, which the seed publishes as they are.
export function editionOf(site: ExampleSiteFile, documents: Readonly<Record<string, unknown>>, images: Readonly<Record<string, string>>, parts: Readonly<Record<string, unknown>>): string {
  const sorted = (record: Readonly<Record<string, unknown>>) => Object.keys(record).sort().map((key) => [key, record[key]]);
  return digest(JSON.stringify([site, sorted(documents), sorted(images), sorted(parts)]));
}

// What the demo found of the example site on this visit: put in for the
// first time, already there, given this build's edition in place of an
// older one nobody had worked on, or kept, worked on, beside a newer
// edition the demo offers.
export type ExampleOutcome = "seeded" | "not empty" | "renewed" | "newer kept";

// The seed, by editions: see the head of this file.
export async function seedExampleEdition(
  adapter: Pick<BrowserAdapter, "siteFingerprint" | "clearSiteIf"> & StorageAdapter,
  source: ExampleSource,
  marks: SeedMarks = browserMarks(),
  editions: EditionMarks = browserEditions(),
): Promise<ExampleOutcome> {
  return underSeedLock(async () => {
    const edition = source.edition;
    let renewed = false;
    if (edition !== undefined && marks.read() === "seeded") {
      const record = editions.read();
      if (record?.edition === edition) return "not empty";
      if (record === null || !(await adapter.clearSiteIf(record.fingerprint))) return "newer kept";
      editions.clear();
      // As a seed cut short: it finds nothing put in, and puts it all in.
      marks.write("seeding");
      renewed = true;
    }
    const outcome = await putIn(adapter, source, marks);
    if (outcome === "seeded" && edition !== undefined) editions.write({ edition, fingerprint: await adapter.siteFingerprint() });
    return renewed ? "renewed" : outcome;
  });
}

// Lets go of the site this browser keeps, for a visitor who chose to
// start over with this build's edition: the next visit puts it in, as a
// seed cut short would be finished.
export async function startOver(adapter: Pick<BrowserAdapter, "clearSite">, marks: SeedMarks = browserMarks(), editions: EditionMarks = browserEditions()): Promise<void> {
  await underSeedLock(async () => {
    await adapter.clearSite();
    editions.clear();
    marks.write("seeding");
  });
}

// The adapter, whose first listing of the pages, or of the header and
// footer, waits for the seed: the editor lists them first, so it opens on
// the example site, and the parts, which the storage makes when they are
// first asked for, are made after the pages, as the seed makes them in an
// empty site. A seed that failed is tried again by the next listing (the
// editor's Try again), or by the next visit, and goes on from where it
// stopped (seedExampleSite).
export function withExampleSite(adapter: StorageAdapter, seed: () => Promise<unknown>): StorageAdapter {
  let seeding: Promise<unknown> | null = null;
  const seeded = () => {
    seeding ??= seed().catch((error: unknown) => {
      seeding = null;
      throw error;
    });
    return seeding;
  };
  return {
    ...adapter,
    listPages(options) {
      return seeded().then(() => adapter.listPages(options));
    },
    listParts(options) {
      return seeded().then(() => adapter.listParts(options));
    },
  };
}

// The example site as the demo's build holds it: the documents bundled,
// the pictures as files of their own beside the bundle, fetched from the
// demo's own address when they are put in.
const builtPages = import.meta.glob<unknown>("../../../example-site/pages/*.json", { eager: true, import: "default" });
const builtCollections = import.meta.glob<unknown>("../../../example-site/collections/*.json", { eager: true, import: "default" });
const builtImages = import.meta.glob<string>("../../../example-site/images/*.png", { eager: true, query: "?url", import: "default" });

// By their file name in site.json ("pages/home.json",
// "collections/news.json", "images/m-tea.png").
const byFile = <T>(found: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(found).map(([path, value]) => [path.slice(path.indexOf("example-site/") + "example-site/".length), value]));

// The files the build holds, which every name in site.json must be.
export function builtFiles(): { pages: string[]; collections: string[]; images: string[] } {
  return { pages: Object.keys(byFile(builtPages)).sort(), collections: Object.keys(byFile(builtCollections)).sort(), images: Object.keys(byFile(builtImages)).sort() };
}

export function builtSource(site: ExampleSiteFile = siteFile): ExampleSource {
  const pages = byFile(builtPages);
  const collections = byFile(builtCollections);
  const images = byFile(builtImages);
  return {
    site,
    pages,
    collections,
    edition: editionOf(site, { ...pages, ...collections }, images, SITE_THEME.parts),
    async image(file) {
      const address = images[file];
      if (address === undefined) throw new Error(`The example site's picture ${file} is not in this build.`);
      const response = await fetch(address);
      if (!response.ok) throw new Error(`The example site's picture ${file} could not be read (${response.status}).`);
      const bytes = await response.blob();
      const bitmap = await createImageBitmap(bytes);
      try {
        return { bytes, width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    },
  };
}
