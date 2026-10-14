// Every change the interface asks of the page goes through here, from the
// clamp, the keyboard, the block's menu, the Insert drawer or a drop:
//
// 1. the text still waiting in a panel's field is handed over first, as a
//    command of its own (./pending.ts); a text the page refuses keeps the
//    command from running, and the sentence that says why stays;
// 2. the command is made from the page as it is then, and applied;
// 3. the focus goes where the command's result says (../document/reducer.ts,
//    focusAfter): after a delete to the neighbour, after an insert, a paste
//    or a duplicate to the new block, after an undo to the block it touched;
//    on the canvas, or on the outline's row when the command came from
//    there;
// 4. a refusal is said, in one sentence, and the page stays as it was.
import { useMemo } from "react";
import { refusal, type CommandError } from "../document/check.ts";
import type { Made } from "../document/commands.ts";
import type { Focus } from "../document/reducer.ts";
import type { PageDocument } from "../shared/document.ts";
import type { StoreOutcome } from "../store/editor-store.ts";
import { useEnv, type EditorEnv } from "./context.tsx";

// Where the person was when they asked: the focus comes back to the same
// part of the editor. The panel keeps its own focus (its field).
export type Region = "canvas" | "navigator" | "panel";

// The first of the elements a selector finds that is drawn: a key the
// wide top bar and a phone's bar both hold (data-drawer, data-sidebar) is
// drawn in one of them only (./layout-mode.ts). With none drawn (a page
// that draws nothing, as a test's), the first.
export function shownElement(selector: string): HTMLElement | null {
  const found = [...document.querySelectorAll<HTMLElement>(selector)];
  return found.find((element) => element.getClientRects().length > 0) ?? found[0] ?? null;
}

export const afterRender = (run: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
};

// The canvas's element for a block, focused and brought into view, once
// React has drawn it. Block ids are the schema's letters, digits, "_" and
// "-", safe inside a quoted attribute selector as they are.
// A focus asked for on a canvas or a tree that has gone by the time it
// runs (another page opened, the editor drawn again) is not carried over
// to the one that took its place, where a block may have the same id.
const stillThere = (part: Element | null): boolean => part === null || part.isConnected;

// What the editor's own deferred focus last put the focus on: a later
// request of its own takes the focus from there, as it does not from
// anything else that took it meanwhile.
let placedLast: Element | null = null;
const place = (element: HTMLElement, options?: FocusOptions): void => {
  element.focus(options);
  placedLast = element;
};

export function focusBlock(id: string): void {
  const canvas = document.querySelector(".canvas");
  afterRender(() => {
    const element = document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`);
    if (!element || !stillThere(canvas)) return;
    place(element, { preventScroll: true });
    element.scrollIntoView?.({ block: "nearest" });
  });
}

// The navigator's row for a block. The navigator opens the rows down to a
// block when it is selected, in the same render, so the row is there.
export function focusRow(id: string): void {
  const tree = document.querySelector(".tree");
  afterRender(() => {
    if (!stillThere(tree)) return;
    const row = document.querySelector<HTMLElement>(`.tree [data-row-id="${id}"]`);
    if (row) place(row);
  });
}

export function placeFocus(focus: Focus | null, region: Region): void {
  if (region === "panel") return;
  if (focus === null) {
    // Nothing left to stand on (the last section went, or the selection
    // was let go): the canvas itself, a frame later. Unless the focus has
    // gone somewhere of its own by then (a key pressed in that frame, +
    // opening a picker): it is not taken back from there. A focus an
    // earlier request of the editor's put somewhere in that frame gives way.
    const from = document.activeElement;
    afterRender(() => {
      const now = document.activeElement;
      if (now !== null && now !== from && now !== document.body && now !== placedLast) return;
      const target = document.querySelector<HTMLElement>(region === "navigator" ? ".tree [role=treeitem]" : ".canvas");
      if (target) place(target);
    });
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
  if (element.closest(".sidebar")) return "panel";
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

// The text still waiting, handed over; the refusal when the page refused
// one, which stays in its field or editor with the notice saying why: the
// command waits rather than land on a page without it.
export function handOver(env: Env): CommandError | null {
  if (env.ui.getState().pending.deliver()) return null;
  return refusal("invalid", env.ui.getState().notice ?? "A text the page cannot keep is still being written.");
}

// A command made from the page as it is once the waiting text is in; null
// when it was applied, the refusal otherwise (also said).
export function runCommand(env: Env, make: (doc: PageDocument) => Made, region: Region): CommandError | null {
  const held = handOver(env);
  if (held) return held;
  const made = make(env.store.getState().document);
  if (!made.ok) {
    env.ui.getState().say(made.error.message);
    return made.error;
  }
  return settle(env, env.store.getState().dispatch(made.command), region);
}

export function runUndo(env: Env, region: Region): CommandError | null {
  const held = handOver(env);
  if (held) return held;
  return settle(env, env.store.getState().undo(), region);
}

export function runRedo(env: Env, region: Region): CommandError | null {
  const held = handOver(env);
  if (held) return held;
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
