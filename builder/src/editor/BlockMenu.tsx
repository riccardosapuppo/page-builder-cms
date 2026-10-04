// The selected block's menus (design/layout/shots-extra/more.png and
// block-menu.png), one list of items, each with its keys from the keymap:
// - More: copy, paste after, duplicate; insert before and after; select
//   the column or section it is in; delete. The clamp's More key opens it,
//   and so does a right click on a block of the canvas or a row of the
//   outline.
// - The block menu: the moves first (up and down, left and right for a
//   column), each saying why it cannot be made at an end, then all of
//   More's. The clamp's head opens it, and so does the keyboard's menu key
//   (Shift+F10) on a block or a row.
// A column takes no insert before or after (a block goes inside it, from
// its "+"), and a section has no column or section around it to select.
//
// Opened from the clamp, it stands beside the clamp, opening upward from
// its foot where the window has no room below; it gives the focus back to
// the clamp's key, else to the block, or to the outline's row.
import { Fragment, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { makeDelete, makeDuplicate, makeMove } from "../document/commands.ts";
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import { afterRender, focusBlock, focusRow, runCommand, type Region } from "./act.ts";
import { canvasUi, useCanvasUi } from "./canvas-ui.ts";
import { clampKey, MOVES, moveWhy, standingOf, type ClampKind } from "./Clamp.tsx";
import { copyFromMenu, pasteFromMenu } from "./clipboard.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { Icon, type IconName } from "./icons.tsx";
import { placeBeside } from "./insert-place.ts";
import { openInserter } from "./InsertPicker.tsx";
import { ariaKeyShortcuts, entry, entryCaps, type KeyAction } from "./keymap.ts";
import { Menu } from "./Menu.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";

const MENU_WIDTH = 252;

// Opens the menu for the block an event falls in (a right click, or the
// menu key on the focused block): selects it, and places the menu at the
// pointer or, from the keyboard, under the block's top left corner. The
// pointer's menu is More; the keyboard's, the block menu with the moves.
export function openBlockMenu(env: ReturnType<typeof useEnv>, event: ReactMouseEvent, id: string, from: "canvas" | "navigator"): void {
  event.preventDefault();
  env.store.getState().select(id);
  env.ui.setState({ tray: "edit", notice: null });
  let { clientX: x, clientY: y } = event;
  // The menu key fires at the focused element: Chromium says so with no
  // button (-1) and a point inside it; other browsers with no point.
  const keyboard = event.button === -1 || (x === 0 && y === 0);
  if (keyboard && event.target instanceof Element) {
    const box = event.target.getBoundingClientRect();
    x = box.left + 12;
    y = box.top + 12;
  }
  canvasUi(env.ui).getState().setMenu(keyboard ? "block" : "more", null);
  env.ui.getState().setBlockMenu({ x, y, from });
}

// The same More menu from a row's "…" key: the row's block selected, the
// menu under the key, its right edge on the key's, so it stays over the
// drawer it was opened from.
export function openRowMenu(env: ReturnType<typeof useEnv>, id: string, from: HTMLElement): void {
  env.store.getState().select(id);
  env.ui.setState({ tray: "edit", notice: null });
  const box = from.getBoundingClientRect();
  canvasUi(env.ui).getState().setMenu("more", null);
  env.ui.getState().setBlockMenu({ x: box.right - MENU_WIDTH, y: box.bottom + 4, from: "navigator" });
}

export function BlockMenu() {
  const at = useUi((u) => u.blockMenu);
  const selection = useEditor((s) => s.selection);
  const kind = useCanvasUi((s) => s.menuKind);
  const opener = useCanvasUi((s) => s.menuFrom);
  if (!at || selection === null) return null;
  return <BlockMenuAt key={`${selection} ${at.x} ${at.y} ${kind}`} id={selection} x={at.x} y={at.y} from={at.from} kind={kind} opener={opener} />;
}

interface Item {
  key: string;
  label: string;
  icon: IconName;
  keys?: KeyAction;
  // Why it cannot be done, beside it.
  why?: string | null;
  danger?: boolean;
  // A rule above it.
  rule?: boolean;
  run: () => void;
}

function BlockMenuAt({ id, x, y, from, kind, opener }: { id: string; x: number; y: number; from: "canvas" | "navigator"; kind: "block" | "more"; opener: "head" | "more" | null }) {
  const env = useEnv();
  const { store, ui, newId } = env;
  const name = useEditor((s) => blockName(s.document, id));
  const type = useEditor((s) => locate(s.document, id)?.block.type);
  const standing = useEditor(useShallow((s) => standingOf(s.document, id)));
  const parent = useEditor(useShallow((s) => {
    const up = locate(s.document, id)?.parentId ?? null;
    return up === null ? null : { id: up, name: blockName(s.document, up) };
  }));
  const anchor = useRef<HTMLElement | null>(null);
  const fromClamp = from === "canvas" ? opener : null;
  // The clamp's key (or the block, or its row): what the focus goes back to.
  const opened = () => (fromClamp ? clampKey(id, fromClamp) : document.querySelector<HTMLElement>(from === "navigator" ? `.tree [data-row-id="${id}"]` : `.canvas [data-block-id="${id}"]`));

  // Once drawn, the menu's height keeps it in the window: where it has no
  // room below, it opens upward from the clamp's foot (or the window's).
  useLayoutEffect(() => {
    anchor.current = fromClamp ? clampKey(id, fromClamp) : document.querySelector<HTMLElement>(from === "navigator" ? `.tree [data-row-id="${id}"]` : `.canvas [data-block-id="${id}"]`);
    const menu = document.querySelector<HTMLElement>(".menu-context");
    if (!menu) return;
    const room = window.innerHeight - 8;
    const height = menu.offsetHeight;
    if (y + height <= room) return;
    const clamp = fromClamp ? document.querySelector(`.canvas [data-block-id="${id}"] > .clamp`)?.getBoundingClientRect() : undefined;
    menu.style.top = `${Math.max(8, clamp ? clamp.bottom - height : room - height)}px`;
  }, [from, id, fromClamp, y]);

  if (!type || !standing) return null;
  const clampKind: ClampKind = type === "section" ? "section" : type === "column" ? "column" : "widget";
  const place = {
    left: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
    top: Math.max(8, y),
  };

  const close = () => ui.getState().setBlockMenu(null);
  const region: Region = from;
  // Back where the menu was opened from.
  const back = () => {
    if (fromClamp) afterRender(() => clampKey(id, fromClamp)?.focus({ preventScroll: true }));
    else if (from === "navigator") focusRow(id);
    else focusBlock(id);
  };
  const move = (by: -1 | 1) => {
    const found = locate(store.getState().document, id);
    if (!found) return;
    if (runCommand(env, (doc) => makeMove(doc, id, { parentId: found.parentId, index: found.index + by }), region) === null && fromClamp) back();
  };
  const insert = (side: "before" | "after") => {
    const at = placeBeside(store.getState().document, id, side);
    if (at) openInserter(env, at, opened());
  };
  const select = (target: string) => {
    store.getState().select(target);
    ui.setState({ tray: "edit", notice: null });
    if (from === "navigator") focusRow(target);
    else focusBlock(target);
  };

  const moves = MOVES[clampKind];
  const items: Item[] = [
    ...(kind === "block"
      ? [
        { key: "back", label: moves.back, icon: moves.backIcon, why: moveWhy(clampKind, standing, -1), run: () => move(-1) },
        { key: "on", label: moves.on, icon: moves.onIcon, why: moveWhy(clampKind, standing, 1), run: () => move(1) },
      ] satisfies Item[]
      : []),
    { key: "copy", label: "Copy", icon: "copy", keys: "copy", rule: kind === "block", run: () => void copyFromMenu(env).then(back) },
    {
      key: "paste",
      label: "Paste after",
      icon: "paste",
      keys: "paste",
      run: () => void pasteFromMenu(env, region).then((refusal) => {
        if (refusal) back();
      }),
    },
    { key: "duplicate", label: "Duplicate", icon: "duplicate", keys: "duplicate", run: () => (runCommand(env, (doc) => makeDuplicate(doc, id, newId), region) ? back() : undefined) },
    ...(clampKind !== "column"
      ? [
        { key: "before", label: "Insert before", icon: "plus", rule: true, run: () => insert("before") },
        { key: "after", label: "Insert after", icon: "plus", keys: "addHere", run: () => insert("after") },
      ] satisfies Item[]
      : []),
    ...(parent
      ? [{ key: "parent", label: `Select ${parent.name}`, icon: clampKind === "column" ? "section" : "column", keys: "selectParent", rule: clampKind === "column", run: () => select(parent.id) }] satisfies Item[]
      : []),
    { key: "delete", label: "Delete", icon: "trash", keys: "delete", danger: true, rule: true, run: () => (runCommand(env, (doc) => makeDelete(doc, id), region) ? back() : undefined) },
  ];

  return (
    <Menu label={kind === "block" ? `${name}: block menu` : `${name} actions`} className="menu-context" button={anchor} onClose={close} style={{ left: place.left, top: place.top }}>
      {items.map((item) => {
        const keys = item.keys ? entry(item.keys) : null;
        return (
          <Fragment key={item.key}>
            {item.rule && <hr className="menu-sep" />}
            <button
              className={`menu-item${item.danger ? " menu-item-danger" : ""}`}
              role="menuitem"
              type="button"
              tabIndex={-1}
              data-item={item.key}
              aria-disabled={item.why ? true : undefined}
              aria-keyshortcuts={keys ? ariaKeyShortcuts(keys) : undefined}
              onClick={() => {
                if (item.why) return;
                close();
                item.run();
              }}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
              {item.why && <small className="mi-why">{item.why}</small>}
              {keys && <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(keys)} small /></span>}
            </button>
          </Fragment>
        );
      })}
    </Menu>
  );
}
