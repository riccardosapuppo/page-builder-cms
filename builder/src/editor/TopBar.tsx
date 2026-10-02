// The top bar of the approved design (design/shots/editor.png): the mark
// and its menu, the open page and the switch to another one, whether the
// page is live, the device the canvas previews, and where the edits are.
//
// What the design draws here and the editor does not have yet is not drawn
// (no control that does nothing): undo, redo, history, site style,
// preview and Publish come with the parts of the editor that do them.
import { useRef, useState, useSyncExternalStore } from "react";
import type { SaveSnapshot } from "../storage/autosave.ts";
import { useEnv, useUi } from "./context.tsx";
import { Icon, Mark } from "./icons.tsx";
import { Menu } from "./Menu.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { useSession, type OpenPage } from "./session.tsx";
import { PREVIEWS, type Preview } from "./ui-store.ts";
import { PREVIEW_WIDTHS } from "../shared/preview-widths.ts";

const PREVIEW_LABELS: Readonly<Record<Preview, { name: string; title: string; icon: "desktop" | "tablet" | "phone" }>> = {
  desktop: { name: "Desktop", title: "Desktop: the canvas at its full width", icon: "desktop" },
  tablet: { name: "Tablet", title: `Tablet: the canvas at ${PREVIEW_WIDTHS.tablet} wide`, icon: "tablet" },
  phone: { name: "Phone", title: `Phone: the canvas at ${PREVIEW_WIDTHS.phone} wide`, icon: "phone" },
};

// "Sep 28 at 7:02 AM", in the editor's one locale.
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

