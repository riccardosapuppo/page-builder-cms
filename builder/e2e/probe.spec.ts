// The probe moved to the start of stage 2: before any editor code
// relies on it, show that from a browser, on the editor development
// server's origin, through its proxy, a draft is saved and an image is
// uploaded with Active Storage's direct upload, to a real CMS.
//
// What it shows, on Chromium headless against the run's own CMS (e2e
// environment, forgery protection on) and Vite server:
// - the browser addresses only the editor's origin: every write, the PUT
//   of the image's bytes included, goes to 127.0.0.1:<editor port>, with
//   Origin set to that origin and Sec-Fetch-Site same-origin, as Chromium
//   sets them, never written by the test;
// - the CMS accepts those writes: the proxy keeps the Host, so the
//   editor's origin is the CMS's own, and its origin rule lets them in;
// - the draft is stored in this run's CMS, at the next revision, as asked
//   directly of the CMS, without the proxy;
// - @rails/activestorage's DirectUpload works unchanged with the API's
//   /media/direct_uploads, which needs no CSRF token, while Active
//   Storage's own endpoint refuses the same request on this server;
// - the CMS gives the upload address on the editor's host, the bytes go
//   there through the proxy, pass the CMS's checksum, become a media item,
//   and come back byte for byte from the library's address.
// What it does not show: anything about production, where there is no
// proxy (docs/decisions/editor-api-through-the-dev-proxy.md); an absolute
// VITE_API_BASE with CORS; other browsers; the storage adapter's own code,
// which does not exist yet and will have its own battery.
import { expect, test, type Request } from "@playwright/test";
// For the type of window.probe, which pages/probe.ts declares: the page
// module itself runs in the browser, never here.
import type {} from "./pages/probe.ts";

interface Sent {
  method: string;
  url: string;
  origin: string | undefined;
  site: string | undefined;
}

test("a draft save and a direct upload go from the editor's origin, through its proxy, to the CMS", async ({ page, request, baseURL }) => {
  const editorOrigin = new URL(baseURL ?? "").origin;
  const cmsUrl = process.env.E2E_CMS_URL ?? "";
  expect(cmsUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(cmsUrl).not.toBe(editorOrigin);

  const pending: Array<Promise<Sent>> = [];
  page.on("request", (sent: Request) => {
    if (sent.method() === "GET" || !new URL(sent.url()).pathname.match(/^\/(api|rails)\//)) return;
    pending.push(sent.allHeaders().then((headers) => ({ method: sent.method(), url: sent.url(), origin: headers.origin, site: headers["sec-fetch-site"] })));
  });

  await page.goto("/e2e/pages/probe.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => window.probe.location())).toBe(editorOrigin);
  expect(await page.evaluate(() => window.probe.apiBase())).toBe("/api");

  // The draft.
  const title = "Saved through the editor's proxy";
  const draft = await page.evaluate((t) => window.probe.saveDraft(t), title);
  expect(draft.created.status).toBe(201);
  expect(draft.before.status).toBe(200);
  const revision = (draft.before.body as { revision: number }).revision;
  expect(draft.saved.status, JSON.stringify(draft.saved.body)).toBe(200);
  expect((draft.saved.body as { revision: number; lastSaveId: string }).revision).toBe(revision + 1);
  expect((draft.saved.body as { lastSaveId: string }).lastSaveId).toBe("probe-save-1");
  expect((draft.after.body as { document: { title: string } }).document.title).toBe(title);
  // Asked of the CMS itself, not through the proxy: it is this run's CMS
  // that holds the draft.
  const direct = await request.get(`${cmsUrl}/api/pages/${draft.id}/draft`);
  expect(direct.status()).toBe(200);
  expect((await direct.json()) as unknown).toMatchObject({ revision: revision + 1, lastSaveId: "probe-save-1", document: { title } });

  // The image.
  const upload = await page.evaluate(() => window.probe.uploadImage());
  expect(upload.blob.contentType).toBe("image/png");
  expect(upload.blob.byteSize).toBe(upload.size);
  // Where the bytes went is in the list of writes below: a PUT to
  // /rails/active_storage/disk/ on the editor's origin.
  expect(upload.created.status, JSON.stringify(upload.created.body)).toBe(201);
  expect(upload.created.body).toMatchObject({ width: 3, height: 2, alt: "A probe image", contentType: "image/png", byteSize: upload.size });
  expect(upload.served.status).toBe(200);
  expect(new URL(upload.served.url).origin).toBe(editorOrigin);
  expect(upload.served.contentType).toBe("image/png");
  expect(upload.served.sha256).toBe(upload.sent);
  // The library on the CMS itself lists the item, found by its id: the
  // tests of a run share one CMS, and other tests put images in its
  // library before this one may run.
  const { id: itemId } = upload.created.body as { id: string };
  const media = await request.get(`${cmsUrl}/api/media`);
  expect(((await media.json()) as { media: Array<{ id: string; alt: string }> }).media.filter((m) => m.id === itemId).map((m) => m.alt)).toEqual(["A probe image"]);

  // Active Storage's own first step, on the same server, refuses without a CSRF token.
  const stock = await page.evaluate(() => window.probe.stockDirectUpload());
  expect(stock.status).toBe(422);

  // Every write the browser sent: where, and with which headers.
  const writes = await Promise.all(pending);
  const summary = writes.map((w) => `${w.method} ${new URL(w.url).pathname.replace(/\/disk\/.+$/, "/disk/...")}`);
  expect(summary).toEqual([
    "POST /api/pages",
    `PUT /api/pages/${draft.id}/draft`,
    "POST /api/media/direct_uploads",
    "PUT /rails/active_storage/disk/...",
    "POST /api/media",
    "POST /rails/active_storage/direct_uploads",
  ]);
  for (const write of writes) {
    expect(new URL(write.url).origin, write.url).toBe(editorOrigin);
    expect(write.origin, write.url).toBe(editorOrigin);
    expect(write.site, write.url).toBe("same-origin");
  }
});
