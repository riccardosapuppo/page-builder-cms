// What the interface's tests share: an editor store and the interface's
// own store around a page, on a fake clock, with a session of the test's
// making; a page holding one widget of each kind; and the server's 422 for
// one field, worded as the API words it and laid on the page by the
// adapter's own errorsByBlock, as the shell does with a refused save.
import { fireEvent, render, screen, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Command } from "../src/document/commands.ts";
import { locate, pointerOf } from "../src/document/tree.ts";
import { EditorProvider, type EditorEnv } from "../src/editor/context.tsx";
import { MediaServiceProvider } from "../src/editor/library/context.tsx";
import type { MediaService } from "../src/editor/library/service.ts";
import { emptySession, SessionProvider, type Session } from "../src/editor/session.tsx";
import { createUiStore, type UiStore } from "../src/editor/ui-store.ts";
import type { Block, PageDocument, WidgetType } from "../src/shared/document.ts";
import { validateDocument } from "../src/shared/validate.ts";
import { errorsByBlock, type FieldError } from "../src/storage/adapter.ts";
import { createEditorStore, type EditorStore } from "../src/store/editor-store.ts";
import { WIDGETS } from "../src/widgets/registry.ts";
import { newWidget, type AnyWidgetDefinition, type InputOf } from "../src/widgets/types.ts";
import { counter } from "./document-page.ts";
import { FakeClock } from "./fake-clock.ts";

// What a widget that needs something is made with in these tests.
const INPUTS: { [T in WidgetType]?: InputOf[T] } = {
  image: { url: "https://images.example.org/bay.jpg", alt: "The bay at dawn" },
  gallery: [{ url: "https://images.example.org/one.jpg", alt: "One" }, { mediaId: "m1", alt: "Two" }],
  video: { provider: "youtube", videoId: "abcdefghijk" },
};

// A page of one section ("Widgets") with one column ("col") holding one
// widget of each kind, each with its type as its id.
export function widgetPage(): PageDocument {
  const widgets = WIDGETS.map((definition: AnyWidgetDefinition) => newWidget(definition as never, definition.type, INPUTS[definition.type] as never)) as Block[];
  const document = {
    schemaVersion: 1,
    title: "Every widget",
    sections: [{ id: "widgets", type: "section", props: { label: "Widgets" }, style: { base: {} }, children: [{ id: "col", type: "column", props: {}, style: { base: {} }, children: widgets }] }],
  };
  const result = validateDocument(document);
  if (!result.valid) throw new Error(`the widget page is not valid: ${JSON.stringify(result.errors)}`);
  return result.document;
}

export interface Kit {
  env: EditorEnv;
  store: EditorStore;
  ui: UiStore;
  clock: FakeClock;
  media: MediaService | null;
  doc(): PageDocument;
  block(id: string): Block | undefined;
  // The command the last change was made with.
  lastCommand(): Command | undefined;
  render(node: ReactNode): RenderResult;
  // The server refuses the last save for a value of a block, as the API
  // answers a 422: a pointer into the request and the block's pointer.
  refuse(id: string, field: string, keyword: string, message: string): void;
}

// `media`: the media library's work (src/editor/library/service.ts), when
// the test gives one; without it the library is only chosen from.
export function editorKit(options: { document: PageDocument; selection?: string | null; session?: Partial<Session>; media?: (ui: UiStore) => MediaService }): Kit {
  const clock = new FakeClock(Date.UTC(2026, 9, 2, 9));
  const store = createEditorStore({ document: options.document, now: () => clock.now() });
  if (options.selection) store.getState().select(options.selection);
  const ui = createUiStore();
  const env: EditorEnv = { store, ui, clock, newId: counter("n") };
  const session: Session = emptySession(options.session);
  const media = options.media?.(ui) ?? null;
  return {
    env,
    store,
    ui,
    clock,
    media,
    doc: () => store.getState().document,
    block: (id) => locate(store.getState().document, id)?.block,
    lastCommand: () => store.getState().past.at(-1)?.command,
    // A wrapper, so a rerender keeps the providers.
    render: (node) => render(node, {
      wrapper: ({ children }) => (
        <EditorProvider env={env}>
          <SessionProvider value={session}>
            <MediaServiceProvider value={media}>{children}</MediaServiceProvider>
          </SessionProvider>
        </EditorProvider>
      ),
    }),
    refuse(id, field, keyword, message) {
      const sent = store.getState().document;
      const found = locate(sent, id);
      if (!found) throw new Error(`no block ${id}`);
      const at = `/document${pointerOf(found.path)}`;
      const error: FieldError = { pointer: `${at}${field}`, keyword, blockPointer: at, message };
      ui.getState().setServerErrors(errorsByBlock(sent, [error]));
    },
  };
}

// Opens the sidebar's groups by their names, each by a click on its head,
// as a person does; a group already open stays open.
export function openGroups(...names: string[]): void {
  for (const name of names) {
    const head = screen.getByRole("button", { name });
    if (head.getAttribute("aria-expanded") !== "true") fireEvent.click(head);
    if (head.getAttribute("aria-expanded") !== "true") throw new Error(`the ${name} group did not open`);
  }
}

// The names of the groups drawn, top to bottom.
export function groupNames(): string[] {
  return [...document.querySelectorAll(".grp .grp-name")].map((e) => e.textContent ?? "");
}

// The text of the error a control names in aria-describedby.
export function describedText(element: Element): string {
  const ids = (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  return ids.map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
}
