// The Assistant's run window (../assistant/README.md, "The run window"),
// over the editor, which stays on the page the person had open and waits,
// inert, while the Assistant writes aside (./assistant-aside.ts). It opens
// as a run begins: Write the page, Write the new site (once asked twice),
// Build the sample page. In it, everything the drawer says of the run
// (./assistant-steps.tsx), and more of it:
//
// - its phase as its title, its status line (the one live region: the
//   drawer's copy behind it says nothing meanwhile), and a bar of how far
//   it has come: a new site's own four steps and its pages, a page's
//   sections and pictures once its plan has said how many;
// - the cost, large: what the run has cost so far, growing as the model
//   writes (../assistant/live.ts), its tokens in and out, each model at its
//   list price and the day the prices were read, the photos being made at
//   their price per image, the requests whose cost is not known; once it
//   is over, what it cost in all, the drawer's own words for it;
// - the steps, as the drawer lists them;
// - a preview of the page being written, drawn by the site's renderer at a
//   desktop's width and made smaller to fit, following the newest section
//   as it lands, unless the person scrolls it.
//
// Closing it while the run goes (its close key, Esc, the scrim) or its Stop
// key asks first, over it: Keep writing, the safe answer, with the focus,
// or Stop. Stop from its close stops the run and closes it; from its Stop
// key, it stops the run and stays, to show what stays and what it cost.
// Once the run is over it stays open, saying how it ended: Done closes it;
// Open the page, or the home page of a new site, opens it in the editor and
// closes it. Closing it then asks nothing. On a phone's window it fills the
// window, Progress and Preview a switch apart.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { runCost, useAssistant, useAssistantStore, type ShownSite, type ShownWriting, type WrittenPage } from "../assistant/context.tsx";
import { LIVE_NOTE, meterWords, SAMPLE_SPENDS } from "../assistant/live.ts";
import { liveDollars, PRICES_DAY } from "../assistant/prices.ts";
import { ESTIMATE_NOTE } from "../assistant/tally.ts";
import { OwnClassPrefix } from "../render/context.ts";
import { PageRoot } from "../render/page.tsx";
import { CANVAS_CLASS_PREFIX } from "../shared/custom-css.ts";
import { going, Notes, PageCost, pageLine, pageTitle, SectionSteps, siteGoing, siteLine, siteNotes, SiteCost, SiteSteps, siteTitle } from "./assistant-steps.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Dialog } from "./dialog.tsx";
import { Icon } from "./icons.tsx";
import { useLayoutMode } from "./layout-mode.ts";
import { useSession } from "./session.tsx";
import { useSiteRender } from "./site-render.ts";
import "./assistant.css";

// The width the preview draws a page at, a desktop's, before it is made
// smaller to fit its box.
export const PREVIEW_WIDTH = 1280;
// The keys that scroll the preview, once it has the focus.
const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

export function AssistantRun() {
  const open = useAssistant((a) => a.runWindow);
  const shown = useAssistant((a) => a.writing !== null || a.site !== null);
  return open && shown ? <RunWindow /> : null;
}

type Asked = "close" | "stop";

// How far a run has come, for its bar: a new site's own four steps and its
// pages, once its direction has named them; a page's sections and
// pictures, once its plan has said how many sections (its answer ended).
// Null while that is not known.
export function progressOf(writing: ShownWriting | null, site: ShownSite | null): { value: number; max: number; words: string } | null {
  const over = (state: string) => state === "done" || state === "failed" || state === "stopped";
  if (site !== null) {
    if (site.direction === null || site.pages.length === 0) return null;
    const steps = Object.values(site.steps).filter(over).length;
    const pages = site.pages.filter((page) => over(page.state)).length;
    const max = 4 + site.pages.length;
    return { value: steps + pages, max, words: `${steps + pages} of ${max} steps: the site's own 4, then its ${site.pages.length} ${site.pages.length === 1 ? "page" : "pages"}` };
  }
  if (writing === null || writing.phase === "asking" || writing.phase === "writing") return null;
  const placed = writing.pictures.filter((one) => over(one.state) || one.state === "placed").length;
  const max = Math.max(1, writing.sections.length + writing.pictures.length);
  const value = writing.phase === "done" ? max : writing.sections.length + placed;
  return { value, max, words: writing.pictures.length === 0 ? `${writing.sections.length} of ${writing.sections.length} sections` : `${writing.sections.length} sections, and ${placed} of ${writing.pictures.length} pictures` };
}

