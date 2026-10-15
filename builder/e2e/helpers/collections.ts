// Collections and entries made through the CMS's API, as the Collections
// screen makes them, for the tests of what the site draws from them: a
// collection under a prefix of its own, its template's draft saved and
// published, and entries written, published, saved again and unpublished.
import type { APIRequestContext } from "@playwright/test";
import { cms, expect, slugStem, unique } from "./site.ts";

export interface MadeCollection {
  id: number;
  prefix: string;
  templateId: number;
}

export interface MadeEntry {
  id: number;
  revision: number;
}

export interface EntryContent {
  title: string;
  slug: string;
  values: Readonly<Record<string, unknown>>;
}

// A collection with these fields, ordered by its own field or by the last
// save, under a prefix of the run's own.
export async function makeCollection(request: APIRequestContext, name: string, fields: readonly unknown[], sort: { by: string; direction: "asc" | "desc" } = { by: "updatedAt", direction: "desc" }): Promise<MadeCollection> {
  const prefix = unique(slugStem(name));
  const made = await request.post(`${cms()}/api/collections`, { data: { name, prefix, fields, sort } });
  expect(made.status(), await made.text()).toBe(201);
  const body = (await made.json()) as { id: number; template: { id: number } };
  return { id: body.id, prefix, templateId: body.template.id };
}

// An entry written, and published unless `publish` is false.
export async function makeEntry(request: APIRequestContext, collection: MadeCollection, content: EntryContent, options: { publish?: boolean } = {}): Promise<MadeEntry> {
  const made = await request.post(`${cms()}/api/collections/${collection.id}/entries`, { data: content });
  expect(made.status(), await made.text()).toBe(201);
  const entry = (await made.json()) as MadeEntry;
  if (options.publish !== false) await publishEntry(request, collection, entry);
  return entry;
}

export async function publishEntry(request: APIRequestContext, collection: MadeCollection, entry: MadeEntry): Promise<void> {
  const published = await request.post(`${cms()}/api/collections/${collection.id}/entries/${entry.id}/publish`, { data: {} });
  expect(published.status(), await published.text()).toBe(200);
}

export async function unpublishEntry(request: APIRequestContext, collection: MadeCollection, entry: MadeEntry): Promise<void> {
  const taken = await request.post(`${cms()}/api/collections/${collection.id}/entries/${entry.id}/unpublish`, { data: {} });
  expect(taken.status(), await taken.text()).toBe(200);
}

// The entry's draft saved with this content, at the revision it is at.
export async function saveEntry(request: APIRequestContext, collection: MadeCollection, entry: MadeEntry, content: EntryContent): Promise<MadeEntry> {
  const saved = await request.put(`${cms()}/api/collections/${collection.id}/entries/${entry.id}`, { data: { revision: entry.revision, saveId: unique("entry-save").slice(-60), ...content } });
  expect(saved.status(), await saved.text()).toBe(200);
  return (await saved.json()) as MadeEntry;
}

// A page's or a template's draft saved with these sections, then
// published unless `publish` is false.
export async function saveDocument(request: APIRequestContext, pageId: number, title: string, sections: readonly unknown[], options: { publish?: boolean } = {}): Promise<void> {
  const draft = (await (await request.get(`${cms()}/api/pages/${pageId}/draft`)).json()) as { revision: number };
  const saved = await request.put(`${cms()}/api/pages/${pageId}/draft`, { data: { revision: draft.revision, saveId: unique("setup").slice(-60), document: { schemaVersion: 1, title, sections } } });
  expect(saved.status(), await saved.text()).toBe(200);
  if (options.publish !== false) await publishPage(request, pageId);
}

export async function publishPage(request: APIRequestContext, pageId: number): Promise<void> {
  const published = await request.post(`${cms()}/api/pages/${pageId}/publish`, { data: {} });
  expect(published.status(), await published.text()).toBe(200);
}
