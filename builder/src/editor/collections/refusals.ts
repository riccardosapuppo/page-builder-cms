// Refusals laid on the fields that hold them, as the sidebar lays a
// refused save on its fields: from the editor's own checks before
// anything is sent (../../shared/validate.ts, validateEntry and
// validateCollection) and from the storage's answer (Invalid), both of
// which point into what was sent, the same way. Pure: no React.
import type { Field } from "../../shared/collection.ts";
import { definitionRefusal, entryRefusal, VALUE_PARTS, valueRefusal } from "./words.ts";

export interface Finding {
  pointer: string;
  keyword: string;
  message: string;
}

const unescape = (step: string): string => step.replaceAll("~1", "/").replaceAll("~0", "~");

function add(map: Record<string, string[]>, key: string, sentence: string): void {
  const list = (map[key] ??= []);
  if (!list.includes(sentence)) list.push(sentence);
}

// An entry's refusals: at its title, its slug, each field's value by its
// key (and a part with a control of its own by its key and the part's
// pointer: "hero/alt", "more/href"), and the rest (said above the form).
export interface EntryIssues {
  title: string[];
  slug: string[];
  values: Record<string, string[]>;
  other: string[];
}

export const NO_ENTRY_ISSUES: EntryIssues = { title: [], slug: [], values: {}, other: [] };

export function entryIssues(fields: readonly Field[], findings: readonly Finding[]): EntryIssues {
  const out: EntryIssues = { title: [], slug: [], values: {}, other: [] };
  for (const { pointer, keyword, message } of findings) {
    if (pointer === "/title" || pointer === "/slug") {
      const member = pointer === "/title" ? "title" : "slug";
      const sentence = entryRefusal(member, keyword, message);
      if (!out[member].includes(sentence)) out[member].push(sentence);
      continue;
    }
    const found = /^\/values\/([^/]+)(\/.*)?$/.exec(pointer);
    const field = found ? fields.find((f) => f.key === unescape(found[1]!)) : undefined;
    if (found && field) {
      const inner = found[2] ?? "";
      const part = VALUE_PARTS[field.type]?.includes(inner) ? inner : "";
      add(out.values, `${field.key}${part}`, valueRefusal(field, inner, keyword, message));
      continue;
    }
    // A value no field takes is left out of the save; anything else is
    // said above the form, as the storage said it.
    if (keyword !== "unknownField" && !out.other.includes(message)) out.other.push(message);
  }
  return out;
}

// How many places an entry's refusals are at.
export function issueCount(issues: EntryIssues): number {
  return (issues.title.length > 0 ? 1 : 0) + (issues.slug.length > 0 ? 1 : 0) + Object.values(issues.values).filter((list) => list.length > 0).length + issues.other.length;
}

// A collection's definition refused: at its name, its prefix, each field
// by its place in the list (its key, its label, its options, an option,
// its bounds), the list itself, the order, and the rest.
export interface FieldIssues {
  key: string[];
  label: string[];
  options: string[];
  // By the option's place in the list.
  option: Record<number, string[]>;
  bounds: string[];
  other: string[];
}

export interface DefinitionIssues {
  name: string[];
  prefix: string[];
  fields: Record<number, FieldIssues>;
  list: string[];
  sort: string[];
  other: string[];
}

export const NO_DEFINITION_ISSUES: DefinitionIssues = { name: [], prefix: [], fields: {}, list: [], sort: [], other: [] };

const emptyField = (): FieldIssues => ({ key: [], label: [], options: [], option: {}, bounds: [], other: [] });

function push(list: string[], sentence: string): void {
  if (!list.includes(sentence)) list.push(sentence);
}

export function definitionIssues(findings: readonly Finding[]): DefinitionIssues {
  const out: DefinitionIssues = { name: [], prefix: [], fields: {}, list: [], sort: [], other: [] };
  for (const { pointer, keyword, message } of findings) {
    if (pointer === "/name") {
      push(out.name, definitionRefusal("name", keyword, message));
      continue;
    }
    if (pointer === "/prefix") {
      push(out.prefix, definitionRefusal("prefix", keyword, message));
      continue;
    }
    if (pointer === "/sort" || pointer.startsWith("/sort/")) {
      push(out.sort, definitionRefusal("sort", keyword, message));
      continue;
    }
    if (pointer === "/fields") {
      push(out.list, definitionRefusal("fields", keyword, message));
      continue;
    }
    const found = /^\/fields\/(\d+)(?:\/([a-zA-Z]+))?(?:\/(\d+))?$/.exec(pointer);
    if (!found) {
      push(out.other, message);
      continue;
    }
    const at = Number(found[1]);
    const field = (out.fields[at] ??= emptyField());
    const member = found[2];
    if (member === "key") push(field.key, definitionRefusal("key", keyword, message));
    else if (member === "label") push(field.label, definitionRefusal("label", keyword, message));
    else if (member === "options" && found[3] !== undefined) push((field.option[Number(found[3])] ??= []), definitionRefusal("option", keyword, message));
    else if (member === "options") push(field.options, definitionRefusal("options", keyword, message));
    // The shop's price retyped: said under the field, in words.
    else if (member === "type") push(field.other, definitionRefusal("type", keyword, message));
    else if (member === "min" || member === "max") {
      // The two bounds out of order is said of both; anything else of the
      // one it is about.
      const sentence = definitionRefusal("bound", keyword, message);
      push(field.bounds, keyword === "range" ? sentence : `${member === "min" ? "Lowest" : "Highest"}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`);
    }
    // A choice without options, one with bounds, a field with what its
    // type does not take: the field's own, said under it.
    else if (keyword === "required" && message.includes("options")) push(field.options, definitionRefusal("options", "required", message));
    else push(field.other, message);
  }
  return out;
}

// Whether a definition's refusals say anything.
export function anyIssue(issues: DefinitionIssues): boolean {
  const field = (f: FieldIssues) => f.key.length + f.label.length + f.options.length + Object.values(f.option).flat().length + f.bounds.length + f.other.length > 0;
  return issues.name.length + issues.prefix.length + issues.list.length + issues.sort.length + issues.other.length > 0 || Object.values(issues.fields).some(field);
}
