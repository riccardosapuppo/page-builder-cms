// The shop's rules: its settings, a price in the smallest unit of its
// currency and an amount in the site's words, a visitor's cart as it is
// kept and changed, and a cart priced from what its products published.
//
// Written twice: here, for the editor, the browser's storage and the demo,
// and in Ruby for the CMS (cms/app/models/shop_rules.rb), rule for rule,
// pointer for pointer and word for word. Both read the same cases,
// contract/shop/cases.json, in their tests (./shop.test.ts and
// cms/test/models/shop_rules_test.rb), so neither changes alone.
//
// Pure, with no dependency but the rules' own limits, so each of them
// imports it as it is.
import { NUMBER_LIMIT } from "../../../schema/tools/collection-rules.ts";
import { escapePointer, MAX_SAFE_INTEGER, twoDecimals } from "../../../schema/tools/rules.ts";

// The currencies a shop sells in, a closed list, and the sign each amount
// is written with.
export const CURRENCIES = ["GBP", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_SIGNS: Readonly<Record<Currency, string>> = { GBP: "£", EUR: "€", USD: "$" };

// A line of a cart holds one product, 1 to MOST_QUANTITY of it; a cart
// holds MOST_LINES lines at most.
export const MOST_QUANTITY = 20;
export const MOST_LINES = 20;

// The toggle field that says whether a product is in stock: a collection
// that has one sells only the products it is on for.
export const IN_STOCK_KEY = "in-stock";

// ------------------------------------------------------------ settings

// The shop's settings: on or off, the currency, the collection whose
// entries are the products, and its number field that is the price. Off,
// in pounds, with no collection, until they are first changed.
export interface ShopSettings {
  enabled: boolean;
  currency: Currency;
  productsCollectionId: number | null;
  priceField: string | null;
}

export const SHOP_MEMBERS = ["enabled", "currency", "productsCollectionId", "priceField"] as const;

export const DEFAULT_SHOP: Readonly<ShopSettings> = { enabled: false, currency: "GBP", productsCollectionId: null, priceField: null };

// What the rules read of a collection: its id, its name for their words,
// and its fields' keys and types.
export interface ShopCollection {
  id: number;
  name: string;
  fields: ReadonlyArray<{ key: string; type: string }>;
}

export interface ShopFault {
  pointer: string;
  keyword: string;
  message: string;
}

// The words of the rules, as the Ruby twin writes them; the request's own
// are the API's (Api::BodyCheck).
export const SHOP_WORDS = {
  object: "must be a JSON object",
  member: "is not a member this request takes",
  required: "is required",
  boolean: "must be true or false",
  currency: `must be one of ${CURRENCIES.join(", ")}`,
  collectionId: "must be a collection's id, or null",
  collectionExists: (id: number) => `The site has no collection ${id}.`,
  numberField: (name: string) => `The collection ${name} has no number field to be the price.`,
  priceText: "must be a field's key, or null",
  noCollection: "Choose the products collection first.",
  priceField: (name: string, key: string) => `The collection ${name} has no number field "${key}".`,
  whenOn: "is required for a shop that is on",
  // A cart's change, which a visitor reads on the cart's page.
  quantity: (least: number) => `The quantity is a whole number from ${least} to ${MOST_QUANTITY}.`,
  entry: "That product could not be read.",
  lines: `The cart holds ${MOST_LINES} different products at most.`,
} as const;

export type ShopCheck = { ok: true; settings: ShopSettings } | { ok: false; faults: ShopFault[] };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

// A positive integer both languages read exactly, an integral float among
// them (Ruby reads 1.0 as a Float, JavaScript as 1); null for anything
// else.
function id(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SAFE_INTEGER ? value : null;
}

const hasNumberField = (collection: ShopCollection, key?: string) => collection.fields.some((field) => field.type === "number" && (key === undefined || field.key === key));

// The settings' faults, every one at once, each at its member, in the
// members' order after any member they do not take: on or off, a
// boolean; a currency of the list; the products collection, null or the id
// of a collection the site has (collectionOf) with a number field; the
// price, null or the key of a number field of that collection; and, for a
// shop that is on, both. A price is not looked for in a collection that is
// itself at fault. With none, the settings as they are kept.
export function checkShop(settings: unknown, collectionOf: (id: number) => ShopCollection | null): ShopCheck {
  if (!isRecord(settings)) return { ok: false, faults: [{ pointer: "", keyword: "type", message: SHOP_WORDS.object }] };
  const faults: ShopFault[] = [];
  const fault = (pointer: string, keyword: string, message: string) => faults.push({ pointer, keyword, message });
  for (const name of Object.keys(settings)) {
    if (!(SHOP_MEMBERS as readonly string[]).includes(name)) fault(`/${escapePointer(name)}`, "additionalProperties", SHOP_WORDS.member);
  }
  const has = (name: string) => Object.hasOwn(settings, name);

  const { enabled, currency, productsCollectionId: collectionId, priceField } = settings;
  if (!has("enabled")) fault("/enabled", "required", SHOP_WORDS.required);
  else if (typeof enabled !== "boolean") fault("/enabled", "type", SHOP_WORDS.boolean);

  if (!has("currency")) fault("/currency", "required", SHOP_WORDS.required);
  else if (!(CURRENCIES as readonly unknown[]).includes(currency)) fault("/currency", "enum", SHOP_WORDS.currency);

  // The collection, when the member names one the site has with a number
  // field: the one a price is looked for in.
  let products: ShopCollection | null = null;
  if (!has("productsCollectionId")) fault("/productsCollectionId", "required", SHOP_WORDS.required);
  else if (collectionId !== null) {
    const wanted = id(collectionId);
    const found = wanted === null ? null : collectionOf(wanted);
    if (wanted === null) fault("/productsCollectionId", "type", SHOP_WORDS.collectionId);
    else if (found === null) fault("/productsCollectionId", "collectionExists", SHOP_WORDS.collectionExists(wanted));
    else if (!hasNumberField(found)) fault("/productsCollectionId", "numberField", SHOP_WORDS.numberField(found.name));
    else products = found;
  }

  if (!has("priceField")) fault("/priceField", "required", SHOP_WORDS.required);
  else if (priceField !== null && typeof priceField !== "string") fault("/priceField", "type", SHOP_WORDS.priceText);
  else if (typeof priceField === "string") {
    if (collectionId === null) fault("/priceField", "priceField", SHOP_WORDS.noCollection);
    else if (products !== null && !hasNumberField(products, priceField)) fault("/priceField", "priceField", SHOP_WORDS.priceField(products.name, priceField));
  }

  if (enabled === true) {
    if (has("productsCollectionId") && collectionId === null) fault("/productsCollectionId", "required", SHOP_WORDS.whenOn);
    if (has("priceField") && priceField === null) fault("/priceField", "required", SHOP_WORDS.whenOn);
  }

  if (faults.length > 0) return { ok: false, faults };
  return { ok: true, settings: { enabled: enabled as boolean, currency: currency as Currency, productsCollectionId: collectionId === null ? null : id(collectionId), priceField: priceField as string | null } };
}

// --------------------------------------------------------------- money

// A price as a number field keeps it, in the currency's main unit with two
// decimals at most, as a count of the currency's smallest unit (pence,
// cents): its hundredths, which a hundred times it rounds to exactly, so
// 1.15 is 115 though a hundred times it is 114.99999999999999 as a float.
// null for no price: no number, a number no number field keeps (beyond a
// billion, a third decimal), or one below zero.
export function minorUnits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > NUMBER_LIMIT || !twoDecimals(value)) return null;
  return Math.round(value * 100);
}

