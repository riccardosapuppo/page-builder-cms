// The Assistant's drawer (../assistant/README.md): a key of the person's
// own, then a brief, then a new page written section by section, or a new
// site. Without a key, a sample written by hand goes through the same
// steps. Which provider, what each one does, what is kept of the key and
// where it goes are said where the key is asked for. Before writing, a
// switch makes pictures: photos with an OpenAI key, at the quality chosen,
// its price per photo said beside it; illustrations with an Anthropic key.
//
// A run (a page, a new site, the sample) opens the run window
// (./AssistantRun.tsx) over the editor, which stays on the page the person
// has open: the Assistant writes aside (./assistant-aside.ts), never into
// it, and the window shows the page growing in a preview. The drawer says
// the same of the run behind it, with no live region of its own while the
// window speaks: its status line, what it has cost so far under it, a live
// estimate made exact as each request ends (../assistant/live.ts), its
// steps (./assistant-steps.tsx), each picture's progress and its cost once
// it is made. After a page, the tokens it used and what they come to at
// the model's list price are said (../assistant/tally.ts), a line for each
// kind of picture, then the whole; the drawer's foot keeps the total since
// the key was connected, and says it is an estimate. The page arrives whole,
// as its draft: no section of it is a step in the History of the page open.
//
// Two choices: a page for this site, or a new site (../assistant/site.ts),
// said plainly before anything is asked: a new style, header and footer,
// three or four pages added, the pages already there kept. Its Write asks
// twice, and beside it is said what its pictures may cost at most, the
// site's budget, and that its words cost a few cents with most models,
// said exactly after. Its steps are grouped by page, the site's own first
// (direction, style, header, footer), its cost so far growing under its
// status line as a page's does, then the final one; then what becomes of
// it, each asked: the home page made the site's, everything published, the
// old style put back, and in the browser demo Start over with the example
// site.
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { runCost, useAssistant, useAssistantStore, type AssistantStore, type ShownSite, type ShownWriting, type SiteOutcome } from "../assistant/context.tsx";
import { PROVIDER_NAMES, PROVIDERS, type ProviderId } from "../assistant/key.ts";
import { liveWords, SAMPLE_SPENDS } from "../assistant/live.ts";
import { illustrationMaker, photoMaker } from "../assistant/makers.ts";
import { PICTURE_KINDS, type PictureKind } from "../assistant/pictures.ts";
import { PLAN_MADE_MOST } from "../assistant/plan.ts";
import { dollars, IMAGE_QUALITIES, imagePrice, PRICES_DAY, type ImageQuality } from "../assistant/prices.ts";
import { directionQuestion, pageQuestion, type PageDirection, type SiteWords } from "../assistant/prompts.ts";
import { sampleAnswer, samplePlan, SAMPLE_BRIEF } from "../assistant/sample.ts";
import { SITE_PICTURES_MOST, writeSite, type SitePage, type SitePagePlan } from "../assistant/site.ts";
import { ESTIMATE_NOTE, totalWords } from "../assistant/tally.ts";
import { writePage } from "../assistant/write.ts";
import type { SiteFacts } from "../assistant/build.ts";
import { PALETTE_SLOTS, type PaletteSlot } from "../shared/document.ts";
import { isFreeColor } from "../shared/free-colors.ts";
import { slotTone } from "../shared/site-tokens.ts";
import type { MediaItem, SiteStyle } from "../storage/adapter.ts";
import { afterRender } from "./act.ts";
import { asideHooks, asideSiteHooks, type AsideOptions } from "./assistant-aside.ts";
import { and, going, Notes, PageCost, pageLine, pageTitle, plural, SectionSteps, shownTally, siteGoing, siteLine, siteNotes, SiteCost, SiteSteps, siteTallies, siteTitle } from "./assistant-steps.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { useMediaService } from "./library/context.tsx";
import { useSession, type Session } from "./session.tsx";
import "./assistant.css";

const KEY_PAGES: Readonly<Record<ProviderId, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

// What each provider does here, said where the person chooses one.
export const PROVIDER_DOES: Readonly<Record<ProviderId, string>> = {
  anthropic: "Writes pages, and draws illustrations for them in the site's colours, as its models make no photos.",
  openai: "Writes pages, and makes photos for them, each at a cost shown before you write.",
};

// What a new site does, said before anything is asked.
export const NEW_SITE_DOES = [
  "gives the site a new style, a new header and a new footer;",
  "adds 3 to 4 pages;",
  "keeps the pages already there.",
] as const;

const QUALITY_NAMES: Readonly<Record<ImageQuality, string>> = { low: "Low", medium: "Medium", high: "High" };

