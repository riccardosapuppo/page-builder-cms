// The sidebar's panels (../Sidebar.tsx): the Page tab's, the page's own
// settings, and the Block tab's, the selected block's, each under its
// collapsible groups (./groups.tsx; design/layout/, the editor and
// page-tab states).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { makeSetPage, REMOVE } from "../../document/commands.ts";
import type { Block } from "../../shared/document.ts";
import type { BlockFieldError, FieldError } from "../../storage/adapter.ts";
import { cmsAddress } from "../../storage/config.ts";
import { widgetDefinition } from "../../widgets/registry.ts";
import { WidgetIcon } from "../../widgets/icon.tsx";
import { describedBy, ErrorList, TextField, useFieldClaims } from "../controls.tsx";
import { useEditor, useEnv, useRun, useUi } from "../context.tsx";
import { deviceOf } from "../device-style.ts";
import { explain } from "../errors.ts";
import { Icon } from "../icons.tsx";
import { blockName, placeLine } from "../names.ts";
import { shownAddress } from "../Publish.tsx";
import { useSession } from "../session.tsx";
import { openSiteStyle } from "../Sidebar.tsx";
import { GroupList, useBlockGroups, type GroupSpec } from "./groups.tsx";
import { useBlock } from "./hooks.ts";
import { DEVICE_WORDS } from "./StyleFields.tsx";

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
  const all = useUi((u) => u.serverErrors);
  const errors = useMemo(() => all.filter((e) => e.blockId === null), [all]);
  const line = !current
    ? "This page’s own settings"
    : current.home
      ? "The home page, the first one visitors see"
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
            hint="Shown in the browser tab and in search results."
            onCommit={(next) => run(makeSetPage(store.getState().document, { title: next }))}
          />
          <AddressField />
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
          hint="Search engines show it under the title. Up to 160 characters."
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
  const hint = current.home
    ? "This is the home page: visitors find it at the site’s root address, /."
    : live === null
      ? shownAddress(cmsAddress(`/${current.slug}`, session.cmsOrigin))
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
            <p className="note"><Icon name="warning" /><span>The server refused the last save of this {block.type === "section" || block.type === "column" ? block.type : "widget"}:</span></p>
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
