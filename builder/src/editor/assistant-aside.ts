// The Assistant's pages written aside (../assistant/README.md, "Written
// aside"): the steps of ../assistant/write.ts and ../assistant/site.ts done
// while the editor stays on the page the person has open, which is never
// written to.
//
// - A page is made with the storage and not opened (Session.makePageAside),
//   at the address asked for or, taken, the next free one.
// - Each command the run makes is applied by the reducer
//   (../document/reducer.ts) to the page's document in memory: nothing goes
//   on the editor's store, its selection or its History, and nothing
//   scrolls. A command the page refuses is said, as the store would say it.
// - That document is saved by an autosave of its own (../storage/autosave.ts:
//   the pause before a save, one save on its way at a time, a save whose
//   answer is lost sent again), and shown to the run window's preview
//   (`show`) a few times a second at most.
// - At the page's end its autosave is flushed, and let go once the page is
//   saved. Until it is let go, closing the tab while the page's edits are
//   only here asks first, as for the page open (../storage/autosave.ts,
//   warnOnClose).
// - A flush that does not end saved (refused, saved somewhere else, no
//   answer) is said in a sentence, and the page is kept as this tab holds
//   it (../assistant/context.tsx, PendingPage): its autosave alive, which
//   sends again by itself a save whose answer was lost, and closing the
//   tab asking first. Saved after all, it is let go, and its run says so;
//   refused again, or met by another save, it is kept still. A new site's
//   clean-up changes it as this tab holds it, and tries again. Opened, the
//   editor takes it in and saves it (./App.tsx, openPage), its autosave
//   settled first and then let go: nothing of what the run wrote is lost
//   because a save of it failed.
// - A picture made for the page goes into the library, as an upload does.
//
// A new site's own steps go through the editor as before: its style through
// Site style's own call, its header and footer as the parts' drafts.
import type { PendingPage, WrittenPage } from "../assistant/context.tsx";
import { LIVE_MS, throttle } from "../assistant/live.ts";
import type { SiteHooks, SitePageHooks } from "../assistant/site.ts";
import { applyCommand } from "../document/reducer.ts";
import type { PageDocument } from "../shared/document.ts";
import { createAutosave, type Autosave, type SaveSnapshot } from "../storage/autosave.ts";
import type { Clock } from "../storage/clock.ts";
import type { MediaService } from "./library/service.ts";
import { keptWords, slugFrom, type Session } from "./session.tsx";
import type { UiStore } from "./ui-store.ts";

// The least time between two showings of a page as it grows: about four a
// second, as the run's cost is told (../assistant/live.ts).
export const SHOW_MS = LIVE_MS;
// The addresses tried for a page: the one asked for, then -2, -3, -4, -5.
const ADDRESS_TRIES = 5;

// Where the pages whose last changes were not saved are kept, as the
// Assistant's state keeps them (../assistant/context.tsx, pending): told
// of one saved after all, which it keeps no more.
export interface PendingPages {
  get(id: number): PendingPage | undefined;
  keep(page: PendingPage): void;
  saved(id: number): void;
}

export interface AsideOptions {
  session: Pick<Session, "makePageAside" | "drafts" | "cmsOrigin">;
  clock: Clock;
  library: MediaService | null;
  // A page of the run as it is now, for the preview.
  show: (page: WrittenPage) => void;
  pending: PendingPages;
}

// What a page whose last changes were not saved says of them, after why.
export const KEPT_HERE = "Open it to try again; they are kept in this tab until then.";

// Why a page's last changes were not saved, from where its autosave
// stopped: the end of a sentence.
export function unsavedWords(snapshot: SaveSnapshot, keeper: string): string {
  switch (snapshot.phase) {
    case "conflict":
      return "the page was saved somewhere else meanwhile.";
    case "retrying":
      return `no answer came about their save${snapshot.failure ? ` (${snapshot.failure.message})` : ""}, and the editor is sending it again.`;
    case "invalid":
      return `${keeper} refused them: ${snapshot.errors[0]?.message ?? "the page is not valid"}.`;
    case "refused":
      return `${keeper} refused them${snapshot.failure ? `: ${snapshot.failure.message}` : "."}`;
    default:
      return "they are not saved yet.";
  }
}

