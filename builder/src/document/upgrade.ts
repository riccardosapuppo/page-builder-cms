// Brings a stored document up to the current schemaVersion: the twin of the
// server's cms/app/models/block_document/upgrade.rb, step for step and
// refusal for refusal. The server's is the one that decides; this one is
// for documents that never pass through it, the browser-only demo's
// (stage 6), which keeps its drafts and versions in the browser.
//
// When the shape of the document changes, schemaVersion goes up by one and
// a step is added to STEPS here and to STEPS there, each a pure function
// from a document of version n to one of version n + 1. Version 1 is the
// first shape, so there is no step yet: a version 1 document goes through
// unchanged. The loop is tested with steps of its own (upgrade.test.ts),
// as the server's is.
import { SCHEMA_VERSION, type PageDocument } from "../shared/document.ts";
import { validateDocument, type DocumentError } from "../shared/validate.ts";
import { isObject } from "./json.ts";

export const CURRENT: number = SCHEMA_VERSION;

export type UpgradeStep = (document: Record<string, unknown>) => unknown;

// STEPS[n] takes a document of schemaVersion n and returns one of n + 1.
export const STEPS: Readonly<Record<number, UpgradeStep>> = Object.freeze({});

export class UnsupportedDocument extends Error {
  override name = "UnsupportedDocument";
}

export interface UpgradeOptions {
  steps?: Readonly<Record<number, UpgradeStep>>;
  current?: number;
}

const versionOf = (document: unknown): unknown => (isObject(document) ? document.schemaVersion : undefined);

// The same messages as the server's, so a refusal reads the same from
// either side.
export function upgrade(document: unknown, { steps = STEPS, current = CURRENT }: UpgradeOptions = {}): unknown {
  const stored = versionOf(document);
  if (typeof stored !== "number" || !Number.isInteger(stored)) {
    throw new UnsupportedDocument("The document has no integer schemaVersion.");
  }
  let version: number = stored;
  if (version > current) {
    throw new UnsupportedDocument(`The document is of schemaVersion ${version}, newer than this server's ${current}.`);
  }
  let upgraded: unknown = document;
  while (version < current) {
    const step: UpgradeStep | undefined = steps[version];
    if (!step) throw new UnsupportedDocument(`There is no upgrade from schemaVersion ${version}.`);
    upgraded = step(upgraded as Record<string, unknown>);
    const next = versionOf(upgraded);
    if (next !== version + 1) {
      throw new UnsupportedDocument(`The upgrade from schemaVersion ${version} gave ${next === undefined ? "nil" : JSON.stringify(next)}, not ${version + 1}.`);
    }
    version += 1;
  }
  return upgraded;
}

export type Opened = { ok: true; document: PageDocument } | { ok: false; errors: DocumentError[] };

// A stored document, upgraded and then checked as the server checks one:
// what the editor may load. The twin of the server's Draft.upgrade_and_check.
export function openDocument(stored: unknown, options: UpgradeOptions = {}): Opened {
  let upgraded: unknown;
  try {
    upgraded = upgrade(stored, options);
  } catch (error) {
    if (!(error instanceof UnsupportedDocument)) throw error;
    return { ok: false, errors: [{ pointer: "/schemaVersion", keyword: "upgrade", message: error.message, layer: "rules" }] };
  }
  const result = validateDocument(upgraded);
  return result.valid ? { ok: true, document: result.document } : { ok: false, errors: result.errors };
}
