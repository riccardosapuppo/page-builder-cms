// One text block edited on the canvas, from the moment its editor opens to
// the moment it closes: TipTap in the block's place, and how its typing
// meets the page's own history. Two histories, kept apart and in step:
// - inside the text, Ctrl+Z and Ctrl+Shift+Z are TipTap's, and undo and
//   redo the typing (the editor's keymap leaves keys in a text field to
//   it, ../keys.ts);
// - the page's history holds what the text became, as ONE command of the
//   block's props (../../document/rich-text.ts, makeTextEdit), handed over
//   when the person pauses (the panel's fields' pause, on the injected
//   clock), when they leave the text, and before anything else changes the
//   page: the typing waits in ../pending.ts, which every other command and
//   the start of every drag deliver first (../act.ts,
//   ../drag/DragLayer.tsx). Each time it is handed over, TipTap's history
//   is closed, so the next Ctrl+Z inside the text stops where the page's
//   history has its step.
//
// The editor closes when the focus leaves the block (to another block, the
// panel, the top bar; not to the block's own bar or link field, and not
// when the whole window loses the focus), on Esc, when another block is
// selected, when a drag starts, and when the block's text changes other
// than by this editor (an undo from the top bar, a reload): the page
// drawn again is then the truth, and the typing still waiting is handed
// over first, onto that page.
//
// The text never becomes one the page refuses: a change past what the
// page takes of a text is not made, and a paste is cut to it (./limits.ts,
// asked of the page here). Should the page refuse a text all the same, the
// typing is not dropped: the hold stays, the editor stays open with the
// sentence that says why, and the commands, drags and the leaving that
// would lose it wait (../act.ts) until the text is one the page takes.
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { CommandError } from "../../document/check.ts";
import { applyCommand } from "../../document/reducer.ts";
import { makeTextEdit, textLimitWords } from "../../document/rich-text.ts";
import { depthOf, locate } from "../../document/tree.ts";
import type { PageDocument } from "../../shared/document.ts";
import { MAX_NESTING } from "../../shared/validate.ts";
import type { EditorState } from "../../store/editor-store.ts";
import type { EditorEnv } from "../context.tsx";
import { COMMIT_AFTER_MS } from "../controls.tsx";
import { checkLink } from "./link-check.ts";
import { createTextEditor } from "./setup.ts";
import type { CaretAt, TextCommands, TextTools, WaitingKey } from "./tools.ts";

type Env = Pick<EditorEnv, "store" | "ui" | "clock">;

// The block's text as the page holds it: the object itself, which a page
// never changes in place, so a new object is a new text.
function storedText(doc: PageDocument, id: string): unknown {
  const block = locate(doc, id)?.block;
  return block?.type === "text" ? block.props.doc : undefined;
}

export class TextSession {
  readonly editor: Editor;
  readonly #env: Env;
  readonly #id: string;
  readonly #root: HTMLElement | null;
  // The text object the editor last matched: loaded, or handed over.
  #matched: unknown;
  #release: (() => void) | null = null;
  #timer: unknown = null;
  // A command of this editor's own is being applied.
  #applying = false;
  #stopped = false;
  #disposed = false;
  #linkOpen = false;
  readonly #unsubscribe: () => void;