// The palette's tones as hex, for the question: a free colour as it is, a
// curated tone by its name.
function paletteHex(style: SiteStyle | null): Record<PaletteSlot, string> {
  return Object.fromEntries(PALETTE_SLOTS.map((slot) => {
    const tone = style?.palette[slot];
    const hex = tone === undefined ? "the site's own" : isFreeColor(tone) ? tone : style?.choices.palette[slot]?.find((choice) => choice.color === tone)?.hex ?? tone;
    return [slot, hex];
  })) as Record<PaletteSlot, string>;
}

// The palette's colours, each as hex, the theme's own where the site's
// style has none: an illustration is drawn in them.
const paletteTones = (style: SiteStyle | null): Record<PaletteSlot, string> =>
  Object.fromEntries(PALETTE_SLOTS.map((slot) => [slot, slotTone(slot, style?.palette).hex])) as Record<PaletteSlot, string>;

const pathOf = (page: { home: boolean; slug: string | null }): string => (page.home ? "/" : `/${page.slug ?? ""}`);

// What the site has that a plan may name: its library, each image with its
// size, and its pages; and the colours words take over a veiled picture.
function siteFacts(session: Session, media: ReadonlyMap<string, MediaItem>, brief: string, style: SiteStyle | null): SiteFacts & { media: SiteWords["media"]; pages: Array<{ path: string; title: string }> } {
  const pages = session.pages.filter((page) => page.kind === "page").map((page) => ({ path: pathOf(page), title: page.title }));
  return {
    media: [...media.values()].map(({ id, alt, width, height }) => ({ id, alt, width, height })),
    paths: pages.map((page) => page.path),
    pages,
    brief,
    ink: { text: slotTone("text", style?.palette).hex, background: slotTone("background", style?.palette).hex },
  };
}

// What the pages of a run are written with here: aside, with the editor's
// clock, each shown to the run window's preview as it grows.
function aside(assistant: AssistantStore, session: Session, clock: AsideOptions["clock"], library: AsideOptions["library"]): AsideOptions {
  return { session, clock, library, show: (page) => assistant.getState().showPage(page) };
}

// One run of the writer, its state shown in the drawer and in the run
// window, which opens as it begins: a page's, which takes the place of a
// site's summary.
async function run(assistant: AssistantStore, start: (signal: AbortSignal, tell: (writing: ShownWriting) => void) => Promise<unknown>, shown: Partial<ShownWriting>) {
  const signal = assistant.getState().begin();
  assistant.getState().setSite(null);
  // The run before it shows nowhere, not even for a moment.
  assistant.getState().setWriting(null);
  assistant.getState().setRunWindow(true);
  try {
    await start(signal, (writing) => assistant.getState().setWriting({ ...writing, ...shown }));
  } finally {
    assistant.getState().end();
  }
}

// A new site's run, the same way, in place of a page's summary.
async function runSite(assistant: AssistantStore, start: (signal: AbortSignal, tell: (site: ShownSite) => void) => Promise<unknown>, shown: Partial<ShownSite>) {
  const signal = assistant.getState().begin();
  assistant.getState().setWriting(null);
  assistant.getState().setSite(null);
  assistant.getState().setRunWindow(true);
  try {
    await start(signal, (site) => assistant.getState().setSite({ ...site, ...shown }));
  } finally {
    assistant.getState().end();
  }
}

export function AssistantPanel() {
  const held = useAssistant((a) => a.held);
  const writing = useAssistant((a) => a.writing);
  const site = useAssistant((a) => a.site);
  // While the run window is open, its status line is the one that speaks.
  const quiet = useAssistant((a) => a.runWindow);
  return (
    <>
      <div className="drawer-body as-body">
        {site && <SiteProgress site={site} quiet={quiet} />}
        {writing && <Progress writing={writing} quiet={quiet} />}
        {held === null ? <Connect /> : <Brief />}
      </div>
      <Total />
    </>
  );
}

// The drawer's foot: the total since the key was connected, while it is
// kept, and, under it, what every estimate here leaves out.
function Total() {
  const held = useAssistant((a) => a.held);
  const spent = useAssistant((a) => a.spent);
  const writing = useAssistant((a) => a.writing);
  const site = useAssistant((a) => a.site);
  const total = held !== null && spent.length > 0;
  const siteSaid = site !== null && (siteTallies(site).words.length > 0 || siteTallies(site).pictures.length > 0);
  if (!total && shownTally(writing) === null && !siteSaid) return null;
  return (
    <div className="drawer-foot as-foot">
      {total && <p className="as-total">{totalWords(spent)}</p>}
      <p>{ESTIMATE_NOTE}</p>
    </div>
  );
}

