// The "rails" project's own check of its harness: the CMS it started for
// this run takes a write and reads it back, on a database that held
// nothing before. The storage adapter's battery runs in this project too,
// against the same CMS.
import { describe, expect, inject, test } from "vitest";

const cms = inject("cmsUrl");

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${cms}${path}`, {
    method,
    headers: { accept: "application/json", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: await response.json() };
}

describe("the CMS this run started", () => {
  test("listens on 127.0.0.1, on the run's port", () => {
    expect(cms).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("keeps what is written to it", async () => {
    const created = await call("POST", "/api/pages", { title: "Harness check", slug: "harness-check" });
    expect(created.status).toBe(201);
    const listed = await call("GET", "/api/pages");
    expect(listed.status).toBe(200);
    const pages = (listed.json as { pages: Array<{ title: string; slug: string }> }).pages;
    // The harness saw an empty list before any test ran.
    expect(pages.map((p) => [p.title, p.slug])).toEqual([["Harness check", "harness-check"]]);
  });
});
