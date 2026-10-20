// The Assistant in a block's panel (../assistant/README.md): a heading or a
// text written again, an image of the library described. Each asks the
// person's model, shows what it wrote before anything changes, and puts it
// on the page only when the person takes it: one step of the Assistant's
// in History, undoable. A suggestion is for what it was asked of: the words
// written over, or the image replaced, it goes, and a question still on its
// way stops. With no key, each says where one is connected. Under what the
// model wrote, or why nothing came of it, the tokens the request used and
// what they come to at the model's list price (../assistant/tally.ts).
import { useEffect, useId, useRef, useState } from "react";
import { makeSetProps, REMOVE, type Updates } from "../document/commands.ts";
import type { Json } from "../document/json.ts";
import { locate } from "../document/tree.ts";
import { useAssistant, useAssistantStore, type AssistantState } from "../assistant/context.tsx";
import { describeQuestion, REWRITES, rewriteQuestion } from "../assistant/prompts.ts";
import { AssistantError } from "../assistant/providers.ts";
import { hasMarks, headingFrom, imageTextFrom, textFrom, textWords } from "../assistant/rewrite.ts";
import { briefWords, type Tally } from "../assistant/tally.ts";
import { asAssistants } from "../assistant/write.ts";
import { blockImage } from "../render/media.tsx";
import type { HeadingBlock, ImageBlock, PageDocument, RichTextDoc, TextBlock } from "../shared/document.ts";
import { useEnv, useRun, useUi } from "./context.tsx";
import { openDrawer } from "./Drawer.tsx";
import { Icon } from "./icons.tsx";
import { mediaResolver } from "./media.ts";
import { picture } from "./picture.ts";
import "./assistant.css";

// Each step is for what it was asked of (`source`: the words, the image),
// and an answer says what asking for it used (`tally`).
type Step<T> =
  | { phase: "idle" }
  | { phase: "asking"; source: string }
  | { phase: "shown"; source: string; result: T; tally: Tally }
  | { phase: "failed"; source: string; error: string; tally: Tally | null };

// A question to the model about `source`, stoppable, its answer read by
// `read`: what the tool shows, or why there is nothing to show. When the
// source changes, the question on its way stops and what was shown for the
// old one is shown no more.
function useAsk<T>(source: string) {
  const assistant = useAssistantStore();
  const [step, setStep] = useState<Step<T>>({ phase: "idle" });
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => {
    running.current?.abort();
    running.current = null;
  }, [source]);
  const ask = async (question: Parameters<AssistantState["ask"]>[0], read: (answer: unknown) => T | null, nothing: string) => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const asked = source;
    setStep({ phase: "asking", source: asked });
    try {
      const answer = await assistant.getState().ask(question, () => undefined, controller.signal);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(answer.text);
      } catch {
        // read below gives nothing
      }
      const result = read(parsed);
      if (running.current === controller) setStep(result === null ? { phase: "failed", source: asked, error: nothing, tally: answer.tally } : { phase: "shown", source: asked, result, tally: answer.tally });
    } catch (error) {
      if (running.current !== controller) return;
      const stopped = error instanceof AssistantError && error.kind === "stopped";
      const tally = error instanceof AssistantError ? error.tally : null;
      setStep(stopped ? { phase: "idle" } : { phase: "failed", source: asked, error: error instanceof Error ? error.message : String(error), tally });
    }
  };
  const stop = () => {
    running.current?.abort();
    running.current = null;
    setStep({ phase: "idle" });
  };
  const shown: Step<T> = step.phase !== "idle" && step.source !== source ? { phase: "idle" } : step;
  return { step: shown, ask, stop, reset: () => setStep({ phase: "idle" }) };
}

// With no key: where one is connected.
function NoKey({ what }: { what: string }) {
  const env = useEnv();
  return (
    <p className="hint as-tool-none">
      {what} with a model of yours, from the{" "}
      <button className="as-example" type="button" onClick={() => openDrawer(env, "assistant")}>Assistant</button>.
    </p>
  );
}

function Asking({ onStop }: { onStop: () => void }) {
  return (
    <div className="as-tool-asking">
      <p className="as-line" role="status"><Icon name="spinner" className="i spin" /><span>Writing…</span></p>
      <button className="btn btn-small btn-secondary" type="button" onClick={onStop}>Stop</button>
    </div>
  );
}

