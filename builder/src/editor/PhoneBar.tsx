// The editor's own bar at the foot of a phone's window (./layout-mode.ts,
// narrow), within reach of a thumb and clear of the phone's home bar (the
// safe area): Insert and the Outline, each a sheet over the canvas; undo
// and redo; the settings of the page or of the block selected, a sheet
// too; and More, what the wide editor's top bar and bottom line hold
// besides: Preview, History, the device the page is looked at on, and
// Block edges. One sheet at a time: opening one closes the one open.
import { useEffect, useRef, useState } from "react";
import { runRedo, runUndo } from "./act.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { closeDrawer, toggleDrawer } from "./Drawer.tsx";
import { Icon, type IconName } from "./icons.tsx";
import { PreviewButton } from "./Publish.tsx";
import { BlockEdges, Devices } from "./StatusBar.tsx";
import { toggleSidebar } from "./Sidebar.tsx";
import type { Drawer } from "./ui-store.ts";

interface PhoneKeyProps {
  // The drawer it opens, or the sidebar: the focus comes back to it when
  // that closes (./act.ts, shownElement).
  drawer?: Drawer;
  sidebar?: boolean;
  icon: IconName;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

const PhoneKey = ({ drawer, sidebar, icon, label, pressed, disabled, title, onClick }: PhoneKeyProps) => (
  <button className="pk" type="button" data-drawer={drawer} data-sidebar={sidebar ? "" : undefined} aria-pressed={pressed} aria-disabled={disabled || undefined} title={title} onClick={disabled ? undefined : onClick}>
    <Icon name={icon} />
    <span>{label}</span>
  </button>
);

export function PhoneBar() {
  const env = useEnv();
  const { ui } = env;
  const drawer = useUi((u) => u.drawer);
  const sidebar = useUi((u) => u.sidebarOpen);
  const last = useEditor((s) => s.past.at(-1));
  const next = useEditor((s) => s.future.at(-1));
  const [more, setMore] = useState(false);
  const moreKey = useRef<HTMLDivElement>(null);
  // Writing on the page, the keyboard up: the sheets give way to the text
  // (the focus stays in it: neither closing moves a focus not theirs).
  const writing = useUi((u) => u.editingText !== null);
  useEffect(() => {
    if (!writing) return;
    if (ui.getState().drawer !== null) closeDrawer(env);
    if (ui.getState().sidebarOpen) toggleSidebar(ui);
  }, [writing, env, ui]);
  // A drawer, the settings or More: the others close.
  const drawerSheet = (which: Drawer) => {
    setMore(false);
    if (ui.getState().sidebarOpen) toggleSidebar(ui);
    toggleDrawer(env, which);
  };
  const settings = () => {
    setMore(false);
    if (ui.getState().drawer !== null) closeDrawer(env);
    toggleSidebar(ui);
  };
  const toggleMore = () => {
    if (!more) {
      if (ui.getState().drawer !== null) closeDrawer(env);
      if (ui.getState().sidebarOpen) toggleSidebar(ui);
    }
    setMore(!more);
  };
  return (
    <>
      {more && <MoreSheet onClose={() => { setMore(false); moreKey.current?.querySelector("button")?.focus(); }} />}
      <nav className="phonebar chrome" aria-label="Editor tools">
        <PhoneKey drawer="insert" icon="plus" label="Insert" pressed={drawer === "insert"} onClick={() => drawerSheet("insert")} />
        <PhoneKey drawer="outline" icon="tree" label="Outline" pressed={drawer === "outline"} onClick={() => drawerSheet("outline")} />
        <PhoneKey icon="undo" label="Undo" disabled={!last} title={last ? `Undo “${last.command.label}”` : "Nothing to undo"} onClick={() => runUndo(env, "canvas")} />
        <PhoneKey icon="redo" label="Redo" disabled={!next} title={next ? `Redo “${next.command.label}”` : "Nothing to redo"} onClick={() => runRedo(env, "canvas")} />
        <PhoneKey sidebar icon="settings" label="Settings" pressed={sidebar} onClick={settings} />
        <div ref={moreKey} className="pk-wrap">
          <PhoneKey icon="more" label="More" pressed={more} onClick={toggleMore} />
        </div>
      </nav>
    </>
  );
}

// More's sheet: Preview, History, the device and Block edges. Esc, or a
// press outside it, closes it.
function MoreSheet({ onClose }: { onClose: () => void }) {
  const env = useEnv();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    const away = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".phone-more, .phonebar")) return;
      onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  return (
    <section
      ref={box}
      className="phone-more chrome"
      role="dialog"
      aria-modal="false"
      aria-label="More"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="phone-more-row">
        <PreviewButton />
        <button className="btn btn-secondary" type="button" onClick={() => { onClose(); toggleDrawer(env, "history"); }}>
          <Icon name="history" />History
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => { onClose(); toggleDrawer(env, "assistant"); }}>
          <Icon name="sparkles" />Assistant
        </button>
      </div>
      <Devices />
      <BlockEdges />
    </section>
  );
}
