// The page document as TypeScript types, written from
// schema/block-document.schema.json, the one schema the editor and the
// server validate with. The schema decides; these types follow it, and
// document.test.ts reads the schema and fails when a type, a key or a token
// here no longer matches it.
//
// The types describe a document that passed validation (validate.ts). What
// they cannot say, the validator still checks: a section holds one to four
// columns, ids are unique, text has a visible character, links follow the
// URL policy.

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------- tokens

export const BLOCK_TYPES = [
  "section", "column",
  "heading", "text", "image", "button", "divider", "spacer",
  "gallery", "video", "map", "iconbox", "quote", "accordion",
  "form",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// What a column may hold: every block type but section and column.
export const WIDGET_TYPES = [
  "heading", "text", "image", "button", "divider", "spacer",
  "gallery", "video", "map", "iconbox", "quote", "accordion",
  "form",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const SPACE_TOKENS = ["none", "xs", "s", "m", "l", "xl", "xxl"] as const;
export type SpaceToken = (typeof SPACE_TOKENS)[number];

export const SECTION_SPACE_TOKENS = [...SPACE_TOKENS, "section-s", "section-l"] as const;
export type SectionSpaceToken = (typeof SECTION_SPACE_TOKENS)[number];

export const COLUMN_WIDTHS_TOKENS = ["3:2", "2:3", "2:1", "1:2", "2:1:1", "1:2:1", "1:1:2"] as const;
export type ColumnWidthsToken = (typeof COLUMN_WIDTHS_TOKENS)[number];

// The presets a section may name for each count of columns: absent means
// equal widths, and one or four columns take no preset.
export const COLUMN_WIDTHS_BY_COUNT = {
  1: [],
  2: ["3:2", "2:3", "2:1", "1:2"],
  3: ["2:1:1", "1:2:1", "1:1:2"],
  4: [],
} as const satisfies Record<1 | 2 | 3 | 4, readonly ColumnWidthsToken[]>;

export const ASPECT_TOKENS = ["original", "16:9", "3:2", "4:3", "5:4", "1:1"] as const;
export type AspectToken = (typeof ASPECT_TOKENS)[number];

export const PALETTE_SLOTS = ["text", "background", "primary", "accent", "soft", "muted"] as const;
export type PaletteSlot = (typeof PALETTE_SLOTS)[number];

export const BACKGROUND_TOKENS = ["none", ...PALETTE_SLOTS] as const;
export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];

export const TYPE_STEPS = ["display", "heading-1", "heading-2", "heading-3", "large", "body", "small"] as const;
export type TypeStep = (typeof TYPE_STEPS)[number];

export const ALIGN_TOKENS = ["left", "center", "right"] as const;
export type AlignToken = (typeof ALIGN_TOKENS)[number];

export const VERTICAL_ALIGN_TOKENS = ["top", "middle", "bottom"] as const;
export type VerticalAlignToken = (typeof VERTICAL_ALIGN_TOKENS)[number];

export const VISIBILITY_TOKENS = ["visible", "hidden"] as const;
export type VisibilityToken = (typeof VISIBILITY_TOKENS)[number];

export const ICON_NAMES = ["sunrise", "buoys", "cup", "calendar", "clock", "pin", "globe", "info"] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export const HEADING_LEVELS = [1, 2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

// A form field's kinds: a line of text, an email address, a longer text, a
// checkbox.
export const FORM_FIELD_KINDS = ["text", "email", "textarea", "checkbox"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

// The most characters an answer may have, by kind: what a field may set
// for itself (text, textarea), or what every one takes (email, the
// standard's length of an address). A checkbox has no text.
export const FORM_TEXT_LIMITS = { text: 300, textarea: 5000 } as const;
export const EMAIL_MAX_LENGTH = 254;

// ----------------------------------------------------------------- style

// Every style setting, by token name. A block type accepts only some of
// them (STYLE_KEYS_BY_TYPE).
export interface StyleTokens {
  spaceInside?: SpaceToken;
  spaceBetween?: SpaceToken;
  spaceAbove?: SectionSpaceToken;
  spaceBelow?: SectionSpaceToken;
  aspect?: AspectToken;
  background?: BackgroundToken;
  color?: PaletteSlot;
  textSize?: TypeStep;
  align?: AlignToken;
  verticalAlign?: VerticalAlignToken;
  visibility?: VisibilityToken;
}
export const STYLE_TOKEN_KEYS = [
  "spaceInside", "spaceBetween", "spaceAbove", "spaceBelow", "aspect", "background",
  "color", "textSize", "align", "verticalAlign", "visibility",
] as const satisfies readonly (keyof StyleTokens)[];

// The tokens each style setting takes: the enum its key refers to in the
// schema's $defs/styleTokens. The renderer turns only these into classes,
// the Style panel offers them, and the tests' random pages draw from them.
export const STYLE_TOKENS = {
  spaceInside: SPACE_TOKENS,
  spaceBetween: SPACE_TOKENS,
  spaceAbove: SECTION_SPACE_TOKENS,
  spaceBelow: SECTION_SPACE_TOKENS,
  aspect: ASPECT_TOKENS,
  background: BACKGROUND_TOKENS,
  color: PALETTE_SLOTS,
  textSize: TYPE_STEPS,
  align: ALIGN_TOKENS,
  verticalAlign: VERTICAL_ALIGN_TOKENS,
  visibility: VISIBILITY_TOKENS,
} as const satisfies { readonly [K in keyof StyleTokens]-?: readonly NonNullable<StyleTokens[K]>[] };

const TEXT_STYLE = ["textSize", "color", "align", "visibility"] as const;
const LINE_STYLE = ["color", "visibility"] as const;
const PLAIN_STYLE = ["visibility"] as const;

export const STYLE_KEYS_BY_TYPE = {
  section: ["background", "spaceAbove", "spaceBelow", "spaceBetween", "visibility"],
  column: ["background", "spaceInside", "spaceBetween", "textSize", "color", "align", "verticalAlign", "visibility"],
  heading: TEXT_STYLE,
  text: TEXT_STYLE,
  quote: TEXT_STYLE,
  image: ["aspect", "visibility"],
  button: ["background", "color", "align", "visibility"],
  divider: LINE_STYLE,
  accordion: LINE_STYLE,
  spacer: PLAIN_STYLE,
  video: PLAIN_STYLE,
  map: PLAIN_STYLE,
  form: PLAIN_STYLE,
  gallery: ["spaceBetween", "visibility"],
  iconbox: ["color", "align", "visibility"],
} as const satisfies Record<BlockType, readonly (keyof StyleTokens)[]>;

export type StyleKeyOf<T extends BlockType> = (typeof STYLE_KEYS_BY_TYPE)[T][number];
export type StylePart<T extends BlockType> = Pick<StyleTokens, StyleKeyOf<T>>;

// base applies on every device; tablet and phone hold only what differs
// there. A removed override is an absent key, and an override object left
// empty is not stored (the validator refuses `{}`).
export interface Style<T extends BlockType> {
  base: StylePart<T>;
  tablet?: StylePart<T>;
  phone?: StylePart<T>;
}
export const DEVICES = ["base", "tablet", "phone"] as const;
export type Device = (typeof DEVICES)[number];

// ------------------------------------------------------------- rich text

// The text widget's document, as the rich-text editor's getJSON() gives
// it, cut down to paragraphs, line breaks, lists, bold, italic and links.
export interface RichTextDoc {
  type: "doc";
  content: RichTextBlock[];
}
export type RichTextBlock = Paragraph | BulletList | OrderedList;
export interface Paragraph {
  type: "paragraph";
  content?: InlineNode[];
}
export interface BulletList {
  type: "bulletList";
  content: ListItem[];
}
export const ORDERED_LIST_STYLES = [null, "1", "a", "A", "i", "I"] as const;
export interface OrderedList {
  type: "orderedList";
  attrs?: {
    start?: number;
    type?: (typeof ORDERED_LIST_STYLES)[number];
  };
  content: ListItem[];
}
// A list item starts with a paragraph; nested lists and further paragraphs follow.
export interface ListItem {
  type: "listItem";
  content: [Paragraph, ...RichTextBlock[]];
}
export type InlineNode = TextNode | HardBreak;
export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}
export interface HardBreak {
  type: "hardBreak";
  marks?: Mark[];
}
export type Mark = BoldMark | ItalicMark | LinkMark;
export interface BoldMark {
  type: "bold";
}
export interface ItalicMark {
  type: "italic";
}
// Only href carries meaning: the renderers set target and rel themselves.
export interface LinkMark {
  type: "link";
  attrs: {
    href: string;
    target?: null | "_blank";
    rel?: null | "noopener noreferrer nofollow";
    class?: null;
  };
}
export const RICH_TEXT_BLOCK_TYPES = ["paragraph", "bulletList", "orderedList"] as const satisfies readonly RichTextBlock["type"][];
export const INLINE_NODE_TYPES = ["text", "hardBreak"] as const satisfies readonly InlineNode["type"][];
export const MARK_TYPES = ["bold", "italic", "link"] as const satisfies readonly Mark["type"][];

// ---------------------------------------------------------------- images

// One image: from the media library or from another site, never both; with
// alt text, or marked decorative and without any.
export type ImageRef = ImageSource & ImageText;
export type ImageSource = { mediaId: string; url?: never } | { url: string; mediaId?: never };
export type ImageText = { alt: string; decorative?: never } | { decorative: true; alt?: never };
export const IMAGE_REF_KEYS = ["mediaId", "url", "alt", "decorative"] as const;

// ----------------------------------------------------------------- props

// No properties at all: `{}`, and nothing may be added to it.
export type NoProps = Record<string, never>;

export interface SectionProps {
  // Shown only in the editor: the navigator and the history.
  label?: string;
  // In-page link target: #anchor scrolls to the section.
  anchor?: string;
  columnWidths?: ColumnWidthsToken;
}
export interface HeadingProps {
  level: HeadingLevel;
  text: string;
  href?: string;
}
export interface TextProps {
  doc: RichTextDoc;
}
export interface ButtonProps {
  label: string;
  href: string;
}
export interface SpacerProps {
  size: SpaceToken;
}
export interface GalleryProps {
  items: ImageRef[];
}
// Stored as provider and id, never as a URL: the renderers build the address.
export interface VideoProps {
  provider: VideoProvider;
  videoId: string;
  title: string;
}
export interface MapProps {
  latitude: number;
  longitude: number;
  zoom: number;
  label: string;
}
export interface IconboxProps {
  icon: IconName;
  title: string;
  text: string;
}
export interface QuoteProps {
  text: string;
  attribution?: string;
}
export interface AccordionItem {
  question: string;
  answer: string;
}
export interface AccordionProps {
  items: AccordionItem[];
}
// One field of a form. name is the key its answers are kept under, made by
// the editor and never shown; unique in its form (an application rule).
// maxLength is there for the two kinds of text and only for them.
interface FormFieldOf<K extends FormFieldKind> {
  name: string;
  kind: K;
  label: string;
  required: boolean;
}
export type FormField =
  | (FormFieldOf<"text" | "textarea"> & { maxLength: number })
  | (FormFieldOf<"email" | "checkbox"> & { maxLength?: never });
export interface FormProps {
  // The fields, in the order the page shows them.
  items: FormField[];
  submitLabel: string;
  // What the visitor reads once the server has kept the answer.
  confirmation: string;
}

// ---------------------------------------------------------------- blocks

// Every block has the same five keys and no others.
interface BlockOf<T extends BlockType, P, C> {
  id: string;
  type: T;
  props: P;
  children: C;
  style: Style<T>;
}
// A widget holds no blocks: its children are always [].
type NoChildren = [];

export type SectionBlock = BlockOf<"section", SectionProps, ColumnBlock[]>;
export type ColumnBlock = BlockOf<"column", NoProps, WidgetBlock[]>;
export type HeadingBlock = BlockOf<"heading", HeadingProps, NoChildren>;
export type TextBlock = BlockOf<"text", TextProps, NoChildren>;
export type ImageBlock = BlockOf<"image", ImageRef, NoChildren>;
export type ButtonBlock = BlockOf<"button", ButtonProps, NoChildren>;
export type DividerBlock = BlockOf<"divider", NoProps, NoChildren>;
export type SpacerBlock = BlockOf<"spacer", SpacerProps, NoChildren>;
export type GalleryBlock = BlockOf<"gallery", GalleryProps, NoChildren>;
export type VideoBlock = BlockOf<"video", VideoProps, NoChildren>;
export type MapBlock = BlockOf<"map", MapProps, NoChildren>;
export type IconboxBlock = BlockOf<"iconbox", IconboxProps, NoChildren>;
export type QuoteBlock = BlockOf<"quote", QuoteProps, NoChildren>;
export type AccordionBlock = BlockOf<"accordion", AccordionProps, NoChildren>;
export type FormBlock = BlockOf<"form", FormProps, NoChildren>;

export type WidgetBlock =
  | HeadingBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock
  | GalleryBlock | VideoBlock | MapBlock | IconboxBlock | QuoteBlock | AccordionBlock
  | FormBlock;
export type Block = SectionBlock | ColumnBlock | WidgetBlock;

export type BlockOfType<T extends BlockType> = Extract<Block, { type: T }>;
export type PropsOf<T extends BlockType> = BlockOfType<T>["props"];

export interface PageDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  // Shown in the browser tab and in search results.
  title: string;
  // Shown under the title in search results; absent when the page has none.
  description?: string;
  sections: SectionBlock[];
}

// ------------------------------------------- the keys, for the schema test

// Which props each block type has, and whether each is required. The type
// below makes the compiler hold this table to the interfaces above, key for
// key; document.test.ts holds it to the schema. The image's props (and a
// gallery item) are an ImageRef, whose rules are exactly-one-of and are
// tested on their own.
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type KeyTable<T> = { readonly [K in keyof T]-?: K extends RequiredKeys<T> ? "required" : "optional" };

export const PROP_KEYS = {
  section: { label: "optional", anchor: "optional", columnWidths: "optional" },
  column: {},
  heading: { level: "required", text: "required", href: "optional" },
  text: { doc: "required" },
  button: { label: "required", href: "required" },
  divider: {},
  spacer: { size: "required" },
  gallery: { items: "required" },
  video: { provider: "required", videoId: "required", title: "required" },
  map: { latitude: "required", longitude: "required", zoom: "required", label: "required" },
  iconbox: { icon: "required", title: "required", text: "required" },
  quote: { text: "required", attribution: "optional" },
  accordion: { items: "required" },
  form: { items: "required", submitLabel: "required", confirmation: "required" },
} as const satisfies { [T in Exclude<BlockType, "image" | "column" | "divider">]: KeyTable<PropsOf<T>> } & {
  column: Record<string, never>;
  divider: Record<string, never>;
};

export const ACCORDION_ITEM_KEYS = { question: "required", answer: "required" } as const satisfies KeyTable<AccordionItem>;
// A field's keys whatever its kind: maxLength is optional here, and the
// schema says for which kinds it is required and for which absent.
export const FORM_FIELD_KEYS = {
  name: "required", kind: "required", label: "required", required: "required", maxLength: "optional",
} as const satisfies KeyTable<FormFieldOf<FormFieldKind> & { maxLength?: number }>;
export const DOCUMENT_KEYS = {
  schemaVersion: "required",
  title: "required",
  description: "optional",
  sections: "required",
} as const satisfies KeyTable<PageDocument>;
