// The sidebar's open groups, kept for the person in this browser (the
// approved layout, design/layout/: which groups are open is remembered per
// block type). It is the viewer's own preference, not the page's, so it
// lives in the browser's local storage, which may be missing, full or
// refused (a private window, site data blocked): every read and write is
// tried, and without it the sidebar draws its groups as each panel does at
// first. What is read is taken only in the shape it is written in, so a
// value left by anything else is ignored rather than drawn.
import type { OpenGroups, UiStore } from "./ui-store.ts";

export const OPEN_GROUPS_KEY = "page-builder-cms:open-groups";

// The part of the Storage interface used here, so a test can hand one in.
export type GroupStorage = Pick<Storage, "getItem" | "setItem">;

// The browser's local storage, or null where reaching it throws.
export function browserStorage(): GroupStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readOpenGroups(storage: GroupStorage | null = browserStorage()): OpenGroups {
  let text: string | null;
  try {
    text = storage?.getItem(OPEN_GROUPS_KEY) ?? null;
  } catch {
    return {};
  }
  if (text === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(value)) return {};
  // Built with fromEntries, which defines each key as data: a key named
  // __proto__ stays a key, never the object's prototype.
  return Object.fromEntries(Object.entries(value).flatMap(([owner, part]) => {
    if (!isRecord(part)) return [];
    const kept = Object.entries(part).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean");
    return kept.length > 0 ? [[owner, Object.fromEntries(kept)]] : [];
  }));
}

// Writes the open groups each time they change, until the returned
// function is called. A write the browser refuses is let go: the groups
// stay as they are on screen, and the next change tries again.
export function keepOpenGroups(ui: UiStore, storage: GroupStorage | null = browserStorage()): () => void {
  return ui.subscribe((state, previous) => {
    if (state.openGroups === previous.openGroups || storage === null) return;
    try {
      storage.setItem(OPEN_GROUPS_KEY, JSON.stringify(state.openGroups));
    } catch {
      // Full or refused: nothing to keep it in.
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
