// The published entries of a collection, each a card linking to its
// entry's page: the twin of cms/app/views/blocks/_collectionList.html.erb.
// The entries come from the render's context (ctx.collections: the
// storage's on the canvas, the database's on the server), and which of
// them, in what order, from ./cards.ts. One list, each card an item: its
// image, then its words: its title (a heading of level 3, the link to the
// entry's page, which site.css stretches over the whole card), its day,
// its price (a number, or money in the shop's currency), its excerpt with
// its line breaks, and the words at its foot, which say again what the
// title's link does and so are hidden from a screen reader. A compact
// list draws the title, the day and the price alone. A list with
// nothing to show says its empty words. On an entry's page, a list of its
// collection leaves that entry out (./cards.ts, leftOut).
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps, MediaResolver } from "../../render/context.ts";
import { TextWithBreaks } from "../../render/drawings.tsx";
import { dayWords } from "../../render/entry-words.ts";
import { BlockImg, blockImage } from "../../render/media.tsx";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";
import { listCards, listColumns, listedId, listLayout, type Card } from "./cards.ts";

function EntryCard({ card, media, more }: { card: Card; media: MediaResolver; more: string }) {
  const image = card.image === null ? null : blockImage(card.image, media);
  return (
    <li className="sw-entry">
      {image && card.image && <figure className="sw-entry-image"><BlockImg item={card.image} image={image} /></figure>}
      <div className="sw-entry-text">
        <h3 className="sw-entry-title">{card.href === null ? card.title : <a href={card.href}>{card.title}</a>}</h3>
        {card.day !== null && <p className="sw-entry-date"><time dateTime={card.day}>{dayWords(card.day)}</time></p>}
        {card.price !== null && <p className="sw-entry-price">{card.price}</p>}
        {card.excerpt !== null && <p className="sw-entry-excerpt"><TextWithBreaks text={card.excerpt} /></p>}
        {more !== "" && <p className="sw-entry-more" aria-hidden="true">{more}</p>}
      </div>
    </li>
  );
}

export function CollectionListRender({ block, ctx, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const id = listedId(props);
  const layout = listLayout(props);
  const cards = listCards(props, id === null ? null : ctx.collections?.(id), ctx.entryHref, ctx.entry, ctx.shop);
  const more = layout === "compact" ? "" : propText(props, "linkLabel");
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-collectionList", styleClasses(style, "color"), visibilityClasses(style)]}
      data={{ collection: id, layout, columns: layout === "grid" ? listColumns(props) : null, ...freeColorData(style, "color") }}
      decoration={decoration}
    >
      {cards.length === 0
        ? <p className="sw-entries-empty">{propText(props, "emptyText")}</p>
        : <ul className="sw-entries">{cards.map((card, index) => <EntryCard key={index} card={card} media={ctx.media} more={more} />)}</ul>}
    </BlockRoot>
  );
}
