import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { ImageRender } from "./render.tsx";

// Added with its image: from the library ({mediaId, alt}), once its upload
// has finished, or from another site ({url, alt}).
export const image: WidgetDefinition<"image"> = {
  type: "image",
  group: "basic",
  label: TYPE_NAMES.image,
  icon,
  needs: "image",
  props: (source) => ({ ...source }),
  render: ImageRender,
  traps: [
    "m-image-library", "m-image-external", "m-image-site-path", "m-image-decorative", "m-image-missing-media",
    "m-image-javascript", "m-image-data", "m-image-http", "m-image-no-alt", "s-image-hidden", "s-image-cropped", "s-image-bad-crops",
  ],
};
