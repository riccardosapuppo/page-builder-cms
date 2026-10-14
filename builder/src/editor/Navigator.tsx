// The Outline drawer (the approved layout, design/layout/shots/
// structure.png), in two tabs. Blocks: the page's structure as a tree,
// sections holding columns holding widgets, in step with the selection
// both ways. Selecting a row selects the block on the canvas and brings it
// into view; selecting on the canvas opens the rows down to it and marks
// it here. Headings: only the page's headings, in order and by level, to
// check the page reads well; one chosen is selected and brought into view.
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
// A block with values of its own on a tablet or a phone carries the
// device's glyph at the end of its row; one hidden on some device is
// grayed out.
//
// Every row can be dragged (./drag/dnd.ts, ROW_SENSORS: the mouse once it
// has moved, a finger held still, or Space and the arrows) and is a place
// to drop (./drag/outline-place.ts). While a row's block moves, the tree
// stays as the page is, the row dimmed and a yellow line where the block
// will land, its container marked and opened; the canvas draws the block
// there as itself (./drag/DragLayer.tsx). A drag begun on the page shows
// the store's preview here instead: the dragged block as a line where it
// would land, its container marked.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DragSession, DropTarget } from "../document/drag.ts";
import { blockName } from "../document/labels.ts";
import { allBlocks, locate } from "../document/tree.ts";
import type { Block, PageDocument, StyleTokens } from "../shared/document.ts";
import { widgetDefinition } from "../widgets/registry.ts";
import { WidgetIcon } from "../widgets/icon.tsx";
import { openBlockMenu, openRowMenu } from "./BlockMenu.tsx";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { overriddenOn, type OverrideDevice } from "./device-style.ts";
import { ROW_SENSORS, rowSource, rowTarget, useDraggable, useRowTarget } from "./drag/dnd.ts";
import { draggedName, draggedOf } from "./drag/marks.ts";
import { siblingsIn } from "./drag/place.ts";
import { Icon } from "./icons.tsx";
import { focusBlock } from "./act.ts";
import { excerpt } from "./names.ts";
import type { PartKind } from "../storage/adapter.ts";
import { PART_NAMES, partOf, useKeptWords, useOpenKind, useOptionalSession } from "./session.tsx";

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

// The flag of a block with values of its own on a tablet or a phone
// (design/shots/style.png, the tablet beside Column 1), in words for the
// pointer's hover and a screen reader: the row's name stays the block's.
function flagWords(devices: readonly OverrideDevice[]): string {
  return devices.length === 2 ? "Has tablet and phone overrides" : `Has a ${devices[0]} override`;
}

// Where the line stands for a place, in the tree as the page is: before
// the row of the block the place comes before, after the last one's rows,
// or inside the container's row when it holds nothing else.
function lineOf(session: DragSession, target: DropTarget): Line | null {
  const ids = siblingsIn(session.base, draggedOf(session), target.parentId);
  if (ids.length === 0) return target.parentId === null ? null : { id: target.parentId, at: "inside" };
  const next = ids[target.index];
  return next !== undefined ? { id: next, at: "before" } : { id: ids.at(-1)!, at: "after" };
}

function countWidgets(doc: PageDocument): number {
  return doc.sections.reduce((sum, section) => sum + section.children.reduce((n, column) => n + column.children.length, 0), 0);
}

// "3 widgets", "1 widget": a column's count at the end of its row, and the
// drawer's total.
const widgetsWords = (count: number): string => `${count} ${count === 1 ? "widget" : "widgets"}`;

