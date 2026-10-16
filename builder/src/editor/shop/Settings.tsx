// The shop's settings (docs/decisions/shop-on-collections.md): on or off,
// the currency, the collection whose entries are the products, offered
// among those with a number field, and that number field, the price;
// then whether a checkout reaches Stripe, and if not, why, and what to do.
// Checked by the shop's rules before they are sent (../../shared/shop.ts,
// checkShop), each refusal at its control, the storage's the same way.
// Saved with their own button, the whole settings at once, as the storage
// takes them; the controls stay at hand while a save travels, and a change
// made meanwhile stays, not saved yet (afterSave); a change not saved is
// asked about before it is left (./ShopScreen.tsx).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { sameJson } from "../../document/json.ts";
import { checkShop, CURRENCIES, type Currency, type ShopFault, type ShopSettings } from "../../shared/shop.ts";
import { isStorageError, type Collection, type FieldError, type Shop } from "../../storage/adapter.ts";
import { RadioField, SelectField, Toggle } from "../controls.tsx";
import type { ShopStorage } from "./context.ts";
import { checkoutWords, currencyLabel, CURRENCY_NAMES, numberFields, pricePicked, settingRefusal } from "./words.ts";

export interface ShopSettingsProps {
  storage: ShopStorage;
  shop: Shop;
  collections: readonly Collection[];
  // The browser's storage: what the full system does is said where the
  // CMS's would say how checkout is set up.
  inBrowser: boolean;
  onSaved: (shop: Shop) => void;
  onDirty: (dirty: boolean) => void;
}

// The settings' members, by which a refusal is said at its control.
type Member = "enabled" | "currency" | "productsCollectionId" | "priceField";
type Issues = Readonly<Record<Member | "other", readonly string[]>>;
const NO_ISSUES: Issues = { enabled: [], currency: [], productsCollectionId: [], priceField: [], other: [] };
const MEMBERS: readonly Member[] = ["enabled", "currency", "productsCollectionId", "priceField"];

const NONE = "";

export const settingsOf = (shop: Shop): ShopSettings => ({ enabled: shop.enabled, currency: shop.currency, productsCollectionId: shop.productsCollectionId, priceField: shop.priceField });

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// The refusals at their controls: the editor's own (the shop's rules) and
// the storage's (Invalid), which point into the settings sent the same
// way; anything at no member is said above the controls.
export function settingIssues(findings: ReadonlyArray<Pick<ShopFault | FieldError, "pointer" | "keyword" | "message">>): Issues {
  const out: Record<Member | "other", string[]> = { enabled: [], currency: [], productsCollectionId: [], priceField: [], other: [] };
  for (const { pointer, keyword, message } of findings) {
    const member = MEMBERS.find((name) => pointer === `/${name}`);
    const list = member === undefined ? out.other : out[member];
    const sentence = member === undefined ? message : settingRefusal(member, keyword, message);
    if (!list.includes(sentence)) list.push(sentence);
  }
  return out;
}

const anyIssue = (issues: Issues): boolean => Object.values(issues).some((list) => list.length > 0);

// The settings once a save is answered: the storage's answer, but for a
// member changed here while the save travelled, which keeps its new value.
export function afterSave(sent: ShopSettings, now: ShopSettings, back: ShopSettings): ShopSettings {
  const keep = <K extends keyof ShopSettings>(key: K): ShopSettings[K] => (now[key] === sent[key] ? back[key] : now[key]);
  return { enabled: keep("enabled"), currency: keep("currency"), productsCollectionId: keep("productsCollectionId"), priceField: keep("priceField") };
}