function Failed({ error, tally, onAgain }: { error: string; tally: Tally | null; onAgain: () => void }) {
  return (
    <div className="as-tool-failed">
      <p className="error" role="alert"><Icon name="error" />{error}</p>
      <button className="btn btn-small btn-secondary" type="button" onClick={onAgain}>Try again</button>
      <Spent tally={tally} />
    </div>
  );
}

// What the request used and what it comes to, when the provider said it.
function Spent({ tally }: { tally: Tally | null }) {
  return tally !== null && tally.length > 0 ? <p className="hint as-spent">{briefWords(tally)}</p> : null;
}

function Choices({ onUse, onAgain, onDiscard }: { onUse: () => void; onAgain: () => void; onDiscard: () => void }) {
  return (
    <div className="as-tool-choices">
      <button className="btn btn-small btn-dark" type="button" onClick={onUse}>Use it</button>
      <button className="btn btn-small btn-secondary" type="button" onClick={onAgain}>Again</button>
      <button className="btn btn-small btn-secondary" type="button" onClick={onDiscard}>Discard</button>
    </div>
  );
}

// ------------------------------------------------------- written again

type Rewritten = { heading: string } | { doc: RichTextDoc };

// What a heading or a text is now: its words, its text's whole document.
const wordsOf = (block: HeadingBlock | TextBlock): string => (block.type === "heading" ? block.props.text : JSON.stringify(block.props.doc));

export function RewriteTool({ block }: { block: HeadingBlock | TextBlock }) {
  const env = useEnv();
  const run = useRun();
  const held = useAssistant((a) => a.held);
  const { step, ask, stop, reset } = useAsk<Rewritten>(wordsOf(block));
  const [own, setOwn] = useState("");
  const last = useRef("");
  const id = useId();
  const heading = block.type === "heading";
  const what = heading ? "heading" : "text";
  const write = (asks: string) => {
    if (asks.trim() === "") return;
    last.current = asks;
    const words = block.type === "heading" ? block.props.text : textWords(block.props.doc);
    const page = env.store.getState().document.title;
    void ask(
      (model) => rewriteQuestion(model, asks, words, what, page),
      (answer) => {
        if (heading) {
          const text = headingFrom(answer);
          return text === null ? null : { heading: text };
        }
        const doc = textFrom(answer);
        return doc === null ? null : { doc };
      },
      `The model's answer held no ${what}. Try again.`,
    );
  };
  const use = (result: Rewritten, source: string) => {
    const now = locate(env.store.getState().document, block.id)?.block;
    // Written for words that are no longer there: nothing is taken.
    if (!now || (now.type !== "heading" && now.type !== "text") || wordsOf(now) !== source) {
      reset();
      return;
    }
    const updates: Updates = "heading" in result ? { text: result.heading } : { doc: result.doc as unknown as Json };
    if (run(asAssistants(makeSetProps(env.store.getState().document, block.id, updates))) === null) reset();
  };
  return (
    <section className="field as-tool" aria-labelledby={`${id}-title`}>
      <span className="label" id={`${id}-title`}><Icon name="sparkles" />Write it again</span>
      {held === null ? <NoKey what={`Write the ${what} again`} />
        : step.phase === "asking" ? <Asking onStop={stop} />
        : step.phase === "failed" ? <Failed error={step.error} tally={step.tally} onAgain={() => write(last.current)} />
        : step.phase === "shown" ? (
          <div className="as-suggestion">
            <div className="as-suggested" aria-label={`The ${what} written again`}>
              {"heading" in step.result ? <p>{step.result.heading}</p> : <Shown doc={step.result.doc} />}
            </div>
            {block.type === "text" && hasMarks(block.props.doc) && <p className="hint">Its bold, italic and links are not kept.</p>}
            <Choices onUse={() => use(step.result, step.source)} onAgain={() => write(last.current)} onDiscard={reset} />
            <Spent tally={step.tally} />
          </div>
        ) : (
          <>
            <div className="as-chips" role="group" aria-labelledby={`${id}-title`}>
              {REWRITES.map((rewrite) => <button key={rewrite.id} className="btn btn-small btn-secondary" type="button" onClick={() => write(rewrite.asks)}>{rewrite.name}</button>)}
            </div>
            <div className="as-own">
              <input
                className="input"
                aria-label={`How to write the ${what} again`}
                placeholder="Or say how: “in Italian”, “for children”…"
                value={own}
                onChange={(event) => setOwn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  write(own);
                }}
              />
              <button className="btn btn-small btn-dark" type="button" aria-disabled={own.trim() === "" ? true : undefined} onClick={() => write(own)}>Write</button>
            </div>
          </>
        )}
    </section>
  );
}

