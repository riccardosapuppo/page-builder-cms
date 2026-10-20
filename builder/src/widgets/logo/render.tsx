// The site's mark, and the site's name beside it: the twin of
// cms/app/views/blocks/_logo.html.erb. With a name, the two are one link to
// the home page; without one, the mark alone, a decoration the block hides
// from screen readers as a whole, as a spacer does. With a name and mark
// false, the name alone, a word mark (w-logo-word): a site of its own,
// whose header is not the theme's. Only false leaves the mark out.
// On a dark band the mark draws itself the other way round (tokens.css).
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { ThemeSvg } from "../../render/drawings.tsx";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function LogoRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const name = propText(props, "name");
  const word = name !== "" && Object.hasOwn(props, "mark") && props.mark === false;
  const style = blockStyle(block);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-logo", (["color", "align"] as const).map((key) => styleClasses(style, key)).flat(), visibilityClasses(style)]}
      data={freeColorData(style, "color")}
      attributes={{ "aria-hidden": name === "" ? "true" : null }}
      decoration={decoration}
    >
      {name === ""
        ? <ThemeSvg name="mark" className="sw-brand-mark" />
        : word
          ? <a className="w-logo-link w-logo-word" href="/"><span>{name}</span></a>
          : <a className="w-logo-link" href="/"><ThemeSvg name="mark" className="sw-brand-mark" /><span>{name}</span></a>}
    </BlockRoot>
  );
}
