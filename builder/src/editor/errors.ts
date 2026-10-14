// What a field says when its value is refused: by the editor's own checks
// before anything is sent (a command the reducer refuses, with the
// validator's findings), or by the server, whose 422 names the block and
// the field (../storage/adapter.ts, errorsByBlock). Both come as a rule
// broken at a place; the field turns the rule into a sentence about
// itself, since the validator's own words are about patterns and keywords.
import type { CommandError } from "../document/check.ts";
import type { BlockFieldError } from "../storage/adapter.ts";

// What kind of value a field holds, for the sentence about a broken pattern.
export type FieldKind = "line" | "paragraph" | "href" | "imageUrl" | "anchor" | "classes" | "slug" | "number" | "other";

export interface FieldRules {
  kind?: FieldKind;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

const PATTERNS: Readonly<Record<FieldKind, string>> = {
  line: "Write at least one visible character, on one line.",
  paragraph: "Write at least one visible character.",
  href: "Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:.",
  imageUrl: "Use an https:// address, or a path on this site (/…).",
  anchor: "Lowercase letters, digits and hyphens, starting with a letter.",
  classes: "Up to eight names, each a letter then letters, digits, hyphens or underscores, at most 40 long.",
  slug: "Lowercase letters, digits and hyphens.",
  number: "Write a number.",
  other: "This value is not accepted here.",
};

// One finding as a sentence for the field that holds it.
export function explain(keyword: string, message: string, rules: FieldRules = {}, limit?: number): string {
  switch (keyword) {
    case "pattern":
    case "not":
    case "format":
      return PATTERNS[rules.kind ?? "other"];
    case "maxLength": {
      const most = limit ?? rules.maxLength;
      return most === undefined ? message : `Up to ${most} characters.`;
    }
    case "minLength":
    case "required":
      return "This cannot be empty.";
    case "minimum":
    case "maximum":
      return rules.minimum !== undefined && rules.maximum !== undefined ? `From ${rules.minimum} to ${rules.maximum}.` : message;
    case "type":
    case "multipleOf":
      return rules.kind === "number" ? "Write a number." : message;
    default:
      return message;
  }
}

// The sentence for a refused command at one field: from the finding whose
// pointer ends at that field (pointers run from the page down, so the
// field's own path is their tail), else the command's own message.
export function refusalAt(error: CommandError, field: string, rules: FieldRules = {}): string {
  const found = error.errors?.find((e) => e.pointer === field || e.pointer.endsWith(field));
  if (found) return explain(found.keyword, found.message, rules, found.limit);
  return error.message;
}

// The server's errors for one block (null: the page's own keys) at one
// field, as sentences.
export function serverErrorsAt(errors: readonly BlockFieldError[], blockId: string | null, field: string, rules: FieldRules = {}): string[] {
  return errors.filter((e) => e.blockId === blockId && e.field === field).map((e) => explain(e.keyword, e.message, rules));
}
