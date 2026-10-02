// The left tray (design/shots/drag.png and editor.png): two tabs, Add,
// the widget panel, and Edit, the panel of the selection or of the page.
import { useId, useRef, type KeyboardEvent } from "react";
import { useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { Palette } from "./Palette.tsx";
import { EditPanel } from "./panels/EditPanel.tsx";

const TABS = ["add", "edit"] as const;

export function LeftTray() {
  const { ui } = useEnv();
  const tray = useUi((u) => u.tray);
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = TABS[(index + 1) % TABS.length]!;
    ui.getState().setTray(next);
    refs.current[TABS.indexOf(next)]?.focus();
  };
  return (
    <aside className="tray tray-left chrome" aria-label="Widgets and properties">
      <section className="view">
        <div className="tray-head">
          <div className="seg seg-wide" role="tablist" aria-label="Panel">
            {TABS.map((tab, index) => (
              <button
                key={tab}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                id={`${id}-${tab}`}
                role="tab"
                type="button"
                aria-selected={tray === tab}
                aria-controls={`${id}-panel`}
                tabIndex={tray === tab ? 0 : -1}
                title={tab === "edit" ? "Edit the selection, or the page when nothing is selected" : undefined}
                onClick={() => ui.getState().setTray(tab)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {tab === "add" ? <><Icon name="plus" />Add</> : "Edit"}
              </button>
            ))}
          </div>
        </div>
        <div className="view" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tray}`}>
          {tray === "add" ? <Palette /> : <EditPanel />}
        </div>
      </section>
    </aside>
  );
}
