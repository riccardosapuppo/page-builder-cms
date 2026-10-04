// The keyboard shortcuts window (design/layout/shots/shortcuts.png), drawn
// from the keymap itself (./keymap.ts): its groups, each entry's words and
// keys, and a search over the words. Opened by "?" or from the mark's menu.
// The approved layout's three columns, each holding its groups one under
// the other.
import { useId, useState } from "react";
import { Dialog } from "./dialog.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { entryCaps, GROUP_NOTES, KEY_GROUPS, KEYMAP, type Cap, type KeyGroup } from "./keymap.ts";

// Which groups each column holds, top to bottom: every group once.
export const KEY_COLUMNS: ReadonlyArray<readonly KeyGroup[]> = [
  ["Selection", "Editing"],
  ["Moving", "Text, while you write"],
  ["Adding and looking", "History", "Publish"],
];

// An arrow is drawn, and named in text a screen reader reads: a kbd may
// not carry an aria-label of its own (it has no role that takes one).
export function KeyCaps({ caps, small = false }: { caps: readonly Cap[]; small?: boolean }) {
  return (
    <>
      {caps.map((cap, index) => "text" in cap
        ? <kbd key={index} className={small ? "kc" : undefined}>{cap.text}</kbd>
        : <kbd key={index} className={small ? "kc" : undefined}><Icon name={`arrow-${cap.arrow}`} className="i i-key" /><span className="visually-hidden">{cap.name}</span></kbd>)}
    </>
  );
}

export function ShortcutsDialog() {
  const open = useUi((u) => u.shortcutsOpen);
  return open ? <ShortcutsWindow /> : null;
}

function ShortcutsWindow() {
  const { ui } = useEnv();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const wanted = query.trim().toLowerCase();
  const groups = KEY_GROUPS.map((group) => ({
    group,
    entries: KEYMAP.filter((entry) => entry.group === group && (wanted === "" || entry.label.toLowerCase().includes(wanted) || group.toLowerCase().includes(wanted))),
  })).filter((g) => g.entries.length > 0);
  return (
    <Dialog
      title="Keyboard shortcuts"
      className="dlg-keys"
      bodyClassName="keys-body"
      closeLabel="Close keyboard shortcuts"
      onClose={() => ui.getState().setShortcutsOpen(false)}
      tools={(
        <label className="search search-inline search-keys" htmlFor={searchId}>
          <Icon name="search" />
          <input id={searchId} type="search" placeholder="Find a shortcut" aria-label="Find a shortcut" data-autofocus value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}
      note={<p className="hint">On a Mac, use Cmd where this list says Ctrl, and Option where it says Alt. The Alt and Shift keys go by the key’s place, so they work on any keyboard layout.</p>}
    >
      {groups.length > 0 && KEY_COLUMNS.map((column) => (
        <div className="keys-col" key={column[0]}>
          {groups.filter((g) => column.includes(g.group)).map(({ group, entries }) => {
            const headId = `${searchId}-${group.replace(/\W+/g, "-")}`;
            return (
              <section className="keys-group" key={group} aria-labelledby={headId}>
                <h3 id={headId}>{group}</h3>
                <dl>
                  {entries.map((entry) => (
                    <div key={entry.action} data-action={entry.action}>
                      <dt>{entry.label}</dt>
                      <dd><KeyCaps caps={entryCaps(entry)} /></dd>
                    </div>
                  ))}
                </dl>
                {GROUP_NOTES[group] && <p className="hint">{GROUP_NOTES[group]}</p>}
              </section>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && <p className="hint" role="status">No shortcut is called “{query.trim()}”.</p>}
    </Dialog>
  );
}
