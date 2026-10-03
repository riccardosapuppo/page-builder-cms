// The text editor as the canvas makes it, and as the tests make it: the
// same extensions, the same handling of what is pasted, the same
// attributes for a screen reader. TipTap's own stylesheet is not injected:
// it turns ligatures off and wraps spaces its own way, and the text being
// edited must lay out exactly as the page lays it out (editor.css has the
// little the editing needs).
import { Editor, type EditorOptions } from "@tiptap/core";
import { cleanPastedText } from "../../document/rich-text.ts";
import { textExtensions, type TextKeyActions } from "./extensions.ts";
import { TextLimitsGuard, type TextLimits } from "./limits.ts";
import { cleanPastedHtml } from "./paste.ts";

export interface TextEditorSetup {
  // Where the editor's own element is: this element becomes it (the
  // contenteditable), so the text's paragraphs sit one level below the
  // block, as near as the page's stylesheet can follow.
  element: HTMLElement | null;
  content: unknown;
  // What a screen reader calls the text.
  label: string;
  keys?: TextKeyActions;
  // What the page takes of the text (./limits.ts): a change past it is not
  // made, and a paste is cut to it.
  limits?: TextLimits;
  on?: Partial<Pick<EditorOptions, "onUpdate" | "onSelectionUpdate" | "onTransaction" | "onFocus" | "onBlur">>;
}

export function createTextEditor({ element, content, label, keys, limits, on = {} }: TextEditorSetup): Editor {
  return new Editor({
    element: element ? { mount: element } : null,
    extensions: [...textExtensions(keys), ...(limits ? [TextLimitsGuard.configure({ limits })] : [])],
    content: content as EditorOptions["content"],
    injectCSS: false,
    editorProps: {
      attributes: { "aria-label": label, "aria-multiline": "true", class: "rte" },
      transformPastedHTML: cleanPastedHtml,
      transformPastedText: cleanPastedText,
    },
    ...on,
  });
}
