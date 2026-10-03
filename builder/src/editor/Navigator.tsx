// The navigator: the page's structure as a tree (design/shots/editor.png),
// sections holding columns holding widgets, in step with the selection
// both ways. Selecting a row selects the block on the canvas and brings it
// into view; selecting on the canvas opens the rows down to it and marks
// it here.
//
// The tree follows the ARIA tree pattern: one Tab stop, the arrows move
// along the rows shown (and the selection with them), Right opens a row or
// goes into it, Left closes it or goes up to its parent, Home and End go
// to the first and last row. A right click (or the menu key) on a row opens
// the block's menu; the editing keys of the keymap (./keys.ts) work on the
// selected row as on the canvas.
//
// Above and below the tree, the theme's header and footer, locked: the
// same on every page, never selected (the canvas draws them so).
//
// While a block is dragged the tree shows the store's preview: the
// dragged block as a line where it would land, its container marked.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { Block, PageDocument, StyleTokens } from "../shared/document.ts";
import { widgetDefinition } from "../widgets/registry.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { openBlockMenu } from "./BlockMenu.tsx";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { draggedName } from "./drag/marks.ts";
import { Icon } from "./icons.tsx";
import { focusBlock } from "./act.ts";
import { excerpt } from "./names.ts";

interface Row {
  block: Block;
  level: number;
  parent: string | null;
  hasChildren: boolean;
}

// The rows a reader sees: every section, and under an open row its children.
function visibleRows(doc: PageDocument, open: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const walk = (blocks: readonly Block[], level: number, parent: string | null) => {
    for (const block of blocks) {
      const children = block.children as readonly Block[];
      rows.push({ block, level, parent, hasChildren: children.length > 0 });
      if (children.length > 0 && open.has(block.id)) walk(children, level + 1, block.id);
    }
  };
  walk(doc.sections, 1, null);
  return rows;
}

// Hidden on some device: grayed out, so it can still be found.
function hiddenSomewhere(block: Block): boolean {
  const style = block.style as { base: StyleTokens; tablet?: StyleTokens; phone?: StyleTokens };
  return [style.base.visibility, style.tablet?.visibility, style.phone?.visibility].includes("hidden");
}

function countWidgets(doc: PageDocument): number {
  return doc.sections.reduce((sum, section) => sum + section.children.reduce((n, column) => n + column.children.length, 0), 0);
}

