// The left tray's Edit view: the panel of the selected block, with its
// three tabs, or, with nothing selected, the page's own (design/shots,
// editor.png and empty.png).
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { makeSetPage, REMOVE } from "../../document/commands.ts";
import type { Block, WidgetBlock } from "../../shared/document.ts";
import type { FieldError } from "../../storage/adapter.ts";
import { WIDGET_PANELS } from "../../widgets/panels.ts";
import { widgetDefinition } from "../../widgets/registry.ts";
import { WidgetIcon } from "../../widgets/icon.tsx";
import { describedBy, ErrorList, TextField, useFieldClaims } from "../controls.tsx";
import { useEditor, useEnv, useRun, useUi } from "../context.tsx";
import { explain } from "../errors.ts";
import { Icon } from "../icons.tsx";
import { blockName, placeLine } from "../names.ts";
import { useSession } from "../session.tsx";
import { PANEL_TABS, type PanelTab } from "../ui-store.ts";
import { AdvancedTab } from "./AdvancedTab.tsx";
import { useBlock } from "./hooks.ts";
import { StyleTab } from "./StyleTab.tsx";
import { ColumnContent, SectionContent } from "./structure.tsx";

export function EditPanel() {
  const selection = useEditor((s) => s.selection);
  return selection === null ? <PagePanel /> : <BlockPanel id={selection} />;
}

// ------------------------------------------------------------- the page

export function PagePanel() {
  const title = useEditor((s) => s.document.title);
  const description = useEditor((s) => s.document.description);
  const { store } = useEnv();
  const run = useRun();
  return (
    <>
      <div className="ed-title">
        <span className="ed-icon"><Icon name="page" className="i i-tile" /></span>
        <div><strong>Page</strong><span>Nothing selected, so you are editing the page</span></div>
      </div>
      <div className="tray-body">
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
        <TextField
          label="Description in search results"
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
      ? `Visitors will find the page at /${current.slug} once it is published.`
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

const TAB_NAMES: Readonly<Record<PanelTab, string>> = { content: "Content", style: "Style", advanced: "Advanced" };

function blockIcon(block: Block) {
  if (block.type === "section") return <Icon name="section" className="i i-tile" />;
  if (block.type === "column") return <Icon name="column" className="i i-tile" />;
  return <WidgetIcon icon={widgetDefinition(block.type).icon} />;
}

export function BlockPanel({ id }: { id: string }) {
  const block = useBlock(id);
  const doc = useEditor((s) => s.document);
  const tab = useUi((u) => u.panelTab);
  const { ui } = useEnv();
  const serverErrors = useUi((u) => u.serverErrors);
  const { provider, claimed } = useFieldClaims();
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  if (!block) return null;

  const name = block.type === "section" ? "Section" : blockName(doc, block.id);
  const unclaimed = serverErrors.filter((e) => e.blockId === block.id && !claimed.has(e.field));
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + PANEL_TABS.length) % PANEL_TABS.length;
    ui.getState().setPanelTab(PANEL_TABS[next]!);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div className="ed-title">
        <span className="ed-icon">{blockIcon(block)}</span>
        <div><strong>{name}</strong><span>{placeLine(doc, block.id)}</span></div>
      </div>
      <div className="subtabs" role="tablist" aria-label={`${name} properties`}>
        {PANEL_TABS.map((t, index) => (
          <button
            key={t}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`${tabsId}-${t}`}
            role="tab"
            type="button"
            aria-selected={t === tab}
            aria-controls={`${tabsId}-panel`}
            tabIndex={t === tab ? 0 : -1}
            onClick={() => ui.getState().setPanelTab(t)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {TAB_NAMES[t]}
          </button>
        ))}
      </div>
      <div className={`tray-body${tab === "style" ? " tray-body-dense" : ""}`} role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {unclaimed.length > 0 && (
          <div className="field">
            <p className="note"><Icon name="warning" /><span>The server refused the last save of this {block.type === "section" || block.type === "column" ? block.type : "widget"}:</span></p>
            <ErrorList id={`${tabsId}-unclaimed`} errors={unclaimed.map((e) => e.message)} />
          </div>
        )}
        {provider(
          // A new panel for each block, so a field never shows another
          // block's text while it is being typed.
          <TabBody key={`${block.id} ${tab}`} block={block} tab={tab} />,
        )}
      </div>
    </>
  );
}

function TabBody({ block, tab }: { block: Block; tab: PanelTab }) {
  if (tab === "style") return <StyleTab block={block} />;
  if (tab === "advanced") return <AdvancedTab block={block} />;
  if (block.type === "section") return <SectionContent block={block} />;
  if (block.type === "column") return <ColumnContent block={block} />;
  return <WidgetContent block={block} />;
}

// The widget's own Content tab, from its folder. The map is keyed by
// type, so the panel given a block is the one written for that type.
function WidgetContent({ block }: { block: WidgetBlock }) {
  const Content = WIDGET_PANELS[block.type].Content as unknown as ComponentType<{ block: WidgetBlock }>;
  return <Content block={block} />;
}
