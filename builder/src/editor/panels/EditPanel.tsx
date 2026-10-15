// The sidebar's panels (../Sidebar.tsx): the Page tab's, the page's own
// settings, and the Block tab's, the selected block's, each under its
// collapsible groups (./groups.tsx; design/layout/, the editor and
// page-tab states).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { makeInsertItems, makeSetPage, REMOVE } from "../../document/commands.ts";
import { leadsTo, linkTargets } from "../../document/links.ts";
import { TYPE_NAMES } from "../../document/labels.ts";
import type { Block, PageDocument } from "../../shared/document.ts";
import type { BlockFieldError, FieldError, PartKind } from "../../storage/adapter.ts";
import { MAX_ITEMS } from "../../widgets/menu/panel.tsx";
import { widgetDefinition } from "../../widgets/registry.ts";
import { WidgetIcon } from "../../widgets/icon.tsx";
import { describedBy, ErrorList, SelectField, TextField, Toggle, useFieldClaims } from "../controls.tsx";
import { runCommand } from "../act.ts";
import { inOrder, previewedEntry } from "../collections/content.ts";
import { useSiteCollection } from "../collections/use-content.ts";
import { useEditor, useEnv, useRun, useUi, type EditorEnv } from "../context.tsx";
import { deviceOf } from "../device-style.ts";
import { explain } from "../errors.ts";
import { Icon } from "../icons.tsx";
import { blockName, fromLine, placeLine } from "../names.ts";
import { siteAddress } from "../Publish.tsx";
import { PART_NAMES, partOf, publishWords, templateOf, useKeptWords, useSession, type Session } from "../session.tsx";
import { openSiteStyle } from "../Sidebar.tsx";
import { GroupList, StaticGroups, useBlockGroups, type GroupSpec } from "./groups.tsx";
import { useBlock } from "./hooks.ts";
import { DEVICE_WORDS } from "./StyleFields.tsx";

// ------------------------------------------------------------- the parts

// The Page tab of the site's header or footer, which has no title,
// address or description of its own: what it is and where it shows,
// whether it is published, and the way back to the page drawn around it;
// then `after`, the way to the site style.
export function PartPanel({ kind, after }: { kind: PartKind; after?: ReactNode }) {
  const { ui } = useEnv();
  const session = useSession();
  const around = useUi((u) => u.aroundPart);
  const name = PART_NAMES[kind];
  const published = session.current?.published ?? null;
  const live = session.capabilities.livePages;
  const back = around ?? (() => {
    const home = session.pages.find((page) => page.home) ?? session.pages[0];
    return home ? { id: home.id, title: home.title } : null;
  })();
  const where = kind === "header" ? "above" : "below";
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon"><Icon name="globe" className="i i-tile" /></span>
        <div><strong>{name}</strong><span>{published ? "On every page, published" : "On every page, not published yet"}</span></div>
      </div>
      <div className="sb-body sb-body-pad part-panel">
        <p>The {kind} is drawn on every page, {where} its sections. Build it as you build a page: sections, columns and blocks. Logo and Menu are in Insert, under Site.</p>
        <p>{live ? `Publish puts it on every page at once.` : `Publish puts it on every page shown in this browser.`} {published ? "" : `Until then, every page shows the ${kind} the site started with.`}</p>
        {kind === "header" && <StickyHeader />}
        {back && (
          <button
            className="btn btn-secondary btn-block"
            type="button"
            data-part-back=""
            onClick={() => void session.openPage(back.id).then((why) => {
              if (why) ui.getState().say(why);
            })}
          >
            <Icon name="arrow-left" />Back to {back.title}
          </button>
        )}
        {after}
      </div>
    </>
  );
}

