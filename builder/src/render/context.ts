// What every block renderer receives besides its block: how to find a
// library image, and, on the canvas only, what the editor adds to a block's
// root element.
import type { ReactNode, Ref } from "react";

// A block as the renderer meets it: an object with a type the tree allows
// at its place, and anything at all in its other keys. The editor's blocks
// are valid documents (../shared/document.ts), but the renderer is the last
// line for a document that reached it some other way, as the server's
// partials are, and reads every key defensively.
export interface RawBlock {
  readonly type: string;
  readonly [key: string]: unknown;
}

// A library image: where it is served and its size in pixels, when known.
export interface MediaImage {
  src: string;
  width?: number | null;
  height?: number | null;
}

// Answers a mediaId with the image, or null for an item the library does
// not have (deleted, or never there): the block then shows nothing, as on
// the server. Injected, because the answers depend on where the editor
// runs: the media library on the CMS, a stub in the contract tests, whose
// goldens must not depend on the app's secret (signed ids).
export type MediaResolver = (mediaId: string) => MediaImage | null | undefined;

// What the canvas adds to one block's root element, and only there: the
// preview and the contract render without it, and the page never has it.
export interface Decoration {
  // Attributes and handlers (tabIndex, aria-*, data-* of the editor's own,
  // onPointerDown...). The page's own attributes win over any of the same
  // name: class, id and the data-block-* the contract reads stay the page's.
  attributes?: Readonly<Record<string, unknown>>;
  ref?: Ref<HTMLElement>;
  // Drawn inside the root after the block's own content: the selection's
  // clamp, an empty container's "+".
  after?: ReactNode;
  // The block's content while the person edits it on the canvas, in place
  // of what the page draws: a text block's editor. Given what the page
  // draws, to show until the editor is there. Only a widget whose content
  // is rich text calls it; every other block's content is the page's.
  editing?: (drawn: ReactNode) => ReactNode;
}

export interface RenderContext {
  media: MediaResolver;
  // A hook, called once in every block's render, so each block can follow
  // the editor's state for itself (its selection, a drag over it) and only
  // the blocks whose answer changed draw again. It must be the same
  // function for the life of the context.
  useDecoration?: (block: RawBlock) => Decoration | undefined;
}

export interface BlockRenderProps {
  block: RawBlock;
  ctx: RenderContext;
  decoration: Decoration | undefined;
}
