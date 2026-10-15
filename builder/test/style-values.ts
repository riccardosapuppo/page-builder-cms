// The values each style key takes in the tests' pages: a key of tokens its
// tokens (STYLE_TOKENS), a key of free type values the schema and the
// rules take, as a document stores them, at both ends of each range and
// between: a size in every unit, every weight, negative, zero and
// fractional numbers.
import { STYLE_TOKENS, type StyleTokens } from "../src/shared/document.ts";

export const FREE_TYPE_SAMPLES = {
  fontSize: ["8px", "48px", "99.99px", "320px", "0.5rem", "2.25rem", "20rem", "0.5vw", "6vw", "25vw"],
  fontWeight: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  letterSpacing: [-0.1, -0.02, 0, 0.07, 0.5],
  lineHeight: [0.8, 0.95, 1, 1.33, 3],
  letterWidth: [62.5, 80, 100, 112.5, 125],
} as const;

export const STYLE_VALUES: Readonly<Record<keyof StyleTokens, readonly (string | number)[]>> = { ...STYLE_TOKENS, ...FREE_TYPE_SAMPLES };
