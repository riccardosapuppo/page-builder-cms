// The root element of every block, and the reading of a block's keys: the
// twin of block_root, block_props, block_style and prop_text in
// cms/app/helpers/blocks_helper.rb.
//
// A root carries its classes, the block's classes of the site's own last
// (each with the prefix of where it is drawn, OwnClassPrefix), then its
// anchor as its id, then data-block-id, data-block-type and
// data-style (the stored style, canonically, which the contract compares),
// then the data its block type adds. A value that is null or undefined
// writes no attribute, as Rails leaves out a nil.
import { createElement, useContext, type ReactNode } from "react";
import { isObject } from "../document/json.ts";
import { OwnClassPrefix, type Decoration, type RawBlock } from "./context.ts";
import { anchor, siteClasses } from "./policy.ts";
import { dataStyle } from "./style.ts";

export function blockProps(block: RawBlock): Record<string, unknown> {
  return isObject(block.props) ? block.props : {};
}

export function blockStyle(block: RawBlock): Record<string, unknown> {
  return isObject(block.style) ? block.style : {};
}

// A string prop, or "" when it is missing or not a string.
export function propText(props: Record<string, unknown>, key: string): string {
  const value = Object.hasOwn(props, key) ? props[key] : undefined;
  return typeof value === "string" ? value : "";
}

// Ruby's to_s of a block's id: the string itself, "" for none. The schema
// allows only strings; a number or a boolean prints as Ruby prints it, and
// anything else as JSON, which is where the two would differ.
export function idText(id: unknown): string {
  if (typeof id === "string") return id;
  if (id === undefined || id === null) return "";
  if (typeof id === "boolean" || (typeof id === "number" && Number.isSafeInteger(id))) return String(id);
  return JSON.stringify(id) ?? "";
}

// Joins classes as Rails' class lists do: nested lists flattened, nothing
// empty kept.
export function classNames(...parts: ReadonlyArray<string | null | undefined | false | readonly string[]>): string {
  return parts.flat().filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}

interface BlockRootProps {
  as?: "div" | "section";
  block: RawBlock;
  classes: ReadonlyArray<string | null | undefined | false | readonly string[]>;
  // data-<name>, by name without the prefix.
  data?: Readonly<Record<string, string | number | null | undefined>>;
  // Other attributes of the root (a spacer's aria-hidden).
  attributes?: Readonly<Record<string, string | null | undefined>>;
  decoration: Decoration | undefined;
  children?: ReactNode;
}

export function BlockRoot({ as = "div", block, classes, data = {}, attributes = {}, decoration, children }: BlockRootProps) {
  const stored = blockProps(block);
  const prefix = useContext(OwnClassPrefix);
  const own: Record<string, unknown> = { className: classNames(...classes, siteClasses(stored.className).map((name) => `${prefix}${name}`)) };
  const id = anchor(stored.anchor);
  if (id !== null) own.id = id;
  for (const [name, value] of Object.entries(attributes)) if (value !== null && value !== undefined) own[name] = value;
  const allData: Record<string, string | number | null | undefined> = {
    "block-id": idText(block.id),
    "block-type": block.type,
    style: dataStyle(block.style),
    ...data,
  };
  for (const [name, value] of Object.entries(allData)) if (value !== null && value !== undefined) own[`data-${name}`] = value;

  const props: Record<string, unknown> = { ...decoration?.attributes, ...own };
  // Content comes from the block alone; the editor adds its own after it.
  delete props.children;
  delete props.dangerouslySetInnerHTML;
  if (decoration?.ref) props.ref = decoration.ref;
  return createElement(as, props, children, decoration?.after);
}
