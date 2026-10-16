// Edit the template: the one way to a collection's template on the canvas,
// whichever key asks for it. The Collections screen has three
// (./CollectionsScreen.tsx: in the collection's head, from its Entries tab
// too; at the foot of its Settings; in an entry's form, beside Preview and
// View), the page switch lists the templates apart (../PageSwitch.tsx),
// and a Collection list's panel leads to its collection's
// (../../widgets/collectionList/panel.tsx).
//
// The Collections screen closes first, when it is open, the focus going
// back where it was; then the template opens as a part opens, through the
// shell's openPage (../App.tsx), which saves the page open first and,
// when it cannot open the template, gives the reason the notice says. A
// template open already stays as it is, its history with it. Asked from an
// entry's form, the canvas draws the template with that entry, as the
// template's Page tab picks one (../panels/EditPanel.tsx, Preview with).
//
// What the Collections screen holds and has not saved is the screen's to
// ask about before this, as before anything else takes its place
// (./CollectionsScreen.tsx, leave); the page's own edits are saved by
// openPage, as at every change of page.
import type { Collection, Entry } from "../../storage/adapter.ts";
import type { Session } from "../session.tsx";
import type { UiStore } from "../ui-store.ts";

export function editTemplate(
  { ui, session }: { ui: UiStore; session: Pick<Session, "openPage" | "isOpen"> | null },
  collection: Pick<Collection, "id" | "template">,
  entry: Pick<Entry, "id"> | null = null,
): void {
  if (entry) ui.getState().setPreviewEntry({ collectionId: collection.id, choice: entry.id });
  if (ui.getState().collections !== null) ui.getState().setCollections(null);
  if (!session || session.isOpen(collection.template.id)) return;
  void session.openPage(collection.template.id).then((why) => {
    if (why) ui.getState().say(why);
  });
}