// A text written again, as plain paragraphs and lists, before it is taken.
function Shown({ doc }: { doc: RichTextDoc }) {
  return (
    <>
      {doc.content.map((block, index) => (block.type === "paragraph"
        ? <p key={index}>{block.content?.map((node) => (node.type === "text" ? node.text : " ")).join("")}</p>
        : block.type === "bulletList"
          ? <ul key={index}>{block.content.map((item, n) => <li key={n}>{item.content[0].content?.map((node) => (node.type === "text" ? node.text : " ")).join("")}</li>)}</ul>
          : <ol key={index}>{block.content.map((item, n) => <li key={n}>{item.content[0].content?.map((node) => (node.type === "text" ? node.text : " ")).join("")}</li>)}</ol>))}
    </>
  );
}

// ------------------------------------------------------ an image described

// The words beside an image: the heading or text before it in its column.
function wordsNear(block: ImageBlock, doc: PageDocument): string {
  const here = locate(doc, block.id);
  if (!here || here.parentId === null) return "";
  const siblings = locate(doc, here.parentId)?.block.children ?? [];
  for (const before of siblings.slice(0, here.index).reverse()) {
    if (before.type === "heading") return before.props.text;
    if (before.type === "text") return textWords(before.props.doc).slice(0, 400);
  }
  return "";
}

export function DescribeTool({ block }: { block: ImageBlock }) {
  const env = useEnv();
  const run = useRun();
  const held = useAssistant((a) => a.held);
  const media = useUi((u) => u.media);
  const source = block.props.mediaId ?? block.props.url ?? "";
  const { step, ask, stop, reset } = useAsk<{ alt: string } | { decorative: true }>(source);
  const id = useId();
  const item = block.props.mediaId !== undefined ? media.get(block.props.mediaId) : undefined;
  const describe = () => {
    const shown = blockImage(block.props, mediaResolver(media));
    if (!item || !shown) return;
    const doc = env.store.getState().document;
    void ask(
      async (model) => describeQuestion(model, await picture(shown.src), { page: doc.title, words: wordsNear(block, doc), library: item.alt }),
      imageTextFrom,
      "The model's answer held no description. Try again.",
    );
  };
  const use = (result: { alt: string } | { decorative: true }, described: string) => {
    const now = locate(env.store.getState().document, block.id)?.block;
    // Written for an image that is no longer there: nothing is taken.
    if (now?.type !== "image" || (now.props.mediaId ?? now.props.url ?? "") !== described) {
      reset();
      return;
    }
    const updates: Updates = "alt" in result ? { alt: result.alt, decorative: REMOVE } : { decorative: true, alt: REMOVE };
    if (run(asAssistants(makeSetProps(env.store.getState().document, block.id, updates))) === null) reset();
  };
  return (
    <section className="field as-tool" aria-labelledby={`${id}-title`}>
      <span className="label" id={`${id}-title`}><Icon name="sparkles" />Describe the image</span>
      {held === null ? <NoKey what="Write its alt text" />
        : !item ? <p className="hint">Only an image of the library can be described.</p>
        : step.phase === "asking" ? <Asking onStop={stop} />
        : step.phase === "failed" ? <Failed error={step.error} tally={step.tally} onAgain={describe} />
        : step.phase === "shown" ? (
          <div className="as-suggestion">
            <div className="as-suggested" aria-label="The alt text proposed">
              <p>{"alt" in step.result ? step.result.alt : "Decorative: it adds nothing the page needs, so screen readers skip it."}</p>
            </div>
            <Choices onUse={() => use(step.result, step.source)} onAgain={describe} onDiscard={reset} />
            <Spent tally={step.tally} />
          </div>
        ) : (
          <>
            <button className="btn btn-small btn-secondary" type="button" onClick={describe}>Write its alt text</button>
            <p className="hint">The model looks at the picture, smaller, and at the words beside it.</p>
          </>
        )}
    </section>
  );
}
