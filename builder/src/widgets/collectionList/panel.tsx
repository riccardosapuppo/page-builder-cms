// The collection list's two groups. Entries: which collection, how many,
// in what order and which of them (every entry, or those whose choice
// field holds an option or whose toggle is on or off), with how many of
// its entries no list shows, since they are not published, and the way to
// them in Collections. Cards: the layout, a grid's columns, the fields a
// card shows (an image, a day, an excerpt, a price), the words at its foot
// and what the list says when it has nothing to show.
//
// The choices are the collection's fields as the storage last gave them
// (../../editor/collections/content.ts); a field the list names that the
// collection no longer has is listed as gone, so the list's own value
// shows, and draws nothing until another is chosen.
import { REMOVE, type Updates } from "../../document/commands.ts";
import { draftCount } from "../../editor/collections/content.ts";
import { useSiteCollection, useSiteCollections } from "../../editor/collections/use-content.ts";
import { directionWords } from "../../editor/collections/words.ts";
import { useEnv, useUi } from "../../editor/context.tsx";
import { CURRENCY_NAMES } from "../../editor/shop/words.ts";
import { NumberField, RadioField, SelectField, TextField } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { useOptionalSession } from "../../editor/session.tsx";
import type { Field } from "../../shared/collection.ts";
import { moneyWords, type ShopSettings } from "../../shared/shop.ts";
import { LIST_COLUMNS, LIST_LAYOUTS, type CollectionListBlock, type ListFilter, type ListLayout, type ListOrder } from "../../shared/document.ts";
import { MOST_ENTRIES } from "./cards.ts";

const NONE = "";
const LAYOUT_NAMES: Readonly<Record<ListLayout, string>> = { list: "List", grid: "Grid", compact: "Compact" };
const LAYOUT_HINTS: Readonly<Record<ListLayout, string>> = {
  list: "One card under another, its image beside its words.",
  grid: "Cards side by side, as many as the columns below, fewer where the page is narrow.",
  compact: "A title and a day a line: no image, no excerpt, no words at the foot.",
};

// An order as one value of a list: "publishedAt desc".
const orderValue = (order: ListOrder): string => `${order.by} ${order.direction}`;
function orderOf(value: string): ListOrder {
  const [by = "publishedAt", direction] = value.split(" ");
  return { by, direction: direction === "asc" ? "asc" : "desc" };
}

// What a list may be ordered by: when its entries went live ("Newest
// first"), their title ("Title, A to Z"), and each date or number field
// ("Date, latest first"), both ways, in the Collections screen's words for
// each way (../../editor/collections/words.ts, directionWords).
export function orderChoices(fields: readonly Field[]): Array<{ value: string; label: string }> {
  const both = (by: string, name: string | null, first: "asc" | "desc") => {
    const words = directionWords(by, fields);
    const said = (direction: "asc" | "desc") => (name === null ? words[direction] : by === "title" ? `${name}, ${words[direction]}` : `${name}, ${words[direction].charAt(0).toLowerCase()}${words[direction].slice(1)}`);
    return [first, first === "asc" ? "desc" : "asc"].map((direction) => ({ value: `${by} ${direction}`, label: said(direction as "asc" | "desc") }));
  };
  return [
    ...both("publishedAt", null, "desc"),
    ...both("title", "Title", "asc"),
    ...fields.filter((field) => field.type === "date" || field.type === "number").flatMap((field) => both(field.key, field.label, "desc")),
  ];
}

// A filter as one value of a list: "" for none, else the field's key and
// its value.
const filterValue = (filter: ListFilter | undefined): string => (filter === undefined ? NONE : JSON.stringify([filter.field, filter.value]));

// What a list may keep: every entry, or those whose toggle is on, or off,
// or whose choice is one of its options.
export function filterChoices(fields: readonly Field[]): Array<{ value: string; label: string }> {
  return [
    { value: NONE, label: "Every entry" },
    ...fields.flatMap((field) => {
      if (field.type === "toggle") return [true, false].map((on) => ({ value: JSON.stringify([field.key, on]), label: `${field.label}: ${on ? "on" : "off"}` }));
      if (field.type === "choice") return field.options.map((option) => ({ value: JSON.stringify([field.key, option]), label: `${field.label}: ${option}` }));
      return [];
    }),
  ];
}

