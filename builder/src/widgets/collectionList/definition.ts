import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { LIST_DEFAULTS } from "./cards.ts";
import { icon } from "./icon.ts";
import { CollectionListRender } from "./render.tsx";

// Offered only where the storage keeps collections (../../editor/insert.ts).
// A new list names the collection Insert found first and follows its
// order, when Insert knows one (InputOf); otherwise it starts with none
// chosen, and its panel asks for one. Three entries, newest first, in a
// grid of three, each card ending in "Read more".
export const collectionList: WidgetDefinition<"collectionList"> = {
  type: "collectionList",
  group: "content",
  label: TYPE_NAMES.collectionList,
  icon,
  needs: null,
  props: (start) => ({
    ...(start ? { collection: start.collection } : {}),
    count: LIST_DEFAULTS.count,
    order: start ? { ...start.order } : { by: "publishedAt", direction: "desc" },
    layout: LIST_DEFAULTS.layout,
    columns: LIST_DEFAULTS.columns,
    linkLabel: "Read more",
    emptyText: "Nothing here yet.",
  }),
  render: CollectionListRender,
  traps: [
    "c-list-grid", "c-list-list", "c-list-compact", "c-list-markup", "c-list-missing", "c-list-unchosen", "c-list-no-field", "c-list-filter-gone",
    "c-list-bad-filter", "c-list-bad-props", "c-list-bad-values", "c-list-styled", "tf-list-in-template",
  ],
};