// The Page tab of a collection's template, which has no address of its
// own: what it is (the page every entry of its collection is drawn in,
// between the site's header and footer), how it goes live, the way to its
// collection in Collections, and the way back to the page it was opened
// from; then `after`, the way to the site style.
export function TemplatePanel({ after }: { after?: ReactNode }) {
  const { ui } = useEnv();
  const session = useSession();
  const around = useUi((u) => u.aroundPart);
  const current = session.current;
  const of = current ? templateOf(current) : "its collection";
  const published = current?.published ?? null;
  const live = session.capabilities.livePages;
  const owner = current?.collection ?? null;
  const back = around ?? (() => {
    const home = session.pages.find((page) => page.home) ?? session.pages[0];
    return home ? { id: home.id, title: home.title } : null;
  })();
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon"><Icon name="collection" className="i i-tile" /></span>
        <div><strong>Template of {of}</strong><span>{published ? "For every entry, published" : "For every entry, not published yet"}</span></div>
      </div>
      <div className="sb-body sb-body-pad part-panel">
        <p>{`${live ? "Every" : "In the full system, every"} entry of ${of} is drawn with this template at its own address${owner ? `, /${owner.prefix}/<slug>` : ""}, between the site’s header and footer.`} Build it as you build a page: sections, columns and blocks; the entry’s own values are Field blocks, in Insert under This entry.</p>
        <p>{live ? "Publish puts it to use for every entry at once." : "Publish keeps it as published in this browser."}</p>
        {owner && <PreviewEntry collectionId={owner.id} name={owner.name} />}
        {owner && (
          <button className="btn btn-secondary btn-block" type="button" data-template-collection="" onClick={() => ui.getState().setCollections({ collectionId: owner.id, tab: "settings" })}>
            <Icon name="collection" />{owner.name} in Collections
          </button>
        )}
        {back && (
          <button
            className="btn btn-secondary btn-block"
            type="button"
            data-part-back=""
            onClick={() => void session.openPage(back.id).then((why) => {
              if (why) ui.getState().say(why);
            })}
          >
            <Icon name="arrow-left" />Back to {back.title}
          </button>
        )}
        {after}
      </div>
    </>
  );
}

// The entry the template is drawn with on the canvas and in its preview:
// any of its collection's, in the collection's own order, a draft too, or
// values made up from the fields' types; the first published one until
// another is picked, and the made-up values while the collection has
// none. What visitors see is each entry's own page.
function PreviewEntry({ collectionId, name }: { collectionId: number; name: string }) {
  const { ui } = useEnv();
  const shown = useSiteCollection(collectionId);
  const picked = useUi((u) => u.previewEntry);
  if (!shown) return null;
  const choice = picked?.collectionId === collectionId ? picked.choice : null;
  const entry = previewedEntry(shown.collection, shown.entries, choice);
  const choices = [
    ...inOrder(shown.collection, shown.entries).map((one) => ({ value: String(one.id), label: one.published ? one.title : `${one.title} (draft)` })),
    { value: "sample", label: "Sample values" },
  ];
  return (
    <SelectField
      label="Preview with"
      choices={choices}
      value={entry ? String(entry.id) : "sample"}
      field="/preview-entry"
      hint={shown.entries.length === 0 ? `${name} has no entry yet: the canvas draws values made up from each field’s type.` : "Its draft, on the canvas and in Preview. Each entry’s own page shows what that entry published."}
      onChange={(value) => {
        ui.getState().setPreviewEntry({ collectionId, choice: value === "sample" ? "sample" : Number(value) });
        return null;
      }}
    />
  );
}

// Whether the header stays at the top of the window while the page
// scrolls under it: a setting of the header's own document, published with
// it, one step of history.
function StickyHeader() {
  const sticky = useEditor((s) => s.document.sticky === true);
  const { store } = useEnv();
  const run = useRun();
  const hint = useId();
  return (
    <div className="field part-sticky">
      <Toggle
        label="Sticky header"
        checked={sticky}
        blockId={null}
        field="/sticky"
        describedById={hint}
        onChange={(on) => run(makeSetPage(store.getState().document, { sticky: on ? true : REMOVE }))}
      />
      <p className="hint" id={hint}>{sticky ? "Stays at the top of the window while the page scrolls under it." : "Scrolls away with the page. On, it stays at the top of the window."}</p>
    </div>
  );
}

// ------------------------------------------------------------- the page

