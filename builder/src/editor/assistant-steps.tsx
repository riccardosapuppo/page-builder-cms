// What a run of the Assistant says of itself, in the drawer
// (./AssistantPanel.tsx) and in its run window (./AssistantRun.tsx) alike:
// the phase, the status line, the steps (a page's sections as they land,
// each with its pictures under it; a new site's own steps, its direction,
// its style's swatches, its header and footer, then each page with its
// sections), the things to know, and once it is over what it used and what
// that comes to at the providers' list prices (../assistant/tally.ts).
import { Fragment, type CSSProperties } from "react";
import type { ShownSite, ShownWriting } from "../assistant/context.tsx";
import type { PictureKind } from "../assistant/pictures.ts";
import { about } from "../assistant/prices.ts";
import { BEFORE_NEW_SITE, type SitePage, type SiteStep } from "../assistant/site.ts";
import { addTallies, allWords, estimateWords, pictureWords, usedWords, type Tally } from "../assistant/tally.ts";
import type { PictureWritten, Writing } from "../assistant/write.ts";
import { PALETTE_SLOTS } from "../shared/document.ts";
import { slotLabel } from "../shared/site-tokens.ts";
import { Icon } from "./icons.tsx";

export const KIND_NAMES: Readonly<Record<PictureKind, string>> = { photo: "Photo", illustration: "Illustration" };

export const PHASE_WORDS: Readonly<Record<ShownWriting["phase"], string>> = {
  asking: "Asking",
  writing: "Writing",
  pictures: "Making pictures",
  done: "Written",
  stopped: "Stopped",
  failed: "Not written",
};

export const SITE_PHASE_WORDS: Readonly<Record<ShownSite["phase"], string>> = {
  asking: "Asking for a direction",
  style: "Giving the site its style",
  frame: "Building the header and footer",
  pages: "Writing the pages",
  done: "Written",
  stopped: "Stopped",
  failed: "Not written",
};

export const going = (writing: ShownWriting): boolean => writing.phase === "asking" || writing.phase === "writing" || writing.phase === "pictures";
export const siteGoing = (site: ShownSite): boolean => site.phase === "asking" || site.phase === "style" || site.phase === "frame" || site.phase === "pages";

// The run's name, as its heading says it: "Writing · sample", "Written · new site".
export const pageTitle = (writing: ShownWriting): string => `${PHASE_WORDS[writing.phase]}${writing.sample ? " · sample" : ""}`;
export const siteTitle = (site: ShownSite): string => `${SITE_PHASE_WORDS[site.phase]} · new site`;

export const count = (n: number): string => `${n} ${n === 1 ? "section" : "sections"}`;
export const pictureCount = (n: number, kind: PictureKind): string => `${n} ${n === 1 ? kind : `${kind}s`}`;
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
export const and = (words: readonly string[]): string => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

// A page's status line: what it is doing, or how it ended. A page written
// arrives whole, as its draft: History holds none of its sections.
export function pageLine(writing: ShownWriting): string {
  const kept = writing.sections.filter((section) => section.kept).length;
  const placed = writing.pictures.filter((one) => one.state === "placed");
  const kind = writing.pictures[0]?.kind;
  const page = writing.title ? `“${writing.title}”` : "the new page";
  const onPage = placed.length > 0 && kind ? `${count(kept)} and ${pictureCount(placed.length, kind)}` : count(kept);
  switch (writing.phase) {
    case "asking":
      return writing.sample ? "Reading the sample plan…" : `Asking ${writing.model ?? "the model"}…`;
    case "writing":
      return `Writing ${page}: ${count(kept)} so far.`;
    case "pictures":
      return `Making the pictures for ${page}: ${placed.length} of ${writing.pictures.length} in.`;
    case "done":
      return writing.unsaved === undefined ? `${onPage} on ${page}, saved as its draft.` : `${onPage} on ${page}. Its last changes were not saved.`;
    case "stopped":
      if (writing.title === null) return "Stopped: no page was made.";
      return writing.unsaved === undefined ? `Stopped. The ${onPage} on ${page} stay, saved as its draft.` : `Stopped. The ${onPage} on ${page} stay; its last changes were not saved.`;
    case "failed":
      return writing.error ?? "The page was not written.";
  }
}

