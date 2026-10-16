// @vitest-environment jsdom
// The Shop screen, from the mark's menu (and the phone's More): offered
// only when the storage keeps a shop; its settings (on or off, the
// currency, the products among the collections with a number field, their
// price among its number fields), checked before they are sent, each
// refusal at its control, saved with their own button and handed to the
// canvas at once; whether checkout is set up, why not, and what to do or,
// in the browser, what the full system does, never a key; the orders, a
// table, an order whole, Ask Stripe again and its answers; how orders come
// when there is none; a change not saved asked about before it is left;
// on a phone's window, one level at a time.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { press } from "../../../test/collections-kit.tsx";
import { editorKit, type Kit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { FakeShop, NOT_SET_UP, order } from "../../../test/fake-shop.ts";
import { serverTime } from "../history-words.ts";
import { PhoneBar } from "../PhoneBar.tsx";
import { emptySession, type Session } from "../session.tsx";
import { TopBar } from "../TopBar.tsx";
import { ShopScreen } from "./ShopScreen.tsx";
import { CHECKOUT_FULL_SYSTEM, CHECKOUT_HOW, CHECKOUT_READY } from "./words.ts";

// When the tests' orders were made, as the screen says it on the kit's
// clock, in the zone the tests run in.
const MADE = serverTime("2026-10-02T08:30:00.000Z", Date.UTC(2026, 9, 2, 9));

const menuItems = () => within(screen.getByRole("menu", { name: "Page Builder CMS" })).getAllByRole("menuitem").map((item) => item.querySelector("span")?.textContent);
const capabilities = { ...emptySession().capabilities, collections: true, shop: true };

async function openShop(fake: FakeShop, session: Partial<Session> = {}): Promise<{ kit: Kit; dialog: HTMLElement }> {
  const kit = editorKit({ document: page(), shop: fake, session: { capabilities, ...session } });
  kit.render(<><TopBar /><ShopScreen /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Shop" })));
  return { kit, dialog: screen.getByRole("dialog", { name: "Shop" }) };
}

const choose = async (select: HTMLElement, value: string) => act(async () => {
  fireEvent.change(select, { target: { value } });
});

let kept: typeof window.matchMedia;
beforeEach(() => {
  kept = window.matchMedia;
});
afterEach(() => {
  window.matchMedia = kept;
});

test("the mark's menu offers Shop after Collections, and the phone's More too, only when the storage keeps a shop", () => {
  const without = editorKit({ document: page() });
  without.render(<><TopBar /><PhoneBar /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  expect(menuItems()).not.toContain("Shop");
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(within(screen.getByRole("dialog", { name: "More" })).queryByRole("button", { name: "Shop" })).toBeNull();
  without.render(<></>).unmount();
  cleanup();

  const kit = editorKit({ document: page(), shop: new FakeShop(), session: { capabilities } });
  kit.render(<><TopBar /><PhoneBar /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  expect(menuItems().slice(-3)).toEqual(["Shop", "Keyboard shortcuts", "About Page Builder CMS"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Shop" }));
  expect(kit.ui.getState().shopOpen).toBe(true);
  kit.ui.getState().setShopOpen(false);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "More" })).getByRole("button", { name: "Shop" }));
  expect(kit.ui.getState().shopOpen).toBe(true);
  expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
});

test("the settings: on, a currency, the products among the collections with a number field and their price among its number fields; saved whole, and handed to the canvas", async () => {
  const fake = new FakeShop();
  const { kit, dialog } = await openShop(fake);
  expect(within(dialog).getByRole("button", { name: "Settings, Off" }).getAttribute("aria-current")).toBe("true");
  expect(within(dialog).getByRole("button", { name: "Orders, No orders yet" })).toBeTruthy();

  const collection = within(dialog).getByLabelText("Collection") as HTMLSelectElement;
  // News has no number field: it is not offered.
  expect([...collection.options].map((option) => option.textContent)).toEqual(["None", "Swim kit"]);
  const price = within(dialog).getByLabelText("Price") as HTMLSelectElement;
  expect([...price.options].map((option) => option.textContent)).toEqual(["None"]);

  await act(async () => fireEvent.click(within(dialog).getByRole("switch", { name: "The shop is on" })));
  await choose(collection, "7");
  // The collection's field "price" is taken as its price at once.
  expect(price.value).toBe("price");
  expect([...price.options].map((option) => option.textContent)).toEqual(["None", "Price", "Weight"]);
  await act(async () => fireEvent.click(within(dialog).getByRole("radio", { name: "€ Euros" })));
  expect(within(dialog).getByText("Changes not saved yet.")).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Save changes" }));

  expect(fake.calls).toContain(`setShop ${JSON.stringify({ enabled: true, currency: "EUR", productsCollectionId: 7, priceField: "price" })}`);
  expect(within(dialog).getByText("Saved.")).toBeTruthy();
  expect(kit.ui.getState().siteShop).toEqual({ enabled: true, currency: "EUR", productsCollectionId: 7, priceField: "price" });
  expect(within(dialog).getByRole("button", { name: "Settings, On, in euros, from Swim kit" })).toBeTruthy();
});

test("a change made while a save travels stays, a change not saved yet, asked about before it is left: the answer takes the place of what was sent alone", async () => {
  const fake = new FakeShop();
  let release = () => {};
  const held = new Promise<void>((done) => {
    release = done;
  });
  const answer = fake.setShop.bind(fake);
  fake.setShop = async (settings) => {
    await held;
    return answer(settings);
  };
  const { kit, dialog } = await openShop(fake);
  await act(async () => fireEvent.click(within(dialog).getByRole("switch", { name: "The shop is on" })));
  await choose(within(dialog).getByLabelText("Collection"), "7");
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" })));
  // While the save travels: the shop switched off again, and euros.
  await act(async () => fireEvent.click(within(dialog).getByRole("switch", { name: "The shop is on" })));
  await act(async () => fireEvent.click(within(dialog).getByRole("radio", { name: "€ Euros" })));
  await act(async () => {
    release();
    await new Promise((done) => setTimeout(done, 0));
  });

  // What was sent is kept, and the canvas draws with it...
  expect(fake.settings).toEqual({ enabled: true, currency: "GBP", productsCollectionId: 7, priceField: "price" });
  expect(kit.ui.getState().siteShop).toEqual(fake.settings);
  // ... and the changes made since stay here, not saved yet.
  expect((within(dialog).getByRole("switch", { name: "The shop is on" }) as HTMLInputElement).checked).toBe(false);
  expect(within(dialog).getByRole("radio", { name: "€ Euros" }).getAttribute("aria-checked")).toBe("true");
  expect(within(dialog).getByLabelText("Collection")).toHaveProperty("value", "7");
  expect(dialog.querySelector(".shop-settings-head .shop-said")?.textContent).toBe("Saved what was sent; a change made since is not saved yet.");
  expect(within(dialog).getByRole("button", { name: "Save changes" }).getAttribute("aria-disabled")).toBeNull();
  // ... and are asked about before anything takes their place.
  await press(within(dialog).getByRole("button", { name: /^Orders, / }));
  const question = within(dialog).getByRole("alertdialog");
  expect(question.textContent).toContain("Leave without saving? The changes to the shop's settings are not saved.");
  await press(within(question).getByRole("button", { name: "Keep editing" }));
  // Saved again, both go.
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.settings).toEqual({ enabled: false, currency: "EUR", productsCollectionId: 7, priceField: "price" });
  expect(dialog.querySelector(".shop-settings-head .shop-said")?.textContent).toBe("Saved.");
});

test("each refusal is said at its control: the editor's own checks before sending, the storage's after", async () => {
  const fake = new FakeShop();
  const { dialog } = await openShop(fake);
  await act(async () => fireEvent.click(within(dialog).getByRole("switch", { name: "The shop is on" })));
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.calls.filter((call) => call.startsWith("setShop"))).toEqual([]);
  expect(within(dialog).getByText("Not saved: a setting needs a change, marked below.")).toBeTruthy();
  const described = (label: string) => document.getElementById(within(dialog).getByLabelText(label).getAttribute("aria-describedby")?.split(" ").at(-1) ?? "")?.textContent;
  expect(described("Collection")).toBe("A shop that is on sells from a collection: choose one.");
  expect(described("Price")).toBe("A shop that is on needs a price: choose a number field.");

  // The storage's own: what this tab could not know.
  await choose(within(dialog).getByLabelText("Collection"), "7");
  fake.refuseNext = [
    { pointer: "/productsCollectionId", keyword: "collectionExists", message: "The site has no collection 7." },
    { pointer: "/currency", keyword: "enum", message: "must be one of GBP, EUR, USD" },
  ];
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(described("Collection")).toBe("That collection is not there any more: choose another.");
  expect(within(dialog).getByRole("radiogroup", { name: "Currency" }).getAttribute("aria-invalid")).toBe("true");
});

