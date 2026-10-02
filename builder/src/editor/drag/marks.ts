// What each block of the canvas draws while a block is dragged
// (design/shots/drag.png), from the store's drag session alone:
//
// - the dragged block, at the place the preview gives it, is drawn as the
//   drop indicator: a line with its name where it will land, or, alone in
//   a container that held nothing else, the frame of that container;
// - the container it would land in is framed and named;
// - the other containers that may take it are outlined (a widget's
//   columns), and those that may not are shaded, with the rule.
//
// The same marks for the mouse and the keyboard: both only move the
// session's target.
import { nestingMessage } from "../../document/check.ts";
import { verdictFor, type DragSession } from "../../document/drag.ts";
import { blockName, TYPE_NAMES } from "../../document/labels.ts";
import { canContain, containersFor, type ContainerType } from "../../document/nesting.ts";
import { childrenOf, locate, typeOf, type ParentId } from "../../document/tree.ts";
import type { BlockType, PageDocument } from "../../shared/document.ts";
import { PAGE_TARGET, type Dragged } from "./place.ts";

export type DragMark =
  // The dragged block: a line in a gap it opens (along a row for a
  // column), or the frame of a container that held nothing else.
  | { kind: "slot"; mode: "line" | "frame"; row: boolean; label: string }
  // The container it would land in.
  | { kind: "target"; label: string }
  // A container that may take it.
  | { kind: "open" }
  // A container that may not, and why.
  | { kind: "shut"; note: string }
  | null;

export function draggedOf(session: DragSession): Dragged {
  return session.source.kind === "block"
    ? { id: session.source.id, type: session.type, fromPage: true }
    : { id: session.source.block.id, type: session.type, fromPage: false };
}

// "Hero", "Column 2", "Quote": what the line and the announcements call
// the dragged block.
export function draggedName(session: DragSession): string {
  if (session.source.kind === "block") return blockName(session.base, session.source.id);
  return session.type === "section" ? "Section" : TYPE_NAMES[session.type];
}

const DEPTH: Readonly<Record<string, number>> = { page: 0, section: 1, column: 2 };
const depth = (type: ContainerType): number => DEPTH[type] ?? 3;

// "Widgets go inside a column": the rule's first half, for the shading.
export function homeRule(type: BlockType): string {
  return nestingMessage(type, "page").split(", not into")[0] ?? "";
}

// A container that cannot take the dragged block is shaded when it stands
// above the places that can (a section, for a widget), or when it could by
// type and cannot now (a section with four columns, for a fifth).
function shaded(type: ContainerType, dragged: BlockType): boolean {
  if (canContain(type, dragged)) return true;
  const homes = containersFor(dragged).map(depth);
  return homes.length > 0 && depth(type) < Math.min(...homes);
}

export function dragMarkOf(session: DragSession, preview: PageDocument, id: string): DragMark {
  const dragged = draggedOf(session);
  if (id === dragged.id) {
    const parentId = locate(preview, id)?.parentId ?? null;
    const others = (childrenOf(preview, parentId) ?? []).filter((b) => b.id !== id).length;
    const row = typeOf(preview, parentId) === "section";
    return { kind: "slot", mode: others === 0 && parentId !== null ? "frame" : "line", row, label: draggedName(session) };
  }
  return containerMark(session, preview, id);
}

// The page's own mark (the canvas's frame), and a container's.
export function containerMark(session: DragSession, preview: PageDocument, id: string): DragMark {
  const parentId: ParentId = id === PAGE_TARGET ? null : id;
  const type = typeOf(preview, parentId);
  if (type === undefined || depth(type) > 2) return null;
  // Nothing inside the dragged block takes part: the preview holds it
  // wherever it is about to land.
  const dragged = draggedOf(session);
  for (let up: ParentId = parentId; up !== null; up = locate(preview, up)?.parentId ?? null) {
    if (up === dragged.id) return null;
  }
  const verdict = verdictFor(session, parentId);
  const target = session.target?.parentId === parentId && session.target !== null;
  if (verdict.allowed) {
    if (target) return { kind: "target", label: parentId === null ? "The page" : blockName(preview, parentId) };
    return { kind: "open" };
  }
  if (!shaded(type, session.type)) return null;
  const note = target ? verdict.error.message : canContain(type, session.type) ? verdict.error.message : `${homeRule(session.type)}.`;
  return { kind: "shut", note };
}
