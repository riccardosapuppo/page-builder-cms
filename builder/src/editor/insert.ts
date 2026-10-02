// Where a block from the widget panel goes, and putting it there. The place
// follows the selection, as a paste does (../document/commands.ts,
// pasteTarget): after the selected block when its container can hold the
// new one, else inside it at the end, else after the nearest block above
// that can have it beside it. With nothing selected a section goes at the
// end of the page and a widget at the end of the last column.
//
// After the insert the new block is selected, its panel shown and the
// focus put on it on the canvas.
import { useCallback } from "react";
import { makeInsert, pasteTarget, type Made } from "../document/commands.ts";
import { nestingMessage, type CommandError } from "../document/check.ts";
import { childrenOf, type Position } from "../document/tree.ts";
import type { Block, BlockType, PageDocument } from "../shared/document.ts";
import { runMade, useEnv } from "./context.tsx";

export function insertTarget(doc: PageDocument, type: BlockType, selection: string | null): Position | null {
  const at = pasteTarget(doc, type, selection);
  if (at || selection !== null || type === "section" || type === "column") return at;
  const column = doc.sections.at(-1)?.children.at(-1);
  return column ? { parentId: column.id, index: column.children.length } : null;
}

// Why a block has nowhere to go: for a widget on a page with no section,
// the approved design's own sentence.
export function nowhereMessage(doc: PageDocument, type: BlockType): string {
  if (type !== "section" && doc.sections.length === 0) return "Widgets go inside a column, so the section comes first: add one from Layout.";
  return nestingMessage(type, "page");
}

// The canvas's element for a block, focused and brought into view, once
// React has drawn it.
export function focusBlock(id: string): void {
  const run = () => {
    const element = document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`);
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest" });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
}

export interface Inserter {
  // A block made elsewhere, put where the selection says; null when it was
  // placed, the refusal otherwise (also said in the notice).
  insertBlock(block: Block): CommandError | null;
  // A command already made (a section with its columns).
  insertMade(made: Made): CommandError | null;
}

export function useInsert(): Inserter {
  const { store, ui } = useEnv();
  const settle = useCallback((made: Made): CommandError | null => {
    const result = runMade(store, made);
    if (!result.ok) {
      ui.getState().say(result.error.message);
      return result.error;
    }
    const focus = result.outcome.focus;
    ui.setState({ tray: "edit", panelTab: "content", notice: null });
    if (focus) focusBlock(focus.id);
    return null;
  }, [store, ui]);
  return {
    insertBlock: useCallback((block: Block) => {
      const { document, selection } = store.getState();
      const at = insertTarget(document, block.type, selection);
      if (!at || childrenOf(document, at.parentId) === undefined) {
        const message = nowhereMessage(document, block.type);
        ui.getState().say(message);
        return { reason: "noTarget", message };
      }
      return settle(makeInsert(document, block, at));
    }, [settle, store, ui]),
    insertMade: settle,
  };
}