// A site upgraded from before the shop may hold /cart; the CMS turns the
// shop on over no page and no collection that holds it.
test("the shop turned on over what holds /cart, refused by the CMS: said at the switch, each naming what holds it and where to free it, and the shop stays off", async () => {
  const fake = new FakeShop();
  const { dialog } = await openShop(fake);
  await act(async () => fireEvent.click(within(dialog).getByRole("switch", { name: "The shop is on" })));
  await choose(within(dialog).getByLabelText("Collection"), "7");
  const page = "The page \"Club news\" is at /cart, the address of the shop's cart: give the page another address and publish it before turning the shop on.";
  const collection = "The collection Notices has the prefix cart, so its entries are below /cart, the address of the shop's cart: give the collection another prefix before turning the shop on.";
  fake.refuseNext = [{ pointer: "/enabled", keyword: "cartAddress", message: page }, { pointer: "/enabled", keyword: "cartPrefix", message: collection }];
  await press(within(dialog).getByRole("button", { name: "Save changes" }));

  expect(within(dialog).getByText("Not saved: a setting needs a change, marked below.")).toBeTruthy();
  const toggle = within(dialog).getByRole("switch", { name: "The shop is on" });
  expect(toggle.getAttribute("aria-invalid")).toBe("true");
  const said = document.getElementById(toggle.getAttribute("aria-describedby")?.split(" ").at(-1) ?? "");
  expect([...(said?.querySelectorAll("p.error") ?? [])].map((p) => p.textContent)).toEqual([
    `${page} Open the page: its address is in the Page tab, under Title and address.`,
    `${collection} Its prefix is in Collections, on the collection's Settings tab.`,
  ]);
  expect(dialog.querySelector(".shop-other")).toBeNull();
  expect(fake.settings.enabled).toBe(false);
});

