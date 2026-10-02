// Block ids. A command that brings new blocks (a duplicate, a paste, a new
// section) draws their ids when it is made, never when it is applied, so
// redoing it puts back the very same blocks. Where the ids come from is
// injected: the editor passes a random source, the tests a counter.
import type { Block, PageDocument } from "../shared/document.ts";
import { copyJson } from "./json.ts";
import { blockIds, type AnyBlock } from "./tree.ts";

// Returns a new id each time it is called. The ids it gives must follow the
// schema's blockId pattern.
export type NewId = () => string;

// The schema's blockId: ASCII letters, digits, "_" and "-", 1 to 64.
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

// Random ids of 12 characters from 64 (72 bits), from the platform's
// cryptographic source unless another is given.
export function randomIds(fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): NewId {
  return () => Array.from(fill(new Uint8Array(12)), (byte) => ALPHABET[byte & 63]).join("");
}

// Draws ids the page does not have yet and this draw has not given before.
// A source that keeps giving taken ids is a broken source: it throws
// rather than loop.
export function idDraw(doc: PageDocument, newId: NewId): () => string {
  const taken = new Set(blockIds(doc));
  return () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = newId();
      if (!BLOCK_ID.test(id)) throw new Error(`the id source gave "${id}", which is not a block id`);
      if (taken.has(id)) continue;
      taken.add(id);
      return id;
    }
    throw new Error("the id source gave 100 ids in a row that the page already has");
  };
}

// A copy of a block, with everything under it, with a new id for each
// block: what a duplicate or a paste puts on the page.
export function reidentify<T extends Block>(block: T, draw: () => string): T {
  const copy = copyJson(block) as unknown as AnyBlock;
  const renew = (b: AnyBlock): void => {
    b.id = draw();
    b.children.forEach(renew);
  };
  renew(copy);
  return copy as unknown as T;
}
