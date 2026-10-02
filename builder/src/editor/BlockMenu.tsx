// The selected block's menu (design/shots-extra/context.png): copy, paste,
// duplicate and delete, each with its keys from the keymap. Opened by a
// right click on a block of the canvas or a row of the navigator, or by
// the keyboard's menu key (Shift+F10) there; it gives the focus back to
// the block, or to the block that took its place.
import { Fragment, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { makeDelete, makeDuplicate } from "../document/commands.ts";
import { blockName } from "../document/labels.ts";
import { focusBlock, focusRow, runCommand } from "./act.ts";
import { copyFromMenu, pasteFromMenu } from "./clipboard.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { Icon, type IconName } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, type KeyAction } from "./keymap.ts";
import { Menu } from "./Menu.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";

const ITEMS: ReadonlyArray<{ action: KeyAction; label: string; icon: IconName; danger?: boolean }> = [
  { action: "copy", label: "Copy", icon: "copy" },
  { action: "paste", label: "Paste", icon: "paste" },
  { action: "duplicate", label: "Duplicate", icon: "duplicate" },
  { action: "delete", label: "Delete", icon: "trash", danger: true },
];

const MENU_WIDTH = 236;
const MENU_HEIGHT = 168;

// Opens the menu for the block an event falls in (a click, or the menu key
// on the focused block): selects it, and places the menu at the pointer or,
// from the keyboard, under the block's top left corner.
export function openBlockMenu(env: ReturnType<typeof useEnv>, event: ReactMouseEvent, id: string, from: "canvas" | "navigator"): void {
  event.preventDefault();
  env.store.getState().select(id);
  env.ui.setState({ tray: "edit", notice: null });
  let { clientX: x, clientY: y } = event;
  // The menu key fires at the focused element, with no pointer position.
  if (x === 0 && y === 0 && event.target instanceof Element) {
    const box = event.target.getBoundingClientRect();
    x = box.left + 12;
    y = box.top + 12;
  }
  env.ui.getState().setBlockMenu({ x, y, from });
}

export function BlockMenu() {
  const at = useUi((u) => u.blockMenu);
  const selection = useEditor((s) => s.selection);
  if (!at || selection === null) return null;
  return <BlockMenuAt key={`${selection} ${at.x} ${at.y}`} id={selection} x={at.x} y={at.y} from={at.from} />;
}

function BlockMenuAt({ id, x, y, from }: { id: string; x: number; y: number; from: "canvas" | "navigator" }) {
  const env = useEnv();
  const name = useEditor((s) => blockName(s.document, id));
  const anchor = useRef<HTMLElement | null>(null);
  // The menu stays inside the window.
  const place = {
    left: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)),
  };

  // The block (or its row) is what the focus goes back to.
  useLayoutEffect(() => {
    anchor.current = document.querySelector<HTMLElement>(from === "navigator" ? `.tree [data-row-id="${id}"]` : `.canvas [data-block-id="${id}"]`);
  }, [from, id]);

  const close = () => env.ui.getState().setBlockMenu(null);
  const region = from;
  const back = () => (from === "navigator" ? focusRow(id) : focusBlock(id));
  const run = (action: KeyAction) => {
    close();
    switch (action) {
      case "copy":
        void copyFromMenu(env).then(back);
        break;
      case "paste":
        void pasteFromMenu(env, region).then((refusal) => {
          if (refusal) back();
        });
        break;
      case "duplicate":
        if (runCommand(env, (doc) => makeDuplicate(doc, id, env.newId), region)) back();
        break;
      case "delete":
        if (runCommand(env, (doc) => makeDelete(doc, id), region)) back();
        break;
      default:
        break;
    }
  };

  return (
    <Menu label={`${name} actions`} className="menu-context" button={anchor} onClose={close} style={{ left: place.left, top: place.top }}>
      {ITEMS.map((item) => {
        const keys = entry(item.action);
        return (
          <Fragment key={item.action}>
            {item.danger && <hr className="menu-sep" />}
            <button
              className={`menu-item${item.danger ? " menu-item-danger" : ""}`}
              role="menuitem"
              type="button"
              tabIndex={-1}
              aria-keyshortcuts={ariaKeyShortcuts(keys)}
              onClick={() => run(item.action)}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
              <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(keys)} small /></span>
            </button>
          </Fragment>
        );
      })}
    </Menu>
  );
}
