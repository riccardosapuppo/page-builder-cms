// A link drawn as a button: the twin of cms/app/views/blocks/_button.html.erb.
// Its background and text colour go on the link itself; an address the URL
// policy refuses leaves a label that links nowhere.
import { BlockRoot, blockProps, blockStyle, classNames, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { linkHref } from "../../render/policy.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

// data-<name> attributes for an element that is not a BlockRoot.
function dataAttributes(data: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]));
}

export function ButtonRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  return (
    <BlockRoot block={block} classes={["w", "w-button", styleClasses(style, "align"), visibilityClasses(style)]} decoration={decoration}>
      <a className={classNames("sw-btn", styleClasses(style, "background"), styleClasses(style, "color"))} href={linkHref(props.href) ?? undefined} {...dataAttributes({ ...freeColorData(style, "background"), ...freeColorData(style, "color") })}>
        {propText(props, "label")}
      </a>
    </BlockRoot>
  );
}