// The page's own settings in two groups, Title and address and Search
// results, every one open until the person closes it; then `after`, the
// way to the site style.
export function PagePanel({ after }: { after?: ReactNode }) {
  const title = useEditor((s) => s.document.title);
  const description = useEditor((s) => s.document.description);
  const { store } = useEnv();
  const run = useRun();
  const session = useSession();
  const current = session.current;
  const words = publishWords(session.capabilities.livePages);
  const all = useUi((u) => u.serverErrors);
  const errors = useMemo(() => all.filter((e) => e.blockId === null), [all]);
  const line = !current
    ? "This page’s own settings"
    : current.home
      ? words.homeLine
      : `/${current.slug}, ${current.published ? "published" : "not published yet"}`;
  const specs: GroupSpec[] = [
    {
      id: "title",
      name: "Title and address",
      keys: [],
      holds: (field) => field === "/title",
      summary: current ? `${title}, /${current.home ? "" : current.slug}` : title,
      body: (
        <>
          <TextField
            label="Title"
            value={title}
            blockId={null}
            field="/title"
            rules={{ kind: "line", maxLength: 120 }}
            hint={words.searchTitle}
            onCommit={(next) => run(makeSetPage(store.getState().document, { title: next }))}
          />
          <AddressField />
          <NotLinked />
        </>
      ),
    },
    {
      id: "search",
      name: "Search results",
      keys: [],
      holds: (field) => field === "/description",
      summary: description ?? "No description yet",
      body: (
        <TextField
          label="Description"
          multiline
          rows={3}
          value={description ?? ""}
          placeholder="One or two sentences about this page"
          blockId={null}
          field="/description"
          rules={{ kind: "line", maxLength: 160 }}
          hint={words.searchText}
          onCommit={(next) => run(makeSetPage(store.getState().document, { description: next.trim() === "" ? REMOVE : next }))}
        />
      ),
    },
  ];
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon"><Icon name="page" className="i i-tile" /></span>
        <div><strong>{title}</strong><span>{line}</span></div>
      </div>
      <div className="sb-body">
        <GroupList owner="page" specs={specs} openFirst={() => true} style={null} errors={errors} />
        {after}
      </div>
    </>
  );
}

// A page, not the home page, that neither the header nor the footer links
// to: visitors reach it only from a link on another page, or by its
// address, which is easy to miss once the page is made. Said under the
// address, with one click that opens the header and adds the page at the
// end of its menu, for the person to publish the header.
function NotLinked() {
  const env = useEnv();
  const session = useSession();
  const title = useEditor((s) => s.document.title);
  const parts = useUi((u) => u.parts);
  const current = session.current;
  if (!current || current.kind !== "page" || current.home || current.slug === null) return null;
  // Until the header and footer are read, nothing is known of their links.
  if (parts.header === null && parts.footer === null) return null;
  const paths = [`/${current.slug}`, ...(current.published && current.published.slug !== current.slug ? [`/${current.published.slug}`] : [])];
  const linked = [parts.header, parts.footer].some((doc) => doc !== null && linkTargets(doc).some((href) => paths.some((path) => leadsTo(href, path))));
  if (linked) return null;
  const header = partOf(session, "header");
  return (
    <div className="override not-linked">
      <Icon name="link" />
      <p>Neither the header nor the footer links to this page: visitors reach it only from a link on another page, or by its address.</p>
      {header && (
        <button className="btn btn-small btn-secondary" type="button" onClick={() => void addToHeaderMenu(env, session, title, `/${current.slug}`)}>
          Add it to the header’s menu
        </button>
      )}
    </div>
  );
}

// The block of a type that comes first in a document, if any.
function firstOfType(doc: PageDocument, type: Block["type"]): Block | null {
  const walk = (blocks: readonly Block[]): Block | null => {
    for (const block of blocks) {
      if (block.type === type) return block;
      const inside = walk(block.children as readonly Block[]);
      if (inside) return inside;
    }
    return null;
  };
  return walk(doc.sections as readonly Block[]);
}

