// The orders the shop's checkout made, the newest first (the storage's
// order): a table of when each was made, its status, its total in the
// shop's words for an amount, its items in words and, once paid, the email
// the buyer gave Stripe; a row opens the order whole in the table's place:
// its lines as they were sold, its total, when it was made and paid, and
// its session at Stripe; Ask Stripe again, for an order still open, asks
// whether it was paid since, and says what came back, or why nothing did.
// With none yet, how an order comes.
//
// The orders are read when this opens, and again on Try again. What a
// buyer gave Stripe is a stranger's text: drawn as React text, never as
// markup.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { moneyWords } from "../../shared/shop.ts";
import { isStorageError, type Order } from "../../storage/adapter.ts";
import { useEnv } from "../context.tsx";
import { serverTime } from "../history-words.ts";
import { Icon } from "../icons.tsx";
import type { ShopStorage } from "./context.ts";
import { emailOf, itemCount, itemsWords, refreshedWords, refreshFailure, statusWords, totalWords } from "./words.ts";

export interface OrdersProps {
  storage: ShopStorage;
  inBrowser: boolean;
  // The orders as last read, for the screen's list and its count.
  onRead: (orders: readonly Order[]) => void;
}

type Rows = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; orders: Order[] };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// How an order comes, for a shop that has none yet.
export function noOrdersWords(inBrowser: boolean): string {
  return inBrowser
    ? "In the full system, an order is made when a visitor checks out from the cart, where Add to cart, on a product's page, puts the products. In this browser, the demo's checkout makes it, marked Not paid: browser demo, since it reaches no payment."
    : "An order is made when a visitor checks out from the cart, where Add to cart, on a product's page, puts the products: it is kept here, open, while the visitor pays on Stripe's page, and paid once Stripe says so.";
}

