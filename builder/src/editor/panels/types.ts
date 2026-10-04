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

export interface WidgetPanel<T extends WidgetType> {
  // null for a widget with no content of its own: a divider, whose one
  // setting is its line's colour.
  content: { name: string; Content: ComponentType<ContentProps<T>> } | null;
}
