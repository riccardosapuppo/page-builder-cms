// The words of the Shop screen (./ShopScreen.tsx), in the editor's one
// locale, en-US. Plain functions of their arguments, so the tests give
// what they mean. An amount is the site's own words for one
// (../../shared/shop.ts, moneyWords), so the screen and the page write a
// price alike.
import { CURRENCY_SIGNS, moneyWords, type Currency, type OrderLine, type ShopSettings } from "../../shared/shop.ts";
import { isStorageError, ORDER_STATUS_WORDS, type Collection, type Order, type ShopCheckout } from "../../storage/adapter.ts";

const counted = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

// ------------------------------------------------------------ settings

// The currencies as the settings offer them: "£ Pounds".
export const CURRENCY_NAMES: Readonly<Record<Currency, string>> = { GBP: "Pounds", EUR: "Euros", USD: "Dollars" };
export const currencyLabel = (currency: Currency): string => `${CURRENCY_SIGNS[currency]} ${CURRENCY_NAMES[currency]}`;

// The settings in a line, under Settings in the screen's list: "On, in
// pounds, from Products"; "Off".
export function settingsLine(settings: ShopSettings, collections: ReadonlyArray<Pick<Collection, "id" | "name">>): string {
  if (!settings.enabled) return "Off";
  const from = collections.find((collection) => collection.id === settings.productsCollectionId);
  return `On, in ${CURRENCY_NAMES[settings.currency].toLowerCase()}${from ? `, from ${from.name}` : ""}`;
}

// The number fields of a collection, which its price may be.
export const numberFields = (collection: Pick<Collection, "fields">) => collection.fields.filter((field) => field.type === "number");

// What the shop's switch does, under it: on, sold, put in a visitor's
// cart (in the browser's storage, the cart this browser keeps); off,
// nothing.
export const onWords = (inBrowser: boolean): string =>
  `On, the products are sold: Add to cart puts them in ${inBrowser ? "the cart this browser keeps" : "a visitor's cart"}, and prices are drawn in the shop's currency.`;
export const OFF_WORDS = "Off, nothing is sold: Add to cart draws nothing, prices are drawn as numbers, and the cart's addresses are not found.";

// What the currency is for: the CMS asks Stripe to charge it; the
// browser's storage, which reaches no Stripe, says that is the full
// system's.
export const currencyWords = (inBrowser: boolean): string =>
  inBrowser ? "Prices are written in it; in the full system, Stripe is asked to charge it." : "Prices are written in it, and Stripe is asked to charge it.";

// The price a newly chosen collection takes: its number field "price",
// else its first number field; none for a collection with none.
export function pricePicked(collection: Pick<Collection, "fields">): string | null {
  const offered = numberFields(collection);
  return (offered.find((field) => field.key === "price") ?? offered[0])?.key ?? null;
}

// A refusal of the settings, said at the control of the member it is at,
// by its keyword (the shop's rules', ../../shared/shop.ts, or the
// schema's), else in the storage's own words.
export function settingRefusal(member: string, keyword: string, message: string): string {
  switch (keyword) {
    case "collectionExists":
      return "That collection is not there any more: choose another.";
    case "numberField":
      return "That collection has no number field to be the price: add one in Collections, or choose another collection.";
    case "priceField":
      return member === "priceField" && message === "Choose the products collection first." ? "Choose the products collection first, then its price." : "That collection has no such number field: choose another.";
    case "required":
      if (member === "productsCollectionId") return "A shop that is on sells from a collection: choose one.";
      if (member === "priceField") return "A shop that is on needs a price: choose a number field.";
      return "This cannot be empty.";
    case "enum":
      return "Choose one of the three currencies.";
    case "type":
      if (member === "enabled") return "The shop is on or off.";
      if (member === "productsCollectionId") return "Choose a collection of the list.";
      if (member === "priceField") return "Choose a number field of the list.";
      return message;
    default:
      return message;
  }
}

// ------------------------------------------------------------ checkout

