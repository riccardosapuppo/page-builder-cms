// Which chunks of a built bundle a page loads at once and which it loads
// later, read from the files themselves: a chunk is loaded at once when the
// entry, or a chunk the entry imports statically (at any depth), names it in
// an import or an export ... from; it is lazy when some file reaches it with
// import() and nothing at once imports it statically; and it comes along
// with a lazy chunk when only lazy chunks (or what comes along with them)
// import it statically, as a provider's SDK brings code of its own. Names
// are what the bundler writes: "./x-HASH.js", between double quotes or
// backticks.
export interface Chunk {
  name: string;
  text: string;
}

// import"./x.js" and from"./x.js" (static); import("./x.js") (dynamic).
const STATIC = /(?:\bfrom\s*|\bimport\s*)["`]\.\/([^"`]+\.js)["`]/g;
const DYNAMIC = /\bimport\(\s*["`]\.\/([^"`]+\.js)["`]\s*\)/g;

const found = (pattern: RegExp, source: string): string[] => [...source.matchAll(pattern)].map((m) => m[1]!);

export const staticImports = (text: string): string[] => found(STATIC, text);
export const dynamicImports = (text: string): string[] => found(DYNAMIC, text);

export interface Graph {
  // The entry and every chunk it imports statically, by name.
  atOnce: Set<string>;
  // Each chunk loaded later, and the chunk that reaches it with import().
  lazy: Map<string, string>;
  // Each chunk loaded later because a chunk loaded later imports it
  // statically, and that chunk.
  along: Map<string, string>;
}

// `folder` is the path the chunks' names are under ("assets/"), so that
// "./x.js" in a chunk is "assets/x.js" in the list.
export function graph(chunks: readonly Chunk[], entry: string, folder = "assets/"): Graph {
  const byName = new Map(chunks.map((c) => [c.name, c]));
  const first = byName.get(entry);
  if (!first) throw new Error(`the entry ${entry} is not among the chunks`);
  const atOnce = new Set<string>([entry]);
  for (const queue = [first]; queue.length > 0;) {
    const next = queue.pop()!;
    for (const name of staticImports(next.text)) {
      const chunk = byName.get(folder + name);
      if (chunk && !atOnce.has(chunk.name)) {
        atOnce.add(chunk.name);
        queue.push(chunk);
      }
    }
  }
  const lazy = new Map<string, string>();
  for (const chunk of chunks) {
    for (const name of dynamicImports(chunk.text)) {
      const target = byName.get(folder + name);
      if (target && !atOnce.has(target.name)) lazy.set(target.name, chunk.name);
    }
  }
  const along = new Map<string, string>();
  for (const queue = [...lazy.keys()]; queue.length > 0;) {
    const from = queue.pop()!;
    for (const name of staticImports(byName.get(from)!.text)) {
      const target = byName.get(folder + name);
      if (target && !atOnce.has(target.name) && !lazy.has(target.name) && !along.has(target.name)) {
        along.set(target.name, from);
        queue.push(target.name);
      }
    }
  }
  return { atOnce, lazy, along };
}
