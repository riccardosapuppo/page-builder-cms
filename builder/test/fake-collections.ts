// The CMS's collections as the editor's tests need them: collections and
// their entries kept in memory and answered as the storage adapter's
// operations answer, with the CMS's own checks (the editor's twin of them,
// validateCollection and validateEntry, which the collection corpus holds
// to the CMS's), a prefix or a slug taken refused as the CMS refuses them,
// a save at a revision, a retry recognised by its saveId, a conflict
// naming where the entry is, publish and unpublish, the counts. Each call
// is noted; a test can make the next call of a kind fail, lose the answer
// of the next save after it went through, save an entry "in another tab",
// and have the next change of a definition refused as the CMS refuses one
// its own rules find (the shop's price, keyword shopPrice).
import type { CollectionDefinition, EntryContent } from "../src/shared/collection.ts";
import { validateCollection, validateEntry } from "../src/shared/validate.ts";
import type { CollectionsStorage } from "../src/editor/collections/context.ts";
import { StorageError, type Collection, type CollectionChanges, type Entry, type EntryQuery, type EntrySave, type Failure, type FieldError, type Invalid, type Outcome, type PageSummary, type PublishRequest } from "../src/storage/adapter.ts";

type Operation = keyof CollectionsStorage;

const invalid = (errors: Array<{ pointer: string; keyword: string; message: string }>): Invalid => ({
  kind: "invalid",
  code: "invalid_request",
  message: "The request is not valid.",
  errors: errors.map((e): FieldError => ({ pointer: e.pointer, keyword: e.keyword, blockPointer: null, message: e.message })),
});

const template = (id: number, name: string): PageSummary => ({
  id,
  kind: "template",
  title: name,
  slug: null,
  home: false,
  revision: 1,
  updatedAt: "2026-10-01T09:00:00.000Z",
  published: null,
  scheduled: null,
  links: { self: `/api/pages/${id}`, draft: "", versions: "", publish: "", schedules: "", preview: `/preview/${id}`, live: null },
});

export class FakeCollections implements CollectionsStorage {
  readonly collections: Collection[] = [];
  readonly entries: Entry[] = [];
  readonly calls: string[] = [];
  private readonly failing = new Map<string, Failure>();
  private nextId = 1;
  private nextEntry = 1;
  private tick = 0;

