// The reducer: a page and a command in, the next page out, or the reason
// the command cannot be applied. Pure: the page given is never changed, and
// the same page and command always give the same result.
//
// It replays the command's steps (./ops.ts), then checks what they could
// have broken (./check.ts): the nesting rule where a block landed, the
// application rules on what came in, ids nobody else has, and the schema on
// each container and block the steps touched, validated alone. The whole
// page is validated only when asked ({ root: true }, as a drop does).
//
// With the page comes the focus, as data: after an insert the new block,
// after a delete its neighbour, after a move or an edit the block itself.
// An undo is the inverse command, so it focuses the block it touched, or
// where that block was when the undo took it away.
import { itemsKey, type PageDocument } from "../shared/document.ts";
import { checkContainer, checkNesting, checkRoot, checkUniqueAnchors, checkUniqueIds, checkValueRules, refusal, type CommandError } from "./check.ts";
import type { Command } from "./commands.ts";
import { applyOp, StaleStep, type Op } from "./ops.ts";
import { childrenOf, depthOf, locate, pointerOf, typeOf, type ParentId } from "./tree.ts";

export interface Focus {
  id: string;
  // For a command on a list's items (a gallery's images): which item.
  item?: number;
}

export type Applied =
  | { ok: true; document: PageDocument; focus: Focus | null }
  | { ok: false; error: CommandError };

export interface ApplyOptions {
  // Validate the whole page too, as the server will.
  root?: boolean;
}

export function applyCommand(doc: PageDocument, command: Command, options: ApplyOptions = {}): Applied {
  let next = doc;
  try {
    for (const op of command.ops) next = applyOp(next, op);
  } catch (error) {
    if (error instanceof StaleStep) {
      return { ok: false, error: refusal("stale", `The page has changed since this was prepared (${error.message}).`) };
    }
    throw error;
  }
  const problem = check(next, command.ops) ?? (options.root ? checkRoot(next) : null);
  if (problem) return { ok: false, error: problem };
  return { ok: true, document: next, focus: focusAfter(next, command) };
}

function check(next: PageDocument, ops: readonly Op[]): CommandError | null {
  const containers = new Set<ParentId>();
  const edited = new Set<string>();
  const placed = new Set<string>();
  const inserted = new Set<string>();
  let pageKeys = false;
  for (const op of ops) {
    switch (op.op) {
      case "insert":
        containers.add(op.at.parentId);
        placed.add(op.block.id);
        inserted.add(op.block.id);
        break;
      case "remove":
        containers.add(op.at.parentId);
        break;
      case "move":
        containers.add(op.from.parentId);
        containers.add(op.to.parentId);
        placed.add(op.id);
        break;
      case "set":
        if (op.id === null) pageKeys = true;
        else edited.add(op.id);
        break;
      default:
        edited.add(op.id);
    }
  }

  // The nesting rule, where each block put somewhere ended up.
  for (const id of placed) {
    const found = locate(next, id);
    if (!found) continue;
    const nesting = checkNesting(typeOf(next, found.parentId) ?? "page", found.block.type);
    if (nesting) return nesting;
  }

  // The application rules on what came in: new blocks whole, edited blocks
  // whole (their props are small), and the page's own keys.
  for (const id of [...inserted, ...edited]) {
    const found = locate(next, id);
    if (!found) continue;
    const rules = checkValueRules(found.block, pointerOf(found.path), depthOf(found.path));
    if (rules) return rules;
  }
  if (pageKeys) {
    for (const key of ["title", "description"] as const) {
      const rules = key in next ? checkValueRules(next[key], `/${key}`, 1) : null;
      if (rules) return rules;
    }
  }
  if (inserted.size > 0) {
    const ids = checkUniqueIds(next);
    if (ids) return ids;
  }
  // Any block may have an anchor: one brought in, with those under it, or
  // one whose props changed, may now share its anchor with another.
  const changed = new Set([...inserted, ...edited]);
  if (changed.size > 0) {
    const anchors = checkUniqueAnchors(next, changed);
    if (anchors) return anchors;
  }

  // The schema, on each block touched, alone; a block under another one
  // touched is validated with it. New sections are blocks of the page,
  // which is checked as a shell, so they are validated on their own.
  const blocks = new Set<string>([...edited, ...[...containers].filter((id): id is string => id !== null)]);
  if (containers.has(null)) for (const id of inserted) if (locate(next, id)?.parentId === null) blocks.add(id);
  for (const id of blocks) {
    if (hasAncestorIn(next, id, blocks)) continue;
    // A block the command removed again has nothing left to check.
    if (!locate(next, id)) continue;
    const problem = checkContainer(next, id);
    if (problem) return problem;
  }
  if (containers.has(null) || pageKeys) return checkContainer(next, null);
  return null;
}

function hasAncestorIn(doc: PageDocument, id: string, set: ReadonlySet<string>): boolean {
  for (let up = locate(doc, id)?.parentId ?? null; up !== null; up = locate(doc, up)?.parentId ?? null) {
    if (set.has(up)) return true;
  }
  return false;
}

export function focusAfter(doc: PageDocument, command: Command): Focus | null {
  const subject = command.subject;
  if (!subject) return null;
  const found = locate(doc, subject.id);
  if (found) {
    if (subject.item === undefined) return { id: subject.id };
    const items = (found.block.props as Record<string, unknown>)[itemsKey(found.block.type)];
    const length = Array.isArray(items) ? items.length : 0;
    const item = itemFocus(command.ops, subject.id, subject.item, length);
    return item === undefined ? { id: subject.id } : { id: subject.id, item };
  }
  // The subject is gone: its neighbour takes the focus, the block now in
  // its place, else the one before it, else its container.
  const removal = command.ops.findLast((op) => op.op === "remove" && op.block.id === subject.id);
  if (removal?.op !== "remove") return null;
  const { parentId, index } = removal.at;
  const siblings = childrenOf(doc, parentId) ?? [];
  const neighbour = siblings[index] ?? siblings[index - 1];
  if (neighbour) return { id: neighbour.id };
  return parentId === null ? null : { id: parentId };
}

// The item a list command leaves the focus on: the first item it put in;
// else the neighbour of the first it took out; else where it moved one to;
// else the one it changed.
function itemFocus(ops: readonly Op[], id: string, fallback: number, length: number): number | undefined {
  const mine = ops.filter((op) => op.op !== "insert" && op.op !== "remove" && op.op !== "move" && op.id === id);
  const inserts = mine.flatMap((op) => (op.op === "insertItem" ? [op.index] : []));
  if (inserts.length > 0) return Math.min(...inserts);
  const removals = mine.flatMap((op) => (op.op === "removeItem" ? [op.index] : []));
  if (removals.length > 0) {
    const first = Math.min(...removals);
    return length === 0 ? undefined : Math.min(first, length - 1);
  }
  const move = mine.findLast((op) => op.op === "moveItem");
  if (move?.op === "moveItem") return move.to;
  const set = mine.findLast((op) => op.op === "set" && typeof op.path[2] === "number");
  if (set?.op === "set" && typeof set.path[2] === "number") return set.path[2];
  return length === 0 ? undefined : Math.min(fallback, length - 1);
}