// An amount of the smallest unit as the site writes it: the currency's
// sign, the main unit with a comma between thousands, and its two
// decimals, "£1,250.50"; a minus before the sign below zero.
export function moneyWords(minor: number, currency: Currency): string {
  const size = Math.abs(minor);
  const whole = String(Math.floor(size / 100)).replace(/\B(?=(?:[0-9]{3})+$)/g, ",");
  const part = String(size % 100).padStart(2, "0");
  return `${minor < 0 ? "-" : ""}${CURRENCY_SIGNS[currency]}${whole}.${part}`;
}

// ---------------------------------------------------------------- cart

// A line of a visitor's cart: a product, by its entry's id, and how many.
// No price: every price is read from what the product published.
export interface CartLine {
  entryId: number;
  quantity: number;
}

// A cart as it is kept (the CMS's cookie, the demo's own storage): its
// lines as [entry id, quantity], in the order they were put in.
export type KeptCart = Array<[number, number]>;

const quantityOf = (value: unknown, least: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= least && value <= MOST_QUANTITY ? value : null;

// A cart read back from where it was kept: a line that is no pair of a
// product's id and a quantity from 1 to MOST_QUANTITY is left out, a
// product's second line too, and the lines past MOST_LINES; anything
// else is an empty cart.
export function readCart(kept: unknown): CartLine[] {
  if (!Array.isArray(kept)) return [];
  const lines: CartLine[] = [];
  for (const line of kept as unknown[]) {
    if (lines.length === MOST_LINES) break;
    if (!Array.isArray(line) || line.length !== 2) continue;
    const entryId = id(line[0]);
    const quantity = quantityOf(line[1], 1);
    if (entryId === null || quantity === null || lines.some((other) => other.entryId === entryId)) continue;
    lines.push({ entryId, quantity });
  }
  return lines;
}

export function keptCart(lines: readonly CartLine[]): KeptCart {
  return lines.map((line) => [line.entryId, line.quantity]);
}

export type CartChange = { ok: true; lines: CartLine[] } | { ok: false; fault: ShopFault };

// A product put in the cart: quantity more of it, its line's quantity at
// most MOST_QUANTITY, or a new line after the others while the cart has
// room for one. Whether the product is for sale is the caller's to say
// (productState).
export function addToCart(lines: readonly CartLine[], entryId: unknown, quantity: unknown): CartChange {
  return change(lines, entryId, quantity, 1, (held) => Math.min(MOST_QUANTITY, held + (quantity as number)));
}

// A line's quantity set: 0 takes the line out, a product not in the cart
// is put in after the others, while it has room.
export function setQuantity(lines: readonly CartLine[], entryId: unknown, quantity: unknown): CartChange {
  return change(lines, entryId, quantity, 0, () => quantity as number);
}

// The cart once an order made from it is paid: each product the order
// took loses the quantity it took, its line gone at none; a product put
// in since, or more of one, stays, in the order the lines were put in.
export function afterOrder(lines: readonly CartLine[], ordered: ReadonlyArray<Pick<OrderLine, "entryId" | "quantity">>): CartLine[] {
  return lines.flatMap((line) => {
    const taken = ordered.filter((one) => one.entryId === line.entryId).reduce((sum, one) => sum + one.quantity, 0);
    return line.quantity > taken ? [{ entryId: line.entryId, quantity: line.quantity - taken }] : [];
  });
}

function change(lines: readonly CartLine[], entryId: unknown, quantity: unknown, least: number, next: (held: number) => number): CartChange {
  const product = id(entryId);
  if (product === null) return { ok: false, fault: { pointer: "/entry", keyword: "entry", message: SHOP_WORDS.entry } };
  if (quantityOf(quantity, least) === null) return { ok: false, fault: { pointer: "/quantity", keyword: "quantity", message: SHOP_WORDS.quantity(least) } };
  const line = lines.find((one) => one.entryId === product);
  if (line) {
    const held = next(line.quantity);
    return { ok: true, lines: held === 0 ? lines.filter((one) => one !== line) : lines.map((one) => (one === line ? { entryId: product, quantity: held } : { ...one })) };
  }
  const held = next(0);
  if (held === 0) return { ok: true, lines: lines.map((one) => ({ ...one })) };
  if (lines.length >= MOST_LINES) return { ok: false, fault: { pointer: "", keyword: "lines", message: SHOP_WORDS.lines } };
  return { ok: true, lines: [...lines.map((one) => ({ ...one })), { entryId: product, quantity: held }] };
}

// -------------------------------------------------- a cart, priced

// A product as the cart reads it: a published entry of the products
// collection, its title and values as it went live.
export interface ShopProduct {
  id: number;
  title: string;
  values: Readonly<Record<string, unknown>>;
}

// for sale; out of stock (the collection's in-stock toggle is not on for
// it); no price (none, or none a price can be: minorUnits); gone (no
// published entry of the products collection has its id any more).
export const PRODUCT_STATES = ["forSale", "outOfStock", "noPrice", "gone"] as const;
export type ProductState = (typeof PRODUCT_STATES)[number];

type FieldsShown = ReadonlyArray<{ key: string; type: string }>;

// A product's price in the smallest unit, read by the price field only
// while it is a number field of the collection; null for none.
export function priceOf(product: ShopProduct, fields: FieldsShown, priceField: string): number | null {
  if (!fields.some((field) => field.key === priceField && field.type === "number")) return null;
  return minorUnits(Object.hasOwn(product.values, priceField) ? product.values[priceField] : undefined);
}

// Whether a product can be put in the cart and ordered, and if not, why.
export function productState(product: ShopProduct | null, fields: FieldsShown, priceField: string): ProductState {
  if (product === null) return "gone";
  if (priceOf(product, fields, priceField) === null) return "noPrice";
  const stocked = fields.some((field) => field.key === IN_STOCK_KEY && field.type === "toggle");
  if (stocked && product.values[IN_STOCK_KEY] !== true) return "outOfStock";
  return "forSale";
}

// A line of an order: the product as it was sold, its title and price
// then, and how many.
export interface OrderLine {
  entryId: number;
  title: string;
  unitAmount: number;
  quantity: number;
}

// A line of the cart as its page shows it: its product's title and price
// as they are now (none for a product gone, the price also for one out
// of stock), and what the line costs, for a line that is for sale.
export interface PricedLine {
  entryId: number;
  quantity: number;
  state: ProductState;
  title: string | null;
  unitAmount: number | null;
  amount: number | null;
}

export interface PricedCart {
  lines: PricedLine[];
  // What the lines for sale cost together, in the smallest unit.
  total: number;
  // What a checkout orders: the lines for sale.
  orderLines: OrderLine[];
}

// The cart, priced from what each product published (productOf: the
// published entry of the products collection with that id, or null), never
// from what the cart holds, which is ids and quantities alone. Counted in
// the smallest unit, as integers.
export function priceCart(lines: readonly CartLine[], productOf: (id: number) => ShopProduct | null, fields: FieldsShown, priceField: string): PricedCart {
  const priced = lines.map((line): PricedLine => {
    const product = productOf(line.entryId);
    const state = productState(product, fields, priceField);
    const unitAmount = product === null ? null : priceOf(product, fields, priceField);
    return { entryId: line.entryId, quantity: line.quantity, state, title: product?.title ?? null, unitAmount, amount: state === "forSale" ? unitAmount! * line.quantity : null };
  });
  const orderLines = priced.filter((line) => line.state === "forSale").map((line) => ({ entryId: line.entryId, title: line.title!, unitAmount: line.unitAmount!, quantity: line.quantity }));
  return { lines: priced, total: orderLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0), orderLines };
}
