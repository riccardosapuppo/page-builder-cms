// Copy and paste of blocks, for the keyboard and the block's menu. What is
// copied is the selected block with everything under it, as the text
// ../document/clipboard.ts writes, so another tab of the editor can paste
// it; what is pasted is read like anything from outside the editor
// (readClipboard: strict JSON, the rules, the schema) and goes after the
// selection with new ids (makePaste).
//
// The keys use the browser's own copy and paste events (./keys.ts), which
// carry the system clipboard without asking for a permission. The menu
// has no such event: it writes and reads the clipboard through the
// browser's clipboard API, and when the browser will not read it, pastes
// the block this tab copied last.
import { clipboardText, copyBlock, readClipboard } from "../document/clipboard.ts";
import type { CommandError } from "../document/check.ts";
import { makePaste } from "../document/commands.ts";
import { blockName } from "../document/labels.ts";
import type { Block } from "../shared/document.ts";
import { FIELD_OUTSIDE } from "../shared/validate.ts";
import { isPartKind, type PageKind } from "../storage/adapter.ts";
import { runCommand, type Region } from "./act.ts";
import type { EditorEnv } from "./context.tsx";

type Env = Pick<EditorEnv, "store" | "ui" | "newId">;

// The selected block as clipboard text, kept as this tab's last copy too;
// null, said, when nothing is selected.
export function copySelection(env: Env): string | null {
  const { document, selection } = env.store.getState();
  const block = selection === null ? undefined : copyBlock(document, selection);
  if (selection === null || !block) {
    env.ui.getState().say("Select a block to copy it.");
    return null;
  }
  const text = clipboardText(block);
  env.ui.setState({ copied: text });
  env.ui.getState().say(`Copied ${blockName(document, selection)}.`);
  return text;
}

// Pastes clipboard text after the selection (or inside it, or at the end
// of the page: pasteTarget) of the document open, a page or a part. Null
// when the block was put on the page.
export function pasteText(env: Env, text: string, region: Region, kind: PageKind = "page"): CommandError | null {
  const read = readClipboard(text);
  if (!read.ok) {
    env.ui.getState().say(read.error.message);
    return read.error;
  }
  // A Field block draws a value of a template's entry: pasted anywhere
  // else, it is refused here, as the storage would refuse the page.
  if (kind !== "template" && holdsField(read.block)) {
    env.ui.getState().say(FIELD_OUTSIDE);
    return { reason: "nesting", message: FIELD_OUTSIDE };
  }
  const selection = env.store.getState().selection;
  // A part's blocks take no anchor; a page's and a template's do.
  const block = isPartKind(kind) ? withoutAnchor(read.block) : read.block;
  return runCommand(env, (doc) => makePaste(doc, block, selection, env.newId), region);
}

// Whether a block is a Field block, or holds one.
function holdsField(block: Block): boolean {
  return block.type === "field" || (block.children as readonly Block[]).some(holdsField);
}

// A header's or footer's block takes no anchor (PART_ANCHOR,
// ../shared/validate.ts): a block pasted into one leaves its anchor, and
// those of the blocks under it, behind, as a block pasted into a page
// leaves one the page uses.
function withoutAnchor(block: Block): Block {
  const { anchor, ...props } = block.props as Record<string, unknown>;
  const children = (block.children as readonly Block[]).map(withoutAnchor);
  if (anchor === undefined && children.every((child, k) => child === block.children[k])) return block;
  return { ...block, props: anchor === undefined ? block.props : props, children } as Block;
}

// The menu's copy: the browser's clipboard as well as this tab's.
export async function copyFromMenu(env: Env): Promise<void> {
  const text = copySelection(env);
  if (text === null) return;
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // The tab's own copy is kept: the menu's Paste still has it.
  }
}

// The menu's paste: the browser's clipboard when it may be read, else
// the block this tab copied last.
export async function pasteFromMenu(env: Env, region: Region, kind: PageKind = "page"): Promise<CommandError | null> {
  let text: string | null = null;
  try {
    text = (await navigator.clipboard?.readText()) ?? null;
  } catch {
    text = null;
  }
  // An empty clipboard is as good as none.
  if (!text) text = env.ui.getState().copied;
  if (!text) {
    const message = "Nothing has been copied yet: copy a block first.";
    env.ui.getState().say(message);
    return { reason: "nothing", message };
  }
  return pasteText(env, text, region, kind);
}
