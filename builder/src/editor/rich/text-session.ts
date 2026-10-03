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
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { makeTextEdit } from "../../document/rich-text.ts";
import { locate } from "../../document/tree.ts";
import type { PageDocument } from "../../shared/document.ts";
import type { EditorState } from "../../store/editor-store.ts";
import type { EditorEnv } from "../context.tsx";
import { COMMIT_AFTER_MS } from "../controls.tsx";
import { checkLink } from "./link-check.ts";
import { createTextEditor } from "./setup.ts";
import type { CaretAt, TextCommands, TextTools } from "./tools.ts";

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
      on: {
        onUpdate: () => this.#typed(),
        onTransaction: () => this.#publish(),
      },
    });
    this.#root?.addEventListener("focusout", this.#onFocusOut);
    this.#unsubscribe = env.store.subscribe((state) => this.#watch(state));
    this.#publish();
    this.#place(at);
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  // Hands the text over as one command, if it waits, and closes TipTap's
  // history there. Bound, since the pending text calls it as it is.
  readonly deliver = (): void => {
    this.#clearTimer();
    const release = this.#release;
    this.#release = null;
    release?.();
    if (!this.editor.isDestroyed) this.editor.view.dispatch(closeHistory(this.editor.state.tr));
    const { store, ui } = this.#env;
    const made = makeTextEdit(store.getState().document, this.#id, this.editor.getJSON());
    if (!made.ok) {
      // The same text: nothing to keep. The block gone: nothing to keep it in.
      if (made.error.reason !== "nothing" && made.error.reason !== "unknown") ui.getState().say(`The text could not be kept: ${made.error.message}`);
      return;
    }
    this.#applying = true;
    const outcome = store.getState().dispatch(made.command);
    this.#applying = false;
    if (outcome.ok) this.#matched = storedText(store.getState().document, this.#id);
    else ui.getState().say(`The text could not be kept: ${outcome.error.message}`);
  };

  // Closes the editor: the text handed over, the canvas told, the focus
  // on the block itself when the person left with Esc.
  stop(focusBlock: boolean): void {
    if (this.#stopped) return;
    this.#stopped = true;
    if (this.#release) this.deliver();
    const { ui } = this.#env;
    if (ui.getState().editingText?.id === this.#id) ui.setState({ editingText: null });
    if (ui.getState().textTools?.id === this.#id) ui.setState({ textTools: null });
    if (focusBlock) this.#root?.focus({ preventScroll: true });
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
    if (state.drag !== null || state.selection !== this.#id) return this.stop(false);
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

  #place(at: CaretAt): void {
    if (at === "end") {
      this.editor.commands.focus("end");
      return;
    }
    const found = this.editor.view.posAtCoords({ left: at.x, top: at.y });
    this.editor.commands.focus(found ? found.pos : "end");
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

  readonly #commands: TextCommands = {
    toggleBold: () => {
      this.editor.chain().focus().toggleBold().run();
    },
    toggleItalic: () => {
      this.editor.chain().focus().toggleItalic().run();
    },
    openLink: () => {
      this.#linkOpen = true;
      this.#publish();
    },
    closeLink: (focusText) => {
      this.#linkOpen = false;
      this.#publish();
      if (focusText) this.editor.commands.focus();
    },
    applyLink: (raw) => {
      const checked = checkLink(raw);
      if (!checked.ok) return checked.reason;
      const { href } = checked;
      const chain = this.editor.chain().focus().extendMarkRange("link");
      if (this.editor.state.selection.empty && !this.editor.isActive("link")) {
        chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
      } else {
        chain.setLink({ href }).run();
      }
      this.#commands.closeLink(false);
      return null;
    },
    removeLink: () => {
      this.editor.chain().focus().extendMarkRange("link").unsetLink().run();
      this.#commands.closeLink(false);
    },
  };
}
