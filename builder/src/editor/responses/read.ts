// The forms of the site that visitors have sent, for the responses screen
// (./ResponsesScreen.tsx): the CMS keeps responses under their page, and
// counts each form's for it, so the site's forms are read page by page and
// named the way the editor names blocks ("Form in Join"), from the page's
// draft. A form may have left the draft since visitors sent it; its
// responses stay, under a name that says so.
import { blockWithPlace } from "../../document/labels.ts";
import { allBlocks } from "../../document/tree.ts";
import type { PageDocument } from "../../shared/document.ts";
import type { ResponsesStorage } from "./context.ts";

export interface SiteForm {
  // The page and the form block's id, together: a form's id is unique only
  // within its page.
  key: string;
  pageId: number;
  pageTitle: string;
  formId: string;
  // "Form in Join", "Form in Join (2)", "Form no longer on the page".
  name: string;
  // Whether the page's draft still has it.
  onPage: boolean;
  count: number;
  // The number of the page's version visitors see now.
  liveVersion: number | null;
}

export const NO_LONGER_ON_PAGE = "Form no longer on the page";

export const formKey = (pageId: number, formId: string): string => `${pageId}:${formId}`;

// The forms with responses, page by page in the site's order (the oldest
// page first, as the CMS lists them), and within a page in the draft's
// order, those no longer on it last. `documents` gives the draft a page
// already has open (the page being edited, with what it has not saved
// yet); the others are read from the CMS.
//
// Only a page that has been published can have responses: a form is sent
// from the live page, and no page goes back to not being live. So the
// pages never published are not asked.
export async function readSiteForms(storage: ResponsesStorage, documents: (pageId: number) => PageDocument | null = () => null): Promise<SiteForm[]> {
  const pages = (await storage.listPages()).filter((page) => page.published !== null);
  const counted = await Promise.all(pages.map(async (page) => ({ page, forms: (await storage.listResponses(page.id)).forms })));
  const named = await Promise.all(
    counted.map(async ({ page, forms }): Promise<SiteForm[]> => {
      if (forms.length === 0) return [];
      const document = documents(page.id) ?? (await storage.getDraft(page.id)).document;
      const names = formNames(document, forms.map((form) => form.formId));
      return [...forms]
        .sort((a, b) => names.get(a.formId)!.order - names.get(b.formId)!.order)
        .map((form): SiteForm => {
          const said = names.get(form.formId)!;
          return { key: formKey(page.id, form.formId), pageId: page.id, pageTitle: page.title, formId: form.formId, name: said.name, onPage: said.onPage, count: form.count, liveVersion: page.published?.versionNumber ?? null };
        });
    }),
  );
  return named.flat();
}

// Each form id's name on this page, and its place in the list: the draft's
// forms by where they stand ("Form in Join"; a second form in the same
// section is "Form in Join (2)", counted over every form of the draft, so a
// form keeps its name whether or not the others have responses); then the
// ids the draft no longer has, in the order of their ids.
export function formNames(document: PageDocument, formIds: readonly string[]): Map<string, { name: string; onPage: boolean; order: number }> {
  const inDraft: Array<{ id: string; place: string }> = [];
  for (const { block } of allBlocks(document)) {
    if (block.type === "form") inDraft.push({ id: block.id, place: blockWithPlace(document, block.id) });
  }
  const shared = new Map<string, number>();
  for (const form of inDraft) shared.set(form.place, (shared.get(form.place) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, { name: string; onPage: boolean; order: number }>();
  inDraft.forEach((form, order) => {
    const nth = (seen.get(form.place) ?? 0) + 1;
    seen.set(form.place, nth);
    names.set(form.id, { name: (shared.get(form.place) ?? 0) > 1 ? `${form.place} (${nth})` : form.place, onPage: true, order });
  });
  const gone = formIds.filter((id) => !names.has(id)).sort();
  gone.forEach((id, index) => {
    names.set(id, { name: gone.length > 1 ? `${NO_LONGER_ON_PAGE} (${index + 1})` : NO_LONGER_ON_PAGE, onPage: false, order: inDraft.length + index });
  });
  return names;
}
