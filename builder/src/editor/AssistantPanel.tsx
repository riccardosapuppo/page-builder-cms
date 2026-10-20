// The Assistant's drawer (../assistant/README.md): a key of the person's
// own, then a brief, then a new page written section by section while the
// person watches it grow on the canvas, or a new site. Without a key, a
// sample written by hand goes through the same steps. Which provider, what
// each one does, what is kept of the key and where it goes are said where
// the key is asked for. Before writing, a switch makes pictures: photos
// with an OpenAI key, at the quality chosen, its price per photo said
// beside it; illustrations with an Anthropic key. While the page is
// written, each picture's progress is in the list of steps, and its cost
// once it is made. After a page, the tokens it used and what they come to
// at the model's list price are said (../assistant/tally.ts), a line for
// each kind of picture, then the whole; the drawer's foot keeps the total
// since the key was connected, and says it is an estimate.
//
// Two choices: a page for this site, or a new site (../assistant/site.ts),
// said plainly before anything is asked: a new style, header and footer,
// three or four pages added, the pages already there kept. Its Write asks
// twice, and beside it is said what its pictures may cost at most, the
// site's budget, and that its words cost a few cents with most models,
// said exactly after. Its steps are grouped by page, the site's own first
// (direction, style, header, footer), with the running cost, then the
// final one; then what becomes of it, each asked: the home page made the
// site's, everything published, the old style put back, and in the
// browser demo Start over with the example site.
import { Fragment, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useAssistant, useAssistantStore, type AssistantStore, type ShownSite, type ShownWriting, type SiteOutcome } from "../assistant/context.tsx";
import { PROVIDER_NAMES, PROVIDERS, type ProviderId } from "../assistant/key.ts";
import { illustrationMaker, photoMaker } from "../assistant/makers.ts";
import { PICTURE_KINDS, type PictureKind } from "../assistant/pictures.ts";
import { PLAN_MADE_MOST } from "../assistant/plan.ts";
import { about, dollars, IMAGE_QUALITIES, imagePrice, PRICES_DAY, type ImageQuality } from "../assistant/prices.ts";
import { directionQuestion, pageQuestion, type PageDirection, type SiteWords } from "../assistant/prompts.ts";
import { sampleAnswer, samplePlan, SAMPLE_BRIEF } from "../assistant/sample.ts";
import { BEFORE_NEW_SITE, SITE_PICTURES_MOST, writeSite, type SiteHooks, type SitePage, type SitePageHooks, type SitePagePlan, type SiteStep } from "../assistant/site.ts";
import { addTallies, allWords, ESTIMATE_NOTE, estimateWords, pictureWords, totalWords, usedWords, type Tally } from "../assistant/tally.ts";
import { LEFT, writePage, type PictureWritten, type Writing } from "../assistant/write.ts";
import type { SiteFacts } from "../assistant/build.ts";
import { PALETTE_SLOTS, type PaletteSlot } from "../shared/document.ts";
import { isFreeColor } from "../shared/free-colors.ts";
import { slotLabel, slotTone } from "../shared/site-tokens.ts";
import type { MediaItem, SiteStyle } from "../storage/adapter.ts";
import { afterRender } from "./act.ts";
import { runMade, useEnv, useUi, type EditorEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { useMediaService } from "./library/context.tsx";
import type { MediaService } from "./library/service.ts";
import { slugFrom, useSession, type Session } from "./session.tsx";
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
const KIND_NAMES: Readonly<Record<PictureKind, string>> = { photo: "Photo", illustration: "Illustration" };

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

// The steps of ../assistant/write.ts done by this editor: a page made from
// the plan's title (its address made free if it is taken), each command
// applied to it while it is the page open, each new section brought into
// view as it lands, and a picture made for it put in the library. A page
// of a new site (`planned`) is made at the address planned for it, and
// only while the page the Assistant opened before it is still the one
// open: another opened meanwhile stops the site.
function pageHooks(env: EditorEnv, session: Session, library: MediaService | null, planned?: { slug: string; after: number | null }): SitePageHooks {
  let opened: { id: number; slug: string } | null = null;
  return {
    made: () => opened,
    async open(title) {
      if (planned && planned.after !== null && !session.isOpen(planned.after)) return LEFT;
      const base = planned?.slug ?? (slugFrom(title) || "page");
      for (let count = 1; count <= 5; count++) {
        const slug = count === 1 ? base : `${base}-${count}`;
        const made = await session.makePage({ title, slug });
        if (made.ok) {
          opened = { id: made.id, slug };
          return session.isOpen(made.id) ? null : "The new page did not open.";
        }
        if (!made.errors.some((error) => error.pointer === "/slug")) return made.errors[0]?.message ?? "The page could not be made.";
      }
      return "No free address was found for the new page.";
    },
    still: () => opened !== null && session.isOpen(opened.id),
    document: () => env.store.getState().document,
    apply(made, options) {
      const selected = env.store.getState().selection;
      const result = runMade(env, made);
      if (!result.ok) return result.error.message;
      // A picture put in leaves the person's selection, and their panel, as they were.
      if (options?.quiet) env.store.getState().select(selected);
      const last = env.store.getState().document.sections.at(-1);
      if (made.ok && made.command.kind === "insert" && made.command.subject?.id === last?.id && last) {
        afterRender(() => {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
          document.querySelector(`.canvas [data-block-id="${last.id}"]`)?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        });
      }
      return null;
    },
    ...(library === null ? {} : {
      async upload(file: File, picture: { width: number; height: number; alt: string }) {
        const put = await library.put({ file, width: picture.width, height: picture.height, alt: picture.alt });
        return put.ok ? { ok: true as const, mediaId: put.item.id } : put;
      },
    }),
  };
}

// What a new site does through this editor (../assistant/site.ts): its
// style saved as Site style saves it, the old one kept to be put back; its
// header and footer saved as the parts' drafts, the drafts they replace
// kept as versions; its pages made and written as a page is.
function siteHooks(env: EditorEnv, session: Session, library: MediaService | null): SiteHooks {
  return {
    applyStyle: (style) => session.applySiteStyle({ ...style, kept: "now" }),
    savePart: (kind, document, keep) => session.replacePart(kind, document, keep),
    taken: () => session.pages.flatMap((page) => (page.slug === null ? [] : [page.slug])),
    header: () => env.ui.getState().parts.header,
    isOpen: (id) => session.isOpen(id),
    page: (planned) => pageHooks(env, session, library, planned),
  };
}

// One run of the writer, stoppable from the drawer, its state shown there:
// a page's, which takes the place of a site's summary.
async function run(assistant: AssistantStore, start: (signal: AbortSignal, tell: (writing: ShownWriting) => void) => Promise<unknown>, shown: Partial<ShownWriting>) {
  const signal = assistant.getState().begin();
  assistant.getState().setSite(null);
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
  return (
    <>
      <div className="drawer-body as-body">
        {site && <SiteProgress site={site} />}
        {writing && <Progress writing={writing} />}
        {held === null ? <Connect /> : <Brief />}
      </div>
      <Total />
    </>
  );
}

const going = (writing: ShownWriting): boolean => writing.phase === "asking" || writing.phase === "writing" || writing.phase === "pictures";
const siteGoing = (site: ShownSite): boolean => site.phase === "asking" || site.phase === "style" || site.phase === "frame" || site.phase === "pages";

// What the page written says it used, once it has ended: the page's words
// and its pictures; nothing while it is being written, for a sample, or
// when the provider said nothing.
function shownTally(writing: ShownWriting | null): { words: Tally | null; pictures: Tally } | null {
  if (writing === null || writing.sample || going(writing)) return null;
  const words = writing.tally !== null && writing.tally.length > 0 ? writing.tally : null;
  const pictures = addTallies(...writing.pictures.map((one) => one.tally ?? []));
  return words === null && pictures.length === 0 ? null : { words, pictures };
}

// What a new site used, its direction's and its pages' words and its
// pictures, as far as it has come.
function siteTallies(site: ShownSite): { words: Tally; pictures: Tally } {
  return {
    words: addTallies(site.tally ?? [], ...site.pages.map((page) => page.writing?.tally ?? [])),
    pictures: addTallies(...site.pages.flatMap((page) => page.writing?.pictures.map((one) => one.tally ?? []) ?? [])),
  };
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
      facts, newId: env.newId, hooks: pageHooks(env, session, null), tell, signal,
    }), { sample: true });
  };
  return (
    <section className="as-sample" aria-labelledby="as_sample_title">
      <h3 className="group-title" id="as_sample_title">No key at hand?</h3>
      <p className="hint">Watch a sample: a plan written by hand for an open day at the swimming club goes through the same steps a model's plan takes, and the page builds itself.</p>
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
      facts, newId: env.newId, hooks: pageHooks(env, session, library), tell, signal, ...(maker ? { pictures: maker } : {}),
    }), { model: name });
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
      hooks: siteHooks(env, session, library),
      newId: env.newId,
      tell,
      signal,
    }), { model: name });
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

