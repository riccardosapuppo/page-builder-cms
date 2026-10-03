// @vitest-environment node
// A text's link is refused at its field for what the server would refuse,
// with the reason in a sentence, and taken in the form the schema wants.
// The verdicts are held to the URL policy and the schema themselves, so
// the field can neither refuse an address the server takes nor take one
// it refuses.
import { expect, test } from "vitest";
import { linkHref } from "../../render/policy.ts";
import { checkLink, linkAllowed } from "./link-check.ts";

const reason = (raw: string) => {
  const checked = checkLink(raw);
  return checked.ok ? null : checked.reason;
};

test("the addresses a link may take are taken, trimmed", () => {
  for (const href of ["https://swims.example.org/join?when=winter#top", "http://example.org", "/swims", "#join", "?season=winter", "mailto:club@example.org", "tel:+441234567"]) {
    expect(checkLink(` ${href} `)).toEqual({ ok: true, href });
    expect(linkAllowed(href)).toBe(true);
  }
});

test("a character outside ASCII is percent-encoded, as the schema asks of the editor", () => {
  expect(checkLink("/café")).toEqual({ ok: true, href: "/caf%C3%A9" });
  expect(checkLink("https://example.org/🌊")).toEqual({ ok: true, href: "https://example.org/%F0%9F%8C%8A" });
  expect(linkAllowed("/café")).toBe(false);
});

test("each address refused says why", () => {
  expect(reason("")).toBe("Write the address the link goes to.");
  expect(reason("https://example.org/a b")).toBe("An address has no spaces. Check where it was cut, or copy it again.");
  expect(reason("javascript:alert(1)")).toBe("A link cannot go to a javascript: address. Use a full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:.");
  expect(reason("data:text/html,hi")).toMatch(/^A link cannot go to a data: address\./);
  expect(reason("ftp://files.example.org")).toMatch(/^A link cannot go to a ftp: address\./);
  expect(reason("HTTPS://example.org")).toBe("Write https: in lowercase.");
  expect(reason("//example.org/x")).toBe("Start a page of this site with one slash (/join), or write the whole address with https://.");
  expect(reason("example.org/swims")).toBe("Start the address with https:// (https://example.org/swims), or with / for a page of this site.");
  expect(reason("example.org:8080/swims")).toBe("Start the address with https:// (https://example.org:8080/swims), or with / for a page of this site.");
  expect(reason(`/${"a".repeat(2048)}`)).toBe("Up to 2048 characters.");
  // A host the schema's labels refuse, and user info, which the policy refuses.
  expect(reason("https://-example.org/")).toBe("Use a full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:.");
  expect(reason("https://user@example.org/")).toBe("Use a full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:.");
  expect(reason("/a\ud800")).toBe("The address holds a character that cannot be written in a link.");
});

test("the field and the server agree: what the field takes, the policy and the schema take", () => {
  const samples = [
    "https://swims.example.org/", "https://-bad.example/", "https://a..b/", "https://example.org:99999/", "http://x", "/", "//x", "/ok?q=1#f",
    "#", "?", "mailto:", "mailto:a@b", "tel:", "tel:12", "tel:+1(2)3-4.5", "javascript:void(0)", "https://example.org/\"quoted\"", "https://example.org/<b>",
    "https://example.org/%zz", "https://example.org/%41", "relative/path", "../up", "https://example.org/\\back",
  ];
  for (const raw of samples) {
    const checked = checkLink(raw);
    if (checked.ok) {
      expect(linkHref(checked.href), raw).toBe(checked.href);
      expect(linkAllowed(checked.href), raw).toBe(true);
    } else {
      expect(linkAllowed(raw.trim()), raw).toBe(false);
    }
  }
});
