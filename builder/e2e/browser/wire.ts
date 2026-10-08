// What crosses between the storage battery's runner, in Node, and the
// browser's storage adapter in a page of Chromium (../../test/browser/
// storage-page.ts), through page.evaluate, which carries plain values only:
// - a File goes as its name, its type and its bytes;
// - a call's options go as what can cross: onProgress as a request to note
//   the progress, which comes back with the answer and is told to the
//   caller's function then; an AbortSignal stays behind, so a call cannot
//   be abandoned from Node (the battery abandons none);
// - a throw comes back as the StorageError's failure, or as the error's
//   name and message.
import type { Capabilities, Failure } from "../../src/storage/adapter.ts";

export interface WireFile {
  __file: { name: string; type: string; bytes: number[] };
}

export interface WireOptions {
  __progress?: true;
}

export type WireAnswer =
  | { ok: unknown; progress: Array<[number, number]> }
  | { failure: Failure }
  | { error: { name: string; message: string } };

export interface StoragePage {
  // An adapter under this key, made on its first call: a tab of the editor.
  open(key: string): Capabilities;
  call(key: string, method: string, args: unknown[]): Promise<WireAnswer>;
  // The bytes at an address of this page (an image's object URL).
  bytes(url: string): Promise<number[]>;
  // The keys a store of the editor's database holds, read from IndexedDB
  // itself: what the interface cannot show, such as an image's bytes left
  // behind by its delete.
  keys(store: string): Promise<unknown[]>;
  // Writes a record straight into a store, past the adapter: a record as
  // an older or broken build might have left it.
  put(store: string, value: unknown): Promise<void>;
}

declare global {
  interface Window {
    storagePage?: StoragePage;
  }
}
