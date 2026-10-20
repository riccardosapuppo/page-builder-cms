// A page written from a brief (./README.md): the model's plan streams in
// (./plan-stream.ts); the page is made and opened as soon as the plan's
// title has come; each section is built (./build.ts) and put on it by a
// command of its own the moment it closes, so the person watches the page
// grow and History holds each step, each one undoable. What the editor
// does is passed in (PageHooks), so this runs the same in a test.
//
// A stop, a refusal or a fault keeps what is already on the page, and a
// stop lets nothing more land, not even sections that had come while the
// page was being made. However the answer ends, a button that leads to a
// section the page does not have is taken out (a plan's button loses its
// link instead), while the page is open. The page is left alone once
// another one is opened in its place: nothing written for it lands on
// another page. What the request used, priced (./tally.ts), is said at the
// end, a refused or cut answer's too: a sample written by hand used none.
//
// Pictures made for the page (./pictures.ts), where the person wants them:
// each is asked for the moment its section is in (./build.ts,
// picturesFor), two at once at most, made by the person's provider
// (PictureMaker), put in the site's library with its alt text
// (PageHooks.upload), then put on its section, or as an image in its
// column, as a step of the Assistant's of its own. One that fails, for
// whatever reason, leaves its section as it was, and is said; a refusal
// of the key (or no network, or no credit) asks for no more. The page is
// written once its pictures are in. A stop, another page opened (looked
// for before each picture is asked, after each that fails, and every
// PAGE_WATCH_MS meanwhile), or the key the run began with forgotten or
// replaced (PictureMaker.gone) stops the pictures still being made, those
// in flight too; one already made goes into the library, not onto the
// page; and what was not made is said.
import { locate } from "../document/tree.ts";
import { makeDelete, makeInsert, makeInsertUploadedImage, makeSetItem, makeSetPage, makeSetPicture, type Made } from "../document/commands.ts";
import { idDraw, type NewId } from "../document/ids.ts";
import type { PageDocument } from "../shared/document.ts";
import { PlanBuilder, type PictureAsk, type SiteFacts } from "./build.ts";
import { pictureName, type MadeType, type PictureKind } from "./pictures.ts";
import { PlanStream } from "./plan-stream.ts";
import { AssistantError, type Answer } from "./providers.ts";
import type { Tally } from "./tally.ts";

export interface PageHooks {
  // Makes and opens a page with this title: null once it is open, or why not.
  open(title: string): Promise<string | null>;
  // Whether the page opened is still the one in the editor.
  still(): boolean;
  document(): PageDocument;
  // Applies a command: null once applied, or the page's refusal, in a
  // sentence. A quiet one (a picture put in, which may come while the
  // person is at work on the page) leaves the selection where it is.
  apply(made: Made, options?: { quiet?: boolean }): string | null;
  // Puts a picture made for the page in the site's library, as an upload
  // is, with its alt text: its id there, or why not. Without it, no
  // picture is made.
  upload?(file: File, picture: { width: number; height: number; alt: string }): Promise<{ ok: true; mediaId: string } | { ok: false; reason: string }>;
}

// A picture made, ready for the library: its bytes, its kind and size, and
// what making it used, priced.
export interface MadePicture {
  blob: Blob;
  type: MadeType;
  width: number;
  height: number;
  tally: Tally;
}

// Makes the pictures a page asks for: photos or illustrations (./makers.ts).
// `gone` aborts once the key they are made with is no longer the one kept:
// what is in flight stops, and nothing more is asked.
export interface PictureMaker {
  kind: PictureKind;
  make(ask: PictureAsk, signal: AbortSignal): Promise<MadePicture>;
  gone?: AbortSignal;
}

// A picture that could not be made, which cost something all the same (an
// illustration whose SVG was not clean): why, and what it used.
export class PictureError extends Error {
  readonly tally: Tally;

  constructor(message: string, tally: Tally) {
    super(message);
    this.name = "PictureError";
    this.tally = tally;
  }
}

export interface SectionWritten {
  label: string;
  // In the page, or left out (with the reason in the notes).
  kept: boolean;
}

// A picture made for the page, as the drawer shows it: its section (its
// place in `sections`), whether it goes behind it or in it as an image,
// what it is and where it stands; what making it used, once said.
export interface PictureWritten {
  section: number;
  behind: boolean;
  kind: PictureKind;
  state: "waiting" | "making" | "placing" | "placed" | "failed" | "stopped";
  tally: Tally | null;
}

export interface Writing {
  // pictures: the answer has ended, and pictures are still being made.
  phase: "asking" | "writing" | "pictures" | "done" | "stopped" | "failed";
  title: string | null;
  sections: SectionWritten[];
  pictures: PictureWritten[];
  notes: string[];
  // What the request used and what it comes to at list price, once the
  // provider has said it: none for a sample, or for a request stopped
  // before its end. The pictures' are their own.
  tally: Tally | null;
  error: string | null;
}

