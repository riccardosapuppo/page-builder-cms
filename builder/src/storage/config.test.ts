import { describe, expect, test } from "vitest";
import { apiBase, cmsAddress, cmsOrigin, storageKind } from "./config.ts";

describe("the storage", () => {
  test("is the CMS's unless VITE_STORAGE says browser", () => {
    expect([storageKind({}), storageKind({ VITE_STORAGE: "" }), storageKind({ VITE_STORAGE: " rails " }), storageKind({ VITE_STORAGE: "browser" })]).toEqual(["rails", "rails", "rails", "browser"]);
  });

  test("named wrong, stops the build rather than pick one", () => {
    expect(() => storageKind({ VITE_STORAGE: "indexeddb" })).toThrow('VITE_STORAGE must be rails or browser, not "indexeddb"');
  });
});

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

describe("the CMS's origin, where the preview and the live page open", () => {
  test("is where npm start runs the CMS when nothing says otherwise", () => {
    expect(cmsOrigin({})).toBe("http://127.0.0.1:3900");
    expect(cmsOrigin({ VITE_API_BASE: "/api", VITE_CMS_ORIGIN: " " })).toBe("http://127.0.0.1:3900");
  });

  test("is VITE_CMS_ORIGIN's origin, whatever path it carries", () => {
    expect(cmsOrigin({ VITE_CMS_ORIGIN: "http://127.0.0.1:3901" })).toBe("http://127.0.0.1:3901");
    expect(cmsOrigin({ VITE_CMS_ORIGIN: "https://cms.example/some/path/" })).toBe("https://cms.example");
  });

  test("follows an absolute API base when VITE_CMS_ORIGIN is not set, and yields to it when it is", () => {
    expect(cmsOrigin({ VITE_API_BASE: "https://cms.example/api" })).toBe("https://cms.example");
    expect(cmsOrigin({ VITE_API_BASE: "https://cms.example/api", VITE_CMS_ORIGIN: "https://pages.example" })).toBe("https://pages.example");
  });

  test("refuses a setting that is not an http address, naming it", () => {
    expect(() => cmsOrigin({ VITE_CMS_ORIGIN: "127.0.0.1:3900" })).toThrow('VITE_CMS_ORIGIN must be an http or https address, not "127.0.0.1:3900"');
    expect(() => cmsOrigin({ VITE_CMS_ORIGIN: "ftp://cms.example" })).toThrow("VITE_CMS_ORIGIN must be");
  });

  test("puts the CMS's paths on its origin", () => {
    expect(cmsAddress("/preview/12", "http://127.0.0.1:3901")).toBe("http://127.0.0.1:3901/preview/12");
    expect(cmsAddress("/", "http://127.0.0.1:3900")).toBe("http://127.0.0.1:3900/");
    expect(cmsAddress("/winter-series", "https://cms.example")).toBe("https://cms.example/winter-series");
  });
});
