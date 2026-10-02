// The block tree of a page document: finding a block, its parent and its
// place, and the immutable updates every change is made of. A document is
// never changed in place: an update copies the blocks on the way down to
// the one it changes and shares everything else with the document it came
// from, so the editor can tell what changed by comparing references.
import type { Block, BlockType, PageDocument } from "../shared/document.ts";

// The container of a block: the id of its section or column, or null for
// the page itself, which holds the sections.
export type ParentId = string | null;

// A place in a container: its parent and the index among the parent's
// children.
export interface Position {
  parentId: ParentId;
  index: number;
}

export interface Located {
  block: Block;
  parentId: ParentId;
  index: number;
  // Indices from the page down: [section], [section, column] or
  // [section, column, widget].
  path: readonly number[];
}

// Blocks and their children as plain data, for the code that handles every
// block type alike; the typed union of ../shared/document.ts is what comes
// in and goes out.
export interface AnyBlock {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  children: AnyBlock[];
  style: Record<string, unknown>;
}

interface Index {
  blocks: Map<string, Located>;
  // The first id found twice, in document order, if any.
  duplicate: { id: string; path: readonly number[] } | null;
}

// Documents are never changed in place, so an index made once for a
// document object stays true for as long as that object lives.
const indexes = new WeakMap<PageDocument, Index>();

function indexFor(doc: PageDocument): Index {
  const cached = indexes.get(doc);
  if (cached) return cached;
  const blocks = new Map<string, Located>();
  let duplicate: Index["duplicate"] = null;
  const visit = (list: readonly AnyBlock[], parentId: ParentId, prefix: readonly number[]): void => {
    list.forEach((block, index) => {
      const path = [...prefix, index];
      if (blocks.has(block.id)) duplicate ??= { id: block.id, path };
      else blocks.set(block.id, { block: block as unknown as Block, parentId, index, path });
      visit(block.children, block.id, path);
    });
  };
  visit(doc.sections as unknown as AnyBlock[], null, []);
  const index = { blocks, duplicate };
  indexes.set(doc, index);
  return index;
}

export function locate(doc: PageDocument, id: string): Located | undefined {
  return indexFor(doc).blocks.get(id);
}

export function hasBlock(doc: PageDocument, id: string): boolean {
  return indexFor(doc).blocks.has(id);
}

// Every block id on the page.
export function blockIds(doc: PageDocument): ReadonlySet<string> {
  return new Set(indexFor(doc).blocks.keys());
}

// The first id the page holds twice, if one is: the application rules
// refuse such a page ("uniqueId").
export function duplicateId(doc: PageDocument): { id: string; path: readonly number[] } | null {
  return indexFor(doc).duplicate;
}

// The children of a container, or undefined when there is no such block.
export function childrenOf(doc: PageDocument, parentId: ParentId): readonly Block[] | undefined {
  if (parentId === null) return doc.sections;
  return locate(doc, parentId)?.block.children;
}

export function typeOf(doc: PageDocument, parentId: ParentId): BlockType | "page" | undefined {
  if (parentId === null) return "page";
  return locate(doc, parentId)?.block.type;
}

// The JSON pointer of a block, as the server's 422 reports it.
export function pointerOf(path: readonly number[]): string {
  return path.map((index, level) => (level === 0 ? `/sections/${index}` : `/children/${index}`)).join("");
}

// How many objects and arrays sit above a block in the document: the page
// object and its sections array above a section, two more for each level
// below. The application rules count nesting this way (MAX_NESTING).
export function depthOf(path: readonly number[]): number {
  return path.length * 2;
}

// Each block on the page, parents before their children, with its place.
export function* allBlocks(doc: PageDocument): Generator<Located> {
  yield* indexFor(doc).blocks.values();
}

// ------------------------------------------------------------ updates

// The page with the block at `path` replaced by what `change` returns.
export function replaceAtPath(doc: PageDocument, path: readonly number[], change: (block: AnyBlock) => AnyBlock): PageDocument {
  const [first, ...rest] = path;
  if (first === undefined) throw new Error("replaceAtPath needs a path to a block");
  const sections = doc.sections as unknown as AnyBlock[];
  const replaced = replaceIn(sections, first, rest, change);
  return { ...doc, sections: replaced as unknown as PageDocument["sections"] };
}

function replaceIn(list: AnyBlock[], index: number, rest: readonly number[], change: (block: AnyBlock) => AnyBlock): AnyBlock[] {
  const block = list[index];
  if (!block) throw new Error(`no block at index ${index}`);
  const [next, ...deeper] = rest;
  const updated = next === undefined ? change(block) : { ...block, children: replaceIn(block.children, next, deeper, change) };
  const copy = list.slice();
  copy[index] = updated;
  return copy;
}

// The page with a container's children replaced by what `change` returns.
export function replaceChildren(doc: PageDocument, parentId: ParentId, change: (children: AnyBlock[]) => AnyBlock[]): PageDocument {
  if (parentId === null) {
    return { ...doc, sections: change((doc.sections as unknown as AnyBlock[]).slice()) as unknown as PageDocument["sections"] };
  }
  const found = locate(doc, parentId);
  if (!found) throw new Error(`no block ${parentId}`);
  return replaceAtPath(doc, found.path, (block) => ({ ...block, children: change(block.children.slice()) }));
}
