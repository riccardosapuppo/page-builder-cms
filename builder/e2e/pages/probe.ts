// The browser half of e2e/probe.spec.ts. It runs on the editor's
// development server, so every request below leaves from the editor's
// origin, with the headers Chromium sets itself (Origin, Sec-Fetch-Site),
// to an address on that origin, which the server's proxy passes to the CMS.
// It calls the API the way the storage adapter will: with the editor's API
// base (src/storage/config.ts), fetch for JSON, and @rails/activestorage's
// DirectUpload, unchanged, for the bytes of an image.
import { DirectUpload, type DirectUploadBlob } from "@rails/activestorage";
import { apiBase } from "../../src/storage/config.ts";

const api = apiBase();

export interface Answer {
  status: number;
  body: unknown;
}

async function call(method: string, path: string, body?: unknown): Promise<Answer> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// A real PNG, drawn and encoded by the browser: the CMS checks the first
// bytes against the type, and the size.
function drawPng(width: number, height: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.fillStyle = "#1E5B4C";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#EDC200";
  context.fillRect(1, 0, 1, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], "probe.png", { type: "image/png" })) : reject(new Error("toBlob gave nothing"))), "image/png");
  });
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function directUpload(file: File): Promise<DirectUploadBlob> {
  return new Promise((resolve, reject) => {
    new DirectUpload(file, `${api}/media/direct_uploads`).create((error, blob) => {
      if (error || !blob) reject(new Error(typeof error === "string" ? error : error?.message ?? "no blob"));
      else resolve(blob);
    });
  });
}

const document1 = (title: string) => ({
  schemaVersion: 1,
  title,
  sections: [{
    id: "s1", type: "section", props: {}, style: { base: {} },
    children: [{
      id: "c1", type: "column", props: {}, style: { base: {} },
      children: [{ id: "h1", type: "heading", props: { level: 1, text: title }, children: [], style: { base: {} } }],
    }],
  }],
});

export const probe = {
  location: () => window.location.origin,
  apiBase: () => api,

  // Create a page, read its draft, save a new document at that revision,
  // read it back.
  async saveDraft(title: string) {
    const created = await call("POST", "/pages", { title: "Probe", slug: "probe" });
    const id = (created.body as { page?: { id?: number } } | null)?.page?.id;
    const before = await call("GET", `/pages/${id}/draft`);
    const revision = (before.body as { revision?: number } | null)?.revision;
    const saved = await call("PUT", `/pages/${id}/draft`, { revision, document: document1(title), saveId: "probe-save-1" });
    const after = await call("GET", `/pages/${id}/draft`);
    return { id, created, before, saved, after };
  },

  // Upload an image with DirectUpload, add it to the media library, and
  // read its bytes back from the address the library gives.
  async uploadImage() {
    const file = await drawPng(3, 2);
    const sent = await sha256(await file.arrayBuffer());
    const blob = await directUpload(file);
    const created = await call("POST", "/media", { signedBlobId: blob.signed_id, width: 3, height: 2, alt: "A probe image" });
    const url = (created.body as { url?: string } | null)?.url ?? "";
    const served = await fetch(url);
    const back = await sha256(await served.arrayBuffer());
    return {
      size: file.size,
      sent,
      blob: { filename: blob.filename, contentType: blob.content_type, byteSize: blob.byte_size },
      created,
      served: { status: served.status, url: served.url, contentType: served.headers.get("content-type"), sha256: back },
    };
  },

  // The same first step, sent to Active Storage's own endpoint instead,
  // which keeps forgery protection: without a CSRF token it must refuse.
  async stockDirectUpload() {
    const response = await fetch("/rails/active_storage/direct_uploads", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ blob: { filename: "a.png", byte_size: 1, checksum: "1B2M2Y8AsgTpgAmY7PhCfg==", content_type: "image/png" } }),
    });
    return { status: response.status };
  },
};
export type Probe = typeof probe;

declare global {
  interface Window {
    probe: Probe;
  }
}
window.probe = probe;
document.body.dataset.ready = "true";
