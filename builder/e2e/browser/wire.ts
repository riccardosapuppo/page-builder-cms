// What crosses between the storage battery's runner, in Node, and the
// browser's storage adapter in a page of Chromium (../../test/browser/
// storage-page.ts), through page.evaluate, which carries plain values only:
// - a File goes as its name, its type and its bytes (base64: a file of the
//   size the storage refuses, 10 MB and one byte, has to cross);
// - a call's options go as what can cross: onProgress as a request to note
//   the progress, which comes back with the answer and is told to the
//   caller's function then; an AbortSignal as whether it was already
//   aborted (a signal cannot cross, and the battery abandons no call on its
//   way), which the page then gives the call as a signal of its own;
// - a throw comes back as the StorageError's failure, or as the error's
//   name and message.
import type { Capabilities, Failure } from "../../src/storage/adapter.ts";

export interface WireFile {
  __file: { name: string; type: string; base64: string };
}

export interface WireOptions {
  __progress?: true;
  __aborted?: true;
}

export type WireAnswer =
  | { ok: unknown; progress: Array<[number, number]> }
  | { failure: Failure }
  | { error: { name: string; message: string } };

export interface StoragePage {
  // An adapter under this key, made on its first call: a tab of the editor;
  // with steps, of a build before this one, whose layout had only its first
  // steps.
  open(key: string, steps?: number): Capabilities;
  call(key: string, method: string, args: unknown[]): Promise<WireAnswer>;
  // The bytes at an address of this page (an image's object URL).
  bytes(url: string): Promise<number[]>;
  // The keys a store of the editor's database holds, read from IndexedDB
  // itself: what the interface cannot show, such as an image's bytes left
  // behind by its delete.
  keys(store: string): Promise<unknown[]>;
  // The records a store holds, read from IndexedDB itself (a store of no
  // blob: a blob does not cross to Node).
  records(store: string): Promise<unknown[]>;
  // How the site stands over these stores alone, as the storage reads it:
  // what a build whose database had only these stores would say.
  stands(stores: string[]): Promise<string>;
  // The version of the editor's database.
  version(): Promise<number>;
  // Writes a record straight into a store, past the adapter: a record as
  // an older or broken build might have left it.
  put(store: string, value: unknown): Promise<void>;
  // Moves the adapters' clock to this time (ISO 8601), or back to the real
  // one with null: every adapter of the page reads the same clock.
  setTime(at: string | null): void;
}

declare global {
  interface Window {
    storagePage?: StoragePage;
  }
}
