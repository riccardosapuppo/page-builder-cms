// The page's tree, walked: the twin of render_document and render_blocks in
// cms/app/helpers/blocks_helper.rb, with the two structural blocks,
// section and column (cms/app/views/blocks/_section.html.erb and
// _column.html.erb). Each widget draws itself through the registry
// (../widgets/registry.ts).
//
// The tree stays strict even for a document that did not pass the schema:
// a page holds sections, a section columns, a column widgets, and a block
// of any other type, in any other place, or that is not an object, is left
// out with everything under it.
import { createElement, memo, type ReactNode } from "react";
import { isObject } from "../document/json.ts";
import { WIDGET_TYPES } from "../shared/document.ts";
import { WIDGET_RENDERERS } from "../widgets/registry.ts";
import { BlockRoot, blockProps, blockStyle, classNames } from "./block-root.tsx";
import type { BlockRenderProps, Decoration, RawBlock, RenderContext } from "./context.ts";
import { anchor } from "./policy.ts";
import { classValue, columnWidths, styleClasses, visibilityClasses } from "./style.ts";

const SECTIONS: readonly string[] = ["section"];
const COLUMNS: readonly string[] = ["column"];
const WIDGETS: readonly string[] = WIDGET_TYPES;

// The sections of a page document, as the published page's <main> holds them.
export function PageSections({ document, ctx }: { document: unknown; ctx: RenderContext }) {
  return <>{renderBlocks(isObject(document) ? document.sections : undefined, SECTIONS, ctx)}</>;
}

// The blocks of a list whose type the place allows, in order. Keys are the
// ids, which a valid page holds once each; where a page does not, the
// place in the list stands in, so nothing is drawn twice or dropped.
export function renderBlocks(blocks: unknown, allow: readonly string[], ctx: RenderContext): ReactNode[] {
  if (!Array.isArray(blocks)) return [];
  const seen = new Set<string>();
  const out: ReactNode[] = [];
  blocks.forEach((block: unknown, index) => {
    if (!isObject(block) || typeof block.type !== "string" || !allow.includes(block.type)) return;
    let key = typeof block.id === "string" ? block.id : `#${index}`;
    if (seen.has(key)) key = `#${index}`;
    seen.add(key);
    out.push(<BlockView key={key} block={block as RawBlock} ctx={ctx} />);
  });
  return out;
}

const noDecoration = (): Decoration | undefined => undefined;

// One block. Memoised: with pages never changed in place (../document), a
// block whose object is the same draws nothing again, so a change redraws
// the blocks on its way down and no others.
export const BlockView = memo(function BlockView({ block, ctx }: { block: RawBlock; ctx: RenderContext }) {
  const useDecoration = ctx.useDecoration ?? noDecoration;
  const decoration = useDecoration(block);
  if (block.type === "section") return <Section block={block} ctx={ctx} decoration={decoration} />;
  if (block.type === "column") return <Column block={block} ctx={ctx} decoration={decoration} />;
  // Each renderer is a module-level component of the registry, the same
  // one for every render of a type.
  const widget = WIDGET_RENDERERS.get(block.type);
  return widget ? createElement(widget, { block, ctx, decoration }) : null;
});

// A band across the page: its columns side by side on desktop, stacked
// below. The column count is the number of its columns, and columnWidths the
// share of each on desktop, equal when the section names no preset for that
// count.
function Section({ block, ctx, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const props = blockProps(block);
  const columns = Array.isArray(block.children) ? block.children.filter((child: unknown) => isObject(child) && child.type === "column") : [];
  const widths = columnWidths(props, columns.length);
  return (
    <BlockRoot
      as="section"
      block={block}
      classes={["sec", styleClasses(style, "background"), styleClasses(style, "spaceAbove"), styleClasses(style, "spaceBelow"), visibilityClasses(style)]}
      attributes={{ id: anchor(props.anchor) }}
      data={{ columns: columns.length, "column-widths": widths }}
      decoration={decoration}
    >
      <div className={classNames("sw-inner", "cols", `cols-${Math.min(Math.max(columns.length, 1), 4)}`, widths && `widths-${classValue(widths)}`, styleClasses(style, "spaceBetween", { family: "cols-gap" }))}>
        {renderBlocks(columns, COLUMNS, ctx)}
      </div>
    </BlockRoot>
  );
}

// One column of a section: its widgets, top to bottom.
function Column({ block, ctx, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  return (
    <BlockRoot
      block={block}
      classes={[
        "col",
        (["background", "spaceInside", "spaceBetween", "textSize", "color", "align", "verticalAlign"] as const).map((key) => styleClasses(style, key)).flat(),
        visibilityClasses(style),
      ]}
      decoration={decoration}
    >
      {renderBlocks(block.children, WIDGETS, ctx)}
    </BlockRoot>
  );
}