  constructor(env: Env, id: string, element: HTMLElement, label: string, at: CaretAt) {
    this.#env = env;
    this.#id = id;
    this.#matched = storedText(env.store.getState().document, id);
    this.#root = element.closest<HTMLElement>("[data-block-id]");
    this.editor = createTextEditor({
      element,
      content: this.#matched,
      label,
      keys: { openLink: () => this.#commands.openLink(), leave: () => this.stop(true) },
      limits: { refuses: (json) => this.#refuses(json), deepestList: () => this.#deepestList(), say: (sentence) => env.ui.getState().say(sentence) },
      on: {
        onUpdate: () => this.#typed(),
        onTransaction: () => this.#publish(),
      },
    });
    this.#root?.addEventListener("focusout", this.#onFocusOut);
    this.#unsubscribe = env.store.subscribe((state) => this.#watch(state));
    this.#publish();
    this.#place(at);
    const opening = env.ui.getState().editingText;
    if (opening?.id === id && opening.keys && opening.keys.length > 0) {
      env.ui.setState({ editingText: { id, at: opening.at } });
      this.#typeWaiting(opening.keys);
    }
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  // Hands the text over as one command, if it waits, and closes TipTap's
  // history there: true once the page has it (or has nothing to take),
  // false when the page refused it, the hold kept and the reason said.
  // Bound, since the pending text calls it as it is.
  readonly deliver = (): boolean => {
    this.#clearTimer();
    const release = this.#release;
    this.#release = null;
    release?.();
    if (!this.editor.isDestroyed) this.editor.view.dispatch(closeHistory(this.editor.state.tr));
    const { store } = this.#env;
    const json = this.editor.getJSON();
    const made = makeTextEdit(store.getState().document, this.#id, json);
    if (!made.ok) {
      // The same text: nothing to keep. The block gone: nothing to keep it in.
      if (made.error.reason === "nothing" || made.error.reason === "unknown") return true;
      return this.#keep(made.error, json);
    }
    this.#applying = true;
    const outcome = store.getState().dispatch(made.command);
    this.#applying = false;
    if (!outcome.ok) return this.#keep(outcome.error, json);
    this.#matched = storedText(store.getState().document, this.#id);
    return true;
  };

  // A text the page refused: held again, so whatever asked for it waits,
  // and the reason said, with what to do.
  #keep(error: CommandError, json: unknown): false {
    if (!this.#disposed) this.#release ??= this.#env.ui.getState().pending.hold(this.deliver);
    const why = textLimitWords(error, json).replace(/\.$/, "");
    this.#env.ui.getState().say(`This text cannot be kept yet: ${why}. It stays open here until the page can take it.`);
    return false;
  }

  // Why the page would refuse this text, or null: the command that would
  // keep it, checked as the store checks it.
  #refuses(json: unknown): string | null {
    const page = this.#env.store.getState().document;
    const made = makeTextEdit(page, this.#id, json);
    if (!made.ok) return made.error.reason === "nothing" || made.error.reason === "unknown" ? null : textLimitWords(made.error, json);
    const applied = applyCommand(page, made.command);
    return applied.ok ? null : textLimitWords(applied.error, json);
  }

  // How many lists deep a list item of this text may stand: the block's
  // own depth on the page, then props, doc and its content; four levels
  // for each list (the list, its items, an item, its content); then a
  // paragraph holding a word with a link (the paragraph, its content, the
  // word, its marks, the mark, its attributes), all within MAX_NESTING.
  #deepestList(): number {
    const found = locate(this.#env.store.getState().document, this.#id);
    if (!found) return Number.POSITIVE_INFINITY;
    const aboveDoc = depthOf(found.path) + 4;
    return Math.floor((MAX_NESTING - aboveDoc - 6) / 4);
  }

  // Closes the editor: the text handed over, the canvas told, the focus
  // on the block itself when the person left with Esc. A text the page
  // refuses keeps it open, the focus back in it when asked: false.
  stop(focusBlock: boolean): boolean {
    if (this.#stopped) return true;
    if (this.#release && !this.deliver()) {
      if (focusBlock) this.#focusText();
      return false;
    }
    this.#stopped = true;
    const { ui } = this.#env;
    if (ui.getState().editingText?.id === this.#id) ui.setState({ editingText: null });
    if (ui.getState().textTools?.id === this.#id) ui.setState({ textTools: null });
    if (focusBlock) this.#root?.focus({ preventScroll: true });
    return true;
  }

  // The editor's element leaves the page: anything still waiting is
  // handed over, and the editor goes. React may mount it again at once
  // (its development checks do), and a new session then starts.
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#release && !this.#stopped) this.deliver();
    this.#clearTimer();
    this.#release?.();
    this.#release = null;
    this.#unsubscribe();
    this.#root?.removeEventListener("focusout", this.#onFocusOut);
    const { ui } = this.#env;
    if (ui.getState().textTools?.id === this.#id) ui.setState({ textTools: null });
    this.editor.destroy();
  }

  #typed(): void {
    const { ui, clock } = this.#env;
    this.#release ??= ui.getState().pending.hold(this.deliver);
    this.#clearTimer();
    this.#timer = clock.setTimeout(() => {
      this.#timer = null;
      this.deliver();
    }, COMMIT_AFTER_MS);
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    this.#env.clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #watch(state: EditorState): void {
    if (this.#stopped || this.#disposed || this.#applying) return;
    if (state.drag !== null || state.selection !== this.#id) {
      // Another block chosen while this text cannot be kept: the selection
      // comes back to it, rather than the typing going.
      if (!this.stop(false) && state.drag === null && storedText(state.document, this.#id) !== undefined) this.#env.store.getState().select(this.#id);
      return;
    }
    const text = storedText(state.document, this.#id);
    if (text === undefined || text !== this.#matched) this.stop(false);
  }

  readonly #onFocusOut = (event: FocusEvent): void => {
    if (this.#stopped || this.#disposed) return;
    const next = event.relatedTarget;
    // To the block's own bar or link field: still editing. To nothing,
    // with the window still focused (a click on the page's empty canvas):
    // done. To nothing because the window lost the focus: still editing.
    if (next instanceof Node ? this.#root?.contains(next) : !document.hasFocus()) return;
    this.stop(false);
  };

  // The caret where asked, and the focus in the text at once: TipTap's
  // own focus command waits for the next frame, and a key pressed in
  // between would go to the block (a Backspace deleting it).
  #place(at: CaretAt): void {
    const { view } = this.editor;
    const found = at === "end" ? null : view.posAtCoords({ left: at.x, top: at.y });
    const { doc } = view.state;
    view.dispatch(view.state.tr.setSelection(found ? TextSelection.near(doc.resolve(found.pos)) : Selection.atEnd(doc)).scrollIntoView());
    view.focus();
  }

  // The keys pressed for the text while its editor was on its way
  // (../keys.ts), typed into it now, as they would have been.
  #typeWaiting(keys: readonly WaitingKey[]): void {
    for (const { key, shift } of keys) {
      if (this.editor.isDestroyed) return;
      const { view } = this.editor;
      if (key === "Enter" || key === "Tab") {
        this.editor.commands.keyboardShortcut(`${shift ? "Shift-" : ""}${key}`);
      } else if (key === "Backspace" || key === "Delete") {
        this.#deleteOne(key === "Backspace" ? -1 : 1);
      } else {
        const { from, to } = view.state.selection;
        const handled = view.someProp("handleTextInput", (handle) => handle(view, from, to, key, () => view.state.tr.insertText(key, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(key, from, to));
      }
    }
  }

  // Backspace or Delete: the text's own keys first (a selection, the
  // edge of a paragraph or a list item), else the one character before or
  // after the caret, both halves of a pair at once.
  #deleteOne(direction: -1 | 1): void {
    const { view } = this.editor;
    const before = view.state;
    this.editor.commands.keyboardShortcut(direction < 0 ? "Backspace" : "Delete");
    if (!view.state.doc.eq(before.doc) || !view.state.selection.eq(before.selection)) return;
    const { $from, empty } = view.state.selection;
    const node = direction < 0 ? $from.nodeBefore : $from.nodeAfter;
    if (!empty || !node) return;
    const edge = node.isText ? (direction < 0 ? (node.text ?? "").slice(-2) : (node.text ?? "").slice(0, 2)) : "";
    const size = /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(edge) ? 2 : 1;
    const at = $from.pos;
    view.dispatch(direction < 0 ? view.state.tr.delete(at - size, at) : view.state.tr.delete(at, at + size));
  }

  #publish(): void {
    if (this.#stopped || this.#disposed || this.editor.isDestroyed) return;
    const { ui } = this.#env;
    const href = this.editor.getAttributes("link").href as unknown;
    const next: TextTools = {
      id: this.#id,
      bold: this.editor.isActive("bold"),
      italic: this.editor.isActive("italic"),
      link: typeof href === "string" ? href : null,
      linkOpen: this.#linkOpen,
      run: this.#commands,
    };
    const now = ui.getState().textTools;
    if (now && now.id === next.id && now.bold === next.bold && now.italic === next.italic && now.link === next.link && now.linkOpen === next.linkOpen && now.run === next.run) return;
    ui.setState({ textTools: next });
  }

  // The focus back in the text, at once: TipTap's own focus command waits
  // for the next frame, and by then the link field that had the focus is
  // gone and the focus with it, which would close the editor.
  #focusText(): void {
    if (!this.editor.isDestroyed) this.editor.view.focus();
  }

  readonly #commands: TextCommands = {
    toggleBold: () => {
      this.#focusText();
      this.editor.chain().toggleBold().run();
    },
    toggleItalic: () => {
      this.#focusText();
      this.editor.chain().toggleItalic().run();
    },
    openLink: () => {
      this.#linkOpen = true;
      this.#publish();
    },
    closeLink: (focusText) => {
      if (focusText) this.#focusText();
      this.#linkOpen = false;
      this.#publish();
    },
    applyLink: (raw) => {
      const checked = checkLink(raw);
      if (!checked.ok) return checked.reason;
      const { href } = checked;
      this.#focusText();
      const chain = this.editor.chain().extendMarkRange("link");
      if (this.editor.state.selection.empty && !this.editor.isActive("link")) {
        chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
      } else {
        chain.setLink({ href }).run();
      }
      this.#commands.closeLink(false);
      return null;
    },
    removeLink: () => {
      this.#focusText();
      this.editor.chain().extendMarkRange("link").unsetLink().run();
      this.#commands.closeLink(false);
    },
  };
}
