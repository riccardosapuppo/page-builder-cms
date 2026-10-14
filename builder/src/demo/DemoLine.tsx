// The demo's line at the bottom of the window, under the editor's bottom
// line and under each page the demo draws: what the demo is, and where the
// source is, word for word as the project gives it; and who made it, as
// About says it, beside the author's photograph. Under the editor it also
// says when a newer edition of the example site is out and this browser
// kept the pages its visitor worked on (../storage/example-site.ts), with
// the way to start over with the new one, asked twice, since it replaces
// those pages.
import { useState, useSyncExternalStore } from "react";
import type { ExampleOutcome } from "../storage/example-site.ts";
import photograph from "./riccardo-sapuppo.webp";

export const SOURCE_ADDRESS = "https://github.com/riccardosapuppo/page-builder-cms";

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
  return (
    <aside className="demo-line chrome" aria-label="About this demo">
      <div className="demo-line-row">
        <p>
          Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching.{" "}
          <a href={SOURCE_ADDRESS}>Source on GitHub</a>.
        </p>{" "}
        <p className="demo-credit">
          <img src={photograph} alt="" width="18" height="18" />
          Developed by Riccardo Sapuppo
        </p>
      </div>
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