function RunWindow() {
  const assistant = useAssistantStore();
  const session = useSession();
  const { ui } = useEnv();
  const writing = useAssistant((a) => a.writing);
  const site = useAssistant((a) => a.site);
  const pages = useAssistant((a) => a.written);
  const layout = useLayoutMode();
  const id = useId();
  const [asked, setAsked] = useState<Asked | null>(null);
  const [stopping, setStopping] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"progress" | "preview">("progress");
  const endKey = useRef<HTMLButtonElement>(null);
  const moving = site !== null ? siteGoing(site) : writing !== null && going(writing);
  const narrow = layout === "narrow";

  const close = useCallback(() => assistant.getState().setRunWindow(false), [assistant]);
  // Closed once its question has gone, and taken the focus back with it.
  useEffect(() => {
    if (closing && asked === null) close();
  }, [closing, asked, close]);
  // A run that ends while its question is open asks nothing more.
  const question = moving ? asked : null;
  // Once it is over, the focus goes to the key that opens what was made (or
  // Done), from where the window put it as it opened or from its Stop key,
  // which goes: not from anywhere the person took it since.
  useEffect(() => {
    if (moving) return;
    const where = document.activeElement;
    if (where === null || where === document.body || !where.isConnected || where.closest(".dlg-run .dlg-head") !== null) endKey.current?.focus();
  }, [moving]);

  // Asked first while the run goes, unless it is stopping already.
  const ask = (from: Asked) => {
    if (moving && !stopping) setAsked(from);
    else if (from === "close") close();
  };
  const stop = () => {
    assistant.getState().stop();
    setStopping(true);
    if (asked === "close") setClosing(true);
    setAsked(null);
  };

  // What the end's key opens: the page written; a new site's home page, or
  // else the first page it made. None when nothing was made.
  const made = site !== null
    ? (site.pages[0]?.id ?? site.pages.find((page) => page.id !== null)?.id ?? null)
    : writing?.title ? (pages[0]?.id ?? null) : null;
  const openMade = () => {
    if (made === null) return;
    close();
    void session.openPage(made).then((why) => {
      if (why) ui.getState().say(why);
    });
  };

  const title = site !== null ? siteTitle(site) : pageTitle(writing!);
  const failed = site !== null ? site.phase === "failed" : writing?.phase === "failed";
  const line = site !== null ? siteLine(site) : pageLine(writing!);
  const progress = moving || (site ?? writing)?.phase === "done" ? progressOf(writing, site) : null;
  const sample = writing?.sample === true;

  const footer = moving
    ? <button className="btn btn-secondary" type="button" aria-disabled={stopping ? true : undefined} onClick={() => !stopping && ask("stop")}>{stopping ? "Stopping…" : "Stop"}</button>
    : made === null
      ? <button ref={endKey} className="btn btn-dark" type="button" onClick={close}>Done</button>
      : (
        <>
          <button className="btn btn-secondary" type="button" onClick={close}>Done</button>
          <button ref={endKey} className="btn btn-dark" type="button" onClick={openMade}>{site !== null ? "Open the home page" : "Open the page"}</button>
        </>
      );

  return (
    <>
      <Dialog title={title} className="dlg-run" bodyClassName="ar-body" onClose={() => ask("close")} footer={footer}>
        {narrow && (
          <div className="seg seg-fill ar-switch" role="radiogroup" aria-label="Show">
            <button type="button" role="radio" aria-checked={view === "progress"} onClick={() => setView("progress")}>Progress</button>
            <button type="button" role="radio" aria-checked={view === "preview"} onClick={() => setView("preview")}>Preview</button>
          </div>
        )}
        <div className="ar-side" aria-busy={moving ? true : undefined} hidden={narrow && view !== "progress"}>
          <p className={failed ? "error as-line ar-line" : "as-line ar-line"} role="status">
            {moving && <Icon name="spinner" className="i spin" />}{failed && <Icon name="error" />}<span>{line}</span>
          </p>
          {(moving || progress !== null) && <Progress of={progress} id={`${id}-progress`} />}
          <Meter writing={writing} site={site} moving={moving} sample={sample} />
          <section className="ar-steps" aria-labelledby={`${id}-steps`}>
            <h3 className="group-title" id={`${id}-steps`}>Steps</h3>
            {site !== null
              ? <SiteSteps site={site} />
              : writing !== null && writing.sections.length > 0
                ? <ol className="as-sections"><SectionSteps writing={writing} /></ol>
                : <p className="hint ar-none">{moving ? "Each section is listed here as it lands." : "No section was written."}</p>}
            {!moving && <Notes notes={site !== null ? siteNotes(site) : writing?.notes ?? []} site={site !== null} />}
          </section>
        </div>
        <RunPreview moving={moving} site={site} hidden={narrow && view !== "preview"} />
      </Dialog>
      {question !== null && (
        <Dialog
          title="Stop the Assistant?"
          role="alertdialog"
          describedBy={`${id}-stays`}
          onClose={() => setAsked(null)}
          footer={(
            <>
              <button className="btn btn-secondary" type="button" data-autofocus onClick={() => setAsked(null)}>Keep writing</button>
              <button className="btn btn-dark" type="button" onClick={stop}>Stop</button>
            </>
          )}
        >
          <p className="ar-stays" id={`${id}-stays`}>
            {site !== null
              ? `What was made stays, as drafts.${site.steps.style === "done" ? " The new site's style stays: Put the old style back, in the Assistant's drawer, returns the old one." : ""} Nothing else is written.`
              : "What was made stays, as the page's draft. Nothing else is written."}
            {question === "close" ? " The window closes." : ""}
          </p>
        </Dialog>
      )}
    </>
  );
}

