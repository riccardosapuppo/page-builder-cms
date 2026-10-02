// The steps every command is made of. A step is data: it names what it
// changes and carries both sides of the change, the value before and the
// value after, so its inverse is another step read the other way round,
// without looking at any document. Applying a step checks that the
// document still holds its "before" side, so a step made for one document
// is refused by another instead of changing it into something nobody
// asked for.
//
// An absent key is a side of a change of its own: a removed override, an
// unset link, a description taken off. A step that removes a key leaves the
// key absent, never set to undefined or null, and the step that puts it
// back puts it where it was among its object's keys, so undoing gives back
// the same document byte for byte.
import type { Block, PageDocument } from "../shared/document.ts";
import { isObject, keyIndex, sameJson, withKey, withoutKey, type Json } from "./json.ts";
import { childrenOf, locate, replaceAtPath, replaceChildren, type AnyBlock, type Position } from "./tree.ts";

// Keys inside a block (["props"], ["style", "tablet"], ["props", "items", 2])
// or inside the page ([]).
export type Path = readonly (string | number)[];

export type Op =
  // A block, with everything under it, put into a container at an index.
  | { op: "insert"; at: Position; block: Block }
  // The block at that place taken out. It carries the block, so the
  // inverse can put it back.
  | { op: "remove"; at: Position; block: Block }
  // A block taken from one place and put at another. `to.index` counts the
  // destination's children once the block has left its old place.
  | { op: "move"; id: string; from: Position; to: Position }
  // One key of an object in a block (id) or in the page (id null). before
  // absent: the key was not there; after absent: it is taken out. `at` is
  // where the key sits among its object's keys while it is there, and is
  // given exactly when one side is absent.
  | { op: "set"; id: string | null; path: Path; key: string; before?: Json; after?: Json; at?: number }
  // One item of a list in a block's props (a gallery's images, an
  // accordion's questions).
  | { op: "insertItem"; id: string; path: Path; index: number; item: Json }
  | { op: "removeItem"; id: string; path: Path; index: number; item: Json }
  | { op: "moveItem"; id: string; path: Path; from: number; to: number };

export function invertOp(op: Op): Op {
  switch (op.op) {
    case "insert":
      return { op: "remove", at: op.at, block: op.block };
    case "remove":
      return { op: "insert", at: op.at, block: op.block };
    case "move":
      return { op: "move", id: op.id, from: op.to, to: op.from };
    case "set": {
      const inverse: Op = { op: "set", id: op.id, path: op.path, key: op.key };
      if ("after" in op) inverse.before = op.after as Json;
      if ("before" in op) inverse.after = op.before as Json;
      if ("at" in op) inverse.at = op.at as number;
      return inverse;
    }
    case "insertItem":
      return { op: "removeItem", id: op.id, path: op.path, index: op.index, item: op.item };
    case "removeItem":
      return { op: "insertItem", id: op.id, path: op.path, index: op.index, item: op.item };
    case "moveItem":
      return { op: "moveItem", id: op.id, path: op.path, from: op.to, to: op.from };
  }
}

// Why a step could not be applied: the document is not the one it was made
// for, or the step asks for something no command makes.
export class StaleStep extends Error {}

const stale = (message: string): never => {
  throw new StaleStep(message);
};

// The document with one step applied, structurally: the step's own
// preconditions are checked, the schema is not (./check.ts does that for a
// whole command). Throws StaleStep when the document does not hold what the
// step expects.
export function applyOp(doc: PageDocument, op: Op): PageDocument {
  switch (op.op) {
    case "insert": {
      const children = childrenOf(doc, op.at.parentId) ?? stale(`there is no block ${String(op.at.parentId)} to insert into`);
      if (!Number.isInteger(op.at.index) || op.at.index < 0 || op.at.index > children.length) stale(`index ${op.at.index} is outside ${String(op.at.parentId)}`);
      return replaceChildren(doc, op.at.parentId, (list) => {
        list.splice(op.at.index, 0, op.block as unknown as AnyBlock);
        return list;
      });
    }
    case "remove": {
      const children = childrenOf(doc, op.at.parentId) ?? stale(`there is no block ${String(op.at.parentId)} to remove from`);
      const there = children[op.at.index];
      // The whole block, not only its id: putting it back must give back
      // exactly what was taken.
      if (!there || !sameJson(there, op.block)) stale(`the block at ${String(op.at.parentId)}/${op.at.index} is not ${op.block.id} as it was`);
      return replaceChildren(doc, op.at.parentId, (list) => {
        list.splice(op.at.index, 1);
        return list;
      });
    }
    case "move": {
      const children = childrenOf(doc, op.from.parentId) ?? stale(`there is no block ${String(op.from.parentId)} to move from`);
      const block = children[op.from.index];
      if (!block || block.id !== op.id) stale(`the block at ${String(op.from.parentId)}/${op.from.index} is not ${op.id}`);
      const without = replaceChildren(doc, op.from.parentId, (list) => {
        list.splice(op.from.index, 1);
        return list;
      });
      // A block cannot go inside itself.
      if (op.to.parentId !== null && !locate(without, op.to.parentId)) stale(`there is no block ${op.to.parentId} to move into`);
      const target = childrenOf(without, op.to.parentId) ?? [];
      if (!Number.isInteger(op.to.index) || op.to.index < 0 || op.to.index > target.length) stale(`index ${op.to.index} is outside ${String(op.to.parentId)}`);
      return replaceChildren(without, op.to.parentId, (list) => {
        list.splice(op.to.index, 0, block as unknown as AnyBlock);
        return list;
      });
    }
    case "set":
      if (op.id === null && !PAGE_KEYS.has(op.key)) stale(`a set step changes the page's title or description, not ${op.key}`);
      return updateObject(doc, op.id, op.path, (object) => setKey(object, op));
    case "insertItem":
    case "removeItem":
    case "moveItem":
      return updateObject(doc, op.id, op.path.slice(0, -1), (object) => {
        const key = op.path[op.path.length - 1];
        const list = typeof key === "string" ? object[key] : undefined;
        if (typeof key !== "string" || !Array.isArray(list)) return stale(`${op.path.join("/")} is not a list`);
        return withKey(object, key, changeList(list, op));
      });
  }
}

