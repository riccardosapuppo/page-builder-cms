// Copy and paste of blocks. What is copied is the block with everything
// under it, as JSON text the system clipboard can carry, marked as this
// editor's so other text is not taken for a block. What is pasted comes
// from outside the editor (another tab, another page, a person's typing),
// so it is read like a document from the network: strict JSON with no
// duplicate keys, the application rules, then the schema for one block.
// The paste command (./commands.ts, makePaste) then gives it new ids.
import { checkTree, normalise, scanJson } from "../../../schema/tools/rules.ts";
import { SCHEMA_VERSION, type Block, type PageDocument } from "../shared/document.ts";
import { validateBlockSchema } from "../shared/validate.ts";
import { refusal, type CommandError } from "./check.ts";
import { copyJson, isObject } from "./json.ts";
import { locate } from "./tree.ts";

export const CLIPBOARD_KIND = "page-builder-cms/block";

interface Envelope {
  kind: typeof CLIPBOARD_KIND;
  schemaVersion: typeof SCHEMA_VERSION;
  block: Block;
}

export function copyBlock(doc: PageDocument, id: string): Block | undefined {
  const found = locate(doc, id);
  return found ? copyJson(found.block) : undefined;
}

export function clipboardText(block: Block): string {
  const envelope: Envelope = { kind: CLIPBOARD_KIND, schemaVersion: SCHEMA_VERSION, block };
  return JSON.stringify(envelope);
}

export type ReadClipboard = { ok: true; block: Block } | { ok: false; error: CommandError };

export function readClipboard(text: string): ReadClipboard {
  const notOurs = { ok: false as const, error: refusal("invalid", "The clipboard holds no block from this editor.") };
  const scan = scanJson(text);
  if (scan) return notOurs;
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value.kind !== CLIPBOARD_KIND) return notOurs;
  if (value.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: refusal("invalid", `The copied block is from schemaVersion ${String(value.schemaVersion)}, and this editor reads ${SCHEMA_VERSION}.`) };
  }
  const rules = checkTree(value.block);
  if (rules.length > 0) {
    return { ok: false, error: refusal("invalid", `The copied block cannot be pasted: ${rules[0]?.message ?? "invalid"}`, rules.map((e) => ({ ...e, layer: "rules" as const }))) };
  }
  const block = normalise(value.block);
  const schema = validateBlockSchema(block);
  if (!schema.valid) {
    return { ok: false, error: refusal("invalid", `The copied block cannot be pasted: ${schema.errors[0]?.message ?? "invalid"}.`, schema.errors) };
  }
  return { ok: true, block: schema.block };
}
