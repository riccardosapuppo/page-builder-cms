// A short digest of a text (FNV-1a, 32 bits): enough to tell one edition
// of the example site, or one state of the browser's storage, from another
// (./example-site.ts, ./browser.ts). Worked out at once, with no promise to
// wait for, so it can be taken inside a transaction of the browser's
// database. Not a check against tampering.
export function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
