// A new site from a brief (./README.md, "A new site from a brief"), in
// steps, each said in the drawer as it goes:
//
// 1. The direction (./direction.ts): one request, its answer in a schema
//    of its own, read without trust, its palette held to AA.
// 2. The style: the direction's palette, type scale and letter width,
//    through the storage's own call, as Site style saves it, the style it
//    replaces kept where Put the old style back finds it (SiteHooks
//    .applyStyle), and in memory (SiteWriting.before).
// 3. The frame (./frame.ts): the header and the footer built from the
//    direction, each saved as its part's draft, the draft it replaces kept
//    as a version first (BEFORE_NEW_SITE), so History brings it back: no
//    draft is saved over that a version does not hold, unless it is the
//    run's own (SiteHooks.savePart).
// 4. The pages, one after the other, each written as a page is
//    (./write.ts), to the direction: its question carries the direction and
//    the site's other pages for its links (the caller's askPage), its words
//    are drawn on the new palette's colours (facts.ink). Their pictures go
//    through one queue for the whole site, two at a time, and share one
//    budget (SITE_PICTURES_MOST): each page is told how many it may make,
//    keeping one for each page still to come, and is held to it. A page
//    waits for its pictures before the next one opens.
// 5. The frame settled, however the run ends once a part is saved (done,
//    stopped, failed, another page opened, the key forgotten): the header
//    and the footer are built again from the pages made, at the addresses
//    they were made at, and the header's call to action leads to the home
//    page's form, by its section's anchor, or to its first section; each is
//    saved again where it changed. Where no page was made, each is put back
//    as it was, said. A button of a page made that leads to a page of the
//    site not made loses its link (it leads to the top of its own page, as
//    a plan's button whose section never came), and one that leads to a
//    page made at another address leads there, each said. A part or a page
//    left leading to a page not made, its clean-up not saved, is said, and
//    the drawer then offers no Publish all.
//
// Nothing is published, and the home page stays the site's: the person
// says what becomes of them once the run is over. The run is bound to the
// key it began with, as a page's is (the caller's bind()): its requests go
// with that key alone, its pictures through the one maker made for it.
//
// Stop stops all of it: the request on its way, the pictures in flight, the
// pages still to come. So does another page opened by the person: before a
// page is asked for and before it is made, the page the Assistant opened
// last must still be the one open. A page that is refused or cut short is
// said, and the next one is written; a key refused, a model gone, no credit
// or no network stops the run, the same being bound to come again. What was
// made stays and is said.
import { makeSetItem, makeSetProps } from "../document/commands.ts";
import type { NewId } from "../document/ids.ts";
import { sameJson } from "../document/json.ts";
import { applyCommand } from "../document/reducer.ts";
import { allBlocks } from "../document/tree.ts";
import { PALETTE_SLOTS, type PageDocument, type PaletteSlot } from "../shared/document.ts";
import type { PartKind } from "../storage/adapter.ts";
import type { SiteFacts } from "./build.ts";
import { readDirection, styleOf, type Direction, type DirectionStyle } from "./direction.ts";
import { actionOf, footerOf, headerOf, type FramePage } from "./frame.ts";
import { PLAN_MADE_MOST } from "./plan.ts";
import { AssistantError, type Answer, type AssistantErrorKind } from "./providers.ts";
import type { Tally } from "./tally.ts";
import { HALTS, inTurn, LEFT, PICTURES_AT_ONCE, writePage, type PageHooks, type PictureMaker, type Writing } from "./write.ts";

// The most pictures a new site has made for it, its pages together.
export const SITE_PICTURES_MOST = 8;
// The name of the version each part keeps of the draft a new site replaces.
export const BEFORE_NEW_SITE = "Before the new site";
// Why a new site stopped when the person opened another page.
export const LEFT_SITE = "Another page was opened: the Assistant stopped the new site.";

export type SiteStep = "waiting" | "doing" | "done" | "failed" | "stopped";

// A page of the new site as the drawer shows it: the direction's title, its
// address (the planned one, then the one it was made at), where it stands,
// its id once made, and its own steps as a page's run tells them.
export interface SitePage {
  title: string;
  path: string;
  state: "waiting" | "writing" | "done" | "failed" | "stopped";
  id: number | null;
  writing: Writing | null;
  // Whether a button of the page made still leads to a page of the site
  // not made, taking its link out not having been saved.
  dangling: boolean;
}