// The bar of how far the run has come; moving, with no measure yet, it
// says so by moving, unless the person asked for less motion.
function Progress({ of, id }: { of: { value: number; max: number; words: string } | null; id: string }) {
  return (
    <div
      className={`ar-progress${of === null ? " ar-progress-unknown" : ""}`}
      role="progressbar"
      aria-labelledby={id}
      aria-valuemin={of === null ? undefined : 0}
      aria-valuemax={of === null ? undefined : of.max}
      aria-valuenow={of === null ? undefined : of.value}
      aria-valuetext={of?.words}
    >
      <span id={id} className="visually-hidden">How far it has come</span>
      <span className="ar-progress-fill" style={of === null ? undefined : { width: `${Math.round((of.value / of.max) * 1000) / 10}%` }} />
    </div>
  );
}

// What the run costs, large: so far while it goes, in all once it is over.
// The sample asks no model: nothing, exactly.
function Meter({ writing, site, moving, sample }: { writing: ShownWriting | null; site: ShownSite | null; moving: boolean; sample: boolean }) {
  const cost = useAssistant(runCost);
  const id = useId();
  const words = cost === null ? null : meterWords(cost);
  const amount = sample ? liveDollars(0) : words?.amount ?? null;
  return (
    <section className="ar-meter" aria-labelledby={`${id}-title`}>
      <h3 className="group-title" id={`${id}-title`}>Cost</h3>
      {amount !== null ? (
        <p className="ar-amount"><span className="ar-dollars">{sample ? amount : `≈ ${amount}`}</span> <span className="ar-when">{moving ? "so far" : "in all"}</span></p>
      ) : words !== null ? (
        <p className="ar-amount ar-amount-none">No list price on file</p>
      ) : null}
      {sample && moving && <p className="hint">{SAMPLE_SPENDS}</p>}
      {words !== null && moving && (
        <>
          <dl className="ar-tokens">
            <div><dt>Tokens in</dt><dd>{words.tokensIn}{words.cached && <span className="ar-cached">, {words.cached}</span>}</dd></div>
            <div><dt>Tokens out</dt><dd>{words.tokensOut}</dd></div>
          </dl>
          {words.prices.map((price) => <p key={price} className="hint ar-price">{price}</p>)}
          {words.photos && <p className="hint ar-photos">{words.photos}</p>}
          {words.unpriced && <p className="hint">{words.unpriced}</p>}
          {words.uncounted && <p className="hint">{words.uncounted}</p>}
          <p className="hint ar-note">Prices of {PRICES_DAY} · {LIVE_NOTE}</p>
        </>
      )}
      {!moving && (
        <div className="ar-breakdown">
          {site !== null ? <SiteCost site={site} /> : writing !== null && <PageCost writing={writing} />}
          {words?.uncounted && <p className="hint">{words.uncounted}</p>}
          {!sample && words !== null && <p className="hint ar-note">{ESTIMATE_NOTE}</p>}
        </div>
      )}
    </section>
  );
}

