// A block's icon, as the panel's title, the navigator and the dragged
// tile draw it: the chrome's section and column icons, a widget's tile icon.
import type { BlockType } from "../shared/document.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { widgetDefinition } from "../widgets/registry.ts";
import { Icon } from "./icons.tsx";

export function BlockIcon({ type, className = "i i-tile" }: { type: BlockType; className?: string }) {
  if (type === "section") return <Icon name="section" className={className} />;
  if (type === "column") return <Icon name="column" className={className} />;
  return <WidgetIcon icon={widgetDefinition(type).icon} className={className} />;
}