const PHASE_WORDS: Readonly<Record<ShownWriting["phase"], string>> = {
  asking: "Asking",
  writing: "Writing",
  pictures: "Making pictures",
  done: "Written",
  stopped: "Stopped",
  failed: "Not written",
};

const count = (n: number): string => `${n} ${n === 1 ? "section" : "sections"}`;
const pictureCount = (n: number, kind: PictureKind): string => `${n} ${n === 1 ? kind : `${kind}s`}`;

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
function SectionSteps({ writing }: { writing: Writing }) {
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

function Progress({ writing }: { writing: ShownWriting }) {
  const assistant = useAssistantStore();
  const moving = going(writing);
  const shown = shownTally(writing);
  const kept = writing.sections.filter((section) => section.kept).length;
  const placed = writing.pictures.filter((one) => one.state === "placed");
  const kind = writing.pictures[0]?.kind;
  const page = writing.title ? `“${writing.title}”` : "the new page";
  const onPage = placed.length > 0 && kind ? `${count(kept)} and ${pictureCount(placed.length, kind)}` : count(kept);
  const line = writing.phase === "asking"
    ? writing.sample ? "Reading the sample plan…" : `Asking ${writing.model ?? "the model"}…`
    : writing.phase === "writing"
      ? `Writing ${page}: ${count(kept)} so far.`
      : writing.phase === "pictures"
        ? `Making the pictures for ${page}: ${placed.length} of ${writing.pictures.length} in.`
        : writing.phase === "done"
          ? `${onPage} on ${page}. Each is a step in History: undo takes them back one at a time.`
          : writing.phase === "stopped"
            ? `Stopped. The ${onPage} on ${page} stay.`
            : writing.error ?? "The page was not written.";
  const kinds = shown ? (["photo", "illustration"] as const).map((which) => pictureWords(shown.pictures, which)).filter((words) => words !== null) : [];
  const all = shown ? allWords(addTallies(shown.words ?? [], shown.pictures)) : null;
  return (
    <section className={`as-progress as-${writing.phase}`} aria-labelledby="as_progress_title" aria-busy={moving ? true : undefined}>
      <div className="as-progress-head">
        <h3 className="group-title" id="as_progress_title">{PHASE_WORDS[writing.phase]}{writing.sample ? " · sample" : ""}</h3>
        {moving
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().stop()}>Stop</button>
          : <button className="ibtn" type="button" aria-label="Clear this summary" title="Clear" onClick={() => assistant.getState().setWriting(null)}><Icon name="close" /></button>}
      </div>
      <p className={writing.phase === "failed" ? "error as-line" : "as-line"} role="status">
        {moving && <Icon name="spinner" className="i spin" />}{writing.phase === "failed" && <Icon name="error" />}<span>{line}</span>
      </p>
      {writing.sections.length > 0 && <ol className="as-sections"><SectionSteps writing={writing} /></ol>}
      {!moving && writing.notes.length > 0 && (
        <details className="as-notes">
          <summary>{writing.notes.length === 1 ? "One thing was left out" : `${writing.notes.length} things were left out`}</summary>
          <ul>{writing.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </details>
      )}
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
      {!moving && writing.sample && <p className="hint">A sample written by hand: no model was asked.</p>}
    </section>
  );
}

// ------------------------------------------------------------ a new site

const SITE_PHASE_WORDS: Readonly<Record<ShownSite["phase"], string>> = {
  asking: "Asking for a direction",
  style: "Giving the site its style",
  frame: "Building the header and footer",
  pages: "Writing the pages",
  done: "Written",
  stopped: "Stopped",
  failed: "Not written",
};

const STEP_ICONS: Readonly<Record<SiteStep, "clock" | "check" | "warning">> = { waiting: "clock", doing: "clock", done: "check", failed: "warning", stopped: "warning" };
const STEP_WORDS: Readonly<Record<SiteStep, string>> = { waiting: "waiting", doing: "", done: "", failed: "not made", stopped: "stopped" };
const PAGE_WORDS: Readonly<Record<SitePage["state"], string>> = { waiting: "waiting", writing: "being written…", done: "written", failed: "not written", stopped: "stopped" };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const and = (words: readonly string[]): string => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

// What a new site has made, in words: "a new style, a new header and
// footer, and 3 pages with 4 photos".
function madeWords(site: ShownSite): string {
  const parts: string[] = [];
  if (site.steps.style === "done") parts.push("a new style");
  const frame = (["header", "footer"] as const).filter((kind) => site.steps[kind] === "done");
  if (frame.length > 0) parts.push(`a new ${frame.join(" and ")}`);
  const pages = site.pages.filter((page) => page.id !== null);
  const placed = pages.flatMap((page) => page.writing?.pictures ?? []).filter((one) => one.state === "placed");
  if (pages.length > 0) parts.push(`${plural(pages.length, "page", "pages")}${placed.length > 0 ? ` with ${pictureCount(placed.length, placed[0]!.kind)}` : ""}`);
  // Its parts hold an "and" of their own: the last one follows a comma.
  return parts.length === 0 ? "nothing" : parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function siteLine(site: ShownSite): string {
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
    case "done":
      return `${name}: ${madeWords(site)}. The header and footer it replaced are kept in their versions, as “${BEFORE_NEW_SITE}”.`;
    case "stopped":
      return `${site.error ? `${site.error} ` : "Stopped. "}What was made stays: ${madeWords(site)}.`;
    case "failed":
      return `${site.error ?? "The site was not written."}${site.steps.style === "done" ? ` What was made stays: ${madeWords(site)}.` : ""}`;
  }
}

// What a new site's steps have cost so far, as the person waits.
function soFarWords(tally: Tally): string | null {
  if (tally.length === 0) return null;
  const priced = tally.filter((line) => line.cost.price !== null);
  if (priced.length === 0) return "So far: no list price on file for these models; only their tokens are counted.";
  return `So far, ${about(priced.reduce((nano, line) => nano + (line.cost.price === null ? 0 : line.cost.nano), 0))}${priced.length < tally.length ? " for what has a list price on file" : ""}.`;
}

function SiteProgress({ site }: { site: ShownSite }) {
  const assistant = useAssistantStore();
  const moving = siteGoing(site);
  // As the site begins, the focus goes to its steps, at the drawer's top,
  // above the brief its Write key was pressed under.
  const title = useRef<HTMLHeadingElement>(null);
  const beginning = site.phase === "asking";
  useEffect(() => {
    if (beginning) title.current?.focus();
  }, [beginning]);
  const { words, pictures } = siteTallies(site);
  const all = addTallies(words, pictures);
  const notes = [...site.notes, ...site.pages.flatMap((page) => (page.writing?.notes ?? []).map((note) => `“${page.title}”: ${note}`))];
  const kinds = moving ? [] : (["photo", "illustration"] as const).map((which) => pictureWords(pictures, which)).filter((line) => line !== null);
  const whole = moving ? null : allWords(all, "the site");
  const direction = site.direction;
  const step = (name: string, state: SiteStep, said: string) => (
    <li className={`as-step as-step-${state}`}>
      {state === "doing" ? <Icon name="spinner" className="i spin" /> : <Icon name={STEP_ICONS[state]} />}
      <span>{name}</span>
      <span className="as-picture-state"><span className="visually-hidden">, </span>{said || STEP_WORDS[state]}</span>
    </li>
  );
  return (
    <section className={`as-progress as-site as-${site.phase}`} aria-labelledby="as_site_title" aria-busy={moving ? true : undefined}>
      <div className="as-progress-head">
        <h3 ref={title} className="group-title" id="as_site_title" tabIndex={-1}>{SITE_PHASE_WORDS[site.phase]} · new site</h3>
        {moving
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().stop()}>Stop</button>
          : <button className="ibtn" type="button" aria-label="Clear this summary" title="Clear" onClick={() => assistant.getState().setSite(null)}><Icon name="close" /></button>}
      </div>
      <p className={site.phase === "failed" ? "error as-line" : "as-line"} role="status">
        {moving && <Icon name="spinner" className="i spin" />}{site.phase === "failed" && <Icon name="error" />}<span>{siteLine(site)}</span>
      </p>
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
            {step("Header", site.steps.header, site.steps.header === "done" ? "draft" : "")}
            {step("Footer", site.steps.footer, site.steps.footer === "done" ? "draft" : "")}
          </ol>
        </li>
        {site.pages.map((page) => (
          <li key={page.path} className={`as-group as-page as-page-${page.state}`}>
            <h4 className="as-group-title">
              {page.title}<span className="as-group-path">{page.path}</span>
              {/* Written goes without saying beside its sections, but to a screen reader. */}
              {page.state === "done"
                ? <span className="visually-hidden">, {PAGE_WORDS.done}</span>
                : <span className="as-picture-state"><span className="visually-hidden">, </span>{PAGE_WORDS[page.state]}</span>}
            </h4>
            {page.writing && page.writing.sections.length > 0 && <ol className="as-sections"><SectionSteps writing={page.writing} /></ol>}
          </li>
        ))}
      </ol>
      {!moving && notes.length > 0 && (
        <details className="as-notes">
          <summary>{notes.length === 1 ? "One thing to know" : `${notes.length} things to know`}</summary>
          <ul>{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </details>
      )}
      {moving && soFarWords(all) && <p className="hint as-so-far">{soFarWords(all)}</p>}
      {!moving && words.length > 0 && (
        <>
          <p className="hint as-used">{usedWords(words)}</p>
          <p className="hint as-cost">{estimateWords(words)}</p>
        </>
      )}
      {kinds.map((line) => <p key={line} className="hint as-pictures-cost">{line}</p>)}
      {whole && <p className="hint as-all">{whole}</p>}
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
  const parts = (["header", "footer"] as const).filter((kind) => site.steps[kind] === "done").flatMap((kind) => {
    const part = session.parts.find((one) => one.kind === kind);
    return part ? [{ kind, id: part.id }] : [];
  });
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
        {session.capabilities.publish && (made.length > 0 || parts.length > 0) && !outcome.published && (asking === "publish"
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
      <p ref={said} className="hint as-offer-said" role="status" tabIndex={-1}>{outcome.said ?? ""}</p>
    </div>
  );
}