// Whether a checkout reaches Stripe, and, when it does not, why (the
// storage's own words, which name a variable and never what it holds) and
// what to do: on the CMS, how it is set up; in the browser's storage,
// what the full system does in its place.
export const CHECKOUT_READY = "Checkout is set up: a visitor pays on Stripe's page, in its test mode, and each order is kept here.";
export const CHECKOUT_HOW = "To set it up, you need a Stripe account in test mode: put its test secret key in STRIPE_SECRET_KEY on the machine that runs the CMS, then start the CMS again.";
export const CHECKOUT_FULL_SYSTEM = "In the full system, the CMS sends each checkout to Stripe's page, in its test mode, and keeps the order paid once Stripe says so.";

export function checkoutWords(checkout: ShopCheckout, inBrowser: boolean): { state: string; reason: string | null; how: string | null } {
  if (checkout.ready) return { state: CHECKOUT_READY, reason: null, how: null };
  return { state: "Checkout is not set up.", reason: checkout.reason, how: inBrowser ? CHECKOUT_FULL_SYSTEM : CHECKOUT_HOW };
}

// ------------------------------------------------------------ orders

// The orders in a line: "No orders yet", "1 order", "3 orders, 1 open".
export function ordersLine(orders: ReadonlyArray<Pick<Order, "status">>): string {
  if (orders.length === 0) return "No orders yet";
  const open = orders.filter((order) => order.status === "open").length;
  return `${counted(orders.length, "order")}${open > 0 ? `, ${open} open` : ""}`;
}

// How many products an order took: "1 item", "3 items".
export const itemCount = (lines: ReadonlyArray<Pick<OrderLine, "quantity">>): string => counted(lines.reduce((sum, line) => sum + line.quantity, 0), "item");

// An order's items in words, as the table writes them: each product's
// title, with how many when more than one, the first three, then how
// many more: "Swim cap × 2, Tow float", "A, B, C and 2 more".
export function itemsWords(lines: ReadonlyArray<Pick<OrderLine, "title" | "quantity">>): string {
  const named = lines.slice(0, 3).map((line) => (line.quantity > 1 ? `${line.title} × ${line.quantity}` : line.title));
  const rest = lines.length - named.length;
  return rest > 0 ? `${named.join(", ")} and ${rest} more` : named.join(", ");
}

export const totalWords = (order: Pick<Order, "total" | "currency">): string => moneyWords(order.total, order.currency);

export const statusWords = (order: Pick<Order, "status">): string => ORDER_STATUS_WORDS[order.status];

// The email the buyer gave Stripe, once the order is paid; none before.
export const emailOf = (order: Pick<Order, "status" | "email">): string | null => (order.status === "paid" && order.email !== null ? order.email : null);

// What asking Stripe again found.
export function refreshedWords(order: Pick<Order, "status">): string {
  switch (order.status) {
    case "paid":
      return "Stripe says the order is paid.";
    case "expired":
      return "Stripe says the order's checkout expired unpaid.";
    case "open":
      return "Stripe says the order is not paid yet.";
    case "demo":
      return "This order is the browser demo's: no payment was ever asked for.";
  }
}

// Why Stripe was not asked: checkout not set up on the CMS (409), Stripe
// not reached or not answering as it should (502), the order gone, or
// anything else, in the storage's words.
export function refreshFailure(error: unknown): string {
  if (isStorageError(error)) {
    const failure = error.failure;
    if (failure.kind === "refused" && failure.code === "checkout_not_set_up") return `Not asked: checkout is not set up on this CMS, so Stripe cannot be asked about the order. ${CHECKOUT_HOW}`;
    if (failure.kind === "unknown" && failure.status === 502) return "Not asked: Stripe could not be reached, or did not answer as it should. Nothing changed: try again in a moment.";
    if (failure.kind === "not-found") return "This order is no longer kept.";
    return `Not asked: ${failure.message}`;
  }
  return `Not asked: ${error instanceof Error ? error.message : String(error)}`;
}