// Opens the header, as its link in the Page tab does, and adds the page
// at the end of its menu, the menu then selected and its links in the
// sidebar; the sentence says the header waits to be published.
export async function addToHeaderMenu(env: EditorEnv, session: Session, title: string, path: string): Promise<void> {
  const header = partOf(session, "header");
  if (!header) return;
  const why = await session.openPage(header.id);
  const say = (words: string) => env.ui.getState().say(words);
  if (why) {
    say(why);
    return;
  }
  // Another page opened meanwhile, chosen while the header was on its way:
  // its menus are not the header's.
  if (!session.isOpen(header.id)) return;
  const menu = firstOfType(env.store.getState().document, "menu");
  if (!menu || menu.type !== "menu") {
    say(`The header has no menu yet: add one from Insert, with a link to ${path}.`);
    return;
  }
  env.store.getState().select(menu.id);
  env.ui.setState({ tray: "edit", sideTab: null });
  if (menu.props.items.length >= MAX_ITEMS) {
    say(`The header’s menu holds ${MAX_ITEMS} links, the most it takes: remove one, then add ${path}.`);
    return;
  }
  const label = [...title.trim()].slice(0, 40).join("").trim() || path;
  if (runCommand(env, (doc) => makeInsertItems(doc, menu.id, menu.props.items.length, [{ label, href: path }]), "panel") !== null) return;
  say(`${label} is the last link of the header’s menu now. Publish the header to put it on every page.`);
}

// The page's address is the page's, not the document's: it changes
// through the storage adapter, and takes effect at the next publish.
function AddressField() {
  const session = useSession();
  const current = session.current;
  const id = useId();
  const [draft, setDraft] = useState(current?.slug ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(current?.slug ?? "");
  }, [current?.slug]);
  if (!current) return null;

  const commit = async () => {
    const next = draft.trim().replace(/^\/+/, "");
    if (next === current.slug || busy) return;
    setBusy(true);
    const problems: FieldError[] | null = await session.setSlug(next);
    setBusy(false);
    setErrors(problems ? problems.map((p) => explain(p.keyword, p.message, { kind: "slug", maxLength: 64 })) : []);
  };
  const live = current.published ? (current.home ? "/" : `/${current.published.slug}`) : null;
  // Where the storage serves pages, the address is where visitors find the
  // page. Where it only keeps them (the browser demo) the address is the
  // one the full system would serve it at: nothing here is served, so
  // nothing here redirects either.
  const serves = session.capabilities.livePages;
  const hint = !serves
    ? current.home
      ? "This is the home page. In the full system, visitors find it at the site’s root address, /."
      : live === null
        ? `In the full system, the page will be at /${current.slug} once it is published.`
        : live === `/${current.slug}`
          ? `Published in this browser as ${live}.`
          : `Published in this browser as ${live}; the next publish uses /${current.slug}.`
    : current.home
      ? "This is the home page: visitors find it at the site’s root address, /."
      : live === null
        ? siteAddress(`/${current.slug}`, session.cmsOrigin)
        : live === `/${current.slug}`
          ? `Visitors find the page at ${live}.`
          : `Live at ${live}; the next publish moves it to /${current.slug}, and the old address leads to the new one.`;
  return (
    <div className={`field${errors.length > 0 ? " field-error" : ""}`}>
      <label className="label" htmlFor={id}>Address</label>
      <div className="input input-icon">
        <span className="input-prefix" aria-hidden="true">/</span>
        <input
          id={id}
          type="text"
          spellCheck={false}
          value={draft}
          aria-invalid={errors.length > 0 ? true : undefined}
          aria-describedby={describedBy(id, hint, errors)}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
            void commit();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") void commit();
          }}
        />
      </div>
      <p className="hint" id={`${id}-hint`}>{busy ? "Saving the address…" : hint}</p>
      <ErrorList id={`${id}-error`} errors={errors} />
    </div>
  );
}

// ------------------------------------------------------------ a block

function blockIcon(block: Block) {
  if (block.type === "section") return <Icon name="section" className="i i-tile" />;
  if (block.type === "column") return <Icon name="column" className="i i-tile" />;
  return <WidgetIcon icon={widgetDefinition(block.type).icon} />;
}

