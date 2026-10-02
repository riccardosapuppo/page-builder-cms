// What a widget is to the editor: its definition. Each widget's folder
// exports one, and registry.ts lists them in the widget panel's order.
import type { ComponentType } from "react";
import type { BlockRenderProps } from "../render/context.ts";
import type { BlockOfType, ImageRef, PropsOf, VideoProvider, WidgetType } from "../shared/document.ts";

// The widget panel's groups, in the approved design's order.
export const WIDGET_GROUPS = [
  { id: "basic", label: "Basic" },
  { id: "media", label: "Media" },
  { id: "content", label: "Content" },
] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number]["id"];

// An icon: an SVG viewBox and its shapes, each an element name and its
// attributes as SVG writes them (stroke-dasharray, not strokeDasharray).
export interface IconData {
  viewBox: string;
  shapes: ReadonlyArray<readonly [element: string, attributes: Readonly<Record<string, string>>]>;
}

// A video the author names: the provider and the provider's id for it.
export interface VideoInput {
  provider: VideoProvider;
  videoId: string;
}

// What the widget panel must have before it can add a widget: nothing, one
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
}
export type Needs = null | "image" | "images" | "video";

export interface WidgetDefinition<T extends WidgetType> {
  type: T;
  group: WidgetGroup;
  // As the widget panel, the navigator and the history name it.
  label: string;
  // The widget panel's tile, from the approved design.
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
