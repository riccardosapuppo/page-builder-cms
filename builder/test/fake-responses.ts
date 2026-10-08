// The CMS's form responses as the editor's tests need them: the site's
// pages, each page's draft and live version, and the responses kept under
// each page, read and deleted as the storage adapter's three operations
// answer (newest first by id, a part at a time with next, every form's
// count whatever the query, not-found for a response that is not the
// page's). Each call is noted, and a test can make the next call of a
// kind fail, or the next about one page.
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

type Operation = "listPages" | "getDraft" | "getVersion" | "listResponses" | "getResponse" | "deleteResponse";

export class FakeResponses implements ResponsesStorage {
  readonly pages: PageSummary[] = [];
  readonly drafts = new Map<number, PageDocument>();
  readonly live = new Map<number, PageDocument>();
  // Every response kept, by id; a later id is a newer response.
  readonly kept: Array<FormResponse & { pageId: number }> = [];
  readonly calls: string[] = [];
  // By operation, or by operation and page ("getDraft 3").
  readonly failing = new Map<string, Failure>();
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

  // The next call of this kind fails so; given a page, the next call of
  // this kind about that page.
  fail(operation: Operation, failure: Failure, pageId?: number): void {
    this.failing.set(pageId === undefined ? operation : `${operation} ${pageId}`, failure);
  }

  // The live version's document of a page, when it is not its draft: the
  // version getVersion gives for the page's live number.
  liveDocument(pageId: number, document: PageDocument): this {
    this.live.set(pageId, document);
    return this;
  }

  private check(operation: Operation, pageId?: number): void {
    for (const key of pageId === undefined ? [operation] : [`${operation} ${pageId}`, operation]) {
      const failure = this.failing.get(key);
      if (!failure) continue;
      this.failing.delete(key);
      throw new StorageError(failure);
    }
  }

  getVersion = async (pageId: number, number: number) => {
    this.calls.push(`getVersion ${pageId} ${number}`);
    this.check("getVersion", pageId);
    const page = this.pages.find((p) => p.id === pageId);
    const document = this.live.get(pageId) ?? this.drafts.get(pageId);
    if (!page || !document || page.published?.versionNumber !== number) throw new StorageError({ kind: "not-found", message: "No such version." });
    return { number, reason: "publish" as const, name: null, restoredFrom: null, createdAt: "2026-10-01T09:00:00.000Z", published: true, document: structuredClone(document) };
  };

  listPages = async (): Promise<PageSummary[]> => {
    this.calls.push("listPages");
    this.check("listPages");
    return structuredClone(this.pages);
  };

  getDraft = async (pageId: number) => {
    this.calls.push(`getDraft ${pageId}`);
    this.check("getDraft", pageId);
    const document = this.drafts.get(pageId);
    if (!document) throw new StorageError({ kind: "not-found", message: "No such page." });
    return { revision: 1, lastSaveId: null, updatedAt: "2026-10-01T09:00:00.000Z", document: structuredClone(document) };
  };

  listResponses = async (pageId: number, query: ResponseQuery = {}): Promise<ResponseList> => {
    this.calls.push(`listResponses ${pageId}${query.form ? ` form=${query.form}` : ""}${query.before ? ` before=${query.before}` : ""}`);
    this.check("listResponses", pageId);
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
