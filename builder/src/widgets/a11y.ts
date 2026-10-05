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
import type { WidgetType } from "../shared/document.ts";

// One thing a case exposes to assistive technology, found by its role
// inside the block: count of them (1 when not said), with this accessible
// name and, for a heading, level; for a form's field, whether the
// accessibility tree says it is required, which a screen reader announces.
export interface Exposed {
  role: "heading" | "link" | "img" | "separator" | "list" | "listitem" | "figure" | "blockquote" | "group" | "paragraph" | "textbox" | "checkbox" | "button";
  name?: string;
  level?: number;
  count?: number;
  required?: boolean;
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
}

// The images the cases show "from another site": the browser tests answer
// these addresses themselves, so nothing leaves the machine.
export const PICTURE = (name: string) => `https://images.example.org/${name}.png`;