// A field of a type a card shows, or none; a key the collection no longer
// has stays listed, as gone.
function cardChoices(fields: readonly Field[], types: readonly string[], value: string | undefined): Array<{ value: string; label: string }> {
  const offered = fields.filter((field) => types.includes(field.type));
  return [
    { value: NONE, label: "None" },
    ...(value !== undefined && !offered.some((field) => field.key === value) ? [{ value, label: `${value}: no such field` }] : []),
    ...offered.map((field) => ({ value: field.key, label: field.label })),
  ];
}

function EntriesContent({ block }: ContentProps<"collectionList">) {
  const { ui } = useEnv();
  const commands = useBlockCommands(block.id);
  const keeps = useOptionalSession()?.capabilities.collections ?? false;
  const all = useSiteCollections();
  const id = block.props.collection;
  const shown = useSiteCollection(id);
  const fields = shown?.collection.fields ?? [];
  // Counted from the entries the canvas draws, not the collection's own
  // count, so the note and the list never disagree.
  const drafts = draftCount(shown?.entries);
  const published = (shown?.entries.length ?? 0) - drafts;
  const order = orderValue(block.props.order);
  const orders = orderChoices(fields);
  const filters = filterChoices(fields);
  const filter = filterValue(block.props.filter);
  const unchosen = id === undefined;
  const collections = [
    ...(unchosen ? [{ value: NONE, label: "Choose a collection" }] : shown === null ? [{ value: String(id), label: "A collection no longer there" }] : []),
    ...all.map((collection) => ({ value: String(collection.id), label: collection.name })),
  ];
  // A new collection's own order, where a list can follow it.
  const choose = (value: string): ReturnType<typeof commands.setProps> => {
    const next = all.find((collection) => String(collection.id) === value);
    if (!next) return null;
    const updates: Updates = { collection: next.id, filter: REMOVE, ...(next.sort.by === "updatedAt" ? {} : { order: { by: next.sort.by, direction: next.sort.direction } }) };
    return commands.setProps(updates);
  };
  if (!keeps) return <p className="hint">This storage keeps no collection: the list says its empty words.</p>;
  return (
    <>
      {all.length === 0
        ? <p className="hint">This site has no collection yet. Make one in Collections, from the menu of the mark at the top left.</p>
        : <SelectField label="Collection" choices={collections} value={unchosen ? NONE : String(id)} blockId={block.id} field="/props/collection" onChange={choose} hint={shown === null && !unchosen ? "This collection was deleted: the list says its empty words." : null} />}
      <NumberField
        label="Entries"
        integer
        value={block.props.count}
        blockId={block.id}
        field="/props/count"
        rules={{ minimum: 1, maximum: MOST_ENTRIES }}
        hint={`The most it shows, from 1 to ${MOST_ENTRIES}.`}
        onCommit={(count) => commands.setProps({ count })}
      />
      <SelectField
        label="Order"
        choices={orders.some((choice) => choice.value === order) ? orders : [{ value: order, label: "A field no longer there" }, ...orders]}
        value={order}
        blockId={block.id}
        field="/props/order"
        onChange={(value) => commands.setProps({ order: { ...orderOf(value) } })}
      />
      {(filters.length > 1 || filter !== NONE) && (
        <SelectField
          label="Show"
          choices={filters.some((choice) => choice.value === filter) ? filters : [{ value: filter, label: "A field or option no longer there" }, ...filters]}
          value={filter}
          blockId={block.id}
          field="/props/filter"
          hint="Every entry, or only those whose choice or toggle holds one value."
          onChange={(value) => {
            if (value === NONE) return commands.setProps({ filter: REMOVE });
            const [field, wanted] = JSON.parse(value) as [string, string | boolean];
            return commands.setProps({ filter: { field, value: wanted } });
          }}
        />
      )}
      {shown && (
        <div className="list-entries-note">
          <p className="hint">
            {published === 0 ? `${shown.collection.name} has no published entry yet: the list says its empty words.` : "A list shows published entries only."}
            {drafts > 0 && ` ${drafts} ${drafts === 1 ? "draft is" : "drafts are"} not shown.`}
          </p>
          <button className="btn btn-secondary btn-block" type="button" onClick={() => ui.getState().setCollections({ collectionId: shown.collection.id, tab: "entries" })}>
            <Icon name="collection" />{shown.collection.name} in Collections
          </button>
        </div>
      )}
    </>
  );
}

