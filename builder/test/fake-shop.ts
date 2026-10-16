// The shop as the Shop screen's tests need it: its settings, the
// collections they choose among and the orders, kept in memory and
// answered as the storage adapter's operations answer, the settings held
// to the shop's rules (../src/shared/shop.ts, checkShop, which the shop's
// cases hold to the CMS's) and an unchanged change keeping its time. Each
// call is noted; a test can make the next call of a kind fail, and say
// what asking Stripe again finds.
import type { ShopStorage } from "../src/editor/shop/context.ts";
import type { Field } from "../src/shared/collection.ts";
import { checkShop, type ShopSettings } from "../src/shared/shop.ts";
import { StorageError, type Collection, type Failure, type FieldError, type Invalid, type Order, type Outcome, type Shop, type ShopCheckout } from "../src/storage/adapter.ts";
import { newsCollection } from "./site-entries.ts";

type Operation = keyof ShopStorage;

export const PRODUCT_FIELDS: Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100_000 },
  { key: "weight", label: "Weight", type: "number", required: false },
  { key: "in-stock", label: "In stock", type: "toggle", required: false },
];

// Two collections: Swim kit, which has number fields, and News, which has
// none.
export const KIT = newsCollection({ id: 7, name: "Swim kit", prefix: "kit", fields: PRODUCT_FIELDS, sort: { by: "title", direction: "asc" } });
export const NEWS = newsCollection();

export const NOT_SET_UP = "STRIPE_SECRET_KEY is not set where the CMS runs: set it to a key of Stripe's test mode (sk_test_ or rk_test_), then start the CMS again.";

export function order(id: number, changes: Partial<Order> = {}): Order {
  return {
    id, status: "open", currency: "GBP",
    lines: [{ entryId: 41, title: "Swim cap", unitAmount: 1200, quantity: 2 }, { entryId: 42, title: "Tow float", unitAmount: 2450, quantity: 1 }],
    total: 4850, stripeSessionId: `cs_test_${id}`, email: null, paidAt: null,
    createdAt: "2026-10-02T08:30:00.000Z", updatedAt: "2026-10-02T08:30:00.000Z", ...changes,
  };
}

const invalid = (errors: ReadonlyArray<{ pointer: string; keyword: string; message: string }>): Invalid => ({
  kind: "invalid",
  code: "invalid_request",
  message: "The request is not valid.",
  errors: errors.map((e): FieldError => ({ pointer: e.pointer, keyword: e.keyword, blockPointer: null, message: e.message })),
});

export class FakeShop implements ShopStorage {
  settings: ShopSettings = { enabled: false, currency: "GBP", productsCollectionId: null, priceField: null };
  updatedAt: string | null = null;
  checkout: ShopCheckout = { ready: false, reason: NOT_SET_UP };
  collections: Collection[] = [KIT, NEWS];
  orders: Order[] = [];
  readonly calls: string[] = [];
  // What asking Stripe again finds: the order as Stripe says it is now.
  refreshed: ((order: Order) => Order) | null = null;
  // The storage's own refusal of the next settings, as the CMS's rules
  // find what the editor's could not (another tab's collection gone).
  refuseNext: Array<{ pointer: string; keyword: string; message: string }> | null = null;
  private readonly failing = new Map<string, Failure>();

  fail(operation: Operation, failure: Failure): void {
    this.failing.set(operation, failure);
  }

  private check(operation: Operation): void {
    const failure = this.failing.get(operation);
    if (!failure) return;
    this.failing.delete(operation);
    throw new StorageError(failure);
  }

  private shop(): Shop {
    return { ...this.settings, updatedAt: this.updatedAt, checkout: { ...this.checkout } };
  }

  async getShop(): Promise<Shop> {
    this.calls.push("getShop");
    this.check("getShop");
    return this.shop();
  }

  async setShop(settings: ShopSettings): Promise<Outcome<Shop, Invalid>> {
    this.calls.push(`setShop ${JSON.stringify(settings)}`);
    this.check("setShop");
    if (this.refuseNext) {
      const errors = this.refuseNext;
      this.refuseNext = null;
      return { ok: false, problem: invalid(errors) };
    }
    const checked = checkShop(settings, (id) => {
      const found = this.collections.find((collection) => collection.id === id);
      return found ? { id: found.id, name: found.name, fields: found.fields } : null;
    });
    if (!checked.ok) return { ok: false, problem: invalid(checked.faults) };
    if (JSON.stringify(checked.settings) !== JSON.stringify(this.settings)) {
      this.settings = checked.settings;
      this.updatedAt = "2026-10-02T09:00:00.000Z";
    }
    return { ok: true, value: this.shop() };
  }

  async listCollections(): Promise<Collection[]> {
    this.calls.push("listCollections");
    this.check("listCollections");
    return this.collections.map((collection) => structuredClone(collection));
  }

  async listOrders(): Promise<Order[]> {
    this.calls.push("listOrders");
    this.check("listOrders");
    return [...this.orders].sort((a, b) => b.id - a.id).map((one) => structuredClone(one));
  }

  async getOrder(orderId: number): Promise<Order> {
    this.calls.push(`getOrder ${orderId}`);
    this.check("getOrder");
    const found = this.orders.find((one) => one.id === orderId);
    if (!found) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    return structuredClone(found);
  }

  async refreshOrder(orderId: number): Promise<Order> {
    this.calls.push(`refreshOrder ${orderId}`);
    this.check("refreshOrder");
    const at = this.orders.findIndex((one) => one.id === orderId);
    if (at < 0) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    const found = this.orders[at]!;
    if (found.status === "open" && this.refreshed) this.orders[at] = this.refreshed(found);
    return structuredClone(this.orders[at]!);
  }
}
