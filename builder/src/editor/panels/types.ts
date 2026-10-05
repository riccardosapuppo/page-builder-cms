// A widget's panel, as its folder exports it (../../widgets/<widget>/panel.tsx):
// the group of its own content, first in the Block tab, named after what it
// holds ("Text", "Button", "Questions"). The groups of its style settings
// are drawn from the keys its type accepts (STYLE_KEYS_BY_TYPE), and Shown
// on is the same for every block (./groups.tsx), so a widget writes only
// what is its own.
import type { ComponentType } from "react";
import type { BlockOfType, WidgetType } from "../../shared/document.ts";

export interface ContentProps<T extends WidgetType> {
  block: BlockOfType<T>;
}

// A further group of a widget's own, after its first, for a widget with
// more to set than one group holds well (a form: its fields, then its
// button and message). It holds the props it names, with everything under
// them, so the server's error on one of them opens this group and not the
// first; it says `summary` while closed.
export interface WidgetGroup<T extends WidgetType> {
  // Its key in the person's open groups.
  id: string;
  name: string;
  props: readonly string[];
  summary: (block: BlockOfType<T>) => string;
  Content: ComponentType<ContentProps<T>>;
}

export interface WidgetPanel<T extends WidgetType> {
  // null for a widget with no content of its own: a divider, whose one
  // setting is its line's colour.
  content: { name: string; Content: ComponentType<ContentProps<T>> } | null;
  more?: readonly WidgetGroup<T>[];
}
