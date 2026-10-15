// An entry's rich text, written in the text widget's own editor
// (../rich/setup.ts): the same nodes and marks, the same cleaning of what
// is pasted, the same limits held while it is written (here an entry's,
// ./values.ts), and the canvas's link field under it (../rich/FormatBar.tsx).
// Bold, italic and link sit above the text, where the canvas has them on
// the block's toolbar. TipTap's own history is the text's: Ctrl+Z inside
// it undoes the typing, and the entry's Save keeps the text as it is then.
//
// A chunk of its own, with TipTap and ProseMirror, as the canvas's editor
// is: the default export, for React's lazy() (./FieldInput.tsx).
import type { Editor } from "@tiptap/core";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { sameJson } from "../../document/json.ts";
import { richTextFromEditor } from "../../document/rich-text.ts";
import type { RichTextDoc } from "../../shared/document.ts";
import { Icon } from "../icons.tsx";
import { ariaKeyShortcuts, entry } from "../keymap.ts";
import { LinkField } from "../rich/FormatBar.tsx";
import { checkLink } from "../rich/link-check.ts";
import { createTextEditor } from "../rich/setup.ts";
import type { TextCommands, TextTools } from "../rich/tools.ts";
import { emptyRichText } from "./values.ts";

export interface RichTextProps {
  // What a screen reader calls the text: the field's label.
  label: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  value: RichTextDoc | null;
  // The text as the schema keeps it, or null when nothing is written.
  onChange: (doc: RichTextDoc | null) => void;
  // Why an entry would not take this text, or null.
  refuses: (doc: RichTextDoc) => string | null;
  deepestList: number;
  // A change the limits did not make, or a paste they cut, in a sentence.
  onSay: (sentence: string) => void;
}

const EMPTY: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };

interface Marks {
  bold: boolean;
  italic: boolean;
  link: string | null;
}

export default function RichText({ label, describedBy, invalid, required, value, onChange, refuses, deepestList, onSay }: RichTextProps) {
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [marks, setMarks] = useState<Marks>({ bold: false, italic: false, link: null });
  const [linkOpen, setLinkOpen] = useState(false);
  // What the latest render was given, for the editor's callbacks.
  const latest = useRef({ onChange, refuses, deepestList, onSay });
  useLayoutEffect(() => {
    latest.current = { onChange, refuses, deepestList, onSay };
  });
  // The text this field last handed over, or was given: a value that
  // differs from it comes from elsewhere (the entry read again).
  const handed = useRef<RichTextDoc | null>(value);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const made = createTextEditor({
      element,
      content: handed.current ?? EMPTY,
      label,
      keys: { openLink: () => setLinkOpen(true), leave: () => {} },
      limits: {
        refuses: (json) => latest.current.refuses(richTextFromEditor(json)),
        deepestList: () => latest.current.deepestList,
        say: (sentence) => latest.current.onSay(sentence),
      },
      on: {
        onUpdate: ({ editor: changed }) => {
          const doc = richTextFromEditor(changed.getJSON());
          const next = emptyRichText(doc) ? null : doc;
          handed.current = next;
          latest.current.onChange(next);
        },
        onTransaction: ({ editor: changed }) => {
          const href = changed.getAttributes("link").href as unknown;
          setMarks((before) => {
            const now = { bold: changed.isActive("bold"), italic: changed.isActive("italic"), link: typeof href === "string" ? href : null };
            return before.bold === now.bold && before.italic === now.italic && before.link === now.link ? before : now;
          });
        },
      },
    });
    setEditor(made);
    return () => {
      made.destroy();
      setEditor(null);
    };
    // The editor is made once: its label and its text are read as it
    // opens, and a text read again later comes in by the effect below.
  }, [label]);

  // The entry read again (Reload, after another tab saved it): the text
  // shown is the one read, not a change of this field's.
  useEffect(() => {
    if (!editor || sameJson(value, handed.current)) return;
    handed.current = value;
    editor.commands.setContent(value ?? EMPTY, { emitUpdate: false });
  }, [editor, value]);

  // The editor's element is TipTap's own; the attributes a field has are
  // set on it as the form's change.
  useEffect(() => {
    const element = editor?.view.dom;
    if (!element) return;
    const set = (name: string, on: string | undefined) => (on === undefined ? element.removeAttribute(name) : element.setAttribute(name, on));
    set("aria-describedby", describedBy);
    set("aria-invalid", invalid ? "true" : undefined);
    set("aria-required", required ? "true" : undefined);
  }, [editor, describedBy, invalid, required]);

  const focusText = () => {
    if (editor && !editor.isDestroyed) editor.view.focus();
  };
  const run: TextCommands = {
    toggleBold: () => {
      focusText();
      editor?.chain().toggleBold().run();
    },
    toggleItalic: () => {
      focusText();
      editor?.chain().toggleItalic().run();
    },
    openLink: () => setLinkOpen(true),
    closeLink: (back) => {
      setLinkOpen(false);
      if (back) focusText();
    },
    applyLink: (raw) => {
      if (!editor) return null;
      const checked = checkLink(raw);
      if (!checked.ok) return checked.reason;
      const { href } = checked;
      focusText();
      const chain = editor.chain().extendMarkRange("link");
      if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
      else chain.setLink({ href }).run();
      setLinkOpen(false);
      return null;
    },
    removeLink: () => {
      focusText();
      editor?.chain().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
    },
  };
  const tools: TextTools = { id: label, ...marks, linkOpen, run };

  return (
    <div className={`co-rte${invalid ? " co-rte-invalid" : ""}`}>
      <div className="co-rte-bar" role="toolbar" aria-label={`${label}: formatting`}>
        <button className="ibtn ibtn-small" type="button" aria-label="Bold" aria-pressed={marks.bold} aria-keyshortcuts={ariaKeyShortcuts(entry("bold"))} onMouseDown={(event) => event.preventDefault()} onClick={run.toggleBold}><Icon name="bold" className="i i-xs" /></button>
        <button className="ibtn ibtn-small" type="button" aria-label="Italic" aria-pressed={marks.italic} aria-keyshortcuts={ariaKeyShortcuts(entry("italic"))} onMouseDown={(event) => event.preventDefault()} onClick={run.toggleItalic}><Icon name="italic" className="i i-xs" /></button>
        <button className="ibtn ibtn-small" type="button" aria-label="Link" aria-pressed={marks.link !== null || linkOpen} aria-keyshortcuts={ariaKeyShortcuts(entry("link"))} aria-expanded={linkOpen} onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkOpen(!linkOpen)}><Icon name="link" className="i i-xs" /></button>
      </div>
      <div ref={host} className="co-rte-text" />
      {linkOpen && (
        // Esc in the link's field goes back to the text: the screen around
        // it stays open.
        <div className="co-rte-link" onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape") event.stopPropagation();
        }}>
          <LinkField tools={tools} />
        </div>
      )}
    </div>
  );
}
