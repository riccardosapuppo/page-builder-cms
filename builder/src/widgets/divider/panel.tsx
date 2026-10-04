// The divider's panel. A divider is a line and holds nothing of its own:
// its one setting, the line's colour, is its Line color group, drawn from
// the style keys its type accepts (../../editor/panels/groups.tsx).
import type { WidgetPanel } from "../../editor/panels/types.ts";

export const panel: WidgetPanel<"divider"> = { content: null };