  // The clock the fake writes its times with: a minute later at each write.
  private time(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 9, 2, 8, this.tick)).toISOString();
  }

  // The next call of this kind fails so.
  fail(operation: Operation, failure: Failure): void {
    this.failing.set(operation, failure);
  }

  // The next change of a definition is refused with these errors.
  private refusing: Array<{ pointer: string; keyword: string; message: string }> | null = null;
  refuseNextUpdate(errors: Array<{ pointer: string; keyword: string; message: string }>): void {
    this.refusing = errors;
  }

  private check(operation: Operation): void {
    const failure = this.failing.get(operation);
    if (!failure) return;
    this.failing.delete(operation);
    throw new StorageError(failure);
  }

  // The next save goes through, and its answer is lost on the way back.
  private losing = false;
  loseNextSave(): void {
    this.losing = true;
  }

  private lost<T>(answer: T): T {
    if (!this.losing) return answer;
    this.losing = false;
    throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "The CMS did not answer." });
  }

  private counted(collection: Collection): Collection {
    const mine = this.entries.filter((e) => e.collectionId === collection.id);
    return structuredClone({ ...collection, entryCount: mine.length, publishedCount: mine.filter((e) => e.published !== null).length });
  }

  private own(collectionId: number): Collection {
    const found = this.collections.find((c) => c.id === collectionId);
    if (!found) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    return found;
  }

  private entry(collectionId: number, entryId: number): Entry {
    this.own(collectionId);
    const found = this.entries.find((e) => e.id === entryId && e.collectionId === collectionId);
    if (!found) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    return found;
  }

  // A collection, made as createCollection makes one (for a test's start).
  add(definition: CollectionDefinition): Collection {
    const id = this.nextId++;
    const at = this.time();
    const made: Collection = { id, ...structuredClone(definition), publishedRevision: 0, entryCount: 0, publishedCount: 0, createdAt: at, updatedAt: at, template: template(100 + id, definition.name) };
    this.collections.push(made);
    return this.counted(made);
  }

  // An entry, made as createEntry makes one; published too if asked.
  addEntry(collectionId: number, content: EntryContent, options: { published?: boolean } = {}): Entry {
    const at = this.time();
    const made: Entry = { id: this.nextEntry++, collectionId, ...structuredClone(content), revision: 0, lastSaveId: null, createdAt: at, updatedAt: at, published: null };
    if (options.published) made.published = { title: made.title, slug: made.slug, values: structuredClone(made.values), draftRevision: 0, publishedAt: at };
    this.entries.push(made);
    return structuredClone(made);
  }

  // Another tab saves the entry: its revision moves on.
  saveElsewhere(entryId: number, changes: Partial<EntryContent>): void {
    const found = this.entries.find((e) => e.id === entryId)!;
    Object.assign(found, structuredClone(changes), { revision: found.revision + 1, lastSaveId: "elsewhere", updatedAt: this.time() });
  }

  private prefixErrors(prefix: string, except: number | null): Array<{ pointer: string; keyword: string; message: string }> {
    if (this.collections.some((c) => c.prefix === prefix && c.id !== except)) return [{ pointer: "/prefix", keyword: "taken", message: "is already the prefix of another collection" }];
    if (prefix === "sent" || prefix === "api") return [{ pointer: "/prefix", keyword: "reserved", message: "is an address the application uses itself" }];
    return [];
  }

  private slugErrors(collectionId: number, slug: string, except: number | null): Array<{ pointer: string; keyword: string; message: string }> {
    const others = this.entries.filter((e) => e.collectionId === collectionId && e.id !== except);
    if (others.some((e) => e.slug === slug)) return [{ pointer: "/slug", keyword: "taken", message: "is already the next address of another entry" }];
    if (others.some((e) => e.published?.slug === slug)) return [{ pointer: "/slug", keyword: "taken", message: "is already the address of another entry" }];
    return [];
  }

  listCollections = async (): Promise<Collection[]> => {
    this.calls.push("listCollections");
    this.check("listCollections");
    return this.collections.map((c) => this.counted(c));
  };

  createCollection = async (definition: CollectionDefinition): Promise<Outcome<Collection, Invalid>> => {
    this.calls.push(`createCollection ${definition.name} /${definition.prefix}`);
    this.check("createCollection");
    const checked = validateCollection(definition);
    if (!checked.valid) return { ok: false, problem: invalid(checked.errors) };
    const taken = this.prefixErrors(definition.prefix, null);
    if (taken.length > 0) return { ok: false, problem: invalid(taken) };
    return { ok: true, value: this.add(checked.value) };
  };

  getCollection = async (collectionId: number): Promise<Collection> => {
    this.calls.push(`getCollection ${collectionId}`);
    this.check("getCollection");
    return this.counted(this.own(collectionId));
  };

  updateCollection = async (collectionId: number, changes: CollectionChanges): Promise<Outcome<Collection, Invalid>> => {
    this.calls.push(`updateCollection ${collectionId} ${Object.keys(changes).join(",")}`);
    this.check("updateCollection");
    if (this.refusing) {
      const errors = this.refusing;
      this.refusing = null;
      return { ok: false, problem: invalid(errors) };
    }
    const own = this.own(collectionId);
    const next = { name: own.name, prefix: own.prefix, fields: own.fields, sort: own.sort, ...structuredClone(changes) };
    const checked = validateCollection(next);
    if (!checked.valid) return { ok: false, problem: invalid(checked.errors) };
    const taken = this.prefixErrors(next.prefix, collectionId);
    if (taken.length > 0) return { ok: false, problem: invalid(taken) };
    Object.assign(own, checked.value, { publishedRevision: own.publishedRevision + 1, updatedAt: this.time() });
    return { ok: true, value: this.counted(own) };
  };

  deleteCollection = async (collectionId: number): Promise<void> => {
    this.calls.push(`deleteCollection ${collectionId}`);
    this.check("deleteCollection");
    this.own(collectionId);
    this.collections.splice(this.collections.findIndex((c) => c.id === collectionId), 1);
    for (let at = this.entries.length - 1; at >= 0; at -= 1) if (this.entries[at]!.collectionId === collectionId) this.entries.splice(at, 1);
  };

  // The titles that hold q, ASCII letters without their case, in the
  // collection's own order (a date or number field's, or a time's).
  listEntries = async (collectionId: number, query: EntryQuery = {}): Promise<Entry[]> => {
    this.calls.push(`listEntries ${collectionId}${query.q ? ` q=${query.q}` : ""}`);
    this.check("listEntries");
    const own = this.own(collectionId);
    const lower = (text: string) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    const mine = this.entries.filter((e) => e.collectionId === collectionId && (!query.q || lower(e.title).includes(lower(query.q))));
    const by = own.sort.by;
    const value = (e: Entry): string | number | null => (by === "title" ? e.title : by === "updatedAt" ? e.updatedAt : by === "publishedAt" ? (e.published?.publishedAt ?? null) : ((e.values[by] as string | number | undefined) ?? null));
    const valued = mine.filter((e) => value(e) !== null).sort((a, b) => {
      const x = value(a)!;
      const y = value(b)!;
      return (x < y ? -1 : x > y ? 1 : 0) || a.id - b.id;
    });
    const rest = mine.filter((e) => value(e) === null);
    const ordered = own.sort.direction === "desc" ? [...valued.reverse(), ...rest.reverse()] : [...valued, ...rest];
    return structuredClone(ordered);
  };

  createEntry = async (collectionId: number, entry: EntryContent): Promise<Outcome<Entry, Invalid>> => {
    this.calls.push(`createEntry ${collectionId} ${JSON.stringify(entry)}`);
    this.check("createEntry");
    const own = this.own(collectionId);
    const checked = validateEntry(own, entry);
    if (!checked.valid) return { ok: false, problem: invalid(checked.errors) };
    const taken = this.slugErrors(collectionId, entry.slug, null);
    if (taken.length > 0) return { ok: false, problem: invalid(taken) };
    return { ok: true, value: this.addEntry(collectionId, checked.value) };
  };

  getEntry = async (collectionId: number, entryId: number): Promise<Entry> => {
    this.calls.push(`getEntry ${collectionId} ${entryId}`);
    this.check("getEntry");
    return structuredClone(this.entry(collectionId, entryId));
  };

  saveEntry = async (collectionId: number, entryId: number, save: EntrySave) => {
    this.calls.push(`saveEntry ${collectionId} ${entryId} r${save.revision} ${JSON.stringify({ title: save.title, slug: save.slug, values: save.values })}`);
    this.check("saveEntry");
    const own = this.own(collectionId);
    const found = this.entry(collectionId, entryId);
    const content = { title: save.title, slug: save.slug, values: save.values };
    const checked = validateEntry(own, content);
    if (!checked.valid) return { ok: false as const, problem: invalid(checked.errors) };
    const taken = this.slugErrors(collectionId, save.slug, entryId);
    if (taken.length > 0) return { ok: false as const, problem: invalid(taken) };
    if (found.revision !== save.revision) {
      // The save that went through last, sent again: answered as saved.
      if (found.lastSaveId === save.saveId && found.revision === save.revision + 1) return { ok: true as const, value: structuredClone(found) };
      return { ok: false as const, problem: { kind: "conflict" as const, message: "The entry has changed since the revision sent.", currentRevision: found.revision, lastSaveId: found.lastSaveId } };
    }
    Object.assign(found, structuredClone(checked.value), { revision: found.revision + 1, lastSaveId: save.saveId, updatedAt: this.time() });
    return this.lost({ ok: true as const, value: structuredClone(found) });
  };

  publishEntry = async (collectionId: number, entryId: number, request: PublishRequest = {}) => {
    this.calls.push(`publishEntry ${collectionId} ${entryId}${request.revision === undefined ? "" : ` r${request.revision}`}`);
    this.check("publishEntry");
    const own = this.own(collectionId);
    const found = this.entry(collectionId, entryId);
    if (request.revision !== undefined && request.revision !== found.revision) {
      return { ok: false as const, problem: { kind: "conflict" as const, message: "The entry has changed since the revision sent.", currentRevision: found.revision, lastSaveId: found.lastSaveId } };
    }
    const checked = validateEntry(own, { title: found.title, slug: found.slug, values: found.values });
    if (!checked.valid) return { ok: false as const, problem: invalid(checked.errors) };
    const at = this.time();
    found.published = { title: found.title, slug: found.slug, values: structuredClone(found.values), draftRevision: found.revision, publishedAt: found.published?.publishedAt ?? at };
    found.updatedAt = at;
    own.publishedRevision += 1;
    return { ok: true as const, value: structuredClone(found) };
  };

  unpublishEntry = async (collectionId: number, entryId: number): Promise<Entry> => {
    this.calls.push(`unpublishEntry ${collectionId} ${entryId}`);
    this.check("unpublishEntry");
    const found = this.entry(collectionId, entryId);
    if (found.published) {
      found.published = null;
      found.updatedAt = this.time();
      this.own(collectionId).publishedRevision += 1;
    }
    return structuredClone(found);
  };

  deleteEntry = async (collectionId: number, entryId: number): Promise<void> => {
    this.calls.push(`deleteEntry ${collectionId} ${entryId}`);
    this.check("deleteEntry");
    this.entry(collectionId, entryId);
    this.entries.splice(this.entries.findIndex((e) => e.id === entryId), 1);
  };
}