export function Orders({ storage, inBrowser, onRead }: OrdersProps) {
  const { clock } = useEnv();
  const id = useId();
  const [rows, setRows] = useState<Rows>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const now = clock.now();

  useEffect(() => {
    let current = true;
    storage.listOrders().then(
      (orders) => {
        if (!current) return;
        setRows({ phase: "ready", orders });
        onRead(orders);
      },
      (error: unknown) => {
        if (current) setRows({ phase: "failed", message: describe(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [storage, attempt, onRead]);

  useLayoutEffect(() => {
    const selector = focusNext.current;
    if (selector === null) return;
    focusNext.current = null;
    box.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  if (rows.phase === "loading") return <p className="shop-state" role="status">Reading the orders…</p>;
  if (rows.phase === "failed") {
    return (
      <div className="shop-state">
        <p className="error"><Icon name="error" />The orders could not be read: {rows.message}</p>
        <button className="btn btn-small btn-secondary" type="button" onClick={() => {
          setRows({ phase: "loading" });
          setAttempt((n) => n + 1);
        }}>Try again</button>
      </div>
    );
  }
  const orders = rows.orders;
  const order = orders.find((one) => one.id === opened) ?? null;
  if (order) {
    return (
      <div ref={box}>
        <OrderDetail
          storage={storage}
          order={order}
          now={now}
          onBack={() => {
            focusNext.current = `[data-order-id="${order.id}"]`;
            setOpened(null);
          }}
          onChanged={(fresh) => {
            const next = orders.map((one) => (one.id === fresh.id ? fresh : one));
            setRows({ phase: "ready", orders: next });
            onRead(next);
          }}
        />
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="shop-empty">
        <p className="shop-empty-title">No orders yet</p>
        <p className="hint">{noOrdersWords(inBrowser)}</p>
      </div>
    );
  }
  return (
    <div ref={box}>
      <table className="shop-table" aria-labelledby={`${id}-caption`}>
        <caption id={`${id}-caption`} className="visually-hidden">Orders, the newest first</caption>
        <thead>
          <tr>
            <th scope="col" className="shop-col-when">Made</th>
            <th scope="col" className="shop-col-status">Status</th>
            <th scope="col" className="shop-col-total">Total</th>
            <th scope="col">Items</th>
            <th scope="col" className="shop-col-email">Email</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((one) => (
            <tr key={one.id} data-status={one.status}>
              <th scope="row">
                <button className="shop-open" type="button" data-order-id={one.id} aria-label={`Order ${one.id}, made ${serverTime(one.createdAt, now)}`} onClick={() => setOpened(one.id)}>
                  {serverTime(one.createdAt, now)}
                </button>
              </th>
              <td><span className={`shop-status shop-status-${one.status}`}>{statusWords(one)}</span></td>
              <td className="shop-amount">{totalWords(one)}</td>
              <td className="shop-items"><span className="shop-items-line">{itemCount(one.lines)}: {itemsWords(one.lines)}</span></td>
              <td className="shop-email">{emailOf(one) ?? <span className="shop-none">None yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One order, whole, with Ask Stripe again while it is open.
function OrderDetail({ storage, order, now, onBack, onChanged }: { storage: ShopStorage; order: Order; now: number; onBack: () => void; onChanged: (order: Order) => void }) {
  const id = useId();
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState("");
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  const email = emailOf(order);

  const ask = async () => {
    setAsking(true);
    setSaid("");
    try {
      const fresh = await storage.refreshOrder(order.id);
      onChanged(fresh);
      setSaid(refreshedWords(fresh));
      // Settled, the order is asked about no more: its key goes, and the
      // focus to the way back.
      if (fresh.status !== "open") back.current?.focus();
    } catch (error) {
      setSaid(refreshFailure(error));
    } finally {
      setAsking(false);
    }
  };

  return (
    <article className="shop-order" aria-labelledby={`${id}-title`}>
      <div className="shop-order-head">
        <button ref={back} className="btn btn-small btn-quiet shop-back" type="button" onClick={onBack}><Icon name="arrow-left" />All orders</button>
        <h3 className="shop-order-title" id={`${id}-title`}>Order {order.id}</h3>
        <p className="shop-order-state">
          <span className={`shop-status shop-status-${order.status}`}>{statusWords(order)}</span>
          <span className="shop-sep" aria-hidden="true">·</span>
          <span>{totalWords(order)}</span>
        </p>
      </div>
      <dl className="shop-facts">
        <div><dt>Made</dt><dd>{serverTime(order.createdAt, now)}</dd></div>
        {order.paidAt !== null && <div><dt>Paid</dt><dd>{serverTime(order.paidAt, now)}</dd></div>}
        <div><dt>Email</dt><dd className={email === null ? "shop-none" : undefined}>{email ?? (order.status === "paid" ? "Stripe gave none" : "Given once it is paid")}</dd></div>
        <div><dt>At Stripe</dt><dd className={order.stripeSessionId === null ? "shop-none" : "shop-session"}>{order.stripeSessionId ?? (order.status === "demo" ? "None: the browser demo's checkout reaches no payment" : "None")}</dd></div>
      </dl>
      <table className="shop-lines" aria-labelledby={`${id}-lines`}>
        <caption id={`${id}-lines`}>{itemCount(order.lines)}, as they were sold</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="shop-num">Each</th>
            <th scope="col" className="shop-num">Quantity</th>
            <th scope="col" className="shop-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line, index) => (
            <tr key={`${line.entryId}-${index}`}>
              <th scope="row">{line.title}</th>
              <td className="shop-num">{moneyWords(line.unitAmount, order.currency)}</td>
              <td className="shop-num">{line.quantity}</td>
              <td className="shop-num">{moneyWords(line.unitAmount * line.quantity, order.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>Total</th>
            <td className="shop-num">{totalWords(order)}</td>
          </tr>
        </tfoot>
      </table>
      {order.status === "open" && (
        <div className="shop-ask">
          <button className="btn btn-secondary" type="button" data-ask-stripe="" aria-disabled={asking ? true : undefined} onClick={asking ? undefined : () => void ask()}>
            <Icon name="refresh" />{asking ? "Asking Stripe…" : "Ask Stripe again"}
          </button>
          <p className="hint">Open until Stripe says it is paid: a visitor who paid and never came back to the thanks page leaves it so.</p>
        </div>
      )}
      <p className="shop-said" role="status">{said}</p>
    </article>
  );
}
