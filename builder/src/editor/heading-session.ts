// One heading written on the canvas, from the moment it opens to the
// moment it closes: the heading's line made editable as plain text, in
// the heading's own element (./HeadingEditor.tsx), and its words handed to
// the page as the sidebar's Text field hands them (makeSetProps), so the
// page's history takes one step per pause, as there; the typing waits in
// ./pending.ts meanwhile, which every other command and the start of every
// drag deliver first, as a text's does (./rich/text-session.ts).
//
// A heading is one line of at most 200 characters with at least one
// visible character (the schema's headingBlock):
// - Enter leaves it, as Esc does; a pasted paragraph becomes one line;
// - a character past the 200th is not typed, and a paste is cut to what
//   fits, the sentence saying so;
// - a heading emptied is not handed over: the sentence says why, the hold
//   stays, and it stays open until it has words again, as a text the page
//   refuses does.
//
// It closes as a text does: on Esc and Enter (the focus back on the block),
// when the focus leaves the block, when another block is chosen or a drag
// starts, and when its words change other than here (an undo from the top
// bar): the page drawn again is then the truth.
import type { CommandError } from "../document/check.ts";
import { makeSetProps } from "../document/commands.ts";
import { locate } from "../document/tree.ts";
import type { PageDocument } from "../shared/document.ts";
import type { EditorState } from "../store/editor-store.ts";
import type { EditorEnv } from "./context.tsx";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { refusalAt } from "./errors.ts";
import type { CaretAt, WaitingKey } from "./rich/tools.ts";

type Env = Pick<EditorEnv, "store" | "ui" | "clock">;

// What the page takes of a heading's text, in characters (code points, as
// both validators count them).
export const HEADING_MAX = 200;
const RULES = { kind: "line", maxLength: HEADING_MAX } as const;
const FIELD = "/props/text";

const length = (text: string) => [...text].length;

// The characters a line does not hold (the schema's lineControls: C0 and
// C1 control characters, line breaks among them, and the line and
// paragraph separators), each run of them one space.
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
}

export function oneLine(text: string): string {
  let out = "";
  let controls = false;
  for (const character of text) {
    if (isControl(character.codePointAt(0) ?? 0)) {
      if (!controls) out += " ";
      controls = true;
    } else {
      out += character;
      controls = false;
    }
  }
  return out;
}

function storedHeading(doc: PageDocument, id: string): string | undefined {
  const block = locate(doc, id)?.block;
  return block?.type === "heading" ? block.props.text : undefined;
}

export class HeadingSession {
  readonly #env: Env;
  readonly #id: string;
  readonly #element: HTMLElement;
  readonly #root: HTMLElement | null;
  // The words the line last matched: loaded, or handed over.
  #matched: string;
  #release: (() => void) | null = null;
  #timer: unknown = null;
  // A command of this line's own is being applied.
  #applying = false;
  #stopped = false;
  #disposed = false;
  readonly #unsubscribe: () => void;

