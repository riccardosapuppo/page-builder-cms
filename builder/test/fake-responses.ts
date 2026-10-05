// The CMS's form responses as the editor's tests need them: the site's
// pages, each page's draft, and the responses kept under each page, read
// and deleted as the storage adapter's three operations answer (newest
// first by id, a part at a time with next, every form's count whatever the
// query, not-found for a response that is not the page's). Each call is
// noted, and a test can make the next call of a kind fail.
import type { Block, FormField, PageDocument } from "../src/shared/document.ts";
import { StorageError, type FormResponse, type Failure, type KeptField, type PageSummary, type ResponseList, type ResponseQuery, type ResponseSummary } from "../src/storage/adapter.ts";
import type { ResponsesStorage } from "../src/editor/responses/context.ts";

export const FIELDS: KeptField[] = [
  { name: "field-1", kind: "text", label: "Name", required: true, maxLength: 300 },
  { name: "field-2", kind: "email", label: "Email", required: true },
  { name: "field-3", kind: "textarea", label: "Message", required: false, maxLength: 5000 },
  { name: "field-4", kind: "checkbox", label: "Keep me posted", required: false },
];

export const formBlock = (id: string, fields: KeptField[] = FIELDS): Block => ({
  id,
  type: "form",
  props: { items: fields.map((f) => ({ ...f })) as FormField[], submitLabel: "Send", confirmation: "Thank you." },
  style: { base: {} },
  children: [],
} as Block);

// A draft of sections, each { label, widgets }, every section one column.
export function draftWith(title: string, sections: Array<{ label: string; widgets: Block[] }>): PageDocument {
  return {
    schemaVersion: 1,
    title,
    sections: sections.map((s, index) => ({
      id: `s${index + 1}`,
      type: "section",
      props: { label: s.label },
      style: { base: {} },
      children: [{ id: `s${index + 1}c`, type: "column", props: {}, style: { base: {} }, children: s.widgets }],
    })),
  } as PageDocument;
}

type Operation = "listPages" | "getDraft" | "listResponses" | "getResponse" | "deleteResponse";

export class FakeResponses implements ResponsesStorage {
  readonly pages: PageSummary[] = [];
  readonly drafts = new Map<number, PageDocument>();
  // Every response kept, by id; a later id is a newer response.
  readonly kept: Array<FormResponse & { pageId: number }> = [];
  readonly calls: string[] = [];
  readonly failing = new Map<Operation, Failure>();
  perPart = 50;
  private nextId = 1;

  page(id: number, title: string, live: number | null, draft: PageDocument): this {
    this.pages.push({
      id,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      home: false,
      revision: 1,
      updatedAt: "2026-10-01T09:00:00.000Z",
      published: live === null ? null : { slug: title.toLowerCase(), versionNumber: live, draftRevision: 1, publishedAt: "2026-10-01T09:00:00.000Z" },
      scheduled: null,
      links: { self: `/api/pages/${id}`, draft: "", versions: "", publish: "", schedules: "", preview: "", live: null },
    });
    this.drafts.set(id, draft);
    return this;
  }

  // A response to a form of a page, sent at this time with these answers.
  send(pageId: number, formId: string, submittedAt: string, answers: Record<string, string | boolean>, options: { versionNumber?: number; fields?: KeptField[] } = {}): number {
    const id = this.nextId++;
    const fields = options.fields ?? FIELDS;
    this.kept.push({ id, pageId, formId, versionNumber: options.versionNumber ?? 1, submittedAt, fields, answers: Object.fromEntries(fields.map((f) => [f.name, answers[f.name] ?? (f.kind === "checkbox" ? false : "")])) });
    return id;
  }

  // The next call of this kind fails so.
  fail(operation: Operation, failure: Failure): void {
    this.failing.set(operation, failure);
  }

  private check(operation: Operation): void {
    const failure = this.failing.get(operation);
    if (!failure) return;
    this.failing.delete(operation);
    throw new StorageError(failure);
  }

  listPages = async (): Promise<PageSummary[]> => {
    this.calls.push("listPages");
    this.check("listPages");
    return structuredClone(this.pages);
  };

  getDraft = async (pageId: number) => {
    this.calls.push(`getDraft ${pageId}`);
    this.check("getDraft");
    const document = this.drafts.get(pageId);
    if (!document) throw new StorageError({ kind: "not-found", message: "No such page." });
    return { revision: 1, lastSaveId: null, updatedAt: "2026-10-01T09:00:00.000Z", document: structuredClone(document) };
  };

  listResponses = async (pageId: number, query: ResponseQuery = {}): Promise<ResponseList> => {
    this.calls.push(`listResponses ${pageId}${query.form ? ` form=${query.form}` : ""}${query.before ? ` before=${query.before}` : ""}`);
    this.check("listResponses");
    const mine = this.kept.filter((r) => r.pageId === pageId);
    const rows = mine
      .filter((r) => (query.form === undefined || r.formId === query.form) && (query.before === undefined || r.id < query.before))
      .sort((a, b) => b.id - a.id);
    const part = rows.slice(0, this.perPart);
    const counts = new Map<string, number>();
    for (const r of mine) counts.set(r.formId, (counts.get(r.formId) ?? 0) + 1);
    return {
      responses: part.map(summary),
      next: rows.length > this.perPart ? part.at(-1)!.id : null,
      forms: [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([formId, count]) => ({ formId, count })),
    };
  };

  getResponse = async (pageId: number, responseId: number): Promise<FormResponse> => {
    this.calls.push(`getResponse ${pageId} ${responseId}`);
    this.check("getResponse");
    const found = this.kept.find((r) => r.id === responseId && r.pageId === pageId);
    if (!found) throw new StorageError({ kind: "not-found", message: "No such response." });
    return structuredClone({ id: found.id, formId: found.formId, versionNumber: found.versionNumber, submittedAt: found.submittedAt, fields: found.fields, answers: found.answers });
  };

  deleteResponse = async (pageId: number, responseId: number): Promise<void> => {
    this.calls.push(`deleteResponse ${pageId} ${responseId}`);
    this.check("deleteResponse");
    const at = this.kept.findIndex((r) => r.id === responseId && r.pageId === pageId);
    if (at === -1) throw new StorageError({ kind: "not-found", message: "No such response." });
    this.kept.splice(at, 1);
  };
}

// The list's line for a response: its first written answer, on one line.
function summary(response: FormResponse): ResponseSummary {
  const field = response.fields.find((f) => f.kind !== "checkbox" && typeof response.answers[f.name] === "string" && (response.answers[f.name] as string).trim() !== "");
  const text = field ? (response.answers[field.name] as string).replace(/\s+/g, " ").trim() : "";
  return {
    id: response.id,
    formId: response.formId,
    versionNumber: response.versionNumber,
    submittedAt: response.submittedAt,
    excerpt: field ? { label: field.label, text: text.slice(0, 120), truncated: text.length > 120 } : null,
  };
}
