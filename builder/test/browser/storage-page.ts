// The browser half of the storage battery on the browser's adapter
// (../../e2e/browser/battery.spec.ts): a test page of the editor's
// development server, where each adapter is a real createBrowserAdapter on
// Chromium's own IndexedDB. Two pages of one browser context are two tabs
// on one database. What crosses to Node is ../../e2e/browser/wire.ts.
import { isStorageError, type StorageAdapter } from "../../src/storage/adapter.ts";
import { createBrowserAdapter, DATABASE_NAME, LAYOUT, standing } from "../../src/storage/browser.ts";
import { systemClock, type Clock } from "../../src/storage/clock.ts";
import type { StoragePage, WireAnswer } from "../../e2e/browser/wire.ts";

const adapters = new Map<string, StorageAdapter>();

// The time every adapter of the page reads: the real one, unless a test has
// moved it (setTime), to try what depends on how long ago a thing was kept.
let moved: number | null = null;
const clock: Clock = { ...systemClock, now: () => moved ?? Date.now() };

// steps: the layout of a build before this one, its first steps only, for
// a test of the upgrade from the database that build made.
function adapterOf(key: string, steps?: number): StorageAdapter {
  let adapter = adapters.get(key);
  if (!adapter) {
    adapter = createBrowserAdapter({ clock, ...(steps === undefined ? {} : { layout: LAYOUT.slice(0, steps) }) });
    adapters.set(key, adapter);
  }
  return adapter;
}

function decode(value: unknown, progress: Array<[number, number]>): unknown {
  if (Array.isArray(value)) return value.map((item) => decode(item, progress));
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if ("__file" in object) {
    const file = object.__file as { name: string; type: string; base64: string };
    const bytes = atob(file.base64);
    return new File([Uint8Array.from({ length: bytes.length }, (_, i) => bytes.charCodeAt(i))], file.name, { type: file.type });
  }
  const decoded = Object.fromEntries(Object.entries(object).filter(([key]) => key !== "__progress" && key !== "__aborted").map(([key, item]) => [key, decode(item, progress)]));
  if (object.__progress === true) decoded.onProgress = (sent: number, total: number) => progress.push([sent, total]);
  if (object.__aborted === true) decoded.signal = AbortSignal.abort();
  return decoded;
}

const page: StoragePage = {
  open(key, steps) {
    return adapterOf(key, steps).capabilities;
  },
  async call(key, method, args): Promise<WireAnswer> {
    const progress: Array<[number, number]> = [];
    const operation = (adapterOf(key) as unknown as Record<string, (...given: unknown[]) => Promise<unknown>>)[method];
    if (typeof operation !== "function") return { error: { name: "TypeError", message: `the adapter has no ${method}` } };
    try {
      const ok = await operation(...args.map((arg) => decode(arg, progress)));
      return { ok, progress };
    } catch (error) {
      if (isStorageError(error)) return { failure: error.failure };
      return { error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) } };
    }
  },
  async bytes(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return [...new Uint8Array(await response.arrayBuffer())];
  },
  keys(store) {
    return raw(store, "readonly", (objects) => objects.getAllKeys()) as Promise<unknown[]>;
  },
  records(store) {
    return raw(store, "readonly", (objects) => objects.getAll()) as Promise<unknown[]>;
  },
  // How the site stands over these stores, read as the storage reads it
  // (standing), in a transaction that spans them alone: what a build whose
  // database had only these stores would say.
  stands(stores) {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(DATABASE_NAME);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        standing(database.transaction(stores, "readonly")).then(
          (digest) => {
            database.close();
            resolve(digest);
          },
          (error: unknown) => {
            database.close();
            reject(error as Error);
          },
        );
      };
    });
  },
  version() {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(DATABASE_NAME);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const { version } = opening.result;
        opening.result.close();
        resolve(version);
      };
    });
  },
  async put(store, value) {
    await raw(store, "readwrite", (objects) => objects.put(value));
  },
  setTime(at) {
    moved = at === null ? null : Date.parse(at);
  },
};

// One request on a store of the editor's database, opened apart from any
// adapter, and closed after.
function raw(store: string, mode: IDBTransactionMode, ask: (objects: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE_NAME);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const tx = database.transaction(store, mode);
      const asked = ask(tx.objectStore(store));
      tx.oncomplete = () => {
        database.close();
        resolve(asked.result);
      };
      tx.onabort = () => {
        database.close();
        reject(tx.error ?? asked.error);
      };
    };
  });
}

window.storagePage = page;
