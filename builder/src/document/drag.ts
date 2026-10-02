// Drag and drop, as pure data. While a block is dragged, the page the
// editor holds does not change: the session keeps the page as it was when
// the drag began (base) and a preview, a separate tree with the block where
// it would land, which the canvas draws instead. A drop makes ONE command,
// a move or, from the widget panel, an insert, and validates the whole page
// it gives; a cancelled drag throws the preview away and leaves nothing
// behind.
//
// Where a block may land comes from the nesting rule (the schema's enum),
// and whether a container can take one more (a full section, a column at
// its limit, a section that would lose its last column) from validating
// that container alone, once per container per drag: the answer cannot
// change while the page stands still, so moving the pointer costs a lookup.
import type { Block, BlockType, PageDocument } from "../shared/document.ts";
import { checkValueRules, refusal, type CommandError } from "./check.ts";
import { makeInsert, makeMove, type Command, type Made } from "./commands.ts";
import { blockName, containerName, plural, TYPE_NAMES } from "./labels.ts";
import { applyOp } from "./ops.ts";
import { applyCommand, type Focus } from "./reducer.ts";
import { allBlocks, blockIds, childrenOf, locate, type ParentId } from "./tree.ts";
import { validateBlockSchema } from "../shared/validate.ts";
import { isContainer } from "./nesting.ts";

export type DragSource =
  // A block of the page.
  | { kind: "block"; id: string }
  // A new block from the widget panel, made (with its ids) when the drag
  // began.
  | { kind: "palette"; block: Block };

// A place to drop: a container and an index among its children once the
// dragged block has left its own place.
export interface DropTarget {
  parentId: ParentId;
  index: number;
}

export type Verdict = { allowed: true } | { allowed: false; error: CommandError };

export interface DragSession {
  // The page when the drag began. Never changed.
  readonly base: PageDocument;
  readonly source: DragSource;
  readonly type: BlockType;
  readonly target: DropTarget | null;
  // Whether the block may land at the target, and if not, why.
  readonly verdict: Verdict | null;
  // What the canvas draws: base with the block at the target when it may
  // land there, base itself otherwise.
  readonly preview: PageDocument;
  // One verdict per container, found the first time the pointer is over it.
  readonly verdicts: Map<string, Verdict>;
}

export type Started = { ok: true; session: DragSession } | { ok: false; error: CommandError };

export function startDrag(base: PageDocument, source: DragSource): Started {
  if (source.kind === "block") {
    const found = locate(base, source.id);
    if (!found) return { ok: false, error: refusal("unknown", `There is no block ${source.id} on the page.`) };
    return { ok: true, session: session(base, source, found.block.type) };
  }
  // A new block is checked on its own when the drag begins: the schema, the
  // rules, and ids the page does not have.
  const schema = validateBlockSchema(source.block);
  if (!schema.valid) return { ok: false, error: refusal("invalid", `The new ${TYPE_NAMES[source.block.type]} is not valid: ${schema.errors[0]?.message ?? "invalid"}.`, schema.errors) };
  const rules = checkValueRules(source.block, "", 0);
  if (rules) return { ok: false, error: rules };
  const taken = blockIds(base);
  const ids: string[] = [];
  const collect = (b: Block): void => {
    ids.push(b.id);
    b.children.forEach(collect);
  };
  collect(source.block);
  const clash = ids.find((id, k) => taken.has(id) || ids.indexOf(id) !== k);
  if (clash) return { ok: false, error: refusal("duplicateId", `The id ${clash} is already used by another block.`) };
  return { ok: true, session: session(base, source, source.block.type) };
}

function session(base: PageDocument, source: DragSource, type: BlockType): DragSession {
  return { base, source, type, target: null, verdict: null, preview: base, verdicts: new Map() };
}

// The one command a drop at `target` would make.
function plan(session: DragSession, target: DropTarget): Made {
  return session.source.kind === "block"
    ? makeMove(session.base, session.source.id, target)
    : makeInsert(session.base, session.source.block, target);
}

const key = (parentId: ParentId): string => (parentId === null ? "" : `#${parentId}`);

// Whether the dragged block may go into this container at all, wherever
// among its children: the nesting rule, then the container (and for a
// move, the container it leaves) validated alone with the block in it.
export function verdictFor(session: DragSession, parentId: ParentId): Verdict {
  const cached = session.verdicts.get(key(parentId));
  if (cached) return cached;
  const verdict = judge(session, parentId);
  session.verdicts.set(key(parentId), verdict);
  return verdict;
}