test("checkout set up, not set up and why, with how to set it up; in the browser, what the full system does; never a key", async () => {
  const fake = new FakeShop();
  const { dialog } = await openShop(fake);
  expect(within(dialog).getByText("Checkout is not set up.")).toBeTruthy();
  expect(within(dialog).getByText(NOT_SET_UP)).toBeTruthy();
  expect(within(dialog).getByText(CHECKOUT_HOW)).toBeTruthy();
  expect(dialog.textContent).not.toMatch(/\b(?:sk|rk)_(?:test|live)_[0-9A-Za-z]/);
  cleanup();

  const ready = new FakeShop();
  ready.checkout = { ready: true, reason: null };
  const opened = await openShop(ready);
  expect(within(opened.dialog).getByText(CHECKOUT_READY)).toBeTruthy();
  expect(within(opened.dialog).queryByText(CHECKOUT_HOW)).toBeNull();
  cleanup();

  const browser = new FakeShop();
  browser.checkout = { ready: false, reason: "This storage is the browser's: its checkout makes an order marked Not paid: browser demo, and reaches no payment." };
  const demo = await openShop(browser, { cmsOrigin: null });
  expect(within(demo.dialog).getByText(CHECKOUT_FULL_SYSTEM)).toBeTruthy();
  expect(within(demo.dialog).queryByText(CHECKOUT_HOW)).toBeNull();
});

test("the orders: a table of when, status, total, items and, once paid, the email; an order whole; with none, how orders come", async () => {
  const empty = new FakeShop();
  const first = await openShop(empty);
  await press(within(first.dialog).getByRole("button", { name: "Orders, No orders yet" }));
  expect(within(first.dialog).getByText("No orders yet", { selector: ".shop-empty-title" })).toBeTruthy();
  expect(within(first.dialog).getByText(/An order is made when a visitor checks out from the cart/)).toBeTruthy();
  cleanup();

  const fake = new FakeShop();
  fake.orders = [
    order(1, { status: "paid", email: "swimmer@example.org", paidAt: "2026-10-02T08:40:00.000Z" }),
    order(2),
    order(3, { status: "expired", lines: [{ entryId: 43, title: "Enamel mug", unitAmount: 990, quantity: 1 }], total: 990 }),
  ];
  const { dialog } = await openShop(fake);
  expect(within(dialog).getByRole("button", { name: "Orders, 3 orders, 1 open" })).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Orders, 3 orders, 1 open" }));
  const rows = within(dialog).getAllByRole("row").slice(1).map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
  expect(rows).toEqual([
    [MADE, "Expired", "£9.90", "1 item: Enamel mug", "None yet"],
    [MADE, "Open", "£48.50", "3 items: Swim cap × 2, Tow float", "None yet"],
    [MADE, "Paid", "£48.50", "3 items: Swim cap × 2, Tow float", "swimmer@example.org"],
  ]);

  await press(within(dialog).getByRole("button", { name: `Order 1, made ${MADE}` }));
  const detail = within(dialog).getByRole("article", { name: "Order 1" });
  expect(within(detail).getAllByRole("row").map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent))).toEqual([
    ["Product", "Each", "Quantity", "Amount"],
    ["Swim cap", "£12.00", "2", "£24.00"],
    ["Tow float", "£24.50", "1", "£24.50"],
    ["Total", "£48.50"],
  ]);
  expect(detail.textContent).toContain("swimmer@example.org");
  // A paid order is not asked about again.
  expect(within(detail).queryByRole("button", { name: "Ask Stripe again" })).toBeNull();
  expect(document.activeElement).toBe(within(detail).getByRole("button", { name: "All orders" }));
  await press(within(detail).getByRole("button", { name: "All orders" }));
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: `Order 1, made ${MADE}` }));
});