function CardsContent({ block }: ContentProps<"collectionList">) {
  const commands = useBlockCommands(block.id);
  const shown = useSiteCollection(block.props.collection);
  const shop = useUi((u) => u.siteShop);
  const fields = shown?.collection.fields ?? [];
  const layout = block.props.layout;
  const card = (key: "image" | "date" | "excerpt" | "price", label: string, types: readonly string[], hint: string) => (
    <SelectField
      label={label}
      choices={cardChoices(fields, types, block.props[key])}
      value={block.props[key] ?? NONE}
      blockId={block.id}
      field={`/props/${key}`}
      hint={hint}
      onChange={(value) => commands.setProps({ [key]: value === NONE ? REMOVE : value })}
    />
  );
  return (
    <>
      <RadioField
        label="Layout"
        choices={LIST_LAYOUTS.map((value) => ({ value, label: LAYOUT_NAMES[value] }))}
        value={layout}
        blockId={block.id}
        field="/props/layout"
        hint={LAYOUT_HINTS[layout]}
        onChange={(next) => commands.setProps({ layout: next })}
      />
      {layout === "grid" && (
        <RadioField
          label="Columns"
          choices={LIST_COLUMNS.map((value) => ({ value, label: String(value) }))}
          value={block.props.columns}
          blockId={block.id}
          field="/props/columns"
          onChange={(columns) => commands.setProps({ columns })}
        />
      )}
      {layout !== "compact" && card("image", "Image", ["image"], "An image field of the entry, above the card’s words, or beside them in a list.")}
      {card("date", "Date", ["date"], "A date field of the entry, under its title.")}
      {layout !== "compact" && card("excerpt", "Excerpt", ["text", "paragraph"], "A text or paragraph field, under the title.")}
      {(fields.some((field) => field.type === "number") || block.props.price !== undefined) && card("price", "Price", ["number"], priceHint(shop, shown?.collection.id ?? null))}
      {layout !== "compact" && (
        <TextField
          label="Link words"
          value={block.props.linkLabel}
          blockId={block.id}
          field="/props/linkLabel"
          rules={{ kind: "lineOrEmpty", maxLength: 40 }}
          hint="At each card’s foot. The title is the link, and the whole card takes the click. Leave it empty for no words."
          onCommit={(linkLabel) => commands.setProps({ linkLabel })}
        />
      )}
      <TextField
        label="When there is nothing to show"
        value={block.props.emptyText}
        blockId={block.id}
        field="/props/emptyText"
        rules={{ kind: "line", maxLength: 200 }}
        onCommit={(emptyText) => commands.setProps({ emptyText })}
      />
    </>
  );
}

// What a card's price is, by the shop: money in its currency for the
// collection it sells from, a number for any other.
export function priceHint(shop: ShopSettings | null, collectionId: number | null): string {
  if (shop !== null && shop.enabled && collectionId !== null && shop.productsCollectionId === collectionId) {
    return `A number field, under the title and the day. The shop's price is written in ${CURRENCY_NAMES[shop.currency].toLowerCase()}, as ${moneyWords(125_050, shop.currency)}.`;
  }
  return "A number field, under the title and the day, written as 1,250.5; the shop's price in its currency, while the shop sells from this collection.";
}

// The Cards group, closed: "Grid of 3, with an image, a day, an excerpt".
export function cardsWords(block: CollectionListBlock): string {
  const { layout, columns, image, date, excerpt, price } = block.props;
  const parts = [layout === "compact" ? null : image && "an image", date && "a day", price && "a price", layout === "compact" ? null : excerpt && "an excerpt"].filter((part): part is string => typeof part === "string");
  const shape = layout === "grid" ? `Grid of ${columns}` : LAYOUT_NAMES[layout];
  return parts.length === 0 ? shape : `${shape}, with ${parts.join(", ")}`;
}

export const panel: WidgetPanel<"collectionList"> = {
  content: { name: "Entries", Content: EntriesContent },
  more: [{ id: "cards", name: "Cards", props: ["layout", "columns", "image", "date", "excerpt", "price", "linkLabel", "emptyText"], summary: cardsWords, Content: CardsContent }],
};