// How many pictures are made at once.
export const PICTURES_AT_ONCE = 2;
// How often, while pictures are being made, the page is looked at to see
// whether it is still the one open: a page left stops them at once.
export const PAGE_WATCH_MS = 250;

export const LEFT = "Another page was opened: the Assistant stopped writing to this one.";

// Jobs run in the order they come, `most` at once. A page's pictures go
// through one; a new site's pages share one (./site.ts).
export type PictureQueue = (job: () => Promise<void>) => Promise<void>;
export function inTurn(most: number): PictureQueue {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async (job) => {
    if (running >= most) await new Promise<void>((go) => waiting.push(go));
    running += 1;
    try {
      await job();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

// Why a picture was not made that asks for no more: the key refused, the
// model gone, no credit, no network. The same would come again.
export const HALTS: ReadonlySet<string> = new Set(["key", "model", "limit", "network"]);

// "Added section Hero" said as the Assistant's: "Assistant added section Hero".
export const ASSISTANTS = (label: string): string => `Assistant ${label.charAt(0).toLowerCase()}${label.slice(1)}`;

export function asAssistants(made: Made): Made {
  return made.ok ? { ok: true, command: { ...made.command, label: ASSISTANTS(made.command.label) } } : made;
}

const UNTITLED = "New page";

export async function writePage(options: {
  // The answer, and what asking for it used, priced: a sample has no tally.
  ask: (written: (piece: string) => void) => Promise<Answer & { tally?: Tally }>;
  facts: SiteFacts;
  newId: NewId;
  hooks: PageHooks;
  tell: (writing: Writing) => void;
  // The run's stop: what has not landed when it comes never does.
  signal?: AbortSignal;
  // Makes the pictures the plan asks for, where the person wants them; the
  // plan asks for none unless facts.made says it may.
  pictures?: PictureMaker;
  // The queue the pictures wait their turn in: a new site's, shared by its
  // pages; else the page's own, PICTURES_AT_ONCE at a time.
  queue?: PictureQueue;
}): Promise<Writing> {
  const { ask, facts, newId, hooks, tell, signal } = options;
  const maker = options.pictures !== undefined && hooks.upload !== undefined ? options.pictures : null;
  const stopped = (): boolean => signal?.aborted === true;
  const builder = new PlanBuilder({ ...facts, made: facts.made === true && maker !== null });
  let writing: Writing = { phase: "asking", title: null, sections: [], pictures: [], notes: [], tally: null, error: null };
  const update = (change: Partial<Writing>): void => {
    writing = { ...writing, ...change, notes: [...builder.notes] };
    tell(writing);
  };
  update({});

  // The pictures' own stop: the run's, the page no longer the one open, or
  // the key they are made with no longer the one kept. What is in flight
  // is aborted, and nothing more is asked.
  const picturing = new AbortController();
  const stopPictures = (): void => picturing.abort();
  signal?.addEventListener("abort", stopPictures, { once: true });
  if (stopped()) stopPictures();
  let keyGone = false;
  const goneKey = (): void => {
    keyGone = true;
    stopPictures();
  };
  maker?.gone?.addEventListener("abort", goneKey, { once: true });
  if (maker?.gone?.aborted) goneKey();
  const queue = options.queue ?? inTurn(PICTURES_AT_ONCE);
  const jobs: Array<Promise<void>> = [];
  // The images made and put in, by their keys, for those that follow them in a column.
  const placed = new Map<string, string>();
  // The pictures that were made (paid for), by their place in `pictures`.
  const madeAt = new Set<number>();
  // Why no more pictures are asked for, once one says the same would come again.
  let halted: string | null = null;
  const picture = (at: number, change: Partial<PictureWritten>): void => {
    update({ pictures: writing.pictures.map((one, index) => (index === at ? { ...one, ...change } : one)) });
  };
  // While pictures are being made, the page is looked at every
  // PAGE_WATCH_MS: one left stops them at once, those in flight too.
  let watching: ReturnType<typeof setInterval> | null = null;

  // The page, made once: from the plan's title, or a plain one if a section comes first.
  let opening: Promise<string | null> | null = null;
  const open = (title: string): Promise<string | null> => {
    opening ??= hooks.open(title).then((why) => {
      if (why === null) update({ title });
      return why;
    });
    return opening;
  };
  // Each step waits for the one before: the page is open before anything goes on it.
  let steps: Promise<void> = Promise.resolve();
  let lost: string | null = null;
  const step = (run: () => Promise<void> | void): void => {
    steps = steps.then(async () => {
      if (lost !== null || stopped()) return;
      const why = await open(UNTITLED);
      if (why !== null) lost = why;
      else if (!hooks.still()) lost = LEFT;
      if (lost !== null) stopPictures();
      if (lost === null && !stopped()) await run();
    });
  };

  // Whether the page is still the one being written: once another is
  // open, the pictures stop, those in flight too, and nothing more is
  // asked for this one.
  const writingHere = (): boolean => {
    if (lost === null && !stopped() && !hooks.still()) {
      lost = LEFT;
      stopPictures();
    }
    return lost === null && !stopped();
  };

  // One picture, from the moment its section is in: made, put in the
  // library, then on the page, each stage said in the drawer. Before it is
  // asked for, the page must still be the one being written.
  const makePicture = async (made: PictureMaker, ask: PictureAsk, at: number): Promise<void> => {
    const what = `the ${made.kind} ${ask.place.behind ? "behind" : "for an image in"} ${ask.called}`;
    if (!writingHere() || picturing.signal.aborted || halted !== null) {
      picture(at, { state: halted !== null && !picturing.signal.aborted ? "failed" : "stopped" });
      return;
    }
    picture(at, { state: "making" });
    let picked: MadePicture;
    try {
      picked = await made.make(ask, picturing.signal);
    } catch (error) {
      const tally = error instanceof AssistantError || error instanceof PictureError ? error.tally : null;
      // Stopped by the pictures' own stop; a failure of its own that came
      // as they were stopped is still said as one.
      const said = error instanceof AssistantError || error instanceof PictureError;
      if ((error instanceof AssistantError && error.kind === "stopped") || (picturing.signal.aborted && !said)) {
        picture(at, { state: "stopped", tally });
        return;
      }
      const why = error instanceof Error ? error.message : String(error);
      builder.notes.push(`Left out ${what}: ${why}`);
      if (error instanceof AssistantError && HALTS.has(error.kind) && halted === null) {
        halted = why;
        builder.notes.push("Asked for no more pictures: the same would come again.");
      }
      picture(at, { state: "failed", tally });
      // A page left meanwhile stops the others now, not at their turn.
      writingHere();
      return;
    }
    // Made, and paid for: it goes into the library even once stopped, and
    // onto the page only while it is still being written.
    madeAt.add(at);
    picture(at, { state: "placing", tally: picked.tally });
    const file = new File([picked.blob], pictureName(writing.title ?? UNTITLED, ask.alt || ask.prompt, picked.type), { type: picked.type });
    let uploaded: { ok: true; mediaId: string } | { ok: false; reason: string };
    try {
      uploaded = await hooks.upload!(file, { width: picked.width, height: picked.height, alt: ask.alt });
    } catch (error) {
      // A library that fails in a way of its own fails this picture, not the page.
      uploaded = { ok: false, reason: `it could not be kept: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!uploaded.ok) {
      builder.notes.push(`Left out ${what}: ${uploaded.reason}`);
      picture(at, { state: "failed" });
      writingHere();
      return;
    }
    const kept = (why: string): void => {
      builder.notes.push(`Put ${what} in the library only: ${why}`);
      picture(at, { state: stopped() || lost !== null ? "stopped" : "failed" });
    };
    if (!writingHere()) return kept("the writing stopped before it went on the page.");
    const doc = hooks.document();
    if (ask.place.behind) {
      const section = locate(doc, ask.sectionId)?.block;
      if (section?.type !== "section") return kept("its section is no longer on the page.");
      if (section.props.picture !== undefined) return kept("its section has a picture behind it already.");
      const refused = hooks.apply(asAssistants(makeSetPicture(doc, ask.sectionId, uploaded.mediaId)), { quiet: true });
      if (refused !== null) return kept(refused);
    } else {
      const column = locate(doc, ask.place.columnId)?.block;
      if (column?.type !== "column") return kept("its column is no longer on the page.");
      // After the nearest block the plan put before it that is still there.
      const ids = column.children.map((child) => child.id);
      const before = ask.place.after.map((key) => placed.get(key) ?? key).find((id) => ids.includes(id));
      const index = before === undefined ? 0 : ids.indexOf(before) + 1;
      const image = ask.alt === "" ? { mediaId: uploaded.mediaId, decorative: true as const } : { mediaId: uploaded.mediaId, alt: ask.alt };
      const insert = makeInsertUploadedImage(doc, image, { parentId: column.id, index }, newId);
      const refused = hooks.apply(asAssistants(insert), { quiet: true });
      if (refused !== null) return kept(refused);
      if (insert.ok && insert.command.subject) placed.set(ask.key, insert.command.subject.id);
    }
    picture(at, { state: "placed" });
  };

  // The pictures a section asks for, once it is in, `index` its place in `sections`.
  const pictures = (sectionId: string, index: number): void => {
    if (maker === null) return;
    for (const ask of builder.picturesFor(sectionId)) {
      const at = writing.pictures.length;
      update({ pictures: [...writing.pictures, { section: index, behind: ask.place.behind, kind: maker.kind, state: "waiting", tally: null }] });
      watching ??= setInterval(writingHere, PAGE_WATCH_MS);
      jobs.push(queue(() => makePicture(maker, ask, at)));
    }
  };

  const stream = new PlanStream({
    head: (key, value) => {
      if (key === "title") {
        void open(builder.title(value) ?? UNTITLED);
        return;
      }
      const description = builder.description(value);
      if (description !== null) step(() => void hooks.apply(asAssistants(makeSetPage(hooks.document(), { description }))));
    },
    section: (raw) => step(() => {
      const doc = hooks.document();
      const section = builder.section(raw, idDraw(doc, newId));
      if (section === null) {
        update({ sections: [...writing.sections, { label: labelOf(raw), kept: false }] });
        return;
      }
      const refused = hooks.apply(asAssistants(makeInsert(doc, section, { parentId: null, index: doc.sections.length })));
      if (refused !== null) builder.notes.push(`Left out ${section.props.label ? `the section “${section.props.label}”` : "a section"}: ${refused}`);
      const index = writing.sections.length;
      update({ sections: [...writing.sections, { label: section.props.label ?? `Section ${index + 1}`, kept: refused === null }] });
      if (refused === null) pictures(section.id, index);
    }),
  });

  // The pictures still being made, said as such once the answer has ended;
  // then what was not made, and why.
  let picturesSaid = false;
  const picturesDone = async (): Promise<void> => {
    if (picturesSaid) return;
    if (writing.pictures.some((one) => one.state === "waiting" || one.state === "making" || one.state === "placing") && !stopped()) update({ phase: "pictures" });
    await Promise.all(jobs);
    picturesSaid = true;
    if (watching !== null) clearInterval(watching);
    watching = null;
    signal?.removeEventListener("abort", stopPictures);
    maker?.gone?.removeEventListener("abort", goneKey);
    const unmade = writing.pictures.filter((one, at) => one.state === "stopped" && !madeAt.has(at)).length;
    if (unmade === 0) return;
    const why = lost !== null ? "another page was opened" : keyGone ? "the key they were to be made with is no longer kept" : "the writing was stopped";
    builder.notes.push(`Did not make ${unmade === 1 ? "one picture" : `${unmade} pictures`} still to come: ${why}.`);
    update({});
  };

  // The buttons whose section never came go, however the answer ended:
  // once the steps waiting are through, while the page made is the one open.
  // A plan's button stays with its plan and leads to the top of the page.
  const tidy = async (): Promise<void> => {
    if (opening === null || lost !== null || (await opening) !== null || !hooks.still()) return;
    for (const button of builder.unmet(hooks.document())) {
      if (button.plan) {
        hooks.apply(asAssistants(makeSetItem(hooks.document(), button.id, button.plan.index, { button: { label: button.label, href: "#" } })));
        builder.notes.push(`Took the link out of the button “${button.label}” of the plan “${button.plan.name}”: the section it leads to was not written.`);
        continue;
      }
      hooks.apply(asAssistants(makeDelete(hooks.document(), button.id)));
      builder.notes.push(`Took out the button “${button.label}”: the section it leads to was not written.`);
    }
  };

  try {
    const answer = await ask((piece) => {
      if (writing.phase === "asking") update({ phase: "writing" });
      stream.push(piece);
    });
    await steps;
    try {
      stream.end();
    } catch {
      builder.notes.push("The answer ended before it was whole: what came is on the page.");
    }
    await picturesDone();
    await tidy();
    if (stopped()) {
      update({ phase: "stopped", tally: answer.tally ?? null, error: null });
      return writing;
    }
    if (opening === null) builder.notes.push("The answer held no page.");
    update({ phase: lost === null ? "done" : "failed", tally: answer.tally ?? null, error: lost });
  } catch (error) {
    await steps;
    await picturesDone();
    await tidy();
    const ended = stopped() || (error instanceof AssistantError && error.kind === "stopped");
    const tally = error instanceof AssistantError ? error.tally : null;
    update({ phase: ended ? "stopped" : "failed", tally, error: ended ? null : error instanceof Error ? error.message : String(error) });
  }
  return writing;
}

function labelOf(raw: unknown): string {
  const label = (raw as { label?: unknown } | null)?.label;
  return typeof label === "string" && label.trim() !== "" ? label.trim().slice(0, 60) : "A section";
}
