// The shop, opened from the mark's menu beside Collections and Form
// responses (and from the phone's More), where the storage keeps a shop
// (docs/decisions/shop-on-collections.md). On the left its two parts, each
// with a line of what it holds: the settings ("On, in pounds, from
// Products") and the orders ("3 orders, 1 open"); on the right the one
// chosen: the settings' form (./Settings.tsx), or the orders' table, an
// order opened whole in its place (./Orders.tsx).
//
// The window is the Collections screen's (../collections/): its size,
// head and footer, Esc and Close, the focus back where it was when it
// closes. On a phone's window it is the whole window, and goes one level
// at a time: the two parts, then the one chosen, with the way back.
//
// The settings are saved by their own Save, through the storage
// (./context.ts), not by the page: they are not commands on the document,
// are not in its history, and Undo does not take them back. A change not
// saved is asked about before anything takes its place: the orders, the
// way back, closing. Once saved, the canvas draws with them at once.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { isStorageError, type Collection, type Order, type Shop } from "../../storage/adapter.ts";
import { LeaveQuestion } from "../collections/CollectionsScreen.tsx";
import { useEnv, useUi } from "../context.tsx";
import { Dialog } from "../dialog.tsx";
import { Icon } from "../icons.tsx";
import { useLayoutMode } from "../layout-mode.ts";
import { useOptionalSession } from "../session.tsx";
import { useShopStorage, type ShopStorage } from "./context.ts";
import { Orders } from "./Orders.tsx";
import { settingsOf, ShopSettingsForm } from "./Settings.tsx";
import "./shop.css";
import { ordersLine, settingsLine } from "./words.ts";

// The screen, while the interface's store says it is open.
export function ShopScreen() {
  const storage = useShopStorage();
  const open = useUi((u) => u.shopOpen);
  const { ui } = useEnv();
  if (!storage || !open) return null;
  return <Screen storage={storage} onClose={() => ui.getState().setShopOpen(false)} />;
}

type Part = "settings" | "orders";
type Read = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; shop: Shop; collections: Collection[] };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

const PART_NAMES: Readonly<Record<Part, string>> = { settings: "Settings", orders: "Orders" };
// Each part's icon: the shop's storefront for its settings, a receipt for
// its orders.
const PART_ICONS: Readonly<Record<Part, "shop" | "receipt">> = { settings: "shop", orders: "receipt" };