export function Navigator() {
  const env = useEnv();
  const { store, ui } = env;
  // A drag from here leaves the rows as the page is; one from the page
  // shows its preview.
  const fromOutline = useUi((u) => u.dragFrom === "outline");
  const doc = useEditor((s) => (s.drag && !fromOutline ? s.drag.preview : s.document));
  const base = useEditor((s) => s.document);
  const drag = useEditor((s) => s.drag);
  // While a block is dragged: which row is the line, and which container
  // it would land in, open so the line shows.
  const dragging = useMemo<Dragging | null>(() => {
    if (!drag) return null;
    const id = drag.source.kind === "block" ? drag.source.id : drag.source.block.id;
    const target = drag.target !== null && drag.verdict?.allowed ? drag.target : null;
    return { id, target: target?.parentId, name: draggedName(drag), line: fromOutline ? (target ? lineOf(drag, target) : null) : undefined };
  }, [drag, fromOutline]);
  const selection = useEditor((s) => s.selection);
  const serverErrors = useUi((u) => u.serverErrors);
  // Around a page, the site's header and footer, each a row that opens it.
  const aroundPage = useOpenKind() === "page";
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // The row with the Tab stop: the selection's, else the first.
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  // Each row's element, kept by its block's id as the row is drawn.
  const register = useCallback((id: string, element: HTMLLIElement | null) => {
    if (element) items.current.set(id, element);
    else items.current.delete(id);
  }, []);
  const [tab, setTab] = useState<(typeof OUTLINE_TABS)[number]>("blocks");
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Moving a row's block: the container it would land in opens, with the
  // rows above it, and they stay open, so no row moves away from under the
  // pointer; and the block, once dropped and selected, keeps the rows as
  // they are, as one chosen here does. Adjusted while drawing, as the
  // selection's rows are.
  const opening = dragging?.line !== undefined && dragging.target !== undefined ? dragging.target : null;
  const moving = dragging?.line !== undefined ? dragging.id : null;
  const [movedSeen, setMovedSeen] = useState<{ opening: string | null; moving: string | null }>({ opening: null, moving: null });
  if (opening !== movedSeen.opening || moving !== movedSeen.moving) {
    setMovedSeen({ opening, moving });
    if (moving !== null && moving !== movedSeen.moving) setChosenHere(moving);
    if (opening !== null) {
      const chain: string[] = [];
      for (let up: string | null = opening; up !== null; up = locate(base, up)?.parentId ?? null) chain.push(up);
      if (chain.some((id) => !expanded.has(id))) setExpanded(new Set([...expanded, ...chain]));
    }
  }

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
    // While a block moves, the arrows, Space and Esc are the drag's.
    if (event.defaultPrevented || store.getState().drag !== null) return;
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

  const sections = base.sections.length;
  const widgets = countWidgets(base);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = OUTLINE_TABS[(index + 1) % OUTLINE_TABS.length]!;
    setTab(next);
    tabRefs.current[OUTLINE_TABS.indexOf(next)]?.focus();
  };
  return (
    <>
      <div className="drawer-tools">
        <div className="dtabs" role="tablist" aria-label="Outline">
          {OUTLINE_TABS.map((t, index) => (
            <button
              key={t}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${tabsId}-${t}`}
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === t ? 0 : -1}
              title={t === "headings" ? "Only the headings, in order: check the page reads well" : undefined}
              onClick={() => setTab(t)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {t === "blocks" ? "Blocks" : "Headings"}
            </button>
          ))}
        </div>
      </div>
      <div className="drawer-body drawer-body-tree" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === "headings" ? <Headings /> : (<>
          {aroundPage && <ThemeRow part="header" />}
          {sections === 0 ? (
            <p className="t-empty">No sections yet. Each section you add shows up here, with its columns and widgets inside.</p>
          ) : (
            <ul className="tree" role="tree" aria-label="Page structure">
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
                  register={register}
                  onChoose={choose}
                  onToggle={toggle}
                  onKeyDown={onKeyDown}
                />
              ))}
            </ul>
          )}
          {aroundPage && <ThemeRow part="footer" />}
          {sections > 0 && <p className="hint hint-pad tree-hint">Select a row and the page scrolls to it.</p>}
        </>)}
      </div>
      <p className="drawer-foot drawer-foot-count">{sections} {sections === 1 ? "section" : "sections"}, {widgetsWords(widgets)}</p>
    </>
  );
}

const OUTLINE_TABS = ["blocks", "headings"] as const;

// The page's headings in reading order, each at its level: a page whose
// levels skip one, or with two H1s, shows it here.
function Headings() {
  const { store, ui } = useEnv();
  const doc = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const headings = [...allBlocks(doc)].flatMap((found) => (found.block.type === "heading" ? [found.block] : []));
  if (headings.length === 0) return <p className="t-empty">No headings yet. Each heading you add shows up here, at its level.</p>;
  return (
    <ul className="heads" aria-label="Headings">
      {headings.map((heading) => (
        <li key={heading.id}>
          <button
            type="button"
            className="head-row"
            style={{ paddingLeft: 8 + (heading.props.level - 1) * 14 }}
            aria-current={selection === heading.id ? "true" : undefined}
            onClick={() => {
              store.getState().select(heading.id);
              ui.setState({ tray: "edit", notice: null });
              document.querySelector(`.canvas [data-block-id="${heading.id}"]`)?.scrollIntoView?.({ block: "nearest" });
            }}
          >
            <span className="head-level">H{heading.props.level}</span>
            <span className="head-text">{heading.props.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface Line {
  id: string;
  at: "before" | "after" | "inside";
}

interface Dragging {
  id: string;
  // The container the block would land in; undefined when nowhere.
  target: string | null | undefined;
  name: string;
  // A drag from the Outline: where the line stands, null when nowhere.
  // Undefined for a drag from the page, which the tree follows in the
  // preview.
  line: Line | null | undefined;
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
  register: (id: string, element: HTMLLIElement | null) => void;
  onChoose: (id: string, focus?: boolean) => void;
  onToggle: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>, row: Row) => void;
}

function TreeItem(props: TreeItemProps) {
  const kept = useKeptWords();
  const env = useEnv();
  const { doc, dragging, block, level, parent, expanded, selection, tabStop, errorsOn, register, onChoose, onToggle, onKeyDown } = props;
  // The row is a drag source and a place to drop (./drag/dnd.ts), but not
  // while the tree shows a drag begun on the page, whose rows move with it.
  const previewing = dragging !== null && dragging.line === undefined;
  const data = useMemo(() => ({ kind: "row" as const, id: block.id }), [block.id]);
  const { ref: sourceRef } = useDraggable({ id: rowSource(block.id), data, sensors: ROW_SENSORS, disabled: previewing });
  const { ref: dropRef } = useRowTarget({ id: rowTarget(block.id), disabled: previewing });
  const itemRef = useCallback((element: HTMLLIElement | null) => {
    register(block.id, element);
    sourceRef(element);
  }, [block.id, register, sourceRef]);
  const rowRef = useCallback((element: HTMLDivElement | null) => dropRef(element), [dropRef]);
  if (dragging !== null && dragging.line === undefined && dragging.id === block.id) {
    return <li className="t-insert" aria-hidden="true" style={{ marginLeft: 4 + (level - 1) * 19 }}><span>{dragging.name}</span></li>;
  }
  const children = block.children as readonly Block[];
  const hasChildren = children.length > 0;
  const isOpen = hasChildren && expanded.has(block.id);
  const line = dragging?.line?.id === block.id ? dragging.line.at : null;
  const indent = 4 + (level - 1) * 19;
  const name = blockName(doc, block.id);
  const detail = excerpt(block);
  const icon = block.type === "section" ? <Icon name="section" /> : block.type === "column" ? <Icon name="column" /> : <WidgetIcon icon={widgetDefinition(block.type).icon} className="i" />;
  const hidden = hiddenSomewhere(block);
  const overrides = overriddenOn(block.style);
  const flagsId = `nav_flags_${block.id}`;
  return (
    <li
      ref={itemRef}
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={selection === block.id}
      aria-label={`${detail && block.type !== "section" ? `${name}: ${detail}` : name}${errorsOn.has(block.id) ? `, refused by ${kept.server}` : ""}`}
      aria-describedby={overrides.length > 0 ? flagsId : undefined}
      tabIndex={tabStop === block.id ? 0 : -1}
      // The row the drawer gives the focus to when it opens.
      data-autofocus={tabStop === block.id ? "" : undefined}
      className={[hidden ? "t-hidden" : "", dragging?.line !== undefined && dragging.id === block.id ? "t-moving" : ""].filter(Boolean).join(" ") || undefined}
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
        ref={rowRef}
        className={`t-row${dragging?.target === block.id ? " t-target" : ""}`}
        style={{ paddingLeft: indent }}
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
          : block.type === "column"
            ? <em className="t-count">{widgetsWords(children.length)}</em>
            : detail && <em>{detail}</em>}
        {errorsOn.has(block.id) && <span className="t-count" title={`${kept.Server} refused this block in the last save`}><Icon name="error" className="i i-xs" /></span>}
        {overrides.length > 0 && (
          <span className="t-flags" id={flagsId} title={flagWords(overrides)}>
            {overrides.map((device) => <Icon key={device} name={device} className="i i-xs" />)}
            <span className="visually-hidden">{flagWords(overrides)}</span>
          </span>
        )}
        {/* The selected row's "…": the same menu a right click opens, for the
            pointer that has no right click. Not a Tab stop: the keyboard has
            the menu key (Shift+F10) on the row. */}
        {selection === block.id && !dragging && (
          <button
            className="t-more"
            type="button"
            tabIndex={-1}
            aria-label={`${name} options`}
            aria-haspopup="menu"
            title="More (or right-click the row)"
            onClick={(event) => {
              event.stopPropagation();
              openRowMenu(env, block.id, event.currentTarget);
            }}
          >
            <Icon name="more" />
          </button>
        )}
      </div>
      {isOpen && (
        <ul role="group">
          {children.map((child) => <TreeItem key={child.id} {...props} block={child} level={level + 1} parent={block.id} />)}
        </ul>
      )}
      {/* Where a row's block will land: over the gap between rows, so no
          row moves under the pointer; inside a row, one step in. */}
      {line && <span className="t-line" data-at={line} style={{ left: indent + 18 + (line === "inside" ? 19 : 0) }} aria-hidden="true" />}
    </li>
  );
}

// The site's header or footer: a row like the tree's, outside it, locked
// on the page: it is made of blocks of its own, and the row opens it to be
// edited as a page is.
function ThemeRow({ part }: { part: PartKind }) {
  const { ui } = useEnv();
  const session = useOptionalSession();
  const found = session ? partOf(session, part) : undefined;
  const name = PART_NAMES[part];
  return (
    <button
      className="t-row t-theme"
      type="button"
      data-part-row={part}
      disabled={!found}
      title={`${name}: the same on every page. Open it to edit its blocks.`}
      onClick={() => {
        if (!session || !found) return;
        void session.openPage(found.id).then((why) => {
          if (why) ui.getState().say(why);
        });
      }}
    >
      <Icon name="globe" /><span>{name}</span>{" "}<em aria-hidden="true">Every page</em><span className="visually-hidden">: the same on every page. Opens it.</span>
    </button>
  );
}
