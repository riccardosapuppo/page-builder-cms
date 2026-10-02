// A widget's panel, as its folder exports it (../../widgets/<widget>/panel.tsx):
// the Content tab, which is the widget's own. The Style tab is drawn from the
// style settings the widget's type accepts (STYLE_KEYS_BY_TYPE) and the
// Advanced tab is the same for every block, so a widget writes only what is
// its own.
import type { ComponentType } from "react";
import type { BlockOfType, WidgetType } from "../../shared/document.ts";

export interface ContentProps<T extends WidgetType> {
  block: BlockOfType<T>;
}

export interface WidgetPanel<T extends WidgetType> {
  Content: ComponentType<ContentProps<T>>;
}
