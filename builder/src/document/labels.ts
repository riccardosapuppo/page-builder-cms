// The words the history and the drop announcements use, in the editor's one
// locale, en-US. A command's label is made when the command is, from the
// page as it is then ("Deleted Divider in Hero"), so the history reads the
// same after the section is renamed or moved.
import type { BlockType, Device, PageDocument, StyleTokens } from "../shared/document.ts";
import { freeTypeText, isFreeTypeKey, type FreeTypeKey } from "../shared/free-type.ts";
import type { ContainerType } from "./nesting.ts";
import { locate, type ParentId } from "./tree.ts";

// As the widget panel names them.
export const TYPE_NAMES: Readonly<Record<BlockType, string>> = {
  section: "Section",
  column: "Column",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  gallery: "Gallery",
  video: "Video",
  map: "Map",
  iconbox: "Icon box",
  quote: "Quote",
  accordion: "Accordion",
  stats: "Stats",
  steps: "Steps",
  pricing: "Pricing",
  collectionList: "Collection list",
  form: "Form",
  logo: "Logo",
  menu: "Menu",
  field: "Field",
  addToCart: "Add to cart",
};

const PLURALS: Readonly<Record<ContainerType, string>> = {
  page: "pages",
  section: "sections",
  column: "columns",
  heading: "headings",
  text: "texts",
  image: "images",
  button: "buttons",
  divider: "dividers",
  spacer: "spacers",
  gallery: "galleries",
  video: "videos",
  map: "maps",
  iconbox: "icon boxes",
  quote: "quotes",
  accordion: "accordions",
  stats: "stats blocks",
  steps: "steps blocks",
  pricing: "pricing tables",
  collectionList: "collection lists",
  form: "forms",
  logo: "logos",
  menu: "menus",
  field: "fields",
  addToCart: "Add to cart blocks",
};

export function plural(type: ContainerType, count: number): string {
  if (count === 1) return type === "page" ? "page" : TYPE_NAMES[type].toLowerCase();
  return PLURALS[type];
}

// "Hero" for a section with that label, "Section 3" for the third one
// without; "Column 2"; a widget by its type.
export function blockName(doc: PageDocument, id: string): string {
  const found = locate(doc, id);
  if (!found) return "a block";
  const { block, index } = found;
  if (block.type === "section") return block.props.label ?? `Section ${index + 1}`;
  if (block.type === "column") return `Column ${index + 1}`;
  return TYPE_NAMES[block.type];
}

// A block with where it is, for the history: "Quote in Members' words",
// "Column 1 in Hero", "Hero".
export function blockWithPlace(doc: PageDocument, id: string): string {
  return `${blockName(doc, id)}${placeOf(doc, id)}`;
}

// " in <section>" for a column or a widget, "" for a section.
export function placeOf(doc: PageDocument, id: string): string {
  const found = locate(doc, id);
  if (!found || found.path.length < 2) return "";
  const section = doc.sections[found.path[0] ?? -1];
  return section ? ` in ${blockName(doc, section.id)}` : "";
}

// A container named for "Added Quote to …": "Column 2 in Hero", "Hero",
// "the page".
export function containerName(doc: PageDocument, parentId: ParentId): string {
  return parentId === null ? "the page" : blockWithPlace(doc, parentId);
}

// ------------------------------------------------------------- style

export const STYLE_KEY_NAMES: Readonly<Record<keyof StyleTokens, string>> = {
  spaceInside: "Space inside",
  spaceBetween: "Space between",
  spaceAbove: "Space above",
  spaceBelow: "Space below",
  aspect: "Crop",
  background: "Background",
  color: "Color",
  textSize: "Text size",
  typeface: "Typeface",
  fontSize: "Type size",
  fontWeight: "Weight",
  letterSpacing: "Letter spacing",
  lineHeight: "Line height",
  letterWidth: "Letter width",
  align: "Alignment",
  verticalAlign: "Vertical alignment",
  visibility: "Visibility",
};

