// An icon of schema/icons.svg, a title and a short text: the twin of
// cms/app/views/blocks/_iconbox.html.erb. A name that is not in the set
// (markup, a name the schema does not list) draws no icon and no
// data-icon.
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { isSiteIcon, SiteIcon, TextWithBreaks } from "../../render/drawings.tsx";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function IconboxRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const icon = isSiteIcon(props.icon) ? props.icon : null;
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-iconbox", "sw-iconbox", styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      data={{ icon, ...freeColorData(style, "color") }}
      decoration={decoration}
    >
      {icon !== null && <SiteIcon name={icon} className="sw-icon" />}
      <div>
        <h3>{propText(props, "title")}</h3>
        <p><TextWithBreaks text={propText(props, "text")} /></p>
      </div>
    </BlockRoot>
  );
}
