// The document is JSON, and so is every value a command carries: these are
// the few operations on JSON values the commands need, written for JSON's
// own rules (an absent key is not a key set to undefined, and key order
// does not make two objects different).

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Deep equality of two JSON values. Objects are equal when they have the
// same keys with equal values, in any order; a key holding undefined is a
// key, so { a: undefined } is not {}.
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    // NaN never reaches a document (the application rules refuse it), so
    // === is enough for the rest.
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  if (Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

// A deep copy of a JSON value, so a command never shares an object with the
// document it was made from.
export function copyJson<T>(value: T): T {
  return structuredClone(value);
}

// The object with `key` set to `value`. The key keeps its place if it was
// there; a new key goes at `at` (the end when at is undefined). Built
// through entries, never by assignment, so a key such as "__proto__" stays
// an ordinary member, as JSON.parse makes it.
export function withKey(object: Record<string, unknown>, key: string, value: unknown, at?: number): Record<string, unknown> {
  const entries = Object.entries(object);
  const found = entries.findIndex(([k]) => k === key);
  if (found >= 0) entries[found] = [key, value];
  else entries.splice(at ?? entries.length, 0, [key, value]);
  return Object.fromEntries(entries);
}

// The object without `key`.
export function withoutKey(object: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));
}

// Where `key` sits among the object's keys, or -1.
export function keyIndex(object: Record<string, unknown>, key: string): number {
  return Object.keys(object).indexOf(key);
}