export function Navigator() {
  const env = useEnv();
  const { store, ui } = env;
  const doc = useEditor((s) => s.drag?.preview ?? s.document);
  const base = useEditor((s) => s.document);
  const drag = useEditor((s) => s.drag);
  // While a block is dragged: which row is the line, and which container
  // it would land in, open so the line shows.
  const dragging = useMemo<Dragging | null>(() => {
    if (!drag) return null;
    const id = drag.source.kind === "block" ? drag.source.id : drag.source.block.id;
    return { id, target: drag.target && drag.verdict?.allowed ? drag.target.parentId : undefined, name: draggedName(drag) };
  }, [drag]);
  const selection = useEditor((s) => s.selection);
  const open = useUi((u) => u.navigatorOpen);
  const serverErrors = useUi((u) => u.serverErrors);
  const site = useUi((u) => u.site);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // The row with the Tab stop: the selection's, else the first.
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());

  // A block selected anywhere opens the rows down to it, once, when it is
  // selected, and closes the others: design/shots/advanced.png and
  // drag.png show only the selection's path open; the selected row itself
  // stays open if it was. Selected by the tree's own arrows, the rows stay
  // as they are, so they never move under the keys. A row closed by hand
  // afterwards stays closed. Adjusted while drawing, as React does state
  // that follows a value from outside.
  const [chosenHere, setChosenHere] = useState<string | null>(null);
  if (selection !== seen) {
    setSeen(selection);
    if (selection !== null) {
      const path = new Set<string>();
      for (let up = locate(doc, selection)?.parentId ?? null; up !== null; up = locate(doc, up)?.parentId ?? null) path.add(up);
      if (selection === chosenHere) {
        if ([...path].some((id) => !expanded.has(id))) setExpanded(new Set([...expanded, ...path]));
      } else {
        if (expanded.has(selection)) path.add(selection);
        if (path.size !== expanded.size || [...path].some((id) => !expanded.has(id))) setExpanded(path);
      }
      setActive(selection);
    }
  }

  useEffect(() => {
    if (selection !== null) items.current.get(selection)?.scrollIntoView?.({ block: "nearest" });
  }, [selection, expanded]);

  const shownOpen = useMemo(() => {
    if (!dragging) return expanded;
    const open = new Set(expanded);
    for (let up = locate(doc, dragging.id)?.parentId ?? null; up !== null; up = locate(doc, up)?.parentId ?? null) open.add(up);
    return open;
  }, [doc, dragging, expanded]);
  const rows = useMemo(() => visibleRows(doc, shownOpen), [doc, shownOpen]);
  const errorsOn = useMemo(() => new Set(serverErrors.map((e) => e.blockId)), [serverErrors]);
  const tabStop = rows.some((r) => r.block.id === active) ? active : (rows[0]?.block.id ?? null);

  const choose = (id: string, focus = true, byKey = false) => {
    setChosenHere(byKey ? id : null);
    store.getState().select(id);
    ui.setState({ tray: "edit", notice: null });
    setActive(id);
    if (focus) items.current.get(id)?.focus();
    // The canvas shows the block chosen here; the focus stays in the tree.
    document.querySelector(`.canvas [data-block-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" });
  };
  const toggle = (id: string, to?: boolean) => setExpanded((set) => {
    const next = new Set(set);
    if (to ?? !next.has(id)) next.add(id);
    else next.delete(id);
    return next;
  });

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, row: Row) => {
    const index = rows.findIndex((r) => r.block.id === row.block.id);
    const isOpen = expanded.has(row.block.id);
    let target: Row | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = rows[index + 1];
        break;
      case "ArrowUp":
        target = rows[index - 1];
        break;
      case "Home":
        target = rows[0];
        break;
      case "End":
        target = rows.at(-1);
        break;
      case "ArrowRight":
        if (row.hasChildren && !isOpen) toggle(row.block.id, true);
        else if (row.hasChildren) target = rows[index + 1];
        break;
      case "ArrowLeft":
        if (row.hasChildren && isOpen) toggle(row.block.id, false);
        else if (row.parent !== null) target = rows.find((r) => r.block.id === row.parent);
        break;
      case "Enter":
        // Over to the canvas, on the block itself.
        focusBlock(row.block.id);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (target) choose(target.block.id, true, true);
  };

  if (!open) {
    return (
      <aside className="tray tray-right tray-closed chrome" aria-label="Navigator">
        <div className="tray-head-title">
          <button className="ibtn" type="button" aria-label="Open navigator" aria-expanded="false" title="Open navigator" onClick={() => ui.getState().setNavigatorOpen(true)}><Icon name="tree" /></button>
        </div>
      </aside>
    );
  }

  const sections = base.sections.length;
  const widgets = countWidgets(base);
  return (
    <aside className="tray tray-right chrome" aria-label="Navigator">
      <section className="view">
        <div className="tray-head tray-head-title">
          <h2 id="navigator_title"><Icon name="tree" />Navigator</h2>
          <button className="ibtn" type="button" aria-label="Collapse navigator" aria-expanded="true" title="Collapse navigator" onClick={() => ui.getState().setNavigatorOpen(false)}><Icon name="panel-right" /></button>
        </div>
        <div className="tray-body tray-body-tight">
          {site && <ThemeRow part="header" />}
          {sections === 0 ? (
            <p className="t-empty">No sections yet. Each section you add shows up here, with its columns and widgets inside.</p>
          ) : (
            <ul className="tree" role="tree" aria-labelledby="navigator_title">
              {doc.sections.map((section) => (
                <TreeItem
                  key={section.id}
                  doc={doc}
                  block={section}
                  level={1}
                  parent={null}
                  expanded={shownOpen}
                  dragging={dragging}
                  selection={selection}
                  tabStop={tabStop}
                  errorsOn={errorsOn}
                  items={items}
                  onChoose={choose}
                  onToggle={toggle}
                  onKeyDown={onKeyDown}
                />
              ))}
            </ul>
          )}
          {site && <ThemeRow part="footer" />}
        </div>
        <p className="nav-foot">{sections} {sections === 1 ? "section" : "sections"}, {widgets} {widgets === 1 ? "widget" : "widgets"}</p>
      </section>
    </aside>
  );
}

interface Dragging {
  id: string;
  // The container the block would land in; undefined when nowhere.
  target: string | null | undefined;
  name: string;
}

interface TreeItemProps {
  doc: PageDocument;
  dragging: Dragging | null;
  block: Block;
  level: number;
  parent: string | null;
  expanded: ReadonlySet<string>;
  selection: string | null;
  tabStop: string | null;
  errorsOn: ReadonlySet<string | null>;
  items: RefObject<Map<string, HTMLLIElement>>;
  onChoose: (id: string, focus?: boolean) => void;
  onToggle: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>, row: Row) => void;
}

function TreeItem(props: TreeItemProps) {
  const env = useEnv();
  const { doc, dragging, block, level, parent, expanded, selection, tabStop, errorsOn, items, onChoose, onToggle, onKeyDown } = props;
  if (dragging?.id === block.id) {
    return <li className="t-insert" aria-hidden="true" style={{ marginLeft: 4 + (level - 1) * 19 }}><span>{dragging.name}</span></li>;
  }
  const children = block.children as readonly Block[];
  const hasChildren = children.length > 0;
  const isOpen = hasChildren && expanded.has(block.id);
  const name = blockName(doc, block.id);
  const detail = excerpt(block);
  const icon = block.type === "section" ? <Icon name="section" /> : block.type === "column" ? <Icon name="column" /> : <WidgetIcon icon={widgetDefinition(block.type).icon} className="i" />;
  const hidden = hiddenSomewhere(block);
  return (
    <li
      ref={(element) => {
        if (element) items.current.set(block.id, element);
        else items.current.delete(block.id);
      }}
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={selection === block.id}
      aria-label={`${detail && block.type !== "section" ? `${name}: ${detail}` : name}${errorsOn.has(block.id) ? ", refused by the server" : ""}`}
      tabIndex={tabStop === block.id ? 0 : -1}
      className={hidden ? "t-hidden" : undefined}
      data-row-id={block.id}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKeyDown(event, { block, level, parent, hasChildren });
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
        if (!dragging) openBlockMenu(env, event, block.id, "navigator");
      }}
    >
      <div
        className={`t-row${dragging?.target === block.id ? " t-target" : ""}`}
        style={{ paddingLeft: 4 + (level - 1) * 19 }}
        onClick={() => onChoose(block.id)}
      >
        <span
          className={`t-chev${hasChildren ? "" : " t-chev-none"}`}
          aria-hidden="true"
          onClick={(event) => {
            if (!hasChildren) return;
            event.stopPropagation();
            onToggle(block.id);
          }}
        >
          <Icon name="chevron-right" className="i i-xs" />
        </span>
        {icon}
        <span>{name}</span>
        {block.type === "section"
          ? <em className="t-count">{detail}</em>
          : detail && <em>{detail}</em>}
        {errorsOn.has(block.id) && <span className="t-count" title="The server refused this block in the last save"><Icon name="error" className="i i-xs" /></span>}
      </div>
      {isOpen && (
        <ul role="group">
          {children.map((child) => <TreeItem key={child.id} {...props} block={child} level={level + 1} parent={block.id} />)}
        </ul>
      )}
    </li>
  );
}

// The theme's header or footer: a row like the tree's, outside it, locked.
function ThemeRow({ part }: { part: "header" | "footer" }) {
  const name = part === "header" ? "Site header" : "Site footer";
  return (
    <p className="t-row t-theme" title={`${name}: the same on every page. It comes from the site's theme and is not edited here.`}>
      <Icon name="lock" /><span>{name}</span><span className="visually-hidden">, locked: the same on every page</span>
    </p>
  );
}
