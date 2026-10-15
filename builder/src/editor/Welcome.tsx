// The first time the editor opens a page in a browser, a note under the
// page's title says what is open and where its changes go: the draft of
// that page, saved as it is edited and on the site only once published,
// or, in the browser demo, kept in this browser. Got it closes it for good
// in that browser. It takes no focus, and it is not drawn while the list of
// pages, which opens where it is, is open.
import { useId, useState } from "react";
import { cmsAddress } from "../storage/config.ts";
import { shownAddress } from "./Publish.tsx";
import { templateOf, useSession, type OpenPage } from "./session.tsx";
import { WELCOME_KEY } from "./welcome-key.ts";

function seen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "seen";
  } catch {
    return false;
  }
}

// What is open, as the note names it: "the home page, “Slack Water”",
// "“Winter series”, at /winter-series", "the header, on every page", "the
// template of News, drawn for every entry".
export function openWords(page: OpenPage, title: string): string {
  if (page.kind === "template") return `the template of ${templateOf(page)}, drawn for every entry`;
  if (page.kind !== "page") return `the ${page.kind}, on every page`;
  return page.home ? `the home page, “${title}”` : `“${title}”, at /${page.slug ?? ""}`;
}

export function Welcome({ title }: { title: string }) {
  const session = useSession();
  const [open, setOpen] = useState(() => !seen());
  const heading = useId();
  const page = session.current;
  if (!open || !page) return null;
  const close = () => {
    try {
      localStorage.setItem(WELCOME_KEY, "seen");
    } catch {
      // A browser that keeps nothing shows it again next time.
    }
    setOpen(false);
  };
  const site = session.cmsOrigin !== null && session.capabilities.livePages ? cmsAddress("/", session.cmsOrigin) : null;
  return (
    <section className="pop pop-welcome chrome" aria-labelledby={heading}>
      <h2 id={heading}>What you are editing</h2>
      <p>The draft of {openWords(page, title)}.</p>
      {site !== null
        ? <p>Changes save as you go. Visitors see them only once you press Publish, on the site at <a className="link link-inline" href={site} target="_blank" rel="noopener">{shownAddress(site)}</a>. Preview shows the draft as it would be published.</p>
        : <p>Changes save in this browser as you go. Publish keeps them as the published version, here in this browser: nothing goes online.</p>}
      <button className="btn btn-dark" type="button" onClick={close}>Got it</button>
    </section>
  );
}
