// What the Collections screen's tests share: the editor kit with a storage
// that keeps collections (./fake-collections.ts), the screen
// opened from the mark's menu as a person opens it, and a field's text
// typed and handed over as the panels' fields hand theirs (on leaving it).
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { CollectionDefinition } from "../src/shared/collection.ts";
import { editorKit, type Kit } from "./editor-kit.tsx";
import { page } from "./document-page.ts";
import type { FakeCollections } from "./fake-collections.ts";
import { emptySession, type Session } from "../src/editor/session.tsx";
import { TopBar } from "../src/editor/TopBar.tsx";
import { CollectionsScreen } from "../src/editor/collections/CollectionsScreen.tsx";
import { presetFields } from "../src/editor/collections/presets.ts";

export const NEWS: CollectionDefinition = { name: "News", prefix: "news", fields: presetFields("articles"), sort: { by: "date", direction: "desc" } };

export async function openScreen(fake: FakeCollections, session: Partial<Session> = {}): Promise<{ kit: Kit; dialog: HTMLElement }> {
  const kit = editorKit({ document: page(), collections: fake, session: { capabilities: { ...emptySession().capabilities, collections: true }, ...session } });
  kit.render(<><TopBar /><CollectionsScreen /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Collections" })));
  const dialog = screen.getByRole("dialog", { name: "Collections" });
  return { kit, dialog };
}

// A field's new text, handed over as the person leaves the field.
export async function type(field: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: text } });
    fireEvent.blur(field);
  });
}

// A click whose work goes through the storage, its answers awaited.
export async function press(element: HTMLElement): Promise<void> {
  await act(async () => fireEvent.click(element));
}

export const field = (scope: HTMLElement, name: RegExp | string) => within(scope).getByRole("textbox", { name });
