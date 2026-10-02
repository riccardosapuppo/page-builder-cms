import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { GalleryRender } from "./render.tsx";

// Added with its first images: the schema wants at least one.
export const gallery: WidgetDefinition<"gallery"> = {
  type: "gallery",
  group: "media",
  label: TYPE_NAMES.gallery,
  icon,
  needs: "images",
  props: (items) => ({ items: items.map((item) => ({ ...item })) }),
  render: GalleryRender,
  traps: ["m-gallery", "e-gallery-one"],
};
