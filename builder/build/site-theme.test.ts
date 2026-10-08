// The theme's file as the build reads it for the browser's storage: the
// shared section the CMS reads, with the time zone under the name the API
// gives it; a file the CMS could not start with stops the build.
import { expect, test } from "vitest";
import { readSiteTheme, siteThemeSource } from "./site-theme.ts";

test("the repository's file gives the site's name, menu, button, footer and time zone", () => {
  const theme = readSiteTheme();
  expect(typeof theme.name).toBe("string");
  expect(Array.isArray(theme.menu)).toBe(true);
  expect(theme.timeZone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  expect(siteThemeSource()).toContain("export const SITE_THEME = {");
});

test("a file without the shared section, or without a time zone, stops the build", () => {
  expect(() => readSiteTheme("development:\n  name: Elsewhere\n")).toThrow(/has no shared section/);
  expect(() => readSiteTheme("shared:\n  name: No zone\n")).toThrow(/names no time_zone/);
  expect(readSiteTheme("shared:\n  name: Tide club\n  time_zone: Europe/Rome\n")).toEqual({ name: "Tide club", menu: undefined, action: undefined, footer: undefined, timeZone: "Europe/Rome" });
});