// What became of a part once the run ended: the new one, leading only to
// pages that are there ("new"); put back as it was, no page of the site
// having been made ("back"); or the new one left leading to a page not
// made, its clean-up not saved ("stale"). Null for a part not saved.
export type FrameState = "new" | "back" | "stale";

// What saving a part answers: the draft it replaced, or why it was not saved.
export type PartSaved = { ok: true; replaced: PageDocument } | { ok: false; why: string };

// A button of a page made that led to a page of the site not made, or made
// at another address: its words, its plan's name in a pricing block, the
// address it led to, and the one it leads to now (null: none, "#").
export interface Relinked {
  label: string;
  plan: string | null;
  from: string;
  to: string | null;
}

export interface SiteWriting {
  phase: "asking" | "style" | "frame" | "pages" | "done" | "stopped" | "failed";
  direction: Direction | null;
  steps: Readonly<Record<"direction" | "style" | "header" | "footer", SiteStep>>;
  // The header and the footer, once the run has ended (FrameState).
  frame: Readonly<Record<PartKind, FrameState | null>>;
  pages: SitePage[];
  // The site's own notes: the direction's reading and its colours fixed,
  // the frame's, a page not written.
  notes: string[];
  // What the direction's request used, priced, once the provider said it.
  tally: Tally | null;
  error: string | null;
  // The style the new site's replaced: what Put the old style back puts
  // back, kept in memory as the storage keeps it.
  before: { palette: Record<string, string>; typeScale: string; letterWidth: string } | null;
}

// What a page of the site is asked with: its place, its title, purpose and
// address, whether it is the home page, how many pictures it may have made,
// the direction, and the site's pages with their purposes, for its links.
export interface SitePagePlan {
  index: number;
  title: string;
  purpose: string;
  path: string;
  home: boolean;
  most: number;
  direction: Direction;
  pages: ReadonlyArray<{ path: string; title: string; purpose: string }>;
}

// A page of the site's hooks (./write.ts, PageHooks), and the page they
// made, once they have.
export interface SitePageHooks extends PageHooks {
  made(): { id: number; slug: string } | null;
}

