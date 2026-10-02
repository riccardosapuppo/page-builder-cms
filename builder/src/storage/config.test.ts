import { describe, expect, test } from "vitest";
import { apiBase } from "./config.ts";

describe("the API base", () => {
  test("is /api unless VITE_API_BASE says otherwise", () => {
    expect(apiBase({})).toBe("/api");
    expect(apiBase({ VITE_API_BASE: "" })).toBe("/api");
    expect(apiBase({ VITE_API_BASE: "  " })).toBe("/api");
  });

  test("takes an absolute address, without the trailing slash", () => {
    expect(apiBase({ VITE_API_BASE: "https://cms.example/api/" })).toBe("https://cms.example/api");
    expect(apiBase({ VITE_API_BASE: "http://127.0.0.1:3900/api" })).toBe("http://127.0.0.1:3900/api");
  });

  test("is /api in the unit tests' own build, where nothing sets it", () => {
    expect(apiBase()).toBe("/api");
  });
});
