// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { wholeNumberFromEnv } from "./env.ts";

const NAME = "PBC_ENV_TEST_VALUE";
afterEach(() => {
  delete process.env[NAME];
});

test("unset or empty, the default applies", () => {
  expect(wholeNumberFromEnv(NAME, 60, 1)).toBe(60);
  process.env[NAME] = "";
  expect(wholeNumberFromEnv(NAME, 60, 1)).toBe(60);
});

test("a whole number at the minimum or above is taken", () => {
  process.env[NAME] = "20261002";
  expect(wholeNumberFromEnv(NAME, 1)).toBe(20261002);
  process.env[NAME] = "1";
  expect(wholeNumberFromEnv(NAME, 60, 1)).toBe(1);
});

test("anything else stops the run instead of running on nothing", () => {
  // 0 runs would pass a property having tried nothing; NaN would be a seed
  // nobody can replay.
  for (const raw of ["0", "-3", "abc", "1.5", "1e3", "0x10", "9007199254740993"]) {
    process.env[NAME] = raw;
    expect(() => wholeNumberFromEnv(NAME, 60, 1), raw).toThrow(`${NAME} must be a whole number of at least 1, not "${raw}"`);
  }
});