function Screen({ storage, onClose }: { storage: ShopStorage; onClose: () => void }) {
  const { ui } = useEnv();
  const id = useId();
  // The browser's storage serves no page and reaches no Stripe: the
  // screen says what the full system does in its place.
  const inBrowser = useOptionalSession()?.cmsOrigin === null;
  // On a phone's window, the parts are a level of their own: none chosen
  // at first.
  const narrow = useLayoutMode() === "narrow";
  const [part, setPart] = useState<Part | null>(narrow ? null : "settings");
  const [read, setRead] = useState<Read>({ phase: "loading" });
  const [orders, setOrders] = useState<readonly Order[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState<{ next: () => void } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  // Whether the settings hold changes not saved.
  const dirty = useRef(false);
  const onDirty = useCallback((on: boolean) => {
    dirty.current = on;
  }, []);

  // The settings and the collections they choose among, read when the
  // screen opens and on Try again; and the orders, for their count.
  useEffect(() => {
    let current = true;
    Promise.all([storage.getShop(), storage.listCollections()]).then(
      ([shop, collections]) => {
        if (current) setRead({ phase: "ready", shop, collections });
      },
      (error: unknown) => {
        if (current) setRead({ phase: "failed", message: describe(error) });
      },
    );
    storage.listOrders().then(
      (list) => {
        if (current) setOrders(list);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [storage, attempt]);

  useLayoutEffect(() => {
    const selector = focusNext.current;
    if (selector === null) return;
    focusNext.current = null;
    body.current?.closest(".dialog")?.querySelector<HTMLElement>(selector)?.focus();
  });

  // Changes not saved are asked about first; then `next`.
  const ask = (next: () => void) => {
    if (!dirty.current) {
      next();
      return;
    }
    setLeaving({ next });
  };
  const choose = (wanted: Part) => {
    if (wanted === part) return;
    ask(() => {
      dirty.current = false;
      setPart(wanted);
    });
  };
  const toList = () => ask(() => {
    dirty.current = false;
    focusNext.current = part === null ? "[data-shop-part]" : `[data-shop-part="${part}"]`;
    setPart(null);
  });
  const close = () => ask(() => {
    dirty.current = false;
    onClose();
  });

  // Whether changes remain is the settings' to say (onDirty): one made
  // while the save travelled is still not saved.
  const saved = (shop: Shop) => {
    setRead((before) => (before.phase === "ready" ? { ...before, shop } : before));
    // The canvas draws with them at once: prices, Add to cart, Insert.
    ui.getState().setSiteShop(settingsOf(shop));
  };
  const counted = useCallback((list: readonly Order[]) => setOrders(list), []);

  const level = part === null ? "list" : "pane";
  const lines: Readonly<Record<Part, string>> = {
    settings: read.phase === "ready" ? settingsLine(read.shop, read.collections) : "",
    orders: orders === null ? "" : ordersLine(orders),
  };

  return (
    <Dialog
      title="Shop"
      className="dlg-shop"
      bodyClassName="shop-main"
      closeLabel="Close the shop"
      tools={<p className="dlg-count">{orders === null ? "" : ordersLine(orders)}</p>}
      onClose={close}
      footer={
        <>
          <p className="hint">The settings are saved with their own button, apart from the page: Undo does not take them back.</p>
          <button className="btn btn-secondary" type="button" data-close="" onClick={close}>Close</button>
        </>
      }
    >
      <div ref={body} className="shop-body" data-level={level}>
        {read.phase === "loading" && <p className="shop-state shop-state-wide" role="status">Reading the shop…</p>}
        {read.phase === "failed" && (
          <div className="shop-state shop-state-wide">
            <p className="error"><Icon name="error" />The shop could not be read: {read.message}</p>
            <button className="btn btn-small btn-secondary" type="button" onClick={() => {
              setRead({ phase: "loading" });
              setAttempt((n) => n + 1);
            }}>Try again</button>
          </div>
        )}
        {read.phase === "ready" && (
          <>
            <nav className="shop-nav" aria-labelledby={`${id}-nav`}>
              <h3 className="group-title" id={`${id}-nav`}>Shop</h3>
              <ul>
                {(["settings", "orders"] as const).map((one) => (
                  <li key={one}>
                    <button
                      className="shop-part"
                      type="button"
                      data-shop-part={one}
                      aria-current={one === part ? "true" : undefined}
                      aria-label={lines[one] === "" ? PART_NAMES[one] : `${PART_NAMES[one]}, ${lines[one]}`}
                      onClick={() => choose(one)}
                    >
                      <Icon name={PART_ICONS[one]} className="i shop-part-icon" />
                      <span className="shop-part-name">{PART_NAMES[one]}</span>
                      <span className="shop-part-meta">{lines[one]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <section className="shop-pane" aria-label={part === null ? "Shop" : PART_NAMES[part]}>
              {leaving && (
                <LeaveQuestion
                  what="The changes to the shop's settings are not saved."
                  onStay={() => setLeaving(null)}
                  onLeave={() => {
                    const next = leaving.next;
                    setLeaving(null);
                    next();
                  }}
                />
              )}
              {part !== null && (
                <div className="shop-head">
                  <button className="btn btn-small btn-quiet shop-back-list" type="button" onClick={toList}><Icon name="arrow-left" />Shop</button>
                  <h3 className="shop-head-name">{PART_NAMES[part]}</h3>
                </div>
              )}
              {part === "settings" && (
                <ShopSettingsForm storage={storage} shop={read.shop} collections={read.collections} inBrowser={inBrowser} onSaved={saved} onDirty={onDirty} />
              )}
              {part === "orders" && <Orders storage={storage} inBrowser={inBrowser} onRead={counted} />}
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}