export function ShopSettingsForm({ storage, shop, collections, inBrowser, onSaved, onDirty }: ShopSettingsProps) {
  const id = useId();
  // The settings as changed: drawn from their state, and kept in a ref too,
  // which each change and Save read at once, as a collection's settings
  // are (../collections/Settings.tsx): a Save made from a drawing before the
  // last change, or an answer that comes after one, would undo it.
  const [draft, setDrawn] = useState<ShopSettings>(() => settingsOf(shop));
  const latest = useRef(draft);
  const setDraft = useCallback((next: ShopSettings | ((now: ShopSettings) => ShopSettings)) => {
    latest.current = typeof next === "function" ? next(latest.current) : next;
    setDrawn(latest.current);
  }, []);
  const [saved, setSaved] = useState<ShopSettings>(() => settingsOf(shop));
  const [issues, setIssues] = useState<Issues>(NO_ISSUES);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const changed = !sameJson(draft, saved);
  useEffect(() => {
    onDirty(changed);
  }, [changed, onDirty]);
  useEffect(() => {
    if (!changed) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  const offered = collections.filter((collection) => numberFields(collection).length > 0);
  const chosen = collections.find((collection) => collection.id === draft.productsCollectionId) ?? null;
  const prices = chosen ? numberFields(chosen) : [];
  const change = (next: Partial<ShopSettings>) => {
    setDraft((now) => ({ ...now, ...next }));
    setSaid("");
    return null;
  };

  const save = async () => {
    const sending = latest.current;
    const checked = checkShop(sending, (wanted) => {
      const found = collections.find((collection) => collection.id === wanted);
      return found ? { id: found.id, name: found.name, fields: found.fields } : null;
    });
    if (!checked.ok) {
      setIssues(settingIssues(checked.faults));
      setSaid("Not saved: a setting needs a change, marked below.");
      return;
    }
    setIssues(NO_ISSUES);
    setBusy(true);
    setSaid("");
    try {
      const outcome = await storage.setShop(checked.settings);
      if (!outcome.ok) {
        const found = settingIssues(outcome.problem.errors);
        setIssues(found);
        setSaid(anyIssue(found) ? "Not saved: a setting needs a change, marked below." : `Not saved: ${outcome.problem.message}`);
        return;
      }
      const kept = settingsOf(outcome.value);
      const now = afterSave(sending, latest.current, kept);
      setSaved(kept);
      setDraft(now);
      setSaid(sameJson(now, kept) ? "Saved." : "Saved what was sent; a change made since is not saved yet.");
      onSaved(outcome.value);
    } catch (error) {
      setSaid(`Not saved: ${describe(error)} Your changes are still here: try again.`);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setDraft(saved);
    setIssues(NO_ISSUES);
    setSaid("Changes discarded.");
  };

  const checkout = checkoutWords(shop.checkout, inBrowser);
  const collectionChoices = [
    { value: NONE, label: "None" },
    ...(draft.productsCollectionId !== null && !offered.some((collection) => collection.id === draft.productsCollectionId)
      ? [{ value: String(draft.productsCollectionId), label: chosen ? `${chosen.name}: no number field` : "A collection no longer there" }]
      : []),
    ...offered.map((collection) => ({ value: String(collection.id), label: collection.name })),
  ];
  const priceChoices = [
    { value: NONE, label: "None" },
    ...(draft.priceField !== null && !prices.some((field) => field.key === draft.priceField) ? [{ value: draft.priceField, label: `${draft.priceField}: no such number field` }] : []),
    ...prices.map((field) => ({ value: field.key, label: field.label })),
  ];

  return (
    <div className="shop-settings">
      <div className="shop-settings-head">
        <p className="shop-said" role="status">{said || (changed ? "Changes not saved yet." : "")}</p>
        <div className="shop-actions">
          {changed && <button className="btn btn-small btn-quiet" type="button" aria-disabled={busy ? true : undefined} onClick={busy ? undefined : discard}>Discard changes</button>}
          <button className="btn btn-small btn-dark" type="button" data-save-shop="" aria-disabled={busy || !changed ? true : undefined} title={changed ? undefined : "No changes to save."} onClick={busy || !changed ? undefined : () => void save()}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
      {issues.other.length > 0 && <div className="shop-other">{issues.other.map((sentence) => <p key={sentence} className="error">{sentence}</p>)}</div>}

      <Section id={`${id}-on`} title="The shop">
        <div className="field">
          <Toggle label="The shop is on" checked={draft.enabled} field="/enabled" issues={issues.enabled} describedById={`${id}-on-hint`} onChange={(enabled) => change({ enabled })} />
          <p className="hint" id={`${id}-on-hint`}>
            {draft.enabled
              ? "On, the products are sold: Add to cart puts them in a visitor's cart, and prices are drawn in the shop's currency."
              : "Off, nothing is sold: Add to cart draws nothing, prices are drawn as numbers, and the cart's addresses are not found."}
          </p>
        </div>
        <RadioField<Currency>
          label="Currency"
          look="seg"
          choices={CURRENCIES.map((currency) => ({ value: currency, label: currencyLabel(currency) }))}
          value={draft.currency}
          field="/currency"
          issues={issues.currency}
          hint="Prices are written in it, and Stripe is asked to charge it."
          onChange={(currency) => change({ currency })}
        />
      </Section>

      <Section id={`${id}-products`} title="Products">
        <SelectField
          label="Collection"
          choices={collectionChoices}
          value={draft.productsCollectionId === null ? NONE : String(draft.productsCollectionId)}
          field="/productsCollectionId"
          issues={issues.productsCollectionId}
          hint={offered.length === 0
            ? "No collection has a number field yet: add one in Collections, or make a collection from the Products preset."
            : "Each published entry of it is a product. Collections with a number field are offered."}
          onChange={(value) => {
            const next = collections.find((collection) => String(collection.id) === value) ?? null;
            return change({ productsCollectionId: next?.id ?? null, priceField: next ? pricePicked(next) : null });
          }}
        />
        <SelectField
          label="Price"
          choices={priceChoices}
          value={draft.priceField ?? NONE}
          field="/priceField"
          issues={issues.priceField}
          hint={chosen
            ? `The number field of ${chosen.name} that is the price, in ${CURRENCY_NAMES[draft.currency].toLowerCase()}, with two decimals at most.`
            : "Choose the collection first: its number fields are offered here."}
          onChange={(value) => change({ priceField: value === NONE ? null : value })}
        />
      </Section>

      <Section id={`${id}-checkout`} title="Checkout">
        <p className="shop-checkout" data-ready={shop.checkout.ready ? "" : undefined}>
          <span className={shop.checkout.ready ? "dot-live" : "dot-draft"} aria-hidden="true" />
          <span>{checkout.state}</span>
        </p>
        {checkout.reason !== null && <p className="shop-checkout-reason">{checkout.reason}</p>}
        {checkout.how !== null && <p className="hint">{checkout.how}</p>}
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="shop-section" aria-labelledby={id}>
      <h4 className="shop-section-title" id={id}>{title}</h4>
      {children}
    </section>
  );
}
