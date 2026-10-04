// A JavaScript CPU profile, as Chrome DevTools Protocol's Profiler gives it
// (a tree of call frames, and the sampled node and the time since the last
// sample, in microseconds), reduced to the functions the time went to:
// - self: the time spent in the function's own code;
// - total: the time spent in it or in what it called (once per sample, so
//   a function that calls itself is not counted twice).
// Idle time is not part of the profile's total.
export interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}

export interface Profile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

export interface Hot {
  name: string;
  // The file and line (1-based) of the function, as the profile gives them.
  where: string;
  // ms.
  self: number;
  total: number;
}

export interface Reduced {
  // ms of all samples but the idle ones.
  total: number;
  hot: Hot[];
}

const label = (frame: ProfileNode["callFrame"]): { name: string; where: string } => ({
  name: frame.functionName === "" ? "(anonymous)" : frame.functionName,
  where: frame.url === "" ? "" : `${frame.url.replace(/^.*\//, "").replace(/\?.*$/, "")}:${frame.lineNumber + 1}`,
});

export function reduce(profile: Profile): Reduced {
  const parent = new Map<number, number>();
  const byId = new Map<number, ProfileNode>();
  for (const node of profile.nodes) {
    byId.set(node.id, node);
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  if (profile.samples.length !== profile.timeDeltas.length) throw new Error("the profile has a sample without a time, or a time without a sample");

  const self = new Map<number, number>();
  let total = 0;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    if (!node) throw new Error(`the profile samples a node it does not hold: ${id}`);
    if (node.callFrame.functionName === "(idle)") return;
    const micros = profile.timeDeltas[i]!;
    self.set(id, (self.get(id) ?? 0) + micros);
    total += micros;
  });

  const hot = new Map<string, Hot>();
  const at = (node: ProfileNode): Hot => {
    const { name, where } = label(node.callFrame);
    const key = `${name} ${where}`;
    let entry = hot.get(key);
    if (!entry) {
      entry = { name, where, self: 0, total: 0 };
      hot.set(key, entry);
    }
    return entry;
  };
  for (const [id, micros] of self) {
    const seen = new Set<Hot>();
    at(byId.get(id)!).self += micros / 1000;
    for (let up: number | undefined = id; up !== undefined; up = parent.get(up)) {
      const entry = at(byId.get(up)!);
      if (seen.has(entry)) continue;
      seen.add(entry);
      entry.total += micros / 1000;
    }
  }
  return { total: total / 1000, hot: [...hot.values()] };
}

export const bySelf = (reduced: Reduced, count: number): Hot[] => [...reduced.hot].sort((a, b) => b.self - a.self).slice(0, count);
export const byTotal = (reduced: Reduced, count: number): Hot[] => [...reduced.hot].filter((h) => !h.name.startsWith("(")).sort((a, b) => b.total - a.total).slice(0, count);
