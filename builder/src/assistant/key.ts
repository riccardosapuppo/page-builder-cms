// The key a person gives the Assistant for a model of theirs, Anthropic's
// or OpenAI's (./README.md): kept in this object's memory, and nowhere
// else. No storage of the browser's (local, session, IndexedDB, a cookie),
// no address, no page, no history, no log ever holds it, so there is
// nothing to read back, decrypt or leak once it is forgotten. It is lent
// for each call to the provider (./providers.ts), which goes from this
// browser to the provider and nowhere else; the page's
// Content-Security-Policy lets it connect to nothing else.
//
// It is forgotten when the person asks; after IDLE_MS without a call; and
// when the page is left (pagehide: the tab closed or reloaded, another
// address opened, even into the browser's back-forward cache, which would
// otherwise bring this memory back). What the interface sees of it is the
// provider and its last four characters, for the person to know it again.
import type { Clock, ClockTimer } from "../storage/clock.ts";

export const PROVIDERS = ["anthropic", "openai"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_NAMES: Readonly<Record<ProviderId, string>> = { anthropic: "Anthropic", openai: "OpenAI" };

// Half an hour without a call, and the key is forgotten.
export const IDLE_MS = 30 * 60 * 1000;

// What the interface may see of a key kept.
export interface Held {
  provider: ProviderId;
  hint: string;
}

// Why a key went: the person asked, it was not used for IDLE_MS, the page
// was left.
export type ForgetReason = "asked" | "idle" | "left";

export interface KeyKeeper {
  held(): Held | null;
  keep(provider: ProviderId, key: string): void;
  forget(why?: ForgetReason): void;
  // A number that changes each time a key is kept or forgotten: a call
  // takes it when it starts, and is lent the key only if it is the same
  // when the key is lent, so a key changed meanwhile (another provider's,
  // pasted while an image was made smaller) never goes to the provider the
  // call was made for.
  ticket(): number;
  // Lends the key to `call`, a request to the provider, which counts as a
  // use; throws when no key is kept, or when `ticket` is not the one now.
  lend<T>(call: (key: string, provider: ProviderId) => T, ticket?: number): T;
  // Told when a key is kept (why null) or forgotten.
  subscribe(listener: (held: Held | null, why: ForgetReason | null) => void): () => void;
  // Forgets the key when `page` is left, until the function it returns is
  // called, which forgets the key too: the editor watches the window while
  // it is there (an effect, run again as often as React likes).
  watch(page: EventTarget): () => void;
}

// The last four characters, after an ellipsis: enough to tell two keys
// apart, never enough to use one.
export const hintOf = (key: string): string => `…${key.slice(-4)}`;

export function createKeyKeeper(clock: Clock): KeyKeeper {
  let key: string | null = null;
  let provider: ProviderId | null = null;
  let timer: ClockTimer | null = null;
  let count = 0;
  const listeners = new Set<(held: Held | null, why: ForgetReason | null) => void>();

  const held = (): Held | null => (key === null || provider === null ? null : { provider, hint: hintOf(key) });
  const tell = (why: ForgetReason | null): void => {
    const now = held();
    for (const listener of listeners) listener(now, why);
  };
  const stopTimer = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const wait = (): void => {
    stopTimer();
    timer = clock.setTimeout(() => forget("idle"), IDLE_MS);
  };
  function forget(why: ForgetReason = "asked"): void {
    stopTimer();
    if (key === null) return;
    key = null;
    provider = null;
    count += 1;
    tell(why);
  }
  const left = (): void => forget("left");

  return {
    held,
    keep(which, given) {
      const trimmed = given.trim();
      if (trimmed === "") throw new Error("A key is needed.");
      key = trimmed;
      provider = which;
      count += 1;
      wait();
      tell(null);
    },
    forget,
    ticket: () => count,
    lend(call, ticket) {
      if (key === null || provider === null) throw new Error("No key is kept.");
      if (ticket !== undefined && ticket !== count) throw new Error("The key changed.");
      wait();
      return call(key, provider);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    watch(page) {
      page.addEventListener("pagehide", left);
      return () => {
        page.removeEventListener("pagehide", left);
        forget("left");
      };
    },
  };
}