// The page being written, or once the run is over the one chosen (a new
// site's home page first), drawn by the site's renderer with the site's
// style and its header and footer (a new site's own, once saved), at a
// desktop's width, made smaller to fit the box; not to be edited. While the
// run goes it follows the newest section as it lands, unless the person
// scrolls it; beside it, in words, what it shows.
function RunPreview({ moving, site, hidden }: { moving: boolean; site: ShownSite | null; hidden: boolean }) {
  const pages = useAssistant((a) => a.written);
  const siteStyle = useUi((u) => u.siteStyle);
  const parts = useUi((u) => u.parts);
  const ctx = useSiteRender();
  const id = useId();
  const [chosen, setChosen] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);
  const following = useRef(true);

  const home = site?.pages[0]?.id ?? null;
  const resting = (chosen !== null && pages.some((one) => one.id === chosen) ? chosen : null) ?? (home !== null && pages.some((one) => one.id === home) ? home : (pages[0]?.id ?? null));
  const page: WrittenPage | null = (moving ? pages.at(-1) : pages.find((one) => one.id === resting)) ?? null;
  const sections = page?.document.sections.length ?? 0;
  const says = page === null ? null : `Preview of “${page.title}”, ${sections} ${sections === 1 ? "section" : "sections"}`;

  // Made smaller to the box's width, the box as tall as the page drawn so.
  const drawn = page !== null;
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = drawing.current;
    if (!drawn || !outer || !inner) return undefined;
    const measure = () => {
      setScale(outer.clientWidth / PREVIEW_WIDTH);
      setHeight(inner.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [drawn]);

  // Another page shown, or the run over: from its top, followed again.
  const shownId = page?.id ?? null;
  useEffect(() => {
    following.current = true;
    box.current?.scrollTo?.({ top: 0 });
  }, [shownId, moving]);

  // The newest section, brought into view as it lands, while the person
  // has not scrolled away: the whole of it where the box holds it, else its
  // top; at once where they asked for less motion.
  useEffect(() => {
    const outer = box.current;
    const last = drawing.current?.querySelector<HTMLElement>(".sw-main > [data-block-type='section']:last-child");
    if (!moving || !following.current || !outer || !last) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const room = outer.getBoundingClientRect();
    const at = last.getBoundingClientRect();
    const top = outer.scrollTop + at.top - room.top;
    const target = at.height + 24 <= room.height ? top + at.height - room.height + 12 : top - 12;
    if (target > outer.scrollTop) outer.scrollTo?.({ top: target, behavior: reduce ? "auto" : "smooth" });
    // Once more as the page drawn grows: the box's room comes a moment after the section.
  }, [moving, sections, shownId, height]);

  const scrolled = () => {
    following.current = false;
  };
  const scrolledByKey = (event: { key: string }) => {
    if (SCROLL_KEYS.has(event.key)) scrolled();
  };
  const onScroll = () => {
    const outer = box.current;
    if (outer && outer.scrollTop + outer.clientHeight >= outer.scrollHeight - 24) following.current = true;
  };

  return (
    <div className="ar-preview" hidden={hidden}>
      <div className="ar-preview-head">
        <p className="ar-preview-says" id={`${id}-says`}>
          <Icon name="eye" />
          <span>{says ?? (site !== null ? "Preview of the new site's pages" : "Preview of the new page")}</span>
        </p>
        {!moving && pages.length > 1 && (
          <div className="seg ar-pages" role="radiogroup" aria-label="Page shown">
            {pages.map((one) => (
              <button key={one.id} type="button" role="radio" aria-checked={one.id === resting} onClick={() => setChosen(one.id)}>{one.title}</button>
            ))}
          </div>
        )}
      </div>
      {page === null ? (
        <div className="ar-preview-box ar-preview-empty">
          <p>{site !== null ? "Each page shows here as it is written." : "The page shows here as it is written."}</p>
        </div>
      ) : (
        <div
          ref={box}
          className="ar-preview-box"
          role="region"
          aria-labelledby={`${id}-says`}
          tabIndex={0}
          onWheel={scrolled}
          onTouchMove={scrolled}
          onKeyDown={scrolledByKey}
          onPointerDown={scrolled}
          onScroll={onScroll}
        >
          <div className="ar-preview-fit" style={{ height: height * scale }}>
            <div ref={drawing} className="ar-preview-page" style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})` }} inert aria-hidden="true">
              <OwnClassPrefix.Provider value={CANVAS_CLASS_PREFIX}>
                <PageRoot document={page.document} ctx={ctx} siteStyle={siteStyle} landmark={false} parts={parts} width={PREVIEW_WIDTH} />
              </OwnClassPrefix.Provider>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
