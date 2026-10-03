// The top bar of the approved design (design/shots/editor.png): the mark
// and its menu, the open page and the switch to another one, whether the
// page is live, Site style, the device the canvas previews, where the edits
// are, Preview and Publish.
//
// What the design draws here and the editor does not have yet is not drawn
// (no control that does nothing): undo, redo and the history come with
// stage 3.
import { useRef, useState, useSyncExternalStore } from "react";
import { useEnv, useUi } from "./context.tsx";
import { Icon, Mark } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps } from "./keymap.ts";
import { Menu } from "./Menu.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { changesNotLive, PreviewButton, PublishButton } from "./Publish.tsx";
import { changes, SaveState, useSaveSnapshot, when } from "./SaveStatus.tsx";
import { useSession, type OpenPage } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { PREVIEWS, type Preview } from "./ui-store.ts";
import { PREVIEW_WIDTHS } from "../shared/preview-widths.ts";

const PREVIEW_LABELS: Readonly<Record<Preview, { name: string; title: string; icon: "desktop" | "tablet" | "phone" }>> = {
  desktop: { name: "Desktop", title: "Desktop: the canvas at its full width", icon: "desktop" },
  tablet: { name: "Tablet", title: `Tablet: the canvas at ${PREVIEW_WIDTHS.tablet} wide`, icon: "tablet" },
  phone: { name: "Phone", title: `Phone: the canvas at ${PREVIEW_WIDTHS.phone} wide`, icon: "phone" },
};

export function TopBar() {
  const session = useSession();
  const { ui } = useEnv();
  const preview = useUi((u) => u.preview);
  const tray = useUi((u) => u.tray);
  const title = useSessionTitle();
  const [menu, setMenu] = useState<"app" | "pages" | null>(null);
  const [creating, setCreating] = useState(false);
  const markButton = useRef<HTMLButtonElement>(null);
  const pageButton = useRef<HTMLButtonElement>(null);
  const current = session.current;
  const siteStyleOpen = tray === "site-style";
  const toggleSiteStyle = (open: boolean) => ui.getState().setTray(open ? "site-style" : "edit");

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
            <button
              className="menu-item"
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                setMenu(null);
                toggleSiteStyle(true);
                // The menu goes; the focus goes to the panel it opened.
                requestAnimationFrame(() => document.querySelector<HTMLElement>(".site-style [data-autofocus]")?.focus());
              }}
            >
              <Icon name="style" /><span>Site style</span>
            </button>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => setMenu("pages")}>
              <Icon name="page" /><span>All pages</span>
            </button>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); markButton.current?.focus(); setCreating(true); }}>
              <Icon name="plus" /><span>New page…</span>
            </button>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} aria-keyshortcuts={ariaKeyShortcuts(entry("showShortcuts"))} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setShortcutsOpen(true); }}>
              <Icon name="keyboard" /><span>Keyboard shortcuts</span>
              <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(entry("showShortcuts"))} small /></span>
            </button>
            <hr className="menu-sep" />
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setAboutOpen(true); }}>
              <Icon name="info" /><span>About Page Builder CMS</span>
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
          <span className="tb-page-name">
            <span className="tb-page-title">{current ? title : "Pages"}</span>
            {current && !current.home && <span className="tb-page-path">/{current.slug}</span>}
          </span>
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
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); pageButton.current?.focus(); setCreating(true); }}>
              <Icon name="plus" /><span>New page…</span>
            </button>
          </Menu>
        )}
        {current && <PublishedChip page={current} />}
        <button className="btn btn-quiet" type="button" data-site-style="" aria-pressed={siteStyleOpen} title="The site's palette and type scale, for every page" onClick={() => toggleSiteStyle(!siteStyleOpen)}>
          <Icon name="style" />Site style
        </button>
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
        <PreviewButton />
        <PublishButton />
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

// Whether visitors see the page, and how much of it: each save since the
// draft revision the live version was taken from is a change visitors do
// not see yet (the CMS's draftRevision), and a new address waits for the
// next publish too.
export function PublishedChip({ page }: { page: OpenPage }) {
  const snapshot = useSaveSnapshot();
  if (!page.published) {
    return <span className="chip chip-draft"><span className="dot-draft" aria-hidden="true" />Not published yet</span>;
  }
  const notLive = changesNotLive(page, snapshot);
  const moved = page.published.slug !== page.slug && !page.home;
  const since = `Published ${when(page.published.publishedAt)}.`;
  if (notLive > 0) {
    const what = changes(notLive);
    return <span className="chip chip-draft" title={`${since} Your ${what} since then are saved but not live yet: Publish sends them.`}><span className="dot-part" aria-hidden="true" />Published, {what} not live</span>;
  }
  if (moved) {
    return <span className="chip chip-draft" title={`${since} The page’s new address, /${page.slug}, is not live yet: Publish sends it.`}><span className="dot-part" aria-hidden="true" />Published, new address not live</span>;
  }
  return <span className="chip chip-draft" title={since}><span className="dot-live" aria-hidden="true" />Published</span>;
}
