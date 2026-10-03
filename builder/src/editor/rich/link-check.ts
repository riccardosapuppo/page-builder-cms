// Where a link of a text may go, decided as the server decides it: the
// address must pass the URL policy the renderers apply
// (../../render/policy.ts, the twin of the CMS's RenderPolicy) and the
// schema's href, through the same compiled validator the editor checks
// every change with (../../shared/validate.ts). What fails is refused at
// the link's field with the reason, in a sentence, before the text holds
// it: a text the server would refuse never leaves the editor.
//
// One thing is mended rather than refused: a character outside ASCII,
// which the schema leaves to the editor to percent-encode
// ("/café" becomes "/caf%C3%A9").
import { linkHref, MAX_URL_LENGTH } from "../../render/policy.ts";
import { validateBlockSchema } from "../../shared/validate.ts";

export type LinkCheck = { ok: true; href: string } | { ok: false; reason: string };

const SCHEMES = ["https", "http", "mailto", "tel"];
const GENERAL = "Use a full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:.";

// The address, encoded as the schema wants it, or why it cannot be a link.
export function checkLink(raw: string): LinkCheck {
  const typed = raw.trim();
  if (typed === "") return { ok: false, reason: "Write the address the link goes to." };
  if (/\s/.test(typed)) return { ok: false, reason: "An address has no spaces. Check where it was cut, or copy it again." };
  let href: string;
  try {
    href = typed.replace(/[^\0-\x7f]+/g, (characters) => encodeURIComponent(characters));
  } catch {
    // Half of a UTF-16 pair, which no address can carry.
    return { ok: false, reason: "The address holds a character that cannot be written in a link." };
  }
  // A site's name with no scheme ("example.org/swims", "example.org:8080"),
  // which a browser's address bar takes and a link does not.
  if (/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?::[0-9]*)?(?:[/?#]|$)/.test(href)) {
    return { ok: false, reason: `Start the address with https:// (https://${href}), or with / for a page of this site.` };
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(href)?.[1];
  if (scheme !== undefined && !SCHEMES.includes(scheme)) {
    if (SCHEMES.includes(scheme.toLowerCase())) return { ok: false, reason: `Write ${scheme.toLowerCase()}: in lowercase.` };
    return { ok: false, reason: `A link cannot go to a ${scheme}: address. ${GENERAL}` };
  }
  if (href.startsWith("//")) return { ok: false, reason: "Start a page of this site with one slash (/join), or write the whole address with https://." };
  if ([...href].length > MAX_URL_LENGTH) return { ok: false, reason: `Up to ${MAX_URL_LENGTH} characters.` };
  if (linkHref(href) === null || !schemaTakes(href)) return { ok: false, reason: GENERAL };
  return { ok: true, href };
}

// Whether the address is one the text editor may write at all: for the
// editor's own link mark, which also checks what a paste brings in.
export function linkAllowed(href: unknown): boolean {
  return typeof href === "string" && linkHref(href) !== null && schemaTakes(href);
}

// The schema's href, asked through a text holding one link to it.
function schemaTakes(href: string): boolean {
  return validateBlockSchema({
    id: "link",
    type: "text",
    props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href } }] }] }] } },
    children: [],
    style: { base: {} },
  }).valid;
}