export function BlockPanel({ id }: { id: string }) {
  const block = useBlock(id);
  const doc = useEditor((s) => s.document);
  const serverErrors = useUi((u) => u.serverErrors);
  const preview = useUi((u) => u.preview);
  const { ui } = useEnv();
  const { provider, claimed } = useFieldClaims();
  const listId = useId();
  const kept = useKeptWords();
  if (!block) return null;

  const name = block.type === "section" ? "Section" : blockName(doc, block.id);
  const own = serverErrors.filter((e) => e.blockId === block.id);
  const unclaimed = own.filter((e) => !claimed.has(e.field));
  const device = deviceOf(preview);
  // Blocks with words of their own, which no device changes.
  const words = !["section", "column", "divider", "spacer"].includes(block.type);

  return (
    <>
      <div className="ed-title">
        <span className="ed-icon">{blockIcon(block)}</span>
        <div><strong>{name}</strong><span>{placeLine(doc, block.id)}</span></div>
      </div>
      {device !== "base" && (
        <p className="note device-note">
          <Icon name={device} />
          <span>Editing for <strong>{device}</strong>. Changes to its look apply to {DEVICE_WORDS[device].plural} only{words ? "; its words are the same everywhere" : ""}.</span>
        </p>
      )}
      <div className="sb-body">
        {unclaimed.length > 0 && (
          <div className="field sb-refused">
            <p className="note"><Icon name="warning" /><span>{kept.Server} refused the last save of this {block.type === "section" || block.type === "column" ? block.type : "widget"}:</span></p>
            <ErrorList id={`${listId}-unclaimed`} errors={unclaimed.map((e) => e.message)} />
          </div>
        )}
        {provider(
          // New groups for each block, so a field never shows another
          // block's text while it is being typed.
          <BlockGroups key={block.id} block={block} errors={own} />,
        )}
        <p className="sb-foot-hint">
          Closed groups show their current value. Colors and sizes come from{" "}
          <button className="link link-inline" type="button" onClick={() => openSiteStyle(ui)}>Site style</button>.
        </p>
      </div>
    </>
  );
}

function BlockGroups({ block, errors }: { block: Block; errors: readonly BlockFieldError[] }) {
  const specs = useBlockGroups(block);
  return <GroupList owner={block.type} specs={specs} openFirst={(index) => index === 0} style={block.style} errors={errors} />;
}

// ------------------------------------------------------- a block moving

// The Block tab while a block is dragged (design/layout/, the drag state):
// what it is and where it comes from, its groups closed with their values
// and out of reach, and why. The page is about to change under the drag, so
// nothing is edited until the block is dropped, or put back with Esc.
export const SETTINGS_WAIT = "Settings wait while you move the block. Drop it, or press Esc.";

export function MovingPanel() {
  const source = useEditor((s) => s.drag?.source ?? null);
  if (!source) return null;
  return source.kind === "block" ? <MovingBlock id={source.id} /> : <AddingBlock block={source.block} />;
}

function MovingBlock({ id }: { id: string }) {
  const block = useBlock(id);
  const doc = useEditor((s) => s.document);
  if (!block) return null;
  const name = blockName(doc, block.id);
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon">{blockIcon(block)}</span>
        <div><strong>{name}</strong><span>Moving, from {fromLine(doc, block.id)}</span></div>
      </div>
      <div className="sb-body sb-body-muted" role="group" aria-label={`${name}, being moved`}>
        <MovingGroups block={block} />
        <p className="sb-foot-hint">{SETTINGS_WAIT}</p>
      </div>
    </>
  );
}

function MovingGroups({ block }: { block: Block }) {
  const specs = useBlockGroups(block);
  return <StaticGroups specs={specs} style={block.style} />;
}

// A new block from Insert on its way to the page: it has no place to come
// from, and no settings until it is dropped.
function AddingBlock({ block }: { block: Block }) {
  const name = block.type === "section" ? "Section" : TYPE_NAMES[block.type];
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon">{blockIcon(block)}</span>
        <div><strong>{name}</strong><span>Adding to the page</span></div>
      </div>
      <div className="sb-body sb-body-muted">
        <p className="sb-foot-hint">Settings wait while you add the block. Drop it, or press Esc.</p>
      </div>
    </>
  );
}
