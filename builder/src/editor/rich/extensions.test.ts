// @vitest-environment jsdom
// The text editor writes the nodes and marks the schema's rich text has,
// with the attributes the schema takes, and no other: its schema, as the
// editor builds it with TipTap's own core extensions, against
// schema/block-document.schema.json. A mark planted in the list, and
// TipTap's link as it comes (with its title), each make the comparison
// fail. And the keys: Ctrl+B makes bold, Ctrl+U makes nothing.
import { Editor, Mark, type AnyExtension } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { afterEach, expect, test } from "vitest";
import schemaJson from "../../../../schema/block-document.schema.json";
import { SCHEMA_EXTENSIONS, textExtensions } from "./extensions.ts";

interface Node {
  readonly [key: string]: unknown;
}
const defs = (schemaJson as unknown as { $defs: Record<string, Node> }).$defs;
const def = (name: string): Node => {
  const found = defs[name];
  if (!found) throw new Error(`the schema has no $defs/${name}`);
  return found;
};
const props = (node: Node): Record<string, Node> => (node.properties ?? {}) as Record<string, Node>;
const typeConst = (name: string): string => props(def(name)).type!.const as string;
const typeEnum = (name: string): string[] => props(def(name)).type!.enum as string[];
const attrKeys = (name: string): string[] => Object.keys(props(props(def(name)).attrs ?? {}));

// The schema's rich text: each node and mark by name, with its attributes.
function schemaShape(): { nodes: Map<string, string[]>; marks: Map<string, string[]> } {
  const nodeDefs: Record<string, string> = { doc: "pmDoc", paragraph: "pmParagraph", bulletList: "pmBulletList", orderedList: "pmOrderedList", listItem: "pmListItem", text: "pmText", hardBreak: "pmHardBreak" };
  const names = [typeConst("pmDoc"), ...typeEnum("pmBlockNode"), typeConst("pmListItem"), ...typeEnum("pmInlineNode")];
  const nodes = new Map(names.map((name) => [name, attrKeys(nodeDefs[name] ?? `pm${name}`)]));
  const markDefs: Record<string, string> = { bold: "pmMarkBold", italic: "pmMarkItalic", link: "pmMarkLink" };
  const marks = new Map(typeEnum("pmMark").map((name) => [name, attrKeys(markDefs[name] ?? `pm${name}`)]));
  return { nodes, marks };
}

let editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

function editorOf(extensions: AnyExtension[], content: unknown = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold water" }] }] }): Editor {
  const editor = new Editor({ element: document.createElement("div"), extensions, injectCSS: false, content: content as never });
  editors.push(editor);
  return editor;
}

// What the editor would write that the schema does not take, and what the
// schema has that the editor cannot write: empty when they agree.
function differences(editor: Editor): string[] {
  const want = schemaShape();
  const out: string[] = [];
  const compare = (kind: "node" | "mark", have: Map<string, string[]>, schema: Map<string, string[]>) => {
    for (const [name, attrs] of have) {
      const allowed = schema.get(name);
      if (!allowed) {
        out.push(`the editor writes a ${kind} ${name} the schema does not have`);
        continue;
      }
      for (const attr of attrs) if (!allowed.includes(attr)) out.push(`the editor's ${kind} ${name} writes ${attr}, which the schema does not take`);
    }
    for (const name of schema.keys()) if (!have.has(name)) out.push(`the schema has a ${kind} ${name} the editor cannot write`);
  };
  const nodes = new Map(Object.values(editor.schema.nodes).map((type) => [type.name, Object.keys(type.spec.attrs ?? {})]));
  const marks = new Map(Object.values(editor.schema.marks).map((type) => [type.name, Object.keys(type.spec.attrs ?? {})]));
  compare("node", nodes, want.nodes);
  compare("mark", marks, want.marks);
  return out;
}

test("the editor's nodes and marks, and their attributes, are the schema's", () => {
  const editor = editorOf(textExtensions({ openLink: () => {}, leave: () => {} }));
  expect(differences(editor)).toEqual([]);
  // The comparison read what it compares: seven nodes, three marks.
  expect(Object.keys(editor.schema.nodes).sort()).toEqual(["bulletList", "doc", "hardBreak", "listItem", "orderedList", "paragraph", "text"]);
  expect(Object.keys(editor.schema.marks).sort()).toEqual(["bold", "italic", "link"]);
  expect(Object.keys(editor.schema.nodes.orderedList!.spec.attrs ?? {})).toEqual(["start", "type"]);
  expect(Object.keys(editor.schema.marks.link!.spec.attrs ?? {})).toEqual(["href"]);
});

test("a mark planted in the list fails the comparison, and so does TipTap's link as it comes", () => {
  const Underline = Mark.create({ name: "underline", parseHTML: () => [{ tag: "u" }], renderHTML: () => ["u", 0] });
  expect(differences(editorOf([...textExtensions(), Underline]))).toEqual(["the editor writes a mark underline the schema does not have"]);
  const stock = SCHEMA_EXTENSIONS.filter((extension) => extension.name !== "link");
  expect(differences(editorOf([...stock, Link]))).toEqual(["the editor's mark link writes title, which the schema does not take"]);
  expect(differences(editorOf(stock))).toEqual(["the schema has a mark link the editor cannot write"]);
});

function press(editor: Editor, key: string): void {
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));
}

test("Ctrl+B makes the selection bold, and Ctrl+U, a mark the schema does not have, does nothing", () => {
  const editor = editorOf(textExtensions());
  editor.commands.setTextSelection({ from: 1, to: 5 });
  press(editor, "u");
  expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold water" }] }] });
  // The same way in, a key the editor has: the keys do reach it.
  press(editor, "b");
  expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold", marks: [{ type: "bold" }] }, { type: "text", text: " water" }] }] });
});

test("a link takes only an address the URL policy and the schema take", () => {
  const editor = editorOf(textExtensions());
  editor.commands.setTextSelection({ from: 1, to: 5 });
  expect(editor.commands.setLink({ href: "javascript:alert(1)" })).toBe(false);
  expect(editor.commands.setLink({ href: "//elsewhere.example" })).toBe(false);
  expect(editor.commands.setLink({ href: "/swims" })).toBe(true);
  expect(editor.getJSON().content?.[0]?.content?.[0]).toEqual({ type: "text", text: "Cold", marks: [{ type: "link", attrs: { href: "/swims" } }] });
  expect(editor.getHTML()).toBe('<p><a href="/swims">Cold</a> water</p>');
});
