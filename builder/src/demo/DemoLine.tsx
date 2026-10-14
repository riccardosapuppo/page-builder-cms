// The demo's line at the bottom of the window, under the editor's bottom
// line and under each page the demo draws: what the demo is, and where the
// source is, word for word as the project gives it; and who made it, as
// About says it, beside the author's face in a disc, a link to the
// author's site. Under the editor it also says when a newer edition of the example
// site is out and this browser kept the pages its visitor worked on
// (../storage/example-site.ts), with the way to start over with the new
// one, asked twice, since it replaces those pages.
//
// Its key at the end shuts the line down to who made it, one line, and
// opens it again; the browser keeps the choice for the editor and the
// pages alike. An offer of a newer example site shows either way.
import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "../editor/icons.tsx";
import type { ExampleOutcome } from "../storage/example-site.ts";
import photograph from "./riccardo-sapuppo.webp";

export const SOURCE_ADDRESS = "https://github.com/riccardosapuppo/page-builder-cms";
export const AUTHOR_ADDRESS = "https://riccardosapuppo.com";

// What the browser keeps once the line is shut, and takes back when it is
// opened again.
export const SHUT_KEY = "page-builder-cms:demo-line";

function keptShut(): boolean {
  try {
    return localStorage.getItem(SHUT_KEY) === "shut";
  } catch {
    return false;
  }
}

function keepShut(shut: boolean): void {
  try {
    if (shut) localStorage.setItem(SHUT_KEY, "shut");
    else localStorage.removeItem(SHUT_KEY);
  } catch {
    // A browser that keeps nothing shows the whole line again next time.
  }
}

// What the seed found on this visit, once it is known.
export interface SeedNews {
  get(): ExampleOutcome | null;
  subscribe(listener: () => void): () => void;
}

export function seedNews(): SeedNews & { set(outcome: ExampleOutcome): void } {
  let outcome: ExampleOutcome | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => outcome,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      outcome = next;
      for (const listener of listeners) listener();
    },
  };
}

const nothing: SeedNews = { get: () => null, subscribe: () => () => undefined };

export function DemoLine({ news = nothing, startOver }: { news?: SeedNews; startOver?: () => Promise<void> }) {
  const outcome = useSyncExternalStore(news.subscribe, news.get);
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [shut, setShut] = useState(keptShut);
  const wordsId = useId();
  return (
    <aside className="demo-line chrome" aria-label="About this demo" data-shut={shut ? "" : undefined}>
      <div className="demo-line-row">
        {!shut && (
          <p id={wordsId} className="demo-words">
            Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching.{" "}
            <a href={SOURCE_ADDRESS}>Source on GitHub</a>.
          </p>
        )}{" "}
        <p className="demo-credit">
          <a href={AUTHOR_ADDRESS} rel="author">
            <span className="demo-face"><img src={photograph} alt="" width="20" height="20" /></span>
            <span>Developed by <span className="demo-credit-name">Riccardo Sapuppo</span></span>
          </a>
        </p>
      </div>
      <button
        type="button"
        className="demo-line-key"
        aria-label="About this demo"
        aria-expanded={!shut}
        aria-controls={shut ? undefined : wordsId}
        title={shut ? "Show what this demo is" : "Hide what this demo is"}
        onClick={() => {
          keepShut(!shut);
          setShut(!shut);
        }}
      >
        <Icon name={shut ? "chevron-down" : "close"} className="i" />
      </button>
      {outcome === "newer kept" && startOver && (
        <p className="demo-newer">
          {asking ? (
            <>
              Start over with the new example site? The pages you changed in this browser are replaced.{" "}
              <button
                type="button"
                className="demo-line-button"
                disabled={starting}
                onClick={() => {
                  setStarting(true);
                  startOver().catch(() => setStarting(false));
                }}
              >
                Start over
              </button>{" "}
              <button type="button" className="demo-line-button" disabled={starting} onClick={() => setAsking(false)}>Keep my pages</button>
            </>
          ) : (
            <>
              A newer example site is out; this browser kept the pages you changed.{" "}
              <button type="button" className="demo-line-button" onClick={() => setAsking(true)}>Start over with it</button>
            </>
          )}
        </p>
      )}
    </aside>
  );
}