test("Ask Stripe again, for an open order: paid, and its row with it; refused as not set up (409), Stripe out of reach (502), each said", async () => {
  const fake = new FakeShop();
  fake.orders = [order(2)];
  const { dialog } = await openShop(fake);
  await press(within(dialog).getByRole("button", { name: "Orders, 1 order, 1 open" }));
  await press(within(dialog).getByRole("button", { name: `Order 2, made ${MADE}` }));
  const detail = () => within(dialog).getByRole("article", { name: "Order 2" });

  fake.fail("refreshOrder", { kind: "refused", status: 409, code: "checkout_not_set_up", message: `Checkout is not set up on this CMS: ${NOT_SET_UP}` });
  await press(within(detail()).getByRole("button", { name: "Ask Stripe again" }));
  expect(detail().textContent).toContain(`Not asked: checkout is not set up on this CMS, so Stripe cannot be asked about the order. ${CHECKOUT_HOW}`);

  fake.fail("refreshOrder", { kind: "unknown", cause: "server", status: 502, message: "POST /api/orders/{id}/refresh failed on the server (502)." });
  await press(within(detail()).getByRole("button", { name: "Ask Stripe again" }));
  expect(detail().textContent).toContain("Not asked: Stripe could not be reached, or did not answer as it should. Nothing changed: try again in a moment.");

  fake.refreshed = (one) => ({ ...one, status: "paid", email: "late@example.org", paidAt: "2026-10-02T08:50:00.000Z" });
  await press(within(detail()).getByRole("button", { name: "Ask Stripe again" }));
  expect(detail().textContent).toContain("Stripe says the order is paid.");
  expect(within(detail()).queryByRole("button", { name: "Ask Stripe again" })).toBeNull();
  expect(document.activeElement).toBe(within(detail()).getByRole("button", { name: "All orders" }));
  expect(within(dialog).getByRole("button", { name: "Orders, 1 order" })).toBeTruthy();
  await press(within(detail()).getByRole("button", { name: "All orders" }));
  expect(within(dialog).getByText("late@example.org")).toBeTruthy();
});

test("a change not saved is asked about before the orders, or closing, take its place", async () => {
  const fake = new FakeShop();
  const { kit, dialog } = await openShop(fake);
  await act(async () => fireEvent.click(within(dialog).getByRole("radio", { name: "$ Dollars" })));
  await press(within(dialog).getByRole("button", { name: "Orders, No orders yet" }));
  const question = within(dialog).getByRole("alertdialog");
  expect(question.textContent).toContain("Leave without saving? The changes to the shop's settings are not saved.");
  await press(within(question).getByRole("button", { name: "Keep editing" }));
  expect(within(dialog).getByRole("radio", { name: "$ Dollars" }).getAttribute("aria-checked")).toBe("true");

  await press(within(dialog).getByRole("button", { name: "Close" }));
  await press(within(within(dialog).getByRole("alertdialog")).getByRole("button", { name: "Leave without saving" }));
  expect(kit.ui.getState().shopOpen).toBe(false);
  expect(fake.calls.filter((call) => call.startsWith("setShop"))).toEqual([]);
});

test("a shop that could not be read says so, with Try again", async () => {
  const fake = new FakeShop();
  fake.fail("getShop", { kind: "unknown", cause: "network", status: null, message: "GET /api/shop could not reach the CMS: offline" });
  const { dialog } = await openShop(fake);
  expect(within(dialog).getByText(/The shop could not be read: GET \/api\/shop could not reach the CMS: offline/)).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Try again" }));
  expect(within(dialog).getByRole("button", { name: "Settings, Off" })).toBeTruthy();
});

test("on a phone's window, one level at a time: the two parts, then the one chosen, with the way back", async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  const fake = new FakeShop();
  const { dialog } = await openShop(fake);
  const body = dialog.querySelector(".shop-body")!;
  expect(body.getAttribute("data-level")).toBe("list");
  await press(within(dialog).getByRole("button", { name: "Settings, Off" }));
  expect(body.getAttribute("data-level")).toBe("pane");
  await press(within(dialog).getByRole("button", { name: "Shop" }));
  expect(body.getAttribute("data-level")).toBe("list");
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Settings, Off" }));
});
