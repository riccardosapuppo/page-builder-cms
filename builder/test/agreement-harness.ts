// What the random-page agreement check (render-agreement.rails.test.tsx)
// and its planted faults (render-agreement-plants.rails.test.tsx) share: a
// page of their own
// on the CMS the run started, two library images, and the comparison of the
// page the CMS serves with the React render of the same document.
//
// Library images: the server's media resolver names Active Storage's proxy
// route with a signed id, which only the CMS can make. The harness uploads
// two images, reads the address and size the CMS gives each on a page once,
// and hands React a resolver with those answers. The resolver is an input
// of both renderers, not one of them, so this decides nothing about them.
// A draft cannot name an image the library does not have (the CMS refuses
// it), so the image gone from the library is the goldens' to show.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "parse5";
import { PageSections } from "../src/render/blocks.tsx";
import type { MediaImage, MediaResolver } from "../src/render/context.ts";
import type { PageDocument } from "../src/shared/document.ts";
import type { MediaItem, StorageAdapter } from "../src/storage/adapter.ts";
import { PNG_BYTES } from "../src/storage/contract.ts";
import { createRailsAdapter } from "../src/storage/rails.ts";
import { canonical, compareCanonical, findElement, mainOfPage, parseSections } from "./html-compare.ts";
import { checked } from "./render-arbitraries.ts";
import { safetyProblems } from "./render-safety.ts";

export interface Agreement {
  adapter: StorageAdapter;
  pageId: number;
  slug: string;
  previewPath: string;
  library: MediaItem[];
  resolver: MediaResolver;
  // Saves the document as the page's draft; throws if the CMS refuses it.
  save(document: unknown): Promise<void>;
  // Publishes the draft as it is, a new version each time, and gives the
  // live page's path; throws if the CMS refuses.
  publish(): Promise<string>;
  revision(): number;
  // Fetches the page at path (the preview by default) and compares it with
  // React's render of the document; throws with where they differ.
  agree(document: unknown, path?: string, label?: string): Promise<{ nodes: number }>;
  fetchText(path: string): Promise<string>;
}

export const oneColumn = (children: unknown[]) => ({
  schemaVersion: 1,
  title: "Random page",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children }] }],
});

export async function startAgreement(cms: string, name: string): Promise<Agreement> {
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const adapter = createRailsAdapter({ apiBase: `${cms}/api` });
  const fetchText = async (path: string) => {
    const response = await fetch(new URL(path, cms), { signal: AbortSignal.timeout(20_000) });
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
    return response.text();
  };

  const library: MediaItem[] = [];
  for (const image of ["shore", "pier"]) {
    const outcome = await adapter.uploadMedia({ file: new File([PNG_BYTES], `${image}-${run}.png`, { type: "image/png" }), width: 3, height: 2, alt: `The ${image}` });
    if (!outcome.ok) throw new Error(`the upload was refused: ${JSON.stringify(outcome.problem)}`);
    library.push(outcome.value);
  }
  const slug = `${name}-${run}`;
  const created = await adapter.createPage({ title: "Random page", slug });
  if (!created.ok) throw new Error(`the page was refused: ${JSON.stringify(created.problem)}`);
  const pageId = created.value.page.id;
  const previewPath = created.value.links.preview;
  let revision = created.value.draft.revision;
  let saves = 0;

  const save = async (document: unknown) => {
    saves += 1;
    const outcome = await adapter.saveDraft(pageId, { revision, document: document as PageDocument, saveId: `${slug}-${saves}` });
    if (!outcome.ok) throw new Error(`the CMS refused a valid page: ${JSON.stringify(outcome.problem).slice(0, 500)}`);
    revision = outcome.value.revision;
  };

  const publish = async () => {
    const published = await adapter.publish(pageId, { revision });
    if (!published.ok) throw new Error(`publishing was refused: ${JSON.stringify(published.problem)}`);
    if (published.value.links.live === null) throw new Error("a published page has no live address");
    return published.value.links.live;
  };

  // What the CMS answers for each library image, read off a page holding them.
  const known = new Map<string, MediaImage>();
  await save(checked(oneColumn(library.map((item, index) => ({ id: `img-${index}`, type: "image", props: { mediaId: item.id, alt: item.alt }, children: [], style: { base: {} } })))));
  const served = parse(await fetchText(previewPath));
  for (const item of library) {
    const block = findElement(served, (e) => e.attrs.some((a) => a.name === "data-media-id" && a.value === item.id));
    const img = block && findElement(block, (e) => e.tagName === "img");
    if (!img) throw new Error(`the preview shows no image for ${item.id}`);
    const value = (attribute: string) => img.attrs.find((a) => a.name === attribute)?.value;
    known.set(item.id, { src: value("src")!, width: Number(value("width")), height: Number(value("height")) });
  }
  const resolver: MediaResolver = (mediaId) => known.get(mediaId) ?? null;

  const agree = async (document: unknown, path = previewPath, label = "preview") => {
    const page = mainOfPage(await fetchText(path));
    const html = renderToStaticMarkup(createElement(PageSections, { document, ctx: { media: resolver } }));
    const result = compareCanonical(canonical(page), canonical(parseSections(html)), label);
    if (!result.equal) throw new Error(result.message);
    const problems = safetyProblems(html);
    if (problems.length > 0) throw new Error(`React's render fails the safety check: ${problems.join("; ")}`);
    return { nodes: result.nodes.react };
  };

  return { adapter, pageId, slug, previewPath, library, resolver, save, publish, revision: () => revision, agree, fetchText };
}
