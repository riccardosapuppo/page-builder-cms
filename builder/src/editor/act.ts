// Every change the interface asks of the page goes through here, from the
// floating bar, the keyboard, the block's menu, the widget panel or a drop:
//
// 1. the text still waiting in a panel's field is handed over first, as a
//    command of its own (./pending.ts);
// 2. the command is made from the page as it is then, and applied;
// 3. the focus goes where the command's result says (../document/reducer.ts,
//    focusAfter): after a delete to the neighbour, after an insert, a paste
//    or a duplicate to the new block, after an undo to the block it touched;
//    on the canvas, or on the navigator's row when the command came from
//    there;
// 4. a refusal is said, in one sentence, and the page stays as it was.
import { useMemo } from "react";
import type { CommandError } from "../document/check.ts";
import type { Made } from "../document/commands.ts";
import type { Focus } from "../document/reducer.ts";
import type { PageDocument } from "../shared/document.ts";
import type { StoreOutcome } from "../store/editor-store.ts";
import { useEnv, type EditorEnv } from "./context.tsx";

// Where the person was when they asked: the focus comes back to the same
// part of the editor. The panel keeps its own focus (its field).
export type Region = "canvas" | "navigator" | "panel";

const afterRender = (run: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
};

// The canvas's element for a block, focused and brought into view, once
// React has drawn it. Block ids are the schema's letters, digits, "_" and
// "-", safe inside a quoted attribute selector as they are.
export function focusBlock(id: string): void {
  afterRender(() => {
    const element = document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`);
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest" });
  });
}

// The navigator's row for a block. The navigator opens the rows down to a
// block when it is selected, in the same render, so the row is there.
export function focusRow(id: string): void {
  afterRender(() => {
    document.querySelector<HTMLElement>(`.tree [data-row-id="${id}"]`)?.focus();
  });
}

export function placeFocus(focus: Focus | null, region: Region): void {
  if (region === "panel") return;
  if (focus === null) {
    // Nothing left to stand on (the last section went): the canvas itself.
    afterRender(() => document.querySelector<HTMLElement>(region === "navigator" ? ".tree [role=treeitem]" : ".canvas")?.focus());
    return;
  }
  if (region === "navigator") focusRow(focus.id);
  else focusBlock(focus.id);
}

// The part of the editor an element is in.
export function regionOf(element: EventTarget | null): Region {
  if (!(element instanceof Element)) return "canvas";
  if (element.closest(".tree")) return "navigator";
  if (element.closest(".canvas")) return "canvas";
  if (element.closest(".tray-left")) return "panel";
  return "canvas";
}

type Env = Pick<EditorEnv, "store" | "ui">;

function settle(env: Env, outcome: StoreOutcome, region: Region): CommandError | null {
  if (!outcome.ok) {
    env.ui.getState().say(outcome.error.message);
    return outcome.error;
  }
  env.ui.getState().say(null);
  placeFocus(outcome.focus, region);
  return null;
}

// A command made from the page as it is once the waiting text is in; null
// when it was applied, the refusal otherwise (also said).
export function runCommand(env: Env, make: (doc: PageDocument) => Made, region: Region): CommandError | null {
  env.ui.getState().pending.deliver();
  const made = make(env.store.getState().document);
  if (!made.ok) {
    env.ui.getState().say(made.error.message);
    return made.error;
  }
  return settle(env, env.store.getState().dispatch(made.command), region);
}

export function runUndo(env: Env, region: Region): CommandError | null {
  env.ui.getState().pending.deliver();
  return settle(env, env.store.getState().undo(), region);
}

export function runRedo(env: Env, region: Region): CommandError | null {
  env.ui.getState().pending.deliver();
  return settle(env, env.store.getState().redo(), region);
}

export interface Act {
  run(make: (doc: PageDocument) => Made, region: Region): CommandError | null;
  undo(region: Region): CommandError | null;
  redo(region: Region): CommandError | null;
}

export function useAct(): Act {
  const { store, ui } = useEnv();
  return useMemo(() => ({
    run: (make, region) => runCommand({ store, ui }, make, region),
    undo: (region) => runUndo({ store, ui }, region),
    redo: (region) => runRedo({ store, ui }, region),
  }), [store, ui]);
}