function judge(session: DragSession, parentId: ParentId): Verdict {
  const children = childrenOf(session.base, parentId);
  if (!children) return { allowed: false, error: refusal("unknown", `There is no block ${String(parentId)} on the page.`) };
  // Any index will do: what is checked does not depend on the order. For
  // the container the block is in already, the place after the next one.
  const own = session.source.kind === "block" ? locate(session.base, session.source.id) : undefined;
  const sameParent = own !== undefined && own.parentId === parentId;
  const index = sameParent ? (own.index === 0 ? Math.min(1, children.length - 1) : 0) : 0;
  if (sameParent && children.length === 1) return { allowed: true };
  const made = plan(session, { parentId, index });
  if (!made.ok) return made.error.reason === "nothing" ? { allowed: true } : { allowed: false, error: made.error };
  const applied = applyCommand(session.base, made.command);
  return applied.ok ? { allowed: true } : { allowed: false, error: applied.error };
}

// The pointer (or the keyboard) is over a place, or over nothing (null).
export function dragOver(session: DragSession, target: DropTarget | null): DragSession {
  if (target === null) return { ...session, target, verdict: null, preview: session.base };
  const verdict = verdictFor(session, target.parentId);
  if (!verdict.allowed) return { ...session, target, verdict, preview: session.base };
  const made = plan(session, target);
  if (!made.ok) {
    // Over its own place, the block stays where it is.
    if (made.error.reason === "nothing") return { ...session, target, verdict: { allowed: true }, preview: session.base };
    return { ...session, target, verdict: { allowed: false, error: made.error }, preview: session.base };
  }
  // The preview takes the steps as they are, unvalidated: the verdict for
  // this container already said they are fine.
  const preview = made.command.ops.reduce(applyOp, session.base);
  return { ...session, target, verdict, preview };
}

export type Dropped =
  | { ok: true; command: Command; document: PageDocument; focus: Focus | null }
  // Dropped where it already was: no command, nothing changes.
  | { ok: true; command: null; document: PageDocument; focus: Focus | null }
  | { ok: false; error: CommandError };

// The drop: the one command, with the page it gives validated whole.
export function drop(session: DragSession): Dropped {
  const { target, verdict } = session;
  if (!target || !verdict) return { ok: false, error: refusal("noTarget", "There is nowhere to drop it.") };
  if (!verdict.allowed) return { ok: false, error: verdict.error };
  const made = plan(session, target);
  if (!made.ok) {
    if (made.error.reason === "nothing" && session.source.kind === "block") {
      return { ok: true, command: null, document: session.base, focus: { id: session.source.id } };
    }
    return { ok: false, error: made.error };
  }
  const applied = applyCommand(session.base, made.command, { root: true });
  if (!applied.ok) return applied;
  return { ok: true, command: made.command, document: applied.document, focus: applied.focus };
}

// A cancelled drag: the page as it was, untouched.
export function cancelDrag(session: DragSession): PageDocument {
  return session.base;
}

// Every container of the page, with whether the dragged block may land in
// it: the canvas shades those it may not ("Shaded areas cannot hold
// widgets").
export function dropTargets(session: DragSession): Array<{ parentId: ParentId; verdict: Verdict }> {
  const containers: ParentId[] = [null];
  for (const { block } of allBlocks(session.base)) if (isContainer(block.type)) containers.push(block.id);
  return containers.map((parentId) => ({ parentId, verdict: verdictFor(session, parentId) }));
}

// The drag library's collision priority for a container: a container with
// children ranks below them, so the pointer over a child picks the child;
// an empty one has nothing to rank below and keeps the default, so it can
// be reached at all.
export function containerPriority(childCount: number): "low" | "default" {
  return childCount === 0 ? "default" : "low";
}

// What the live region says while dragging: "Quote will be added to Column
// 2 in Hero, after Text." or why it cannot go there.
export function describeDrop(session: DragSession): string | null {
  const { target, verdict } = session;
  if (!target || !verdict) return null;
  if (!verdict.allowed) return verdict.error.message;
  const moving = session.source.kind === "block" ? session.source.id : null;
  const name = moving
    ? blockName(session.base, moving)
    : session.type === "section" && session.source.kind === "palette"
      ? `A section with ${session.source.block.children.length} ${plural("column", session.source.block.children.length)}`
      : TYPE_NAMES[session.type];
  const siblings = (childrenOf(session.base, target.parentId) ?? []).filter((b) => b.id !== moving);
  const before = siblings[target.index - 1];
  const where = target.parentId === null ? "the page" : containerName(session.base, target.parentId);
  const place = before ? `, after ${blockName(session.base, before.id)}` : siblings.length > 0 ? ", at the top" : "";
  return `${name} will ${moving ? "move" : "be added"} to ${where}${place}.`;
}