function Connect() {
  const assistant = useAssistantStore();
  const connecting = useAssistant((a) => a.connecting);
  const problem = useAssistant((a) => a.problem);
  const forgotten = useAssistant((a) => a.forgotten);
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [key, setKey] = useState("");
  const id = useId();
  const name = PROVIDER_NAMES[provider];
  const connect = async () => {
    if (connecting) return;
    // The field lets go of the key once it is kept: from then on it lives in the keeper only.
    if (await assistant.getState().connect(provider, key)) setKey("");
  };
  return (
    <>
      <p className="as-lead">Write a whole page from a few lines, with a model of your own. Bring a key for it.</p>
      {forgotten !== null && forgotten !== "asked" && (
        <p className="hint as-forgotten" role="status">{forgotten === "idle" ? "Your key was forgotten after 30 minutes without use." : "Your key was forgotten when the page was left."} Paste it again to go on.</p>
      )}
      <div className="field as-first">
        <span className="label" id={`${id}-provider`}>Provider</span>
        <div className="seg seg-fill" role="radiogroup" aria-labelledby={`${id}-provider`} aria-describedby={`${id}-compare`}>
          {PROVIDERS.map((which) => (
            <button key={which} type="button" role="radio" aria-checked={provider === which} onClick={() => setProvider(which)}>{PROVIDER_NAMES[which]}</button>
          ))}
        </div>
        {/* What each one does, side by side, the one chosen marked. */}
        <dl className="as-compare" id={`${id}-compare`}>
          {PROVIDERS.map((which) => (
            <div key={which} className={which === provider ? "as-compare-on" : undefined}>
              <dt>{PROVIDER_NAMES[which]}</dt>
              <dd>{PROVIDER_DOES[which]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={`field${problem ? " field-error" : ""}`}>
        <label className="label" htmlFor={`${id}-key`}>Your {name} key</label>
        <input
          id={`${id}-key`}
          className="input as-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-autofocus=""
          aria-describedby={`${id}-kept${problem ? ` ${id}-problem` : ""}`}
          aria-invalid={problem ? true : undefined}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void connect();
          }}
        />
        {problem && <p className="error" id={`${id}-problem`}><Icon name="error" />{problem}</p>}
        <p className="hint" id={`${id}-kept`}>
          Kept only in this tab's memory: never saved, never sent to this site. It goes from your browser to {name} alone, and is forgotten when the tab is reloaded or closed, or after 30 minutes unused.
        </p>
        <p className="hint"><a className="as-out" href={KEY_PAGES[provider]} target="_blank" rel="noopener noreferrer">Get a key from {name}<Icon name="external" /></a></p>
      </div>
      <button className="btn btn-dark btn-block as-go" type="button" aria-disabled={connecting ? true : undefined} onClick={() => void connect()}>
        {connecting ? "Checking the key…" : `Connect ${name}`}
      </button>
      <Sample />
    </>
  );
}

function Sample() {
  const env = useEnv();
  const session = useSession();
  const assistant = useAssistantStore();
  const media = useUi((u) => u.media);
  const style = useUi((u) => u.siteStyle);
  const busy = useAssistant((a) => a.running !== null);
  const build = () => {
    if (busy) return;
    const facts = siteFacts(session, media, SAMPLE_BRIEF, style);
    void run(assistant, (signal, tell) => writePage({
      ask: sampleAnswer(samplePlan(facts.media), env.clock, signal),
      facts, newId: env.newId, hooks: asideHooks(aside(assistant, session, env.clock, null)), tell, signal,
    }), { sample: true });
  };
  return (
    <section className="as-sample" aria-labelledby="as_sample_title">
      <h3 className="group-title" id="as_sample_title">No key at hand?</h3>
      <p className="hint">Watch a sample: a plan written by hand for an open day at the swimming club goes through the same steps a model's plan takes, and the page builds itself as a new draft.</p>
      <button className="btn btn-small btn-secondary" type="button" aria-disabled={busy ? true : undefined} onClick={build}>Build the sample page</button>
    </section>
  );
}

// The dearest of a photo's three sizes at a quality, as the guide prices
// them, or null where it gives no price per image.
function dearest(model: string, quality: ImageQuality): number | null {
  const prices = (["1536x1024", "1024x1536", "1024x1024"] as const).map((size) => imagePrice(model, quality, size));
  return prices.some((price) => price === null) ? null : Math.max(...(prices as number[]));
}

// A photo's price before it is made, at the quality chosen: the guide's
// price per image where it gives one, else that its cost is said after.
function photoPriceWords(model: string, quality: ImageQuality): string {
  const landscape = imagePrice(model, quality, "1536x1024");
  const portrait = imagePrice(model, quality, "1024x1536");
  const square = imagePrice(model, quality, "1024x1024");
  if (landscape === null || portrait === null || square === null) {
    return `${model} has no published price per image: each photo's cost is said once it is made, from the tokens it used.`;
  }
  const each = landscape === portrait
    ? `${dollars(landscape)} a photo, landscape or portrait, ${dollars(square)} a square one`
    : `${dollars(landscape)} a landscape photo, ${dollars(portrait)} a portrait one, ${dollars(square)} a square one`;
  return `${each}, at ${model}'s price per image of ${PRICES_DAY}. Up to ${PLAN_MADE_MOST} on a page: ${dollars(Math.max(landscape, portrait, square) * PLAN_MADE_MOST)} at most.`;
}

// What a new site's pictures may cost at most, before it is written: the
// site's budget at the dearest price per photo, or, for illustrations, that
// each is a request of its own, priced by its tokens.
export function sitePicturesWords(kind: PictureKind, model: string, quality: ImageQuality | null): string {
  if (kind === "illustration") return `Pictures: up to ${SITE_PICTURES_MOST} illustrations for the whole site, each a request of its own to ${model}, priced by its tokens like the words.`;
  const price = quality === null ? null : dearest(model, quality);
  if (price === null || quality === null) return `Pictures: up to ${SITE_PICTURES_MOST} photos for the whole site. ${model} has no published price per image: each photo's cost is said once it is made.`;
  return `Pictures: up to ${SITE_PICTURES_MOST} photos for the whole site, ${dollars(price * SITE_PICTURES_MOST)} at most at ${QUALITY_NAMES[quality].toLowerCase()} quality (${model}'s price per image of ${PRICES_DAY}, ${dollars(price)} at most a photo).`;
}

export const SITE_WORDS_COST = "The words, the direction and each page, cost a few cents with most models: their exact cost is said once the site is written, from the tokens the provider counts.";

// A question asked before something that changes much, as Delete is asked
// in the library: the safe answer first, with the focus, and Esc is it.
function Ask({ label, question, yes, no = "Cancel", onYes, onNo }: { label: string; question: string; yes: string; no?: string; onYes: () => void; onNo: () => void }) {
  const safe = useRef<HTMLButtonElement>(null);
  useEffect(() => safe.current?.focus(), []);
  return (
    <div className="as-ask" role="group" aria-label={label} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onNo();
    }}>
      <p>{question}</p>
      <div className="as-ask-buttons">
        <button ref={safe} className="btn btn-small btn-secondary" type="button" onClick={onNo}>{no}</button>
        <button className="btn btn-small btn-dark" type="button" onClick={onYes}>{yes}</button>
      </div>
    </div>
  );
}

