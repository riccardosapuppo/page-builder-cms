// What the page takes of a text is held while it is written, not found out
// when the text is handed over. The schema counts a text's paragraphs and
// lists (500), a paragraph's runs and line breaks (2000), a list's items
// (500), a list item's parts (50), and the page refuses objects nested
// deeper than 64, which a list nested about twelve deep in a text block
// reaches. A text past any of them is one the page cannot keep: handed over
// it is refused, and everything typed with it would have nowhere to go.
//
// So no change of the editor's makes such a text: a key (Enter, Tab), a
// mark, a link or typing that would is not done, and says why; a paste is
// cut to what fits (whole paragraphs and lists first, else the first one
// cut short), and says so. Whether a text fits is asked of the page itself
// (`refuses`, ./text-session.ts: the command that would keep it, checked as
// the store would check it), so the limits are the schema's and the
// application rules' own, from the block's place on the page. Lists keep a
// margin besides: a level is refused where a word typed in it, made a
// link, would pass the page's nesting (`deepestList`), so no Tab opens a
// list item nothing can be typed into.
import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

export interface TextLimits {
  // Why the page would refuse this text (the editor's JSON), in words the
  // person can act on, or null when it takes it.
  refuses(json: unknown): string | null;
  // How many lists deep a list item may stand, a linked word in it still
  // within the page's nesting.
  deepestList(): number;
  say(sentence: string): void;
}

export const NESTED_TOO_DEEP = "lists cannot be nested any deeper in a text";

// How many lists deep the deepest list item of a text stands.
export function listDepth(node: ProseMirrorNode): number {
  if (node.isTextblock) return 0;
  let deepest = 0;
  node.forEach((child) => {
    const inner = listDepth(child);
    deepest = Math.max(deepest, child.type.name === "bulletList" || child.type.name === "orderedList" ? inner + 1 : inner);
  });
  return deepest;
}

// Why the page would refuse the text `next`, made from `before`, or null.
// A text already deeper than the margin may still be changed, so long as
// no list goes deeper.
export function refusalOf(next: ProseMirrorNode, before: ProseMirrorNode, limits: Pick<TextLimits, "refuses" | "deepestList">): string | null {
  const deepest = listDepth(next);
  if (deepest > limits.deepestList() && deepest > listDepth(before)) return NESTED_TOO_DEEP;
  return limits.refuses(next.toJSON());
}

const sentence = (lead: string, why: string) => `${lead}: ${why.replace(/\.$/, "")}.`;

// The paste, or as much of its start as the text can take; why it was cut,
// or null when it was not.
export function fitPaste(slice: Slice, state: EditorState, limits: Pick<TextLimits, "refuses" | "deepestList">): { slice: Slice; why: string | null } {
  const result = (candidate: Slice) => state.tr.replaceSelection(candidate).doc;
  const whole = refusalOf(result(slice), state.doc, limits);
  if (whole === null) return { slice, why: null };
  // What pasting nothing would leave (the selection gone): a start of the
  // paste that leaves the same keeps nothing of it.
  const nothing = result(Slice.empty);
  const refusal = (candidate: Slice): string | null => {
    const doc = result(candidate);
    return doc.eq(nothing) ? "nothing" : refusalOf(doc, state.doc, limits);
  };
  // A start of the paste, open where the paste was, as far as it still can.
  const first = (fragment: Fragment): Slice => {
    if (fragment.size === 0) return Slice.empty;
    const open = Slice.maxOpen(fragment);
    return new Slice(fragment, Math.min(slice.openStart, open.openStart), Math.min(slice.openEnd, open.openEnd));
  };
  const byNodes = (count: number): Slice => {
    let size = 0;
    for (let index = 0; index < count; index += 1) size += slice.content.child(index).nodeSize;
    return first(slice.content.cut(0, size));
  };
  // The most that fits, the text growing as `n` grows: the largest `n` in
  // [low, high] for which `fits(n)`, or low - 1.
  const most = (low: number, high: number, fits: (n: number) => boolean): number => {
    let found = low - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(middle)) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  };
  const nodes = most(1, slice.content.childCount - 1, (n) => refusal(byNodes(n)) === null);
  if (nodes >= 1) return { slice: byNodes(nodes), why: whole };
  // Not even the first paragraph or list whole: as much of it as fits.
  const firstSize = slice.content.firstChild?.nodeSize ?? 0;
  const positions = most(1, firstSize - 1, (n) => refusal(first(slice.content.cut(0, n))) === null);
  if (positions >= 1) {
    const cut = first(slice.content.cut(0, positions));
    if (cut.content.size > 0) return { slice: cut, why: whole };
  }
  return { slice: Slice.empty, why: whole };
}

const KEY = new PluginKey("textLimits");

export const TextLimitsGuard = Extension.create<{ limits: TextLimits | null }>({
  name: "textLimits",
  addOptions() {
    return { limits: null };
  },
  addProseMirrorPlugins() {
    const { limits } = this.options;
    if (!limits) return [];
    // A paste is cut in transformPasted, so the transaction that follows is
    // one the page takes; the sentence then said is the cut's.
    let cutSaid = false;
    return [
      new Plugin({
        key: KEY,
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          const why = refusalOf(tr.doc, state.doc, limits);
          if (why === null) return true;
          const pasted = tr.getMeta("uiEvent") === "paste" || tr.getMeta("uiEvent") === "drop";
          if (!(pasted && cutSaid)) limits.say(sentence(pasted ? "The paste was not kept" : "Not done", why));
          cutSaid = false;
          return false;
        },
        props: {
          transformPasted(slice, view) {
            cutSaid = false;
            const fitted = fitPaste(slice, view.state, limits);
            if (fitted.why !== null) {
              limits.say(sentence(fitted.slice.size > 0 ? "Only the start of the paste was kept" : "The paste was not kept", fitted.why));
              cutSaid = true;
            }
            return fitted.slice;
          },
        },
      }),
    ];
  },
});
