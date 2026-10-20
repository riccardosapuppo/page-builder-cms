// The Assistant's drawer (../assistant/README.md): a key of the person's
// own, then a brief, then a new page written section by section while the
// person watches it grow on the canvas. Without a key, a sample written by
// hand goes through the same steps. Which provider, what is kept of the key
// and where it goes are said where the key is asked for. After a page, the
// tokens it used and what they come to at the model's list price are said
// (../assistant/tally.ts); the drawer's foot keeps the total since the key
// was connected, and says it is an estimate.
import { useId, useState } from "react";
import { useAssistant, useAssistantStore, type AssistantStore, type ShownWriting } from "../assistant/context.tsx";
import { PROVIDER_NAMES, PROVIDERS, type ProviderId } from "../assistant/key.ts";
import { pageQuestion, type SiteWords } from "../assistant/prompts.ts";
import { sampleAnswer, samplePlan, SAMPLE_BRIEF } from "../assistant/sample.ts";
import { ESTIMATE_NOTE, estimateWords, totalWords, usedWords, type Tally } from "../assistant/tally.ts";
import { writePage, type PageHooks } from "../assistant/write.ts";
import type { SiteFacts } from "../assistant/build.ts";
import { PALETTE_SLOTS, type PaletteSlot } from "../shared/document.ts";
import { isFreeColor } from "../shared/free-colors.ts";
import { slotTone } from "../shared/site-tokens.ts";
import type { MediaItem, SiteStyle } from "../storage/adapter.ts";
import { afterRender } from "./act.ts";
import { runMade, useEnv, useUi, type EditorEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { slugFrom, useSession, type Session } from "./session.tsx";
import "./assistant.css";

const KEY_PAGES: Readonly<Record<ProviderId, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

// The palette's tones as hex, for the question: a free colour as it is, a
// curated tone by its name.
function paletteHex(style: SiteStyle | null): Record<PaletteSlot, string> {
  return Object.fromEntries(PALETTE_SLOTS.map((slot) => {
    const tone = style?.palette[slot];
    const hex = tone === undefined ? "the site's own" : isFreeColor(tone) ? tone : style?.choices.palette[slot]?.find((choice) => choice.color === tone)?.hex ?? tone;
    return [slot, hex];
  })) as Record<PaletteSlot, string>;
}

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
// view as it lands.
function pageHooks(env: EditorEnv, session: Session): PageHooks {
  let opened: number | null = null;
  return {
    async open(title) {
      const base = slugFrom(title) || "page";
      for (let count = 1; count <= 5; count++) {
        const made = await session.makePage({ title, slug: count === 1 ? base : `${base}-${count}` });
        if (made.ok) {
          opened = made.id;
          return session.isOpen(made.id) ? null : "The new page did not open.";
        }
        if (!made.errors.some((error) => error.pointer === "/slug")) return made.errors[0]?.message ?? "The page could not be made.";
      }
      return "No free address was found for the new page.";
    },
    still: () => opened !== null && session.isOpen(opened),
    document: () => env.store.getState().document,
    apply(made) {
      const result = runMade(env, made);
      if (!result.ok) return result.error.message;
      const last = env.store.getState().document.sections.at(-1);
      if (made.ok && made.command.kind === "insert" && last) {
        afterRender(() => {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
          document.querySelector(`.canvas [data-block-id="${last.id}"]`)?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        });
      }
      return null;
    },
  };
}

// One run of the writer, stoppable from the drawer, its state shown there.
async function run(assistant: AssistantStore, start: (signal: AbortSignal, tell: (writing: ShownWriting) => void) => Promise<unknown>, shown: Partial<ShownWriting>) {
  const signal = assistant.getState().begin();
  try {
    await start(signal, (writing) => assistant.getState().setWriting({ ...writing, ...shown }));
  } finally {
    assistant.getState().end();
  }
}

export function AssistantPanel() {
  const held = useAssistant((a) => a.held);
  const writing = useAssistant((a) => a.writing);
  return (
    <>
      <div className="drawer-body as-body">
        {writing && <Progress writing={writing} />}
        {held === null ? <Connect /> : <Brief />}
      </div>
      <Total />
    </>
  );
}

// What the page written says it used, once it has ended: nothing while it
// is being written, for a sample, or when the provider said nothing.
function shownTally(writing: ShownWriting | null): Tally | null {
  if (writing === null || writing.sample || writing.phase === "asking" || writing.phase === "writing") return null;
  return writing.tally !== null && writing.tally.length > 0 ? writing.tally : null;
}

// The drawer's foot: the total since the key was connected, while it is
// kept, and, under it, what every estimate here leaves out.
function Total() {
  const held = useAssistant((a) => a.held);
  const spent = useAssistant((a) => a.spent);
  const writing = useAssistant((a) => a.writing);
  const total = held !== null && spent.length > 0;
  if (!total && shownTally(writing) === null) return null;
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
        <div className="seg seg-fill" role="radiogroup" aria-labelledby={`${id}-provider`}>
          {PROVIDERS.map((which) => (
            <button key={which} type="button" role="radio" aria-checked={provider === which} onClick={() => setProvider(which)}>{PROVIDER_NAMES[which]}</button>
          ))}
        </div>
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
      facts, newId: env.newId, hooks: pageHooks(env, session), tell, signal,
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

function Brief() {
  const env = useEnv();
  const session = useSession();
  const assistant = useAssistantStore();
  const held = useAssistant((a) => a.held)!;
  const models = useAssistant((a) => a.models);
  const model = useAssistant((a) => a.model);
  const busy = useAssistant((a) => a.running !== null);
  const media = useUi((u) => u.media);
  const style = useUi((u) => u.siteStyle);
  const [brief, setBrief] = useState("");
  const [missing, setMissing] = useState(false);
  const id = useId();

  const write = () => {
    if (busy) return;
    if (brief.trim() === "") {
      setMissing(true);
      return;
    }
    setMissing(false);
    const facts = siteFacts(session, media, brief, style);
    const words: SiteWords = { palette: paletteHex(style), media: facts.media, pages: facts.pages };
    const name = models.find((choice) => choice.id === model)?.name ?? model ?? "the model";
    void run(assistant, (signal, tell) => writePage({
      ask: (written) => assistant.getState().ask((chosen) => pageQuestion(chosen, brief, words), written, signal),
      facts, newId: env.newId, hooks: pageHooks(env, session), tell, signal,
    }), { model: name });
  };

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
      <div className={`field${missing ? " field-error" : ""}`}>
        <div className="label-row">
          <label className="label" htmlFor={`${id}-brief`}>What is the page for?</label>
          <button className="as-example" type="button" onClick={() => setBrief(SAMPLE_BRIEF)}>Use an example</button>
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
        {missing && <p className="error" id={`${id}-brief-missing`}><Icon name="error" />Say what the page is for first.</p>}
        <p className="hint" id={`${id}-brief-hint`}>Who it is for, what it should say, what readers should do next. The facts you give are the only facts it uses. It writes into a new page.</p>
      </div>
      <button className="btn btn-dark btn-block as-go" type="button" aria-disabled={busy ? true : undefined} onClick={write}>Write the page</button>
    </>
  );
}

const PHASE_WORDS: Readonly<Record<ShownWriting["phase"], string>> = {
  asking: "Asking",
  writing: "Writing",
  done: "Written",
  stopped: "Stopped",
  failed: "Not written",
};

const count = (n: number): string => `${n} ${n === 1 ? "section" : "sections"}`;

function Progress({ writing }: { writing: ShownWriting }) {
  const assistant = useAssistantStore();
  const going = writing.phase === "asking" || writing.phase === "writing";
  const tally = shownTally(writing);
  const kept = writing.sections.filter((section) => section.kept).length;
  const page = writing.title ? `“${writing.title}”` : "the new page";
  const line = writing.phase === "asking"
    ? writing.sample ? "Reading the sample plan…" : `Asking ${writing.model ?? "the model"}…`
    : writing.phase === "writing"
      ? `Writing ${page}: ${count(kept)} so far.`
      : writing.phase === "done"
        ? `${count(kept)} on ${page}. Each is a step in History: undo takes them back one at a time.`
        : writing.phase === "stopped"
          ? `Stopped. The ${count(kept)} on ${page} stay.`
          : writing.error ?? "The page was not written.";
  return (
    <section className={`as-progress as-${writing.phase}`} aria-labelledby="as_progress_title" aria-busy={going ? true : undefined}>
      <div className="as-progress-head">
        <h3 className="group-title" id="as_progress_title">{PHASE_WORDS[writing.phase]}{writing.sample ? " · sample" : ""}</h3>
        {going
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => assistant.getState().stop()}>Stop</button>
          : <button className="ibtn" type="button" aria-label="Clear this summary" title="Clear" onClick={() => assistant.getState().setWriting(null)}><Icon name="close" /></button>}
      </div>
      <p className={writing.phase === "failed" ? "error as-line" : "as-line"} role="status">
        {going && <Icon name="spinner" className="i spin" />}{writing.phase === "failed" && <Icon name="error" />}<span>{line}</span>
      </p>
      {writing.sections.length > 0 && (
        <ol className="as-sections">
          {writing.sections.map((section, index) => (
            <li key={index} className={section.kept ? undefined : "as-left"}>
              <Icon name={section.kept ? "check" : "warning"} />
              <span>{section.label}</span>
              {!section.kept && <span className="visually-hidden">, left out</span>}
            </li>
          ))}
        </ol>
      )}
      {!going && writing.notes.length > 0 && (
        <details className="as-notes">
          <summary>{writing.notes.length === 1 ? "One thing was left out" : `${writing.notes.length} things were left out`}</summary>
          <ul>{writing.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </details>
      )}
      {tally && (
        <>
          <p className="hint as-used">{usedWords(tally)}</p>
          <p className="hint as-cost">{estimateWords(tally)}</p>
        </>
      )}
      {writing.phase === "stopped" && !writing.sample && tally === null && (
        <p className="hint as-used">Its tokens are not known: the provider counts them when a request ends, and this one was stopped.</p>
      )}
      {!going && writing.sample && <p className="hint">A sample written by hand: no model was asked.</p>}
    </section>
  );
}