const TOKEN_NAMES: Readonly<Record<string, string>> = {
  none: "None", xs: "XS", s: "S", m: "M", l: "L", xl: "XL", xxl: "XXL",
  "section-s": "Section S", "section-l": "Section L",
  original: "Original",
  text: "Text", background: "Background", primary: "Primary", accent: "Accent", soft: "Soft", muted: "Muted",
  display: "Display", "heading-1": "Heading 1", "heading-2": "Heading 2", "heading-3": "Heading 3",
  large: "Large", body: "Body", small: "Small",
  heading: "Headings",
  left: "Left", center: "Center", right: "Right",
  top: "Top", middle: "Middle", bottom: "Bottom",
  visible: "Visible", hidden: "Hidden",
};

// A token as the style panel shows it: "L", "Heading 1", "16:9".
export function tokenName(token: string): string {
  return TOKEN_NAMES[token] ?? token;
}

// A value of free type as the panel and the history say it, from the text
// the page writes ("6vw", "-0.02"): "6 vw", "800", "0.02 em" after a minus
// sign or a plus (none for no spacing at all), "0.95", "80 %".
export function freeTypeWords(key: FreeTypeKey, text: string): string {
  switch (key) {
    case "fontSize":
      return text.replace(/(px|rem|vw)$/, " $1");
    case "letterSpacing":
      return `${text.startsWith("-") ? `\u2212${text.slice(1)}` : text === "0" ? text : `+${text}`} em`;
    case "letterWidth":
      return `${text} %`;
    default:
      return text;
  }
}

// A setting's value as the history and the panel say it: a token by its
// name ("Heading 1"), a value of free type in its words ("6 vw"), stored
// (800) or as the page writes it ("800").
export function settingWords(key: keyof StyleTokens, value: string | number): string {
  if (!isFreeTypeKey(key)) return tokenName(String(value));
  const text = freeTypeText(key, key !== "fontSize" && typeof value === "string" ? Number(value) : value);
  return text === null ? String(value) : freeTypeWords(key, text);
}

// "" for every device (base), " on tablet", " on phone".
export function onDevice(device: Device): string {
  return device === "base" ? "" : ` on ${device}`;
}

// ------------------------------------------------------------- props

// The fields of the Content and Advanced tabs, by block type and key, for
// "Changed Button text in Join". A key without a name here is told by the
// widget's own name ("Changed Quote in Members' words").
export const FIELD_NAMES: Readonly<Partial<Record<BlockType, Readonly<Record<string, string>>>>> = {
  section: { label: "Section label", anchor: "Anchor id", stack: "Stacking" },
  heading: { level: "Heading level", href: "Heading link" },
  button: { label: "Button text", href: "Button link" },
  image: { alt: "Alt text", decorative: "Alt text" },
  spacer: { size: "Spacer size" },
  video: { title: "Video title" },
  map: { label: "Map label" },
  iconbox: { icon: "Icon", title: "Icon box title", text: "Icon box text" },
  quote: { attribution: "Quote attribution" },
  form: { submitLabel: "Form button text", confirmation: "Form message" },
  logo: { name: "Site name" },
  menu: { label: "Menu name" },
  collectionList: {
    collection: "Listed collection", count: "Entries listed", order: "List order", filter: "List filter", layout: "List layout", columns: "Grid columns",
    image: "Card image", date: "Card date", excerpt: "Card excerpt", price: "Card price", linkLabel: "Card link words", emptyText: "Empty list words",
  },
  field: { field: "Field shown", level: "Field level" },
  addToCart: { label: "Cart button text", quantity: "Quantity field" },
};

// What one item of a list is called: an image of a gallery, a question of
// an accordion, a figure of a stats block, a step of a steps block, a plan
// of a pricing block, a field of a form.
export const ITEM_NAMES: Readonly<Partial<Record<BlockType, { one: string; many: string }>>> = {
  gallery: { one: "image", many: "images" },
  accordion: { one: "question", many: "questions" },
  stats: { one: "figure", many: "figures" },
  steps: { one: "step", many: "steps" },
  pricing: { one: "plan", many: "plans" },
  form: { one: "field", many: "fields" },
  menu: { one: "link", many: "links" },
};
