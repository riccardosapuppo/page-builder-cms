// What every block renderer receives besides its block: how to find a
// library image, a collection's published entries, the entry a template
// is drawn with and the shop's settings, and, on the canvas only, what the
// editor adds to a block's root element.
import { createContext, type ReactNode, type Ref } from "react";

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

// A collection as a Collection list draws it: the prefix of its entries'
// addresses, its fields (each a key, a label and a type), and its
// published entries, in any order (the list puts them in its own). The
// storage's data on the canvas (the CMS's, or the browser's), the
// database's on the server (SiteContent), a fixture's in the contract
// (cms/test/support/contract_content.rb), so each member is read
// defensively, as a block's are.
export interface ListedCollection {
  id: number;
  prefix: string;
  fields: readonly unknown[];
  entries: readonly ListedEntry[];
}

// One published entry: the title, slug and values it went live with, and
// when, in ISO 8601 to the millisecond as the API writes it.
export interface ListedEntry {
  id: number;
  title: string;
  slug: string;
  values: unknown;
  publishedAt: string;
}

// Answers a collection's id with the collection, or null for one the
// storage does not have (deleted, or never there): the list then says its
// empty words, as on the server.
export type CollectionResolver = (collectionId: number) => ListedCollection | null | undefined;

// The entry a collection's template is drawn with, which its Field blocks
// draw: its collection's fields, its title, its slug and its values. On
// the site, what it went live with; on the canvas and in the preview, its
// draft, or values made up from the fields' types when the collection has
// no entry yet. Its id and its collection's, for an entry that is one
// (made-up values are none): a Collection list of that collection, on its
// page, leaves it out.
export interface ShownEntry {
  id?: number | null;
  collectionId?: number | null;
  fields: readonly unknown[];
  title: string;
  slug: string;
  values: unknown;
}

// The shop's settings, as a page is drawn with them: whether it is on, its
// currency, the collection whose entries are its products and the number
// field of it that is their price (../shared/shop.ts, ShopSettings). The
// storage's on the canvas, the database's on the server (SiteContent), a
// fixture's in the contract, so each member is read defensively, as a
// block's are (./shop-words.ts). A Field block and a Collection list's
// cards draw that price as money, Add to cart draws its form, only while
// the shop is on and sells from their entries' collection.
export interface ShownShop {
  enabled: unknown;
  currency: unknown;
  productsCollectionId: unknown;
  priceField: unknown;
}

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
  // The block's content while the person writes in it on the canvas, in
  // place of what the page draws: a text block's editor, a heading's line.
  // Given what the page draws, to show until the editor is there. Only a
  // text and a heading call it; every other block's content is the page's.
  editing?: (drawn: ReactNode) => ReactNode;
}

// The prefix every class of the site's own carries where the page is
// drawn: "" on a page a visitor sees and in the contract, the canvas's
// own- in the editor (../shared/custom-css.ts, CANVAS_CLASS_PREFIX), whose
// own stylesheets would otherwise reach a block named like one of their
// classes.
export const OwnClassPrefix = createContext("");

export interface RenderContext {
  media: MediaResolver;
  // The collections Collection lists draw; absent, every list is empty.
  collections?: CollectionResolver;
  // The entry a template is drawn with; absent or null on any other page,
  // where a Field block draws nothing.
  entry?: ShownEntry | null;
  // The shop's settings; absent or null, no shop: a price is a number,
  // and Add to cart draws nothing.
  shop?: ShownShop | null;
  // Where a list's card links, for a storage that serves no entry's page
  // at its address: the browser demo's own view of it. Absent, the
  // entry's address on the site, /<prefix>/<slug>.
  entryHref?: (collection: ListedCollection, entry: ListedEntry) => string;
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