  constructor(env: Env, id: string, element: HTMLElement, at: CaretAt) {
    this.#env = env;
    this.#id = id;
    this.#element = element;
    this.#matched = storedHeading(env.store.getState().document, id) ?? "";
    this.#root = element.closest<HTMLElement>("[data-block-id]");
    element.textContent = this.#matched;
    element.addEventListener("beforeinput", this.#onBeforeInput);
    element.addEventListener("input", this.#onInput);
    element.addEventListener("paste", this.#onPaste);
    element.addEventListener("keydown", this.#onKeyDown);
    this.#root?.addEventListener("focusout", this.#onFocusOut);
    this.#unsubscribe = env.store.subscribe((state) => this.#watch(state));
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

  // The words as the line holds them now, as the page would take them.
  get words(): string {
    return oneLine(this.#element.textContent ?? "");
  }

  // Hands the words over as one command, if they wait: true once the page
  // has them (or has nothing to take), false when the page refused them,
  // the hold kept and the reason said. Bound, since the pending typing
  // calls it as it is.
  readonly deliver = (): boolean => {
    this.#clearTimer();
    const release = this.#release;
    this.#release = null;
    release?.();
    const text = this.words;
    const { store } = this.#env;
    // The same words, or the block gone: nothing to keep.
    if (text === this.#matched || storedHeading(store.getState().document, this.#id) === undefined) return true;
    const made = makeSetProps(store.getState().document, this.#id, { text });
    if (!made.ok) return this.#keep(made.error);
    this.#applying = true;
    const outcome = store.getState().dispatch(made.command);
    this.#applying = false;
    if (!outcome.ok) return this.#keep(outcome.error);
    this.#matched = text;
    return true;
  };

  // Closes the line: the words handed over, the canvas told, the focus on
  // the block itself when the person left with Esc or Enter. Words the page
  // refuses keep it open, the focus back in it when asked: false.
  stop(focusBlock: boolean): boolean {
    if (this.#stopped) return true;
    if (this.#release && !this.deliver()) {
      if (focusBlock) this.#element.focus({ preventScroll: true });
      return false;
    }
    this.#stopped = true;
    const { ui } = this.#env;
    if (ui.getState().editingText?.id === this.#id) ui.setState({ editingText: null });
    if (focusBlock) this.#root?.focus({ preventScroll: true });
    return true;
  }

  // The line leaves the page: anything still waiting is handed over, and
  // the line goes. React may mount it again at once (its development
  // checks do), and a new session then starts.
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#release && !this.#stopped) this.deliver();
    this.#clearTimer();
    this.#release?.();
    this.#release = null;
    this.#unsubscribe();
    const element = this.#element;
    element.removeEventListener("beforeinput", this.#onBeforeInput);
    element.removeEventListener("input", this.#onInput);
    element.removeEventListener("paste", this.#onPaste);
    element.removeEventListener("keydown", this.#onKeyDown);
    this.#root?.removeEventListener("focusout", this.#onFocusOut);
  }

  // Words the page refused: held again, so whatever asked for them waits,
  // and the reason said, with what to do.
  #keep(error: CommandError): false {
    if (!this.#disposed) this.#release ??= this.#env.ui.getState().pending.hold(this.deliver);
    const why = refusalAt(error, FIELD, RULES).replace(/\.$/, "");
    this.#env.ui.getState().say(`This heading cannot be kept yet: ${why}. It stays open here until the page can take it.`);
    return false;
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

  // How many characters the selection holds, inside the line.
  #selected(): number {
    const selection = this.#element.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.#element.contains(selection.anchorNode)) return 0;
    return length(selection.toString());
  }

  // Room left for new characters, the selection's own given back.
  #room(): number {
    return HEADING_MAX - (length(this.words) - this.#selected());
  }

  #say(sentence: string): void {
    this.#env.ui.getState().say(sentence);
  }

  #watch(state: EditorState): void {
    if (this.#stopped || this.#disposed || this.#applying) return;
    if (state.drag !== null || state.selection !== this.#id) {
      // Another block chosen while these words cannot be kept: the
      // selection comes back to the heading, rather than the typing going.
      if (!this.stop(false) && state.drag === null && storedHeading(state.document, this.#id) !== undefined) this.#env.store.getState().select(this.#id);
      return;
    }
    const text = storedHeading(state.document, this.#id);
    if (text === undefined || text !== this.#matched) this.stop(false);
  }

  readonly #onInput = (): void => {
    if (this.#stopped || this.#disposed) return;
    this.#typed();
  };

  // One line, of at most HEADING_MAX characters: a break leaves the line,
  // and what would pass the limit is not typed. Deleting, and the line's
  // own undo and redo, go as they come.
  readonly #onBeforeInput = (event: InputEvent): void => {
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      this.stop(true);
      return;
    }
    if (!event.inputType.startsWith("insert") || event.inputType === "insertFromPaste") return;
    const data = oneLine(event.data ?? event.dataTransfer?.getData("text/plain") ?? "");
    if (length(data) <= this.#room()) return;
    event.preventDefault();
    this.#say(`A heading takes up to ${HEADING_MAX} characters.`);
  };

  // A paste is plain text on one line, cut to what fits. The editor's own
  // paste, which adds copied blocks after the selection (./keys.ts), is
  // not for it.
  readonly #onPaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const pasted = oneLine(event.clipboardData?.getData("text/plain") ?? "");
    const room = Math.max(0, this.#room());
    const fits = [...pasted].slice(0, room).join("");
    if (fits.length < pasted.length) this.#say(`A heading takes up to ${HEADING_MAX} characters: the rest of what was pasted is left out.`);
    if (fits !== "") this.#insert(fits);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape" || (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.stop(true);
    }
  };

  readonly #onFocusOut = (event: FocusEvent): void => {
    if (this.#stopped || this.#disposed) return;
    const next = event.relatedTarget;
    // Still in the block: still writing. To nothing, with the window still
    // focused (a click on the page's empty canvas): done. To nothing
    // because the window lost the focus: still writing.
    if (next instanceof Node ? this.#root?.contains(next) : !document.hasFocus()) return;
    this.stop(false);
  };

  // Text at the caret, as typing puts it there: the line's own undo takes
  // it back, and its input event follows.
  #insert(text: string): void {
    const doc = this.#element.ownerDocument;
    let typed = false;
    try {
      typed = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text);
    } catch {
      // A document without the command: the text goes in by hand below.
    }
    if (typed) return;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.#element.contains(selection.anchorNode)) {
      this.#element.append(text);
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(doc.createTextNode(text));
      range.collapse(false);
    }
    this.#element.normalize();
    this.#typed();
  }

  // The caret where asked (the point of the click, else the end), and the
  // focus in the line at once: a key pressed in between would go to the
  // block, where a Backspace deletes it.
  #place(at: CaretAt): void {
    const element = this.#element;
    const doc = element.ownerDocument as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let range: Range | null = null;
    if (at !== "end") {
      const position = doc.caretPositionFromPoint?.(at.x, at.y);
      if (position && element.contains(position.offsetNode)) {
        range = doc.createRange();
        range.setStart(position.offsetNode, position.offset);
      } else {
        const found = doc.caretRangeFromPoint?.(at.x, at.y);
        if (found && element.contains(found.startContainer)) range = found;
      }
    }
    // A point outside the words (past the line's end, under it): the end.
    if (range) {
      range.collapse(true);
    } else {
      range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
    }
    element.focus({ preventScroll: true });
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  // The keys pressed for the heading while it was opening (./keys.ts),
  // typed into it now, at the caret, as they would have been: Enter
  // leaves, Backspace and Delete take one character, a character goes in
  // while there is room.
  #typeWaiting(keys: readonly WaitingKey[]): void {
    for (const { key } of keys) {
      if (this.#stopped) return;
      if (key === "Enter") {
        this.stop(true);
      } else if (key === "Backspace" || key === "Delete") {
        const text = [...this.words];
        if (text.length > 0) {
          this.#element.textContent = (key === "Backspace" ? text.slice(0, -1) : text.slice(1)).join("");
          this.#place("end");
          this.#typed();
        }
      } else if (key !== "Tab" && length(key) === 1) {
        if (this.#room() < 1) this.#say(`A heading takes up to ${HEADING_MAX} characters.`);
        else this.#insert(key);
      }
    }
  }
}
