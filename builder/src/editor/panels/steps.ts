// The spacing steps as the ruler prints them (None, XS ... XXL, and the
// two section steps), with the name a screen reader says for each.
import { tokenName } from "../../document/labels.ts";

const SHORT: Readonly<Record<string, string>> = { "section-s": "Sec S", "section-l": "Sec L" };

export function spaceSteps(tokens: readonly string[]): Array<{ value: string; label: string; name: string }> {
  return tokens.map((token) => ({ value: token, label: SHORT[token] ?? tokenName(token), name: tokenName(token) }));
}
