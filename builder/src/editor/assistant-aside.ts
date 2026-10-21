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
//   saved. A flush that does not end saved is said in a sentence; an
//   autosave still sending a save whose answer was lost goes on sending it,
//   and is let go once saved or refused. Until it is let go, closing the
//   tab while the page's edits are only here asks first, as for the page
//   open (../storage/autosave.ts, warnOnClose).
// - A picture made for the page goes into the library, as an upload does.
//
// A new site's own steps go through the editor as before: its style through
// Site style's own call, its header and footer as the parts' drafts.
import type { WrittenPage } from "../assistant/context.tsx";
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

export interface AsideOptions {
  session: Pick<Session, "makePageAside" | "drafts" | "cmsOrigin">;
  clock: Clock;
  library: MediaService | null;
  // A page of the run as it is now, for the preview.
  show: (page: WrittenPage) => void;
}

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
  const { session, clock, library, show } = options;
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
      if (autosave === null) return null;
      const settled = await autosave.flush();
      if (settled.phase === "saved") {
        letGo(autosave);
        return null;
      }
      if (settled.phase === "retrying") {
        // Sent again by itself until an answer comes: let go once there is one.
        const stop = autosave.subscribe((snapshot) => {
          if (snapshot.phase === "retrying" || snapshot.phase === "saving" || snapshot.phase === "waiting") return;
          stop();
          letGo(autosave);
        });
      } else {
        letGo(autosave);
      }
      return unsavedWords(settled, keptWords(session.cmsOrigin).keeper);
    },
  };
}

// What a new site does through this editor (../assistant/site.ts): its
// style saved as Site style saves it, the old one kept to be put back; its
// header and footer saved as the parts' drafts, the drafts they replace
// kept as versions; its pages made and written aside, and their buttons to
// a page not made changed once it ends.
export function asideSiteHooks(options: AsideOptions & { session: Session; ui: UiStore }): SiteHooks {
  const { session, ui } = options;
  return {
    applyStyle: (style) => session.applySiteStyle({ ...style, kept: "now" }),
    savePart: (kind, document, keep, ours, fence) => session.replacePart(kind, document, keep, ours, fence),
    changePage: (id, change) => session.changeDraft(id, change),
    taken: () => session.pages.flatMap((page) => (page.slug === null ? [] : [page.slug])),
    header: () => ui.getState().parts.header,
    page: (planned) => asideHooks(options, planned),
  };
}
