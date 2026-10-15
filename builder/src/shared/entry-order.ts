// The order of a collection's entries, by one value of each: the list the
// API answers (the CMS's EntriesController, the browser's storage) and a
// Collection list on a page (../widgets/collectionList/cards.ts) put
// entries in the same order, the twin of EntryOrder
// (cms/app/models/entry_order.rb).

// Ruby's order of two UTF-8 strings, byte by byte, which is code point by
// code point: not JavaScript's, by UTF-16 unit, where a letter past U+FFFF
// comes before U+E000.
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  if (i >= a.length && j >= b.length) return 0;
  return i >= a.length ? -1 : 1;
}

// The value an entry is ordered by: a time as the API writes it, a title,
// a date field's value as its text, a number field's as its number; null
// for none, or one of another kind than its field takes.
export type SortValue = string | number | null;

// By the value, the ones without one last; each run of one value by id;
// reversed, those without a value apart, for a descending order. The
// values of one key are all text or all numbers.
export function orderedBy<T extends { id: number }>(items: readonly T[], value: (item: T) => SortValue, descending: boolean): T[] {
  const valued = items.filter((item) => value(item) !== null);
  const rest = items.filter((item) => value(item) === null).sort((a, b) => a.id - b.id);
  const compare = (a: SortValue, b: SortValue): number =>
    (typeof a === "number" && typeof b === "number" ? a - b : compareCodePoints(String(a), String(b)));
  const sorted = [...valued].sort((a, b) => compare(value(a), value(b)) || a.id - b.id);
  return descending ? [...sorted.reverse(), ...rest.reverse()] : [...sorted, ...rest];
}
