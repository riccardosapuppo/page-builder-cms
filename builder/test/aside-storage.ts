// What the Assistant's pages written aside are made and saved in, for the
// interface's tests (src/editor/assistant-aside.ts): a page made at a free
// address, ids counted from `first`, an address in `taken` refused as the
// CMS refuses it; each draft at a revision, a save taken only at it, as the
// CMS takes one; every save of the page at `elsewhere` met by a conflict, as
// if another tab saved it each time. `made` hears of each page made.
import type { PageDocument } from "../src/shared/document.ts";
import type { Session } from "../src/editor/session.tsx";

const T = "2026-10-21T08:00:00.000Z";

export function asideStorage(options: { first?: number; taken?: readonly string[]; elsewhere?: string; made?: (page: { id: number; title: string; slug: string }) => void } = {}) {
  const taken = new Set(options.taken ?? []);
  const drafts = new Map<number, { title: string; slug: string; revision: number; document: PageDocument }>();
  let next = options.first ?? 1;
  const session: Pick<Session, "makePageAside" | "drafts" | "cmsOrigin"> = {
    cmsOrigin: "http://127.0.0.1:3900",
    async makePageAside({ title, slug }) {
      if (taken.has(slug)) return { ok: false, errors: [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }] };
      taken.add(slug);
      const id = next++;
      const document: PageDocument = { schemaVersion: 1, title, sections: [] };
      drafts.set(id, { title, slug, revision: 0, document });
      options.made?.({ id, title, slug });
      return { ok: true, id, revision: 0, document };
    },
    drafts: {
      getDraft: async (id) => ({ revision: drafts.get(id)!.revision, document: drafts.get(id)!.document, lastSaveId: null, updatedAt: T }),
      async saveDraft(id, save) {
        const draft = drafts.get(id)!;
        if (draft.slug === options.elsewhere) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: draft.revision + 1, lastSaveId: null } };
        if (save.revision !== draft.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: draft.revision, lastSaveId: null } };
        drafts.set(id, { ...draft, revision: draft.revision + 1, document: save.document });
        return { ok: true, value: { revision: draft.revision + 1, lastSaveId: save.saveId, updatedAt: T } };
      },
    },
  };
  // The page made at `slug`, as its draft is saved now.
  const draftAt = (slug: string): PageDocument | undefined => [...drafts.values()].find((draft) => draft.slug === slug)?.document;
  return { session, drafts, draftAt };
}