function setKey(object: Record<string, unknown>, op: Extract<Op, { op: "set" }>): Record<string, unknown> {
  const has = Object.hasOwn(object, op.key);
  if ("before" in op ? !has || !sameJson(object[op.key], op.before) : has) {
    stale(`${op.key} is not what the change expects`);
  }
  if ("before" in op && !("after" in op) && keyIndex(object, op.key) !== op.at) stale(`${op.key} is not at ${String(op.at)}`);
  if (!("after" in op)) return withoutKey(object, op.key);
  if (!("before" in op) && (op.at === undefined || op.at > Object.keys(object).length)) stale(`${op.key} cannot go at ${String(op.at)}`);
  return withKey(object, op.key, op.after, op.at);
}

function changeList(list: readonly unknown[], op: Extract<Op, { op: "insertItem" | "removeItem" | "moveItem" }>): unknown[] {
  const copy = list.slice();
  switch (op.op) {
    case "insertItem":
      if (!Number.isInteger(op.index) || op.index < 0 || op.index > copy.length) stale(`item ${op.index} is outside the list`);
      copy.splice(op.index, 0, op.item);
      return copy;
    case "removeItem":
      if (!sameJson(copy[op.index], op.item)) stale(`item ${op.index} is not the one the change expects`);
      copy.splice(op.index, 1);
      return copy;
    case "moveItem": {
      if (!Number.isInteger(op.from) || op.from < 0 || op.from >= copy.length) stale(`item ${op.from} is outside the list`);
      const [item] = copy.splice(op.from, 1);
      if (!Number.isInteger(op.to) || op.to < 0 || op.to > copy.length) stale(`item ${op.to} is outside the list`);
      copy.splice(op.to, 0, item);
      return copy;
    }
  }
}

// What a set step may reach: a block's props and style, and the page's own
// keys (its title and description). Never a block's id, type or children,
// which only the structural steps change, nor the page's sections or
// schemaVersion.
const PAGE_KEYS = new Set(["title", "description"]);
const BLOCK_ROOTS = new Set(["props", "style"]);

function updateObject(doc: PageDocument, id: string | null, path: Path, change: (object: Record<string, unknown>) => Record<string, unknown>): PageDocument {
  if (id === null) {
    if (path.length !== 0) stale("the page's keys are set at the top level");
    return change(doc as unknown as Record<string, unknown>) as unknown as PageDocument;
  }
  const found = locate(doc, id) ?? stale(`there is no block ${id}`);
  const [root] = path;
  if (typeof root !== "string" || !BLOCK_ROOTS.has(root)) stale(`a set step reaches a block's props or style, not ${String(root)}`);
  return replaceAtPath(doc, found.path, (block) => updateIn(block as unknown as Record<string, unknown>, path, change) as unknown as AnyBlock);
}

function updateIn(value: Record<string, unknown>, path: Path, change: (object: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> | unknown[] {
  const [step, ...rest] = path;
  if (step === undefined) return change(value);
  if (Array.isArray(value)) {
    if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step >= value.length) return stale(`no item ${String(step)}`);
    const copy = value.slice();
    copy[step] = updateIn(copy[step] as Record<string, unknown>, rest, change);
    return copy;
  }
  if (!isObject(value) || typeof step !== "string" || !Object.hasOwn(value, step)) return stale(`no key ${String(step)}`);
  const inner = value[step];
  if (!isObject(inner) && !Array.isArray(inner)) return stale(`${step} holds no object`);
  return withKey(value, step, updateIn(inner as Record<string, unknown>, rest, change));
}