// A page's hooks, written aside: made at `planned`'s address for a page of
// a new site, else at an address from its title.
export function asideHooks(options: AsideOptions, planned?: { slug: string }): SitePageHooks {
  const { session, clock, library, show, pending } = options;
  let made: { id: number; slug: string; title: string } | null = null;
  let document: PageDocument | null = null;
  let saving: Autosave | null = null;
  const shown = throttle(clock, SHOW_MS, () => {
    if (made !== null && document !== null) show({ id: made.id, title: made.title, document });
  });
  // The tab closed while the page's edits are only here: asked first.
  const warn = (event: Event) => {
    if (saving?.getSnapshot().warnOnClose) event.preventDefault();
  };
  const letGo = (autosave: Autosave) => {
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", warn);
    autosave.dispose();
  };
  // The page, its last changes not saved as it ended, kept as this tab
  // holds it (PendingPage): until its autosave saves it after all, and it
  // is let go and said so, or the editor takes it as it is opened.
  const keep = (page: { id: number; title: string }, start: PageDocument, autosave: Autosave): void => {
    let latest = start;
    // Settled, nothing more is sent: the page is about to be opened.
    let settled = false;
    let gone = false;
    const release = (): void => {
      if (gone) return;
      gone = true;
      watching();
      letGo(autosave);
    };
    // Saved after all: let go once the autosave has told everyone waiting
    // for it, a flush on its way too, which letting it go at once would drop.
    const watching = autosave.subscribe((snapshot) => {
      if (snapshot.phase !== "saved") return;
      queueMicrotask(() => {
        if (gone) return;
        release();
        pending.saved(page.id);
      });
    });
    pending.keep({
      id: page.id,
      title: page.title,
      document: () => latest,
      revision: () => autosave.getSnapshot().revision,
      async change(next) {
        latest = next;
        if (settled || gone) return false;
        autosave.edit(next);
        return (await autosave.flush()).phase === "saved";
      },
      async settle() {
        if (settled || gone) return;
        await autosave.flush();
        settled = true;
        watching();
        autosave.dispose();
      },
      letGo: release,
    });
  };
  return {
    made: () => (made === null ? null : { id: made.id, slug: made.slug }),
    async open(title) {
      const base = planned?.slug ?? (slugFrom(title) || "page");
      for (let count = 1; count <= ADDRESS_TRIES; count++) {
        const slug = count === 1 ? base : `${base}-${count}`;
        const page = await session.makePageAside({ title, slug });
        if (page.ok) {
          made = { id: page.id, slug, title };
          document = page.document;
          saving = createAutosave({ adapter: session.drafts, pageId: page.id, revision: page.revision, document: page.document, clock });
          if (typeof window !== "undefined") window.addEventListener("beforeunload", warn);
          shown.now();
          return null;
        }
        if (!page.errors.some((error) => error.pointer === "/slug")) return page.errors[0]?.message ?? "The page could not be made.";
      }
      return "No free address was found for the new page.";
    },
    // Written aside, the page is the run's while the run goes: no other
    // page can take its place.
    still: () => made !== null,
    document: () => {
      if (document === null) throw new Error("The page is not made yet.");
      return document;
    },
    apply(change) {
      if (!change.ok) return change.error.message;
      if (document === null) return "The page is not made yet.";
      const applied = applyCommand(document, change.command);
      if (!applied.ok) return applied.error.message;
      document = applied.document;
      saving?.edit(document);
      shown.poke();
      return null;
    },
    ...(library === null ? {} : {
      async upload(file: File, picture: { width: number; height: number; alt: string }) {
        const put = await library.put({ file, width: picture.width, height: picture.height, alt: picture.alt });
        return put.ok ? { ok: true as const, mediaId: put.item.id } : put;
      },
    }),
    async end() {
      shown.now();
      const autosave = saving;
      if (autosave === null || made === null || document === null) return null;
      const settled = await autosave.flush();
      if (settled.phase === "saved") {
        letGo(autosave);
        return null;
      }
      keep(made, document, autosave);
      return `${unsavedWords(settled, keptWords(session.cmsOrigin).keeper)} ${KEPT_HERE}`;
    },
  };
}

// What a new site does through this editor (../assistant/site.ts): its
// style saved as Site style saves it, the old one kept to be put back; its
// header and footer saved as the parts' drafts, the drafts they replace
// kept as versions; its pages made and written aside, and their buttons to
// a page not made changed once it ends: a page kept with its last changes
// not saved as this tab holds it, tried again, and saved with them, now
// or once it is opened; any other as the editor changes a draft.
export function asideSiteHooks(options: AsideOptions & { session: Session; ui: UiStore }): SiteHooks {
  const { session, ui, pending } = options;
  return {
    applyStyle: (style) => session.applySiteStyle({ ...style, kept: "now" }),
    savePart: (kind, document, keep, ours, fence) => session.replacePart(kind, document, keep, ours, fence),
    async changePage(id, change) {
      const kept = pending.get(id);
      if (kept === undefined) return session.changeDraft(id, change);
      const next = change(kept.document());
      if (next !== null) await kept.change(next.document);
      return null;
    },
    taken: () => session.pages.flatMap((page) => (page.slug === null ? [] : [page.slug])),
    header: () => ui.getState().parts.header,
    page: (planned) => asideHooks(options, planned),
  };
}
