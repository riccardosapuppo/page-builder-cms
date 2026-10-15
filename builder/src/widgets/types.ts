// What a widget is to the editor: its definition. Each widget's folder
// exports one, and registry.ts lists them in the Insert drawer's order.
import type { ComponentType } from "react";
import type { BlockRenderProps } from "../render/context.ts";
import type { Shape } from "../render/drawings.tsx";
import type { BlockOfType, ImageRef, PropsOf, VideoProvider, WidgetType } from "../shared/document.ts";

// The Insert drawer's and the picker's groups, in the approved design's
// order.
export const WIDGET_GROUPS = [
  { id: "basic", label: "Basic" },
  { id: "media", label: "Media" },
  { id: "content", label: "Content" },
  { id: "forms", label: "Forms" },
  // After the design's groups: the blocks a header and a footer are made
  // of, which the approved design drew as fixed parts of the theme.
  { id: "site", label: "Site" },
] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number]["id"];

// A tile's icon: the Lucide icon it is (its file in ../editor/lucide/) and
// that file's shapes, each an element name and its attributes as SVG
// writes them, on Lucide's 24-unit grid.
export interface IconData {
  lucide: string;
  shapes: readonly Shape[];
}

// A video the author names: the provider and the provider's id for it.
export interface VideoInput {
  provider: VideoProvider;
  videoId: string;
}

// What Insert or a "+" must have before it can add a widget: nothing, one
// image (from the library or another site), at least one image, or a video.
// A new block is a valid block from the moment it exists, and an image
// cannot be valid without its source.
export interface InputOf {
  heading: void;
  text: void;
  image: ImageRef;
  button: void;
  divider: void;
  spacer: void;
  gallery: readonly [ImageRef, ...ImageRef[]];
  video: VideoInput;
  map: void;
  iconbox: void;
  quote: void;
  accordion: void;
  stats: void;
  form: void;
  logo: void;
  menu: void;
}
export type Needs = null | "image" | "images" | "video";

export interface WidgetDefinition<T extends WidgetType> {
  type: T;
  group: WidgetGroup;
  // As Insert, the Outline and the history name it.
  label: string;
  // Its key's icon in Insert and in the picker: Lucide's, its file in
  // ../editor/lucide/.
  icon: IconData;
  needs: Needs;
  // The props of a new one.
  props: (input: InputOf[T]) => PropsOf<T>;
  // The renderer the canvas, the preview and the contract use.
  render: ComponentType<BlockRenderProps>;
  // The blocks of contract/fixtures that hold this widget's traps (markup
  // in its text, refused addresses, values the schema does not list): its
  // renderer must draw each as the server's partial does.
  traps: readonly string[];
}

export type AnyWidgetDefinition = { [T in WidgetType]: WidgetDefinition<T> }[WidgetType];

// A new block of a widget, with the id the caller drew: props as the
// widget's definition makes them, no children, no style of its own.
export function newWidget<T extends WidgetType>(definition: WidgetDefinition<T>, id: string, input: InputOf[T]): BlockOfType<T> {
  return { id, type: definition.type, props: definition.props(input), children: [], style: { base: {} } } as unknown as BlockOfType<T>;
}
