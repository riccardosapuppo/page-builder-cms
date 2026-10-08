// The forms of the site that visitors have sent, for the responses screen
// (./ResponsesScreen.tsx): the CMS keeps responses under their page, and
// counts each form's for it, so the site's forms are read page by page and
// named the way the editor names blocks ("Form in Join"), from the page's
// draft. A form may have left the draft since visitors sent it; its
// responses stay, under a name that says where the form still is: on the
// live page until the next publish, or nowhere.
import { blockWithPlace } from "../../document/labels.ts";
import { allBlocks } from "../../document/tree.ts";
import type { PageDocument } from "../../shared/document.ts";
import { isStorageError } from "../../storage/adapter.ts";
import type { ResponsesStorage } from "./context.ts";

export interface SiteForm {
  // The page and the form block's id, together: a form's id is unique only
  // within its page.
  key: string;
  pageId: number;
  pageTitle: string;
  formId: string;
  // "Form in Join", "Form in Join (2)", "Form in Join, on the live page
  // only", "Form no longer on the page".
  name: string;
  // Whether the page's draft still has it.
  onPage: boolean;
  count: number;
  // The number of the page's version visitors see now.
  liveVersion: number | null;
}

// A page whose forms could not be read, and why: the screen names it and
// shows the others.
export interface UnreadPage {
  pageId: number;
  pageTitle: string;
  message: string;
}

export interface SiteForms {
  forms: SiteForm[];
  unread: UnreadPage[];
}

export const NO_LONGER_ON_PAGE = "Form no longer on the page";
export const LIVE_ONLY = "on the live page only";

export const formKey = (pageId: number, formId: string): string => `${pageId}:${formId}`;

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// The forms with responses, page by page in the site's order (the oldest
// page first, as the CMS lists them), and within a page in the draft's
// order, those no longer in it last. `documents` gives the draft a page
// already has open (the page being edited, with what it has not saved
// yet); the others are read from the CMS. A page that has forms no longer
// in its draft has its live version read too, to tell the forms visitors
// still see from those gone for good.
//
// Only a page that has been published can have responses: a form is sent
// from the live page, and no page goes back to not being live. So the
// pages never published are not asked.
//
// A page whose reads fail is set apart with the reason, and the other
// pages' forms are still given: one page the CMS cannot answer for does
// not hide the rest. Only the list of pages failing fails the whole.
export async function readSiteForms(storage: ResponsesStorage, documents: (pageId: number) => PageDocument | null = () => null): Promise<SiteForms> {
  const pages = (await storage.listPages()).filter((page) => page.published !== null);
  const read = await Promise.all(
    pages.map(async (page): Promise<{ forms: SiteForm[] } | { unread: UnreadPage }> => {
      try {
        const { forms } = await storage.listResponses(page.id);
        if (forms.length === 0) return { forms: [] };
        const document = documents(page.id) ?? (await storage.getDraft(page.id)).document;
        const ids = forms.map((form) => form.formId);
        const live = page.published && ids.some((formId) => !draftForms(document).has(formId))
          ? (await storage.getVersion(page.id, page.published.versionNumber)).document
          : null;
        const names = formNames(document, ids, live);
        return {
          forms: [...forms]
            .sort((a, b) => names.get(a.formId)!.order - names.get(b.formId)!.order)
            .map((form): SiteForm => {
              const said = names.get(form.formId)!;
              return { key: formKey(page.id, form.formId), pageId: page.id, pageTitle: page.title, formId: form.formId, name: said.name, onPage: said.onPage, count: form.count, liveVersion: page.published?.versionNumber ?? null };
            }),
        };
      } catch (error) {
        return { unread: { pageId: page.id, pageTitle: page.title, message: describe(error) } };
      }
    }),
  );
  return {
    forms: read.flatMap((one) => ("forms" in one ? one.forms : [])),
    unread: read.flatMap((one) => ("unread" in one ? [one.unread] : [])),
  };
}

function draftForms(document: PageDocument): Set<string> {
  const ids = new Set<string>();
  for (const { block } of allBlocks(document)) if (block.type === "form") ids.add(block.id);
  return ids;
}

// Each form id's name on this page, and its place in the list: the draft's
// forms by where they stand ("Form in Join"; a second form in the same
// section is "Form in Join (2)", counted over every form of the draft, so a
// form keeps its name whether or not the others have responses); then the
// ids the draft no longer has, in the order of their ids: named by where
// they stand on the live page when it still has them ("Form in Join, on
// the live page only"), else as gone.
export function formNames(document: PageDocument, formIds: readonly string[], live: PageDocument | null = null): Map<string, { name: string; onPage: boolean; order: number }> {
  const names = new Map<string, { name: string; onPage: boolean; order: number }>();
  placed(document).forEach((name, formId) => names.set(formId, { name, onPage: true, order: names.size }));
  const gone = formIds.filter((formId) => !names.has(formId)).sort();
  const onLive = live ? placed(live) : new Map<string, string>();
  const liveOnly = gone.filter((formId) => onLive.has(formId));
  const nowhere = gone.filter((formId) => !onLive.has(formId));
  // Two forms of one section of the live page are told apart there
  // already ("Form in Join (2)"); the suffix follows.
  for (const formId of liveOnly) names.set(formId, { name: `${onLive.get(formId)!}, ${LIVE_ONLY}`, onPage: false, order: names.size });
  nowhere.forEach((formId, index) => {
    names.set(formId, { name: nowhere.length > 1 ? `${NO_LONGER_ON_PAGE} (${index + 1})` : NO_LONGER_ON_PAGE, onPage: false, order: names.size });
  });
  return names;
}

// The forms of a document by id, each named by where it stands, a second
// form of one section numbered, in the document's order.
function placed(document: PageDocument): Map<string, string> {
  const forms: Array<{ id: string; place: string }> = [];
  for (const { block } of allBlocks(document)) {
    if (block.type === "form") forms.push({ id: block.id, place: blockWithPlace(document, block.id) });
  }
  const shared = new Map<string, number>();
  for (const form of forms) shared.set(form.place, (shared.get(form.place) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const form of forms) {
    const nth = (seen.get(form.place) ?? 0) + 1;
    seen.set(form.place, nth);
    names.set(form.id, (shared.get(form.place) ?? 0) > 1 ? `${form.place} (${nth})` : form.place);
  }
  return names;
}