// What the editor does for a new site, passed in so it runs the same in a
// test.
export interface SiteHooks {
  // The style the direction gives, saved as Site style saves it, the style
  // it replaces kept to be put back: null once kept, or why not.
  applyStyle(style: { palette: Record<string, string>; typeScale: string; letterWidth: string }): Promise<string | null>;
  // A part's draft replaced by `document`, the draft it replaces kept first
  // as a version named `keep`, unless it is `ours`, the document the run
  // saved there itself: no draft saved over that a version does not hold.
  // What it replaced, once saved, or why not.
  savePart(kind: PartKind, document: PageDocument, keep: string, ours: PageDocument | null): Promise<PartSaved>;
  // The draft of the page of `id` changed by `change`, given the page as it
  // is (null: nothing to change), as a step named by `label` while it is
  // open; nothing saved there meanwhile lost: null once saved, or why not.
  changePage(id: number, change: (doc: PageDocument) => { document: PageDocument; label: string } | null): Promise<string | null>;
  // The addresses the site's pages have now.
  taken(): readonly string[];
  // The header as it is now, for whether it stays at the top of the window.
  header(): PageDocument | null;
  // The hooks a page of the site is written with: it is made at `slug`, or
  // the next free address, titled as its plan says, once `after` (the page
  // the Assistant opened before it) is still the one open.
  page(planned: { slug: string; after: number | null }): SitePageHooks;
  // Whether the page of `id` is the one open now.
  isOpen(id: number): boolean;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function writeSite(options: {
  // The direction, and what asking for it used, priced.
  askDirection: () => Promise<Answer & { tally?: Tally }>;
  // A page's plan, streamed as a page's is.
  askPage: (page: SitePagePlan) => (written: (piece: string) => void) => Promise<Answer & { tally?: Tally }>;
  // The site style as it is now: what the direction is held to, and what
  // is kept to be put back.
  style: DirectionStyle;
  facts: Pick<SiteFacts, "media" | "brief">;
  // The pictures' maker for the site, made once its look is known: its
  // palette, which an illustration is drawn in, and its imagery; none
  // where no picture is made.
  pictures?: (look: { palette: Record<PaletteSlot, string>; imagery: string }) => PictureMaker | undefined;
  budget?: number;
  hooks: SiteHooks;
  newId: NewId;
  tell: (site: SiteWriting) => void;
  signal?: AbortSignal;
}): Promise<SiteWriting> {
  const { hooks, tell, signal } = options;
  const stopped = (): boolean => signal?.aborted === true;
  let site: SiteWriting = {
    phase: "asking", direction: null, steps: { direction: "doing", style: "waiting", header: "waiting", footer: "waiting" },
    frame: { header: null, footer: null }, pages: [], notes: [], tally: null, error: null, before: null,
  };
  const update = (change: Partial<SiteWriting>): void => {
    site = { ...site, ...change };
    tell(site);
  };
  const step = (name: keyof SiteWriting["steps"], state: SiteStep): void => update({ steps: { ...site.steps, [name]: state } });
  const note = (words: string): void => update({ notes: [...site.notes, words] });
  const setPage = (at: number, change: Partial<SitePage>): void => update({ pages: site.pages.map((page, index) => (index === at ? { ...page, ...change } : page)) });
  // The run's end: the steps not taken said as stopped.
  const finish = (phase: SiteWriting["phase"], error: string | null): SiteWriting => {
    const steps = Object.fromEntries(Object.entries(site.steps).map(([name, state]) => [name, state === "waiting" || state === "doing" ? (phase === "done" ? state : "stopped") : state])) as SiteWriting["steps"];
    const pages = site.pages.map((page) => (page.state === "waiting" || page.state === "writing" ? { ...page, state: "stopped" as const } : page));
    update({ phase, error, steps, pages });
    return site;
  };
  update({});

  // 1. The direction.
  let direction: Direction;
  try {
    const answer = await options.askDirection();
    update({ tally: answer.tally ?? null });
    let raw: unknown = null;
    try {
      raw = JSON.parse(answer.text);
    } catch {
      raw = null;
    }
    const read = readDirection(raw, options.style);
    if (!read.ok) {
      step("direction", "failed");
      return finish("failed", read.reason);
    }
    direction = read.direction;
    update({ direction, notes: read.notes });
    step("direction", "done");
  } catch (error) {
    const ended = stopped() || (error instanceof AssistantError && error.kind === "stopped");
    if (error instanceof AssistantError && error.tally !== null) update({ tally: error.tally });
    step("direction", ended ? "stopped" : "failed");
    return finish(ended ? "stopped" : "failed", ended ? null : messageOf(error));
  }
  if (stopped()) return finish("stopped", null);

  // 2. The style, the one it replaces kept.
  update({ phase: "style" });
  step("style", "doing");
  const before = { palette: { ...options.style.palette }, typeScale: options.style.typeScale, letterWidth: options.style.letterWidth };
  const refused = await hooks.applyStyle(styleOf(direction));
  if (refused !== null) {
    step("style", "failed");
    return finish("failed", `The new style was not kept: ${refused}`);
  }
  update({ before });
  step("style", "done");
  if (stopped()) return finish("stopped", null);

  // 3. The addresses, free ones, then the frame on them.
  const taken = new Set(hooks.taken());
  const planned = direction.pages.map((page) => {
    let slug = page.address;
    for (let count = 2; taken.has(slug); count += 1) slug = `${page.address.slice(0, 60)}-${count}`;
    taken.add(slug);
    return { ...page, slug };
  });
  update({ phase: "frame", pages: planned.map((page) => ({ title: page.title, path: `/${page.slug}`, state: "waiting", id: null, writing: null, dangling: false })) });
  const sticky = hooks.header()?.sticky === true;
  // Each part's draft as it was before the new site, and as the run saved it last.
  const was: Record<PartKind, PageDocument | null> = { header: null, footer: null };
  const saved: Record<PartKind, PageDocument | null> = { header: null, footer: null };
  const frameOf = (pages: readonly FramePage[], href: string): Record<PartKind, PageDocument> => ({
    header: headerOf({ name: direction.name, action: { label: direction.action, href }, pages, sticky }),
    footer: footerOf({ name: direction.name, tagline: direction.tagline, pages }),
  });
  const setFrame = (kind: PartKind, state: FrameState): void => update({ frame: { ...site.frame, [kind]: state } });
  // A part saved over the draft it finds, the one before kept unless it is `ours`.
  const savePart = async (kind: PartKind, document: PageDocument, ours: PageDocument | null): Promise<PartSaved> => {
    try {
      return await hooks.savePart(kind, document, BEFORE_NEW_SITE, ours);
    } catch (error) {
      return { ok: false, why: messageOf(error) };
    }
  };
  // The home page as written, for where the header's call to action
  // leads; each page made as written, where it was still open once it was.
  let home: PageDocument | null = null;
  const written: Array<PageDocument | null> = planned.map(() => null);

  // 4. The pages, one after the other: how the run ended, or null once they
  // are all through.
  const writePages = async (): Promise<{ phase: "stopped" | "failed"; error: string | null } | null> => {
    update({ phase: "pages" });
    const look = {
      palette: Object.fromEntries(PALETTE_SLOTS.map((slot) => [slot, direction.palette[slot]?.hex ?? "#000000"])) as Record<PaletteSlot, string>,
      imagery: direction.imagery,
    };
    const maker = options.pictures?.(look);
    const queue = inTurn(PICTURES_AT_ONCE);
    let left = maker ? (options.budget ?? SITE_PICTURES_MOST) : 0;
    let last: number | null = null;
    const ink = { text: direction.palette.text?.hex ?? look.palette.text, background: direction.palette.background?.hex ?? look.palette.background };
    for (const [index, plan] of planned.entries()) {
      if (stopped()) return { phase: "stopped", error: null };
      if (last !== null && !hooks.isOpen(last)) return { phase: "stopped", error: LEFT_SITE };
      // Its share of the pictures: as many as are left, keeping one for each
      // page still to come, and never more than a page takes.
      const most = Math.max(0, Math.min(PLAN_MADE_MOST, left - (planned.length - index - 1)));
      const page = hooks.page({ slug: plan.slug, after: last });
      const path = site.pages[index]!.path;
      setPage(index, { state: "writing" });
      // Why its request failed, if it did: whether the same would come again.
      const failure: { kind: AssistantErrorKind | null } = { kind: null };
      const ask = options.askPage({
        index, title: plan.title, purpose: plan.purpose, path, home: index === 0, most, direction,
        pages: site.pages.map((one, at) => ({ path: one.path, title: one.title, purpose: planned[at]!.purpose })),
      });
      const result = await writePage({
        ask: (piece) => ask(piece).catch((error: unknown) => {
          if (error instanceof AssistantError) failure.kind = error.kind;
          throw error;
        }),
        facts: { media: options.facts.media, brief: options.facts.brief, paths: site.pages.map((one) => one.path), ink, made: most > 0, most },
        newId: options.newId,
        hooks: page,
        tell: (writing) => setPage(index, { writing }),
        ...(signal ? { signal } : {}),
        ...(maker && most > 0 ? { pictures: maker } : {}),
        queue,
      });
      left -= result.pictures.length;
      const made = page.made();
      if (made !== null) {
        setPage(index, { id: made.id, path: `/${made.slug}` });
        last = made.id;
        if (hooks.isOpen(made.id)) {
          written[index] = page.document();
          if (index === 0) home = written[index];
        }
      }
      if (result.phase === "done" && made !== null) {
        setPage(index, { state: "done" });
        continue;
      }
      setPage(index, { state: result.phase === "stopped" ? "stopped" : "failed" });
      if (result.phase === "stopped") return { phase: "stopped", error: null };
      if (result.error === LEFT) return { phase: "stopped", error: LEFT_SITE };
      if (failure.kind !== null && HALTS.has(failure.kind)) return { phase: "failed", error: result.error };
      note(`The page “${plan.title}” was not written: ${result.error ?? "the answer held no page."}`);
    }
    return null;
  };

  // 5. The frame settled on the pages made, at the addresses they were made
  // at, or put back as it was where no page was made; then the buttons of
  // the pages made that lead to one not made, or made at another address.
  const settle = async (): Promise<void> => {
    const made = site.pages.flatMap((page, index) => (page.id === null ? [] : [{ index, id: page.id, title: page.title, path: page.path }]));
    for (const kind of PARTS) {
      const ours = saved[kind];
      if (ours === null) continue;
      if (made.length === 0) {
        const back = await savePart(kind, was[kind]!, ours);
        if (back.ok) {
          saved[kind] = was[kind];
          setFrame(kind, "back");
          note(`Put the ${kind} back as it was: no page of the new site was made.`);
        } else {
          setFrame(kind, "stale");
          note(`The new ${kind} was not put back as it was: ${back.why} It leads to pages that were not made; its versions hold the one it replaced, as “${BEFORE_NEW_SITE}”.`);
        }
        continue;
      }
      const first = site.pages[0]!;
      const href = first.id !== null ? actionOf(first.path, home) : made[0]!.path;
      const settled = frameOf(made.map(({ title, path }) => ({ title, path })), href)[kind];
      if (sameJson(ours, settled)) continue;
      const outcome = await savePart(kind, settled, ours);
      if (outcome.ok) saved[kind] = settled;
      else {
        setFrame(kind, "stale");
        note(`The new ${kind} was not brought up to date with the pages made: ${outcome.why} It still leads to pages that were not made.`);
      }
    }
    // Where each page the others were told of is now, where that changed:
    // made at another address, or not made.
    const moves = new Map<string, string | null>();
    planned.forEach((plan, index) => {
      const page = site.pages[index]!;
      if (page.id === null) moves.set(`/${plan.slug}`, null);
      else if (page.path !== `/${plan.slug}`) moves.set(`/${plan.slug}`, page.path);
    });
    if (moves.size === 0) return;
    for (const page of made) {
      // A page whose buttons, as it was written, lead to none of them needs nothing.
      const known = written[page.index] ?? null;
      if (known !== null && relinked(known, moves).changed.length === 0) continue;
      let changed: Relinked[] = [];
      let why: string | null;
      try {
        why = await hooks.changePage(page.id, (doc) => {
          const relink = relinked(doc, moves);
          changed = relink.changed;
          return changed.length === 0 ? null : { document: relink.document, label: changed.every((one) => one.to === null) ? "Assistant took out links to pages not made" : "Assistant led buttons to the pages made" };
        });
      } catch (error) {
        why = messageOf(error);
      }
      if (why !== null) {
        setPage(page.index, { dangling: true });
        note(`“${page.title}”: Its buttons that lead to pages not made keep their links, as the change was not saved: ${why}`);
        continue;
      }
      for (const one of changed) note(relinkWords(page.title, one));
    }
  };

  let ended: { phase: "stopped" | "failed"; error: string | null } | null = null;
  try {
    const first = frameOf(site.pages.map(({ title, path }) => ({ title, path })), site.pages[0]!.path);
    for (const kind of PARTS) {
      if (stopped()) {
        ended = { phase: "stopped", error: null };
        break;
      }
      step(kind, "doing");
      const outcome = await savePart(kind, first[kind], null);
      if (outcome.ok) {
        was[kind] = outcome.replaced;
        saved[kind] = first[kind];
        setFrame(kind, "new");
      } else note(`The new ${kind} was not saved: ${outcome.why}`);
      step(kind, outcome.ok ? "done" : "failed");
    }
    if (ended === null) ended = await writePages();
  } catch (error) {
    ended = { phase: "failed", error: messageOf(error) };
  }
  // However the run ended, once a part may have been saved.
  await settle();
  return finish(ended?.phase ?? "done", ended?.error ?? null);
}

const PARTS = ["header", "footer"] as const;

// "“Home”: Took the link out of the button “Classes”: the page it led to,
// /classes, was not made."
function relinkWords(title: string, one: Relinked): string {
  const button = `the button “${one.label}”${one.plan === null ? "" : ` of the plan “${one.plan}”`}`;
  return one.to === null
    ? `“${title}”: Took the link out of ${button}: the page it led to, ${one.from}, was not made.`
    : `“${title}”: Led ${button} to ${one.to}, where its page was made, in place of ${one.from}.`;
}

// The page with each button that led to one of `moves`' addresses led
// where that page is now, or nowhere where it was not made: to the top of
// its own page (#), as a plan's button whose section never came. A button
// block and a plan's button alike, each by a command of the page's own, so
// the page's rules hold; and the buttons so changed.
export function relinked(doc: PageDocument, moves: ReadonlyMap<string, string | null>): { document: PageDocument; changed: Relinked[] } {
  const found = [...allBlocks(doc)].flatMap(({ block }): Array<{ id: string; plan: { index: number; name: string } | null; label: string; from: string }> => {
    if (block.type === "button") return moves.has(block.props.href) ? [{ id: block.id, plan: null, label: block.props.label, from: block.props.href }] : [];
    if (block.type !== "pricing") return [];
    return block.props.plans.flatMap((plan, index) => (moves.has(plan.button.href) ? [{ id: block.id, plan: { index, name: plan.name }, label: plan.button.label, from: plan.button.href }] : []));
  });
  let next = doc;
  const changed: Relinked[] = [];
  for (const one of found) {
    const to = moves.get(one.from) ?? null;
    const href = to ?? "#";
    const made = one.plan === null ? makeSetProps(next, one.id, { href }) : makeSetItem(next, one.id, one.plan.index, { button: { label: one.label, href } });
    if (!made.ok) continue;
    const applied = applyCommand(next, made.command);
    if (!applied.ok) continue;
    next = applied.document;
    changed.push({ label: one.label, plan: one.plan?.name ?? null, from: one.from, to });
  }
  return { document: next, changed };
}
