// The text editor's extensions, listed one by one: exactly the nodes and
// marks the schema's rich text has (schema/block-document.schema.json,
// $defs/pmDoc), and nothing a kit would turn on by itself. TipTap 3's
// starter kit brings underline, strike, code, headings, quotes and more,
// and a Ctrl+U there would make a text the server refuses.
// extensions.test.ts holds this list's nodes, marks and their attributes to
// the schema, and shows a mark planted in it failing that test.
//
// The link is TipTap's, cut to its href: the schema takes no title, and
// the renderers set target and rel themselves. It goes only where the URL
// policy and the schema let it (./link-check.ts), whether it is set from
// the link field or arrives in pasted HTML; a pasted address in plain text
// is not turned into a link by itself, and typing past a link does not
// stretch it.
//
// Loaded on demand with the editor (./TextEditor.tsx), never with the page.
import { Extension, type AnyExtension } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions/undo-redo";
import { entry, proseMirrorKeys, type KeyAction } from "../keymap.ts";
import { linkAllowed } from "./link-check.ts";

const TextLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("href"),
      },
    };
  },
  addPasteRules() {
    return [];
  },
}).configure({
  openOnClick: false,
  enableClickSelection: false,
  autolink: false,
  linkOnPaste: true,
  // Nothing besides the href on the <a>, as on the published page.
  HTMLAttributes: { target: null, rel: null, class: null },
  isAllowedUri: (url) => linkAllowed(url),
  shouldAutoLink: () => false,
});

// The keys of a keymap entry the text carries (../keymap.ts), each running
// the same command: the "?" window lists exactly the keys the text takes.
function keysOf(action: KeyAction, run: () => boolean): Record<string, () => boolean> {
  return Object.fromEntries(proseMirrorKeys(entry(action)).map((key) => [key, run]));
}

// Bold and italic by the keymap's keys only: TipTap's own also take them
// with Shift, which the window does not list.
const TextBold = Bold.extend({
  addKeyboardShortcuts() {
    return keysOf("bold", () => this.editor.commands.toggleBold());
  },
});
const TextItalic = Italic.extend({
  addKeyboardShortcuts() {
    return keysOf("italic", () => this.editor.commands.toggleItalic());
  },
});

// The keys the canvas gives the text besides TipTap's own: Ctrl+K opens
// the link's field, Esc leaves the text (src/editor/keymap.ts lists both).
export interface TextKeyActions {
  openLink(): void;
  leave(): void;
}

const TextKeys = Extension.create<TextKeyActions>({
  name: "textKeys",
  addOptions() {
    return { openLink: () => {}, leave: () => {} };
  },
  addKeyboardShortcuts() {
    return {
      ...keysOf("link", () => {
        this.options.openLink();
        return true;
      }),
      ...keysOf("leaveText", () => {
        this.options.leave();
        return true;
      }),
    };
  },
});

// The extensions that make nodes or marks, in the order they rank.
export const SCHEMA_EXTENSIONS: readonly AnyExtension[] = [
  Document, Paragraph, Text, HardBreak, BulletList, OrderedList, ListItem, TextBold, TextItalic, TextLink,
];

export function textExtensions(keys?: TextKeyActions): AnyExtension[] {
  return [
    ...SCHEMA_EXTENSIONS,
    // Backspace and Delete at a list item's edges, and the text's own
    // history (Ctrl+Z inside the text), which the canvas closes each time
    // the text becomes a change of the page.
    ListKeymap,
    UndoRedo,
    ...(keys ? [TextKeys.configure(keys)] : []),
  ];
}
