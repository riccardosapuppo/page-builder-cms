// The accessibility test of a widget, as data: the cases a widget's folder
// gives in its a11y.ts, each a block's props and what a screen reader must
// find in it once it is drawn. e2e/widgets.spec.ts saves every case to the
// CMS, publishes it, and holds the published page and the editor's canvas
// to it: what each case exposes, by role, name and level, and axe with no
// serious or critical finding. registry.test.ts holds every widget to having
// one, with at least one case.
//
// Plain data with type imports only, so the browser tests can read it
// without the editor's build.
import type { Field } from "../shared/collection.ts";
import type { WidgetType } from "../shared/document.ts";

// One thing a case exposes to assistive technology, found by its role
// inside the block: count of them (1 when not said), with this accessible
// name and, for a heading, level; for a form's field, whether the
// accessibility tree says it is required, which a screen reader announces.
// A stats block's figures are the terms and definitions of a description
// list. For a role whose words are no name (a paragraph: a pricing plan's
// badge), the words the tree reads in it: only those of the role that hold
// them are counted.
export interface Exposed {
  role: "heading" | "link" | "img" | "separator" | "list" | "listitem" | "figure" | "blockquote" | "group" | "paragraph" | "textbox" | "checkbox" | "button" | "navigation" | "term" | "definition";
  name?: string;
  level?: number;
  count?: number;
  required?: boolean;
  text?: string;
}

export interface A11yCase {
  // What the case is, in a few words: "a heading that is a link".
  name: string;
  props: Record<string, unknown>;
  exposes: readonly Exposed[];
  // Hidden from assistive technology as a whole (a spacer).
  hidden?: true;
}

export interface WidgetA11y {
  type: WidgetType;
  cases: readonly A11yCase[];
  // What the cases draw from, made on the CMS before they are published:
  // a collection with its fields and its entries, each published, whose id
  // stands in the cases' props as A11Y_COLLECTION (a Collection list's).
  collection?: A11yCollection;
  // Drawn in that collection's template, on its first entry's page, rather
  // than on a page of their own (a Field block's, which only a template
  // holds), and on the canvas with that entry.
  inTemplate?: true;
}

export interface A11yCollection {
  name: string;
  fields: readonly Field[];
  // In the order they are made and published.
  entries: ReadonlyArray<{ title: string; slug: string; values: Readonly<Record<string, unknown>> }>;
}

// The id a case names its collection by, which the browser test replaces
// with the one the CMS made.
export const A11Y_COLLECTION = 1;

// The images the cases show "from another site": the browser tests answer
// these addresses themselves, so nothing leaves the machine.
export const PICTURE = (name: string) => `https://images.example.org/${name}.png`;
