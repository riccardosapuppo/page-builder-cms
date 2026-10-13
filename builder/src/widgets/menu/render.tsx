// The site's links in a row, and Menu, which opens them as a sheet where
// the block is narrower than the row needs: the twin of
// cms/app/views/blocks/_menu.html.erb. data-fold names the step of
// site.css's container queries below which the row folds, worked out from
// the widths of the labels' letters (../../render/header-fit.ts, the
// server's HeaderFit). A link whose address the URL policy refuses is left
// out, as is an item that is not a link; with no link left there is no
// Menu to open. The menu's name is for a screen reader, Menu when it has
// none.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { ThemeSvg } from "../../render/drawings.tsx";
import { menuFold } from "../../render/header-fit.ts";
import { linkHref } from "../../render/policy.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

// A menu's links as [label, href], in order: those whose address the URL
// policy accepts, of the items that are objects. BlocksHelper#menu_links.
export function menuLinks(items: unknown): Array<[label: string, href: string]> {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown): Array<[string, string]> => {
    if (!isObject(item)) return [];
    const href = linkHref(item.href);
    return href === null ? [] : [[propText(item, "label"), href]];
  });
}

export function MenuRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const links = menuLinks(props.items);
  const label = propText(props, "label");
  const drawn = () => links.map(([text, href], index) => <a key={index} href={href}>{text}</a>);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-menu", (["color", "align"] as const).map((key) => styleClasses(style, key)).flat(), visibilityClasses(style)]}
      data={{ fold: menuFold(links.map(([text]) => text)), ...freeColorData(style, "color") }}
      decoration={decoration}
    >
      <nav aria-label={label === "" ? "Menu" : label}>
        <div className="w-menu-links">{drawn()}</div>
        {links.length > 0 && (
          <details className="w-menu-fold">
            <summary className="sw-menu-button"><ThemeSvg name="menu" className="sw-menu-icon" /><span className="w-menu-word">Menu</span></summary>
            <div className="sw-menu-sheet">{drawn()}</div>
          </details>
        )}
      </nav>
    </BlockRoot>
  );
}
