// The editor's Content-Security-Policy (./csp.ts): first in the head of the
// built page, connections to this site and the two providers only, the
// page's inline script allowed by its own hash and no other, the players
// the renderers allow and no other frame.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { FRAME_ORIGINS } from "../src/render/frames.ts";
import { apiOrigin, editorPolicy, inlineScripts, withPolicy } from "./csp.ts";

const directives = (policy: string) => new Map(policy.split("; ").map((part) => {
  const [name, ...values] = part.split(" ");
  return [name!, values] as const;
}));

test("connections go to this site and the two providers' APIs, nowhere else; no plugin, no other base", () => {
  const policy = directives(editorPolicy([]));
  expect(policy.get("connect-src")).toEqual(["'self'", "blob:", "https://api.anthropic.com", "https://api.openai.com"]);
  expect(policy.get("script-src")).toEqual(["'self'"]);
  expect(policy.get("default-src")).toEqual(["'self'"]);
  expect(policy.get("object-src")).toEqual(["'none'"]);
  expect(policy.get("base-uri")).toEqual(["'self'"]);
  expect(policy.get("frame-src")).toEqual([...FRAME_ORIGINS]);
});

test("the page's own inline script is allowed by its hash, and only that script", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = inlineScripts(html);
  expect(scripts).toHaveLength(1);
  expect(scripts[0]).toContain("serviceWorker");
  const sha = `'sha256-${createHash("sha256").update(scripts[0]!, "utf8").digest("base64")}'`;
  expect(directives(editorPolicy(scripts)).get("script-src")).toEqual(["'self'", sha]);
  expect(inlineScripts(`<script type="module" src="/assets/index.js"></script>`)).toEqual([]);
});

test("the policy is the first element of the head, before any script", () => {
  const page = withPolicy("<!doctype html>\n<html><head>\n<meta charset=\"utf-8\">\n<script>go()</script>\n</head><body></body></html>");
  const head = page.slice(page.indexOf("<head>") + 6).trimStart();
  expect(head.startsWith("<meta http-equiv=\"Content-Security-Policy\"")).toBe(true);
  expect(head.indexOf("Content-Security-Policy")).toBeLessThan(head.indexOf("<script>"));
});

test("a build for a CMS on another origin connects there too, and shows its images and files from there", () => {
  expect([apiOrigin(undefined), apiOrigin("/api"), apiOrigin(" https://cms.example/api/ "), apiOrigin("http://127.0.0.1:3900/api")]).toEqual([null, null, "https://cms.example", "http://127.0.0.1:3900"]);
  const policy = directives(editorPolicy([], "http://127.0.0.1:3900"));
  expect(policy.get("connect-src")).toEqual(["'self'", "blob:", "https://api.anthropic.com", "https://api.openai.com", "http://127.0.0.1:3900"]);
  expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:", "https:", "http://127.0.0.1:3900"]);
  expect(policy.get("media-src")).toEqual(["'self'", "blob:", "http://127.0.0.1:3900"]);
});