// The focus back on a key once the question it asked is answered no
// (`no` marks it so): answered yes, the focus goes where what was asked
// for is said.
function useBackFrom(asking: boolean): [RefObject<HTMLButtonElement | null>, () => void] {
  const key = useRef<HTMLButtonElement>(null);
  const answeredNo = useRef(false);
  useEffect(() => {
    if (!asking && answeredNo.current) key.current?.focus();
    answeredNo.current = false;
  }, [asking]);
  const no = useCallback(() => {
    answeredNo.current = true;
  }, []);
  return [key, no];
}

function Brief() {
  const env = useEnv();
  const session = useSession();
  const assistant = useAssistantStore();
  const library = useMediaService();
  const held = useAssistant((a) => a.held)!;
  const models = useAssistant((a) => a.models);
  const model = useAssistant((a) => a.model);
  const imageModel = useAssistant((a) => a.imageModel);
  const busy = useAssistant((a) => a.running !== null);
  const media = useUi((u) => u.media);
  const style = useUi((u) => u.siteStyle);
  const [brief, setBrief] = useState("");
  const [missing, setMissing] = useState(false);
  const [wanted, setWanted] = useState(true);
  const [quality, setQuality] = useState<ImageQuality>("medium");
  const [what, setWhat] = useState<"page" | "site">("page");
  const [asking, setAsking] = useState(false);
  const [writeKey, answeredNo] = useBackFrom(asking);
  const id = useId();
  const kind = PICTURE_KINDS[held.provider];
  const name = models.find((choice) => choice.id === model)?.name ?? model ?? "the model";
  const site = what === "site";
  // Pictures can be made where there is a library to keep them and, for
  // photos, an image model the key may use.
  const can = library !== null && (kind === "illustration" || imageModel !== null);
  const pictures = wanted && can;

  const write = () => {
    if (busy) return;
    if (brief.trim() === "") {
      setMissing(true);
      return;
    }
    setMissing(false);
    // The run is bound to the key kept now: its plan and its pictures go
    // with that key alone, and stop once it is forgotten or replaced.
    const bound = assistant.getState().bind();
    if (bound === null) return;
    const facts = { ...siteFacts(session, media, brief, style), made: pictures };
    const words: SiteWords = { palette: paletteHex(style), media: facts.media, pages: facts.pages };
    const maker = !pictures ? undefined : kind === "photo" ? photoMaker(assistant, bound, quality) : illustrationMaker(assistant, bound, paletteTones(style));
    void run(assistant, (signal, tell) => writePage({
      ask: (written) => assistant.getState().ask((chosen) => pageQuestion(chosen, brief, words, pictures ? kind : null), written, signal, "words", bound),
      facts, newId: env.newId, hooks: asideHooks(aside(assistant, session, env.clock, library)), tell, signal, ...(maker ? { pictures: maker } : {}),
    }), { model: name, run: bound.run });
  };

  // A new site, once asked twice; not before the site's style is read,
  // which it replaces.
  const askSite = () => {
    if (busy || style === null) return;
    if (brief.trim() === "") {
      setMissing(true);
      return;
    }
    setMissing(false);
    setAsking(true);
  };
  const startSite = () => {
    setAsking(false);
    if (busy || style === null) return;
    const bound = assistant.getState().bind();
    if (bound === null) return;
    const facts = siteFacts(session, media, brief, style);
    const made = pictures ? kind : null;
    const directed = (page: SitePagePlan): PageDirection => ({
      name: page.direction.name, voice: page.direction.voice, palette: page.direction.palette, imagery: page.direction.imagery,
      motion: page.direction.motion, action: page.direction.action, page: { title: page.title, purpose: page.purpose, path: page.path, home: page.home },
      pages: page.pages, most: page.most,
    });
    void runSite(assistant, (signal, tell) => writeSite({
      askDirection: () => assistant.getState().ask((chosen) => directionQuestion(chosen, brief, style, made), () => undefined, signal, "words", bound),
      askPage: (page) => (written) => assistant.getState().ask((chosen) => pageQuestion(
        chosen, brief,
        { palette: Object.fromEntries(PALETTE_SLOTS.map((slot) => [slot, page.direction.palette[slot]?.hex ?? paletteHex(style)[slot]])) as Record<PaletteSlot, string>, media: facts.media, pages: page.pages },
        made !== null && page.most > 0 ? made : null, directed(page),
      ), written, signal, "words", bound),
      style,
      facts: { media: facts.media, brief },
      ...(pictures ? { pictures: (look: { palette: Record<PaletteSlot, string>; imagery: string }) => (kind === "photo" ? photoMaker(assistant, bound, quality, undefined, look.imagery) : illustrationMaker(assistant, bound, look.palette, undefined, look.imagery)) } : {}),
      hooks: asideSiteHooks({ ...aside(assistant, session, env.clock, library), session, ui: env.ui }),
      newId: env.newId,
      tell,
      signal,
    }), { model: name, run: bound.run });
  };

  const hint = library === null ? "This editor has no library to keep pictures in."
    : kind === "photo"
      ? imageModel === null ? `This key may use no GPT Image model, so the ${site ? "site" : "page"} is written without photos.`
        : site ? `${imageModel} makes them where a page needs them, each kept in your library with its alt text.`
          : `${imageModel} makes them where the page needs them, ${PLAN_MADE_MOST} at most, each kept in your library with its alt text.`
      : site ? `${name} draws them in the new site's colours where a page needs them, each kept in your library with its alt text.`
        : `${name} draws them in the site's colours where the page needs them, ${PLAN_MADE_MOST} at most, each kept in your library with its alt text. Each is a request of its own, its tokens counted with the page's.`;

  return (
    <>
      <div className="as-held">
        <span className="as-held-what">
          <Icon name="key" />
          <span className="as-held-words"><span className="as-held-name">{PROVIDER_NAMES[held.provider]}</span><span className="as-held-hint">Key {held.hint}</span></span>
        </span>
        <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().forget()}>Forget key</button>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-model`}>Model</label>
        <select id={`${id}-model`} className="input as-model" value={model ?? ""} onChange={(event) => assistant.getState().choose(event.target.value)}>
          {models.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </select>
      </div>
      <div className="field">
        <span className="label" id={`${id}-what`}>What to write</span>
        <div className="seg seg-fill" role="radiogroup" aria-labelledby={`${id}-what`} aria-describedby={site ? `${id}-site` : undefined}>
          <button type="button" role="radio" aria-checked={!site} onClick={() => {
            setWhat("page");
            setAsking(false);
          }}>A page for this site</button>
          <button type="button" role="radio" aria-checked={site} onClick={() => setWhat("site")}>A new site</button>
        </div>
        {site && (
          <div className="as-site-says" id={`${id}-site`}>
            <p>A new site:</p>
            <ul>{NEW_SITE_DOES.map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="hint">Its style takes the place of this one on every page at once, the published ones too, as a change in Site style does; Put the old style back returns it. The header, the footer and the new pages are drafts until you publish them, and your home page stays as it is until you choose.</p>
          </div>
        )}
      </div>
      <div className={`field${missing ? " field-error" : ""}`}>
        <div className="label-row">
          <label className="label" htmlFor={`${id}-brief`}>{site ? "What is the site for?" : "What is the page for?"}</label>
          {!site && <button className="as-example" type="button" onClick={() => setBrief(SAMPLE_BRIEF)}>Use an example</button>}
        </div>
        <textarea
          id={`${id}-brief`}
          className="input as-brief"
          rows={6}
          data-autofocus=""
          aria-describedby={`${id}-brief-hint${missing ? ` ${id}-brief-missing` : ""}`}
          aria-invalid={missing ? true : undefined}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
        />
        {missing && <p className="error" id={`${id}-brief-missing`}><Icon name="error" />{site ? "Say what the site is for first." : "Say what the page is for first."}</p>}
        <p className="hint" id={`${id}-brief-hint`}>
          {site
            ? "Who it is for, what it offers, what visitors should do. The facts you give are the only facts it uses: it makes up no price, date, address or review."
            : "Who it is for, what it should say, what readers should do next. The facts you give are the only facts it uses. It writes into a new page."}
        </p>
      </div>
      <div className="field as-make">
        <label className="toggle">
          <input type="checkbox" role="switch" checked={pictures} disabled={!can} aria-describedby={`${id}-pictures`} onChange={(event) => setWanted(event.target.checked)} />
          <span className="toggle-ui" aria-hidden="true" />
          <span>{kind === "photo" ? `Make photos for the ${site ? "site" : "page"}` : `Draw illustrations for the ${site ? "site" : "page"}`}</span>
        </label>
        <p className="hint" id={`${id}-pictures`}>{hint}</p>
        {pictures && kind === "photo" && imageModel !== null && (
          <>
            <span className="label as-quality-label" id={`${id}-quality`}>Photo quality</span>
            <div className="seg seg-fill" role="radiogroup" aria-labelledby={`${id}-quality`} aria-describedby={`${id}-price`}>
              {IMAGE_QUALITIES.map((which) => (
                <button key={which} type="button" role="radio" aria-checked={quality === which} onClick={() => setQuality(which)}>{QUALITY_NAMES[which]}</button>
              ))}
            </div>
            {!site && <p className="hint as-price" id={`${id}-price`}>{photoPriceWords(imageModel, quality)}</p>}
          </>
        )}
        {site && (
          <div className="as-estimate" id={`${id}-price`}>
            <p className="hint as-price">{pictures ? sitePicturesWords(kind, kind === "photo" ? (imageModel ?? "") : name, kind === "photo" ? quality : null) : "Pictures: none is made; the library's are used where they fit."}</p>
            <p className="hint">{SITE_WORDS_COST}</p>
          </div>
        )}
      </div>
      {site
        ? asking
          ? <Ask
              label="Write the new site"
              question="Give the site a new style, header and footer, and add the new pages? The pages already there stay."
              yes="Write the new site"
              onYes={startSite}
              onNo={() => {
                answeredNo();
                setAsking(false);
              }}
            />
          : <button ref={writeKey} className="btn btn-dark btn-block as-go" type="button" aria-disabled={busy || style === null ? true : undefined} onClick={askSite}>Write the new site</button>
        : <button className="btn btn-dark btn-block as-go" type="button" aria-disabled={busy ? true : undefined} onClick={write}>Write the page</button>}
    </>
  );
}

// What the run has cost so far, under the status line while the run goes
// (../assistant/live.ts): the requests that ended as the provider counted
// them, those in flight estimated, told a few times a second at most. No
// live region: the status line stays the only one, so a screen reader is
// not read every figure. The sample's says nothing is spent.
function LiveCost({ sample = false }: { sample?: boolean }) {
  const cost = useAssistant(runCost);
  if (sample) return <p className="hint as-live">{SAMPLE_SPENDS}</p>;
  if (cost === null || (cost.lines.length === 0 && cost.flying.length === 0)) return null;
  return <p className="hint as-live">{liveWords(cost)}</p>;
}

// A page's run, as the drawer says it: its phase, its status line (no live
// region while the run window speaks: `quiet`), what it has cost so far,
// its sections and pictures, then what was left out and what it used.
function Progress({ writing, quiet }: { writing: ShownWriting; quiet: boolean }) {
  const assistant = useAssistantStore();
  const moving = going(writing);
  return (
    <section className={`as-progress as-${writing.phase}`} aria-labelledby="as_progress_title" aria-busy={moving ? true : undefined}>
      <div className="as-progress-head">
        <h3 className="group-title" id="as_progress_title">{pageTitle(writing)}</h3>
        {moving
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().stop()}>Stop</button>
          : <button className="ibtn" type="button" aria-label="Clear this summary" title="Clear" onClick={() => assistant.getState().setWriting(null)}><Icon name="close" /></button>}
      </div>
      <p className={writing.phase === "failed" ? "error as-line" : "as-line"} role={quiet ? undefined : "status"}>
        {moving && <Icon name="spinner" className="i spin" />}{writing.phase === "failed" && <Icon name="error" />}<span>{pageLine(writing)}</span>
      </p>
      {moving && <LiveCost sample={writing.sample === true} />}
      {writing.sections.length > 0 && <ol className="as-sections"><SectionSteps writing={writing} /></ol>}
      {!moving && <Notes notes={writing.notes} />}
      <PageCost writing={writing} />
    </section>
  );
}

// ------------------------------------------------------------ a new site

// A new site's run, as the drawer says it, the same way: its steps grouped
// by page, then what to know, what it used, and what becomes of it.
function SiteProgress({ site, quiet }: { site: ShownSite; quiet: boolean }) {
  const assistant = useAssistantStore();
  const moving = siteGoing(site);
  // As the site begins, the focus goes to its steps, at the drawer's top,
  // above the brief its Write key was pressed under: where the run window,
  // opening over it, gives it back once it closes.
  const title = useRef<HTMLHeadingElement>(null);
  const beginning = site.phase === "asking";
  useEffect(() => {
    if (beginning) title.current?.focus();
  }, [beginning]);
  return (
    <section className={`as-progress as-site as-${site.phase}`} aria-labelledby="as_site_title" aria-busy={moving ? true : undefined}>
      <div className="as-progress-head">
        <h3 ref={title} className="group-title" id="as_site_title" tabIndex={-1}>{siteTitle(site)}</h3>
        {moving
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().stop()}>Stop</button>
          : <button className="ibtn" type="button" aria-label="Clear this summary" title="Clear" onClick={() => assistant.getState().setSite(null)}><Icon name="close" /></button>}
      </div>
      <p className={site.phase === "failed" ? "error as-line" : "as-line"} role={quiet ? undefined : "status"}>
        {moving && <Icon name="spinner" className="i spin" />}{site.phase === "failed" && <Icon name="error" />}<span>{siteLine(site)}</span>
      </p>
      {moving && <LiveCost />}
      <SiteSteps site={site} />
      {!moving && <Notes notes={siteNotes(site)} site />}
      <SiteCost site={site} />
      {!moving && (site.steps.style === "done" || site.pages.some((page) => page.id !== null)) && <SiteOffer site={site} />}
    </section>
  );
}

// What becomes of a new site once it is written, each asked: its home page
// made the site's, everything it made published, its old style put back;
// and in the browser demo, Start over with the example site.
function SiteOffer({ site }: { site: ShownSite }) {
  const session = useSession();
  const assistant = useAssistantStore();
  const style = useUi((u) => u.siteStyle);
  const [asking, setAsking] = useState<"home" | "publish" | "start" | null>(null);
  const [busy, setBusy] = useState(false);
  const [homeKey, homeNo] = useBackFrom(asking === "home");
  const [publishKey, publishNo] = useBackFrom(asking === "publish");
  const [startKey, startNo] = useBackFrom(asking === "start");
  // What was done, said; the focus there once it is.
  const said = useRef<HTMLParagraphElement>(null);
  const outcome: SiteOutcome = site.outcome ?? { home: false, published: false, styleBack: false, said: null };
  const record = (change: Partial<SiteOutcome>) => {
    const now = assistant.getState().site;
    if (now) assistant.getState().setSite({ ...now, outcome: { ...(now.outcome ?? outcome), ...change } });
    afterRender(() => said.current?.focus());
  };
  // A question answered no: the focus back on the key that asked it.
  const no = (answered: () => void) => () => {
    answered();
    setAsking(null);
  };
  const live = session.capabilities.livePages;
  const made = site.pages.filter((page): page is SitePage & { id: number } => page.id !== null);
  const first = site.pages[0];
  const home = first && first.id !== null ? { title: first.title, id: first.id } : null;
  const isHome = home !== null && session.pages.some((page) => page.id === home.id && page.home);
  const homeNow = session.pages.find((page) => page.home);
  // The new parts, each leading only to pages made: one put back as it
  // was is the site's own again.
  const parts = (["header", "footer"] as const).filter((kind) => site.frame[kind] === "new").flatMap((kind) => {
    const part = session.parts.find((one) => one.kind === kind);
    return part ? [{ kind, id: part.id }] : [];
  });
  // What may still lead to a page not made, its clean-up not saved or its
  // save's outcome not to be told: while anything may, Publish all is not
  // offered.
  const dangling = [
    ...made.filter((page) => page.dangling).map((page) => `“${page.title}”`),
    ...(["header", "footer"] as const).filter((kind) => site.frame[kind] === "stale").map((kind) => `the ${kind}`),
  ];
  // A page whose last changes were not saved has a draft that is not what
  // was written: while one has, Publish all is not offered either.
  const unsaved = made.filter((page) => page.writing?.unsaved !== undefined).map((page) => `“${page.title}”`);
  const held = [
    ...(dangling.length > 0 ? [`${and(dangling)} may still lead to a page that was not made`] : []),
    ...(unsaved.length > 0 ? [`${and(unsaved)} ${unsaved.length === 1 ? "has" : "have"} changes that were not saved`] : []),
  ];
  const old = style?.kept ?? site.before;
  const styled = site.steps.style === "done" && !outcome.styleBack && old !== null;
  const madeAll = and([...(made.length > 0 ? [`the ${plural(made.length, "new page", "new pages")}`] : []), ...parts.map((part) => `the ${part.kind}`)]);

  const makeHome = async () => {
    setAsking(null);
    if (home === null) return;
    setBusy(true);
    const why = await session.setHome(home.id);
    setBusy(false);
    record(why === null ? { home: true, said: `“${home.title}” is the home page: the site's address leads to it${live ? " once it is published" : ""}.` } : { said: `“${home.title}” was not made the home page: ${why}` });
  };
  const publishAll = async () => {
    setAsking(null);
    setBusy(true);
    const ids = [...made.map((page) => page.id), ...parts.map((part) => part.id)];
    const results = await session.publishAll(ids);
    setBusy(false);
    const named = (id: number) => made.find((page) => page.id === id)?.title ?? parts.find((part) => part.id === id)?.kind ?? String(id);
    const failed = results.filter((result) => result.why !== null);
    if (failed.length === 0) {
      record({ published: true, said: live ? `Published: ${madeAll}. Visitors see them now.` : `Published in this browser: ${madeAll}.` });
      return;
    }
    record({ said: `Published ${results.length - failed.length} of ${results.length}. Not published: ${failed.map((result) => `${named(result.id)}, ${result.why}`).join("; ")}` });
  };
  const putBack = async () => {
    if (old === null) return;
    setBusy(true);
    const why = await session.applySiteStyle({ palette: old.palette, typeScale: old.typeScale, letterWidth: old.letterWidth, kept: "none" });
    setBusy(false);
    record(why === null ? { styleBack: true, said: "The old style is back, on every page." } : { said: `The old style was not put back: ${why}` });
  };

  return (
    <div className="as-offer" role="group" aria-label="The new site, now">
      <p className="as-offer-lead">{live ? "Nothing is published yet, and the home page is still the one it was." : "Nothing is published yet in this browser, and the home page is still the one it was."}</p>
      <div className="as-offer-keys">
        {home !== null && !isHome && !outcome.home && (asking === "home"
          ? <Ask
              label={`Make “${home.title}” the home page`}
              question={`Make “${home.title}” the home page? The site's address leads to it${live ? " once it is published" : ""}${homeNow ? `; “${homeNow.title}” keeps its own address, /${homeNow.slug ?? ""}` : ""}.`}
              yes="Make it the home page"
              onYes={() => void makeHome()}
              onNo={no(homeNo)}
            />
          : <button ref={homeKey} className="btn btn-small btn-secondary" type="button" aria-disabled={busy ? true : undefined} onClick={() => !busy && setAsking("home")}>Make “{home.title}” the home page</button>)}
        {session.capabilities.publish && held.length === 0 && (made.length > 0 || parts.length > 0) && !outcome.published && (asking === "publish"
          ? <Ask
              label="Publish all"
              question={`Publish ${madeAll}? ${live ? "Visitors see them at once." : "This browser shows them as published."}`}
              yes="Publish all"
              onYes={() => void publishAll()}
              onNo={no(publishNo)}
            />
          : <button ref={publishKey} className="btn btn-small btn-secondary" type="button" aria-disabled={busy ? true : undefined} onClick={() => !busy && setAsking("publish")}>Publish all</button>)}
        {styled && <button className="btn btn-small btn-secondary" type="button" aria-disabled={busy ? true : undefined} onClick={() => !busy && void putBack()}>Put the old style back</button>}
        {session.startOver !== null && (asking === "start"
          ? <Ask
              label="Start over with the example site"
              question="Start over with the example site? Everything this browser keeps for the editor goes, the new site with it, and the example site comes back."
              yes="Start over"
              onYes={() => {
                setAsking(null);
                setBusy(true);
                void session.startOver?.().catch(() => setBusy(false));
              }}
              onNo={no(startNo)}
            />
          : <button ref={startKey} className="btn btn-small btn-secondary" type="button" aria-disabled={busy ? true : undefined} onClick={() => !busy && setAsking("start")}>Start over with the example site</button>)}
      </div>
      {session.capabilities.publish && held.length > 0 && (
        <p className="hint as-offer-held">Publish all is not offered: {held.join(", and ")}, as the things to know say.</p>
      )}
      <p ref={said} className="hint as-offer-said" role="status" tabIndex={-1}>{outcome.said ?? ""}</p>
    </div>
  );
}
