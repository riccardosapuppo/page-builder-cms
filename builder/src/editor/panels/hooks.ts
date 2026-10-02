// The commands a panel makes for its block, each made from the page as it
// is when the control hands its value over (not as it was when the panel
// was drawn), and run through the store. Each returns null when the page
// took the change, or the refusal for the control to show.
import { useMemo } from "react";
import { useStore } from "zustand";
import {
  makeInsertItems, makeMoveItem, makeRemoveItem, makeSetItem, makeSetProps, makeSetStyle,
  type StyleUpdates, type Updates,
} from "../../document/commands.ts";
import type { CommandError } from "../../document/check.ts";
import type { Json } from "../../document/json.ts";
import { locate } from "../../document/tree.ts";
import type { Block, BlockOfType, BlockType, Device } from "../../shared/document.ts";
import { useEnv, useRun } from "../context.tsx";

export interface BlockCommands {
  setProps(updates: Updates): CommandError | null;
  setStyle(device: Device, updates: StyleUpdates): CommandError | null;
  insertItems(index: number, items: readonly Json[]): CommandError | null;
  removeItem(index: number): CommandError | null;
  moveItem(from: number, to: number): CommandError | null;
  setItem(index: number, updates: Updates): CommandError | null;
}

export function useBlockCommands(id: string): BlockCommands {
  const { store } = useEnv();
  const run = useRun();
  return useMemo(() => {
    const doc = () => store.getState().document;
    return {
      setProps: (updates) => run(makeSetProps(doc(), id, updates)),
      setStyle: (device, updates) => run(makeSetStyle(doc(), id, device, updates)),
      insertItems: (index, items) => run(makeInsertItems(doc(), id, index, items)),
      removeItem: (index) => run(makeRemoveItem(doc(), id, index)),
      moveItem: (from, to) => run(makeMoveItem(doc(), id, from, to)),
      setItem: (index, updates) => run(makeSetItem(doc(), id, index, updates)),
    };
  }, [id, run, store]);
}

// The block as the page holds it now, or null once it is gone.
export function useBlock(id: string | null): Block | null {
  const { store } = useEnv();
  return useStore(store, (s) => (id === null ? null : (locate(s.document, id)?.block ?? null)));
}

export function isType<T extends BlockType>(block: Block | null, type: T): block is BlockOfType<T> {
  return block?.type === type;
}