// Where a picture stands, after its name in the list.
function pictureState(one: PictureWritten): string {
  switch (one.state) {
    case "waiting":
      return "waiting";
    case "making":
      return one.kind === "photo" ? "being made…" : "being drawn…";
    case "placing":
      return "going into the library…";
    case "placed": {
      const tally = one.tally ?? [];
      const priced = tally.filter((line) => line.cost.price !== null);
      if (tally.length === 0) return "in";
      if (priced.length === 0) return "in, no list price on file";
      return `in, ${about(priced.reduce((nano, line) => nano + (line.cost.price === null ? 0 : line.cost.nano), 0))}`;
    }
    case "failed":
      return "left out";
    case "stopped":
      return "stopped";
  }
}

const PICTURE_ICONS: Readonly<Record<PictureWritten["state"], "clock" | "spinner" | "check" | "warning">> = {
  waiting: "clock", making: "spinner", placing: "spinner", placed: "check", failed: "warning", stopped: "warning",
};

// A page's sections as they land, each with its pictures under it.
export function SectionSteps({ writing }: { writing: Writing }) {
  return (
    <>
      {writing.sections.map((section, index) => (
        <Fragment key={index}>
          <li className={section.kept ? undefined : "as-left"}>
            <Icon name={section.kept ? "check" : "warning"} />
            <span>{section.label}</span>
            {!section.kept && <span className="visually-hidden">, left out</span>}
          </li>
          {writing.pictures.map((one, at) => one.section !== index ? null : (
            <li key={`picture-${at}`} className={`as-picture as-picture-${one.state}`}>
              {one.state === "making" || one.state === "placing" ? <Icon name="spinner" className="i spin" /> : <Icon name={PICTURE_ICONS[one.state]} />}
              <span>{KIND_NAMES[one.kind]} {one.behind ? "behind" : "in"} {section.label}</span>
              <span className="as-picture-state"><span className="visually-hidden">, </span>{pictureState(one)}</span>
            </li>
          ))}
        </Fragment>
      ))}
    </>
  );
}

// What the page written says it used, once it has ended: the page's words
// and its pictures; nothing while it is being written, for a sample, or
// when the provider said nothing.
export function shownTally(writing: ShownWriting | null): { words: Tally | null; pictures: Tally } | null {
  if (writing === null || writing.sample || going(writing)) return null;
  const words = writing.tally !== null && writing.tally.length > 0 ? writing.tally : null;
  const pictures = addTallies(...writing.pictures.map((one) => one.tally ?? []));
  return words === null && pictures.length === 0 ? null : { words, pictures };
}

// What a new site used, its direction's and its pages' words and its
// pictures, as far as it has come.
export function siteTallies(site: ShownSite): { words: Tally; pictures: Tally } {
  return {
    words: addTallies(site.tally ?? [], ...site.pages.map((page) => page.writing?.tally ?? [])),
    pictures: addTallies(...site.pages.flatMap((page) => page.writing?.pictures.map((one) => one.tally ?? []) ?? [])),
  };
}

// What a page used and what it comes to, once it has ended: its words, a
// line for each kind of picture, the whole; for a request stopped, that its
// tokens are not known; for the sample, that no model was asked.
export function PageCost({ writing }: { writing: ShownWriting }) {
  if (going(writing)) return null;
  const shown = shownTally(writing);
  const kinds = shown ? (["photo", "illustration"] as const).map((which) => pictureWords(shown.pictures, which)).filter((words) => words !== null) : [];
  const all = shown ? allWords(addTallies(shown.words ?? [], shown.pictures)) : null;
  return (
    <>
      {shown?.words && (
        <>
          <p className="hint as-used">{usedWords(shown.words)}</p>
          <p className="hint as-cost">{estimateWords(shown.words)}</p>
        </>
      )}
      {kinds.map((words) => <p key={words} className="hint as-pictures-cost">{words}</p>)}
      {all && <p className="hint as-all">{all}</p>}
      {writing.phase === "stopped" && !writing.sample && (shown?.words ?? null) === null && (
        <p className="hint as-used">Its tokens are not known: the provider counts them when a request ends, and this one was stopped.</p>
      )}
      {writing.sample && <p className="hint">A sample written by hand: no model was asked.</p>}
    </>
  );
}