export function TopBar() {
  const session = useSession();
  const { ui } = useEnv();
  const preview = useUi((u) => u.preview);
  const title = useSessionTitle();
  const [menu, setMenu] = useState<"app" | "pages" | null>(null);
  const [creating, setCreating] = useState(false);
  const markButton = useRef<HTMLButtonElement>(null);
  const pageButton = useRef<HTMLButtonElement>(null);
  const current = session.current;

  return (
    <header className="topbar chrome">
      <div className="tb-left">
        <button
          ref={markButton}
          className="tb-mark"
          type="button"
          aria-label="Page Builder CMS menu"
          aria-haspopup="menu"
          aria-expanded={menu === "app"}
          onClick={() => setMenu(menu === "app" ? null : "app")}
        >
          <Mark />
          <Icon name="chevron-down" className="i i-xs" />
        </button>
        {menu === "app" && (
          <Menu label="Page Builder CMS" className="menu-app" button={markButton} onClose={() => setMenu(null)}>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => setMenu("pages")}>
              <Icon name="page" /><span>All pages</span>
            </button>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); setCreating(true); }}>
              <Icon name="plus" /><span>New page…</span>
            </button>
          </Menu>
        )}
        <button
          ref={pageButton}
          className="tb-page"
          type="button"
          aria-label={current ? `Switch page. Open: ${title}` : "Pages"}
          aria-haspopup="menu"
          aria-expanded={menu === "pages"}
          onClick={() => setMenu(menu === "pages" ? null : "pages")}
        >
          <Icon name="page" />
          <span className="tb-page-title">{current ? title : "Pages"}</span>
          {current && !current.home && <span className="tb-page-path">/{current.slug}</span>}
          <Icon name="chevron-down" className="i i-xs" />
        </button>
        {menu === "pages" && (
          <Menu label="Pages" className="menu-pages" button={pageButton} onClose={() => setMenu(null)}>
            {session.pages.map((page) => (
              <button
                key={page.id}
                className="menu-item menu-item-rich"
                role="menuitem"
                type="button"
                tabIndex={-1}
                aria-current={current?.id === page.id ? "page" : undefined}
                onClick={() => {
                  setMenu(null);
                  if (current?.id !== page.id) void session.openPage(page.id).then((why) => ui.getState().say(why));
                }}
              >
                <Icon name="page" />
                <span><strong>{current?.id === page.id ? title : page.title}</strong><small>{page.home ? "/, the home page" : `/${page.slug}`}{page.published ? "" : ", not published yet"}</small></span>
              </button>
            ))}
            {session.pages.length > 0 && <hr className="menu-sep" />}
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); setCreating(true); }}>
              <Icon name="plus" /><span>New page…</span>
            </button>
          </Menu>
        )}
        {current && <PublishedChip page={current} />}
      </div>

      <div className="tb-center">
        <div className="seg seg-devices" role="group" aria-label="Device">
          {PREVIEWS.map((p) => (
            <button key={p} type="button" aria-pressed={preview === p} title={PREVIEW_LABELS[p].title} onClick={() => ui.getState().setPreview(p)}>
              <Icon name={PREVIEW_LABELS[p].icon} />{PREVIEW_LABELS[p].name}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-right">
        {session.autosave && <SaveState />}
      </div>
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </header>
  );
}

// The open page's title as the document holds it now.
function useSessionTitle(): string {
  const { store } = useEnv();
  return useSyncExternalStore(store.subscribe, () => store.getState().document.title);
}

const NEVER: SaveSnapshot | null = null;
const noSubscription = () => () => {};

function useSaveSnapshot(): SaveSnapshot | null {
  const { autosave } = useSession();
  return useSyncExternalStore(autosave ? autosave.subscribe : noSubscription, autosave ? autosave.getSnapshot : () => NEVER);
}

// Whether visitors see the page, and how much of it: each save since the
// draft revision the live version was taken from is a change visitors do
// not see yet (the CMS's draftRevision), and a new address waits for the
// next publish too.
export function PublishedChip({ page }: { page: OpenPage }) {
  const snapshot = useSaveSnapshot();
  if (!page.published) {
    return <span className="chip chip-draft"><span className="dot-draft" aria-hidden="true" />Not published yet</span>;
  }
  const revision = snapshot?.revision ?? page.revision;
  const changes = Math.max(0, revision - page.published.draftRevision);
  const moved = page.published.slug !== page.slug && !page.home;
  const since = `Published ${when(page.published.publishedAt)}.`;
  if (changes > 0) {
    const what = `${changes} ${changes === 1 ? "change" : "changes"}`;
    return <span className="chip chip-draft" title={`${since} Your ${what} since then are saved but not live yet.`}><span className="dot-part" aria-hidden="true" />Published, {what} not live</span>;
  }
  if (moved) {
    return <span className="chip chip-draft" title={`${since} The page’s new address, /${page.slug}, is not live yet.`}><span className="dot-part" aria-hidden="true" />Published, new address not live</span>;
  }
  return <span className="chip chip-draft" title={since}><span className="dot-live" aria-hidden="true" />Published</span>;
}

// Where the edits are. The server's answers decide: saved means the server
// has every edit.
function SaveState() {
  const snapshot = useSaveSnapshot();
  if (!snapshot) return null;
  switch (snapshot.phase) {
    case "saved":
      return <span className="save-state" role="status" title={snapshot.savedAt ? `All changes saved at ${when(snapshot.savedAt)}` : undefined}><Icon name="check" />Saved</span>;
    case "waiting":
    case "saving":
      return <span className="save-state" role="status"><Icon name="spinner" className="i spin" />Saving…</span>;
    case "retrying":
      return <span className="save-state save-warn" role="status"><Icon name="warning" />Not saved, retrying</span>;
    case "conflict":
      return <span className="save-state save-warn" role="status"><Icon name="warning" />Changed in another tab</span>;
    case "invalid":
      return <span className="save-state save-err" role="status" title="The server refused a value: it is marked in the navigator and in the panel."><Icon name="error" />Not saved: a value was refused</span>;
    case "refused":
      return <span className="save-state save-err" role="status" title={snapshot.failure?.message}><Icon name="error" />Not saved</span>;
  }
}