// The same for a new site, once it has ended: its direction's and its
// pages' words together, a line for each kind of picture, the whole.
export function SiteCost({ site }: { site: ShownSite }) {
  if (siteGoing(site)) return null;
  const { words, pictures } = siteTallies(site);
  const kinds = (["photo", "illustration"] as const).map((which) => pictureWords(pictures, which)).filter((line) => line !== null);
  const whole = allWords(addTallies(words, pictures), "the site");
  return (
    <>
      {words.length > 0 && (
        <>
          <p className="hint as-used">{usedWords(words)}</p>
          <p className="hint as-cost">{estimateWords(words)}</p>
        </>
      )}
      {kinds.map((line) => <p key={line} className="hint as-pictures-cost">{line}</p>)}
      {whole && <p className="hint as-all">{whole}</p>}
    </>
  );
}

// The things a run says it left out, or that are worth knowing, folded
// under how many there are.
export function Notes({ notes, site = false }: { notes: readonly string[]; site?: boolean }) {
  if (notes.length === 0) return null;
  const summary = site
    ? notes.length === 1 ? "One thing to know" : `${notes.length} things to know`
    : notes.length === 1 ? "One thing was left out" : `${notes.length} things were left out`;
  return (
    <details className="as-notes">
      <summary>{summary}</summary>
      <ul>{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </details>
  );
}

// A new site's notes and its pages', each page's under its title.
export const siteNotes = (site: ShownSite): string[] => [...site.notes, ...site.pages.flatMap((page) => (page.writing?.notes ?? []).map((note) => `“${page.title}”: ${note}`))];

// ------------------------------------------------------------ a new site

const STEP_ICONS: Readonly<Record<SiteStep, "clock" | "check" | "warning">> = { waiting: "clock", doing: "clock", done: "check", failed: "warning", stopped: "warning" };
const STEP_WORDS: Readonly<Record<SiteStep, string>> = { waiting: "waiting", doing: "", done: "", failed: "not made", stopped: "stopped" };
const PAGE_WORDS: Readonly<Record<SitePage["state"], string>> = { waiting: "waiting", writing: "being written…", done: "written", failed: "not written", stopped: "stopped" };

// What a new site has made, in words: "a new style, a new header and
// footer, and 3 pages with 4 photos".
export function madeWords(site: ShownSite): string {
  const parts: string[] = [];
  if (site.steps.style === "done") parts.push("a new style");
  // A part put back as it was is not one the site made.
  const frame = (["header", "footer"] as const).filter((kind) => site.steps[kind] === "done" && site.frame[kind] !== "back");
  if (frame.length > 0) parts.push(`a new ${frame.join(" and ")}`);
  const pages = site.pages.filter((page) => page.id !== null);
  const placed = pages.flatMap((page) => page.writing?.pictures ?? []).filter((one) => one.state === "placed");
  if (pages.length > 0) parts.push(`${plural(pages.length, "page", "pages")}${placed.length > 0 ? ` with ${pictureCount(placed.length, placed[0]!.kind)}` : ""}`);
  // Its parts hold an "and" of their own: the last one follows a comma.
  return parts.length === 0 ? "nothing" : parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

// A new site's status line: what it is doing, or how it ended.
export function siteLine(site: ShownSite): string {
  const name = site.direction ? `“${site.direction.name}”` : "the new site";
  switch (site.phase) {
    case "asking":
      return `Asking ${site.model ?? "the model"} for the site's direction…`;
    case "style":
      return `Giving ${name} its style…`;
    case "frame":
      return `Building ${name}'s header and footer…`;
    case "pages": {
      const at = site.pages.findIndex((page) => page.state === "writing");
      const page = site.pages[at];
      if (!page) return `Writing ${name}'s pages…`;
      const writing = page.writing;
      const where = `“${page.title}”, page ${at + 1} of ${site.pages.length}`;
      if (writing?.phase === "pictures") return `Making the pictures for ${where}: ${writing.pictures.filter((one) => one.state === "placed").length} of ${writing.pictures.length} in.`;
      return writing && writing.phase !== "asking" ? `Writing ${where}: ${count(writing.sections.filter((section) => section.kept).length)} so far.` : `Asking for ${where}…`;
    }
    case "done": {
      const kept = (["header", "footer"] as const).filter((kind) => site.frame[kind] === "new" || site.frame[kind] === "stale");
      const back = (["header", "footer"] as const).filter((kind) => site.frame[kind] === "back");
      const one = (kinds: readonly string[], single: string, many: string) => (kinds.length === 1 ? single : many);
      return `${name}: ${madeWords(site)}.`
        + (kept.length > 0 ? ` The ${and(kept)} it replaced ${one(kept, "is kept in its", "are kept in their")} versions, as “${BEFORE_NEW_SITE}”.` : "")
        + (back.length > 0 ? ` The ${and(back)} ${one(back, "is back as it was", "are back as they were")}: no page was made.` : "");
    }
    case "stopped":
      return `${site.error ? `${site.error} ` : "Stopped. "}What was made stays: ${madeWords(site)}.`;
    case "failed":
      return `${site.error ?? "The site was not written."}${site.steps.style === "done" ? ` What was made stays: ${madeWords(site)}.` : ""}`;
  }
}

// Where a new site's header or footer stands, beside its step: a draft;
// put back as it was; or one to check, which may lead to a page not made.
function partWords(site: ShownSite, kind: "header" | "footer"): string {
  if (site.frame[kind] === "back") return "put back";
  if (site.frame[kind] === "stale") return "to check";
  return site.steps[kind] === "done" ? "draft" : "";
}

// Where a page of the site stands, beside its title: written goes without
// saying beside its sections, but to a screen reader; a page whose last
// changes were not saved says so.
function pageState(page: SitePage) {
  if (page.state === "done" && page.writing?.unsaved !== undefined) return <span className="as-picture-state as-unsaved"><span className="visually-hidden">, </span>last changes not saved</span>;
  if (page.state === "done") return <span className="visually-hidden">, {PAGE_WORDS.done}</span>;
  return <span className="as-picture-state"><span className="visually-hidden">, </span>{PAGE_WORDS[page.state]}</span>;
}

// A new site's steps, grouped: the site's own first (direction, style,
// header, footer), then each page with its sections and pictures.
export function SiteSteps({ site }: { site: ShownSite }) {
  const direction = site.direction;
  const step = (name: string, state: SiteStep, said: string) => (
    <li className={`as-step as-step-${state}`}>
      {state === "doing" ? <Icon name="spinner" className="i spin" /> : <Icon name={STEP_ICONS[state]} />}
      <span>{name}</span>
      <span className="as-picture-state"><span className="visually-hidden">, </span>{said || STEP_WORDS[state]}</span>
    </li>
  );
  return (
    <ol className="as-groups">
      <li className="as-group">
        <h4 className="as-group-title">The site{direction ? <span className="as-group-path">{direction.name}</span> : null}</h4>
        <ol className="as-sections">
          {step("Direction", site.steps.direction, site.steps.direction === "done" && direction ? plural(direction.pages.length, "page", "pages") : "")}
          <li className={`as-step as-step-${site.steps.style}`}>
            {site.steps.style === "doing" ? <Icon name="spinner" className="i spin" /> : <Icon name={STEP_ICONS[site.steps.style]} />}
            <span>Style</span>
            {direction && site.steps.style === "done" && (
              <span className="as-swatches" role="img" aria-label={`The new palette: ${PALETTE_SLOTS.map((slot) => `${slotLabel(slot)} ${direction.palette[slot]?.hex ?? ""}`).join(", ")}`}>
                {PALETTE_SLOTS.map((slot) => <span key={slot} className="as-swatch" style={{ "--c": direction.palette[slot]?.hex } as CSSProperties} />)}
              </span>
            )}
            <span className="as-picture-state"><span className="visually-hidden">, </span>{site.steps.style === "done" ? "applied" : STEP_WORDS[site.steps.style]}</span>
          </li>
          {step("Header", site.steps.header, partWords(site, "header"))}
          {step("Footer", site.steps.footer, partWords(site, "footer"))}
        </ol>
      </li>
      {site.pages.map((page) => (
        <li key={page.path} className={`as-group as-page as-page-${page.state}`}>
          <h4 className="as-group-title">
            {page.title}<span className="as-group-path">{page.path}</span>
            {pageState(page)}
          </h4>
          {page.writing && page.writing.sections.length > 0 && <ol className="as-sections"><SectionSteps writing={page.writing} /></ol>}
        </li>
      ))}
    </ol>
  );
}
