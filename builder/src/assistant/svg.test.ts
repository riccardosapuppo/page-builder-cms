// The illustrations' cleaner (./svg.ts): what a model drew is written out
// anew from a strict allowlist, comments, words that draw nothing and the
// root's own size left out; and a battery of hostile SVGs, each refused
// whole, with why: script in every disguise, event handlers, styles,
// foreign content, images and uses, links, url() of anything but a
// gradient of its own, animation, words, DOCTYPEs and entities, CDATA,
// instructions, other namespaces, documents written wrongly, too large,
// too deep, too many, and values that would make a check slow.
import { expect, test } from "vitest";
import { cleanSvg, SVG_MOST } from "./svg.ts";

const SIZE = { width: 1536, height: 1024 };
const HEAD = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\" width=\"1536\" height=\"1024\" preserveAspectRatio=\"xMidYMid slice\">";
const svg = (inner: string, root = "xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\"") => `<svg ${root}>${inner}</svg>`;
const BACKGROUND = "<rect width=\"600\" height=\"400\" fill=\"#E6EFEA\"/>";

test("an illustration is written anew from what the allowlist keeps: shapes, groups, gradients by their own ids, painting and numbers", () => {
  const drawn = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!-- An open sea at dawn -->",
    "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" width=\"600\" height=\"400\" viewBox=\"0 0 600 400\" class=\"art\" data-name=\"dawn\">",
    "  <title>Dawn</title>",
    "  <desc>A sun over the sea</desc>",
    "  <defs>",
    "    <linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">",
    "      <stop offset=\"0%\" stop-color=\"#F2A541\"/>",
    "      <stop offset=\"100%\" stop-color=\"#E6EFEA\" stop-opacity=\"0.8\"/>",
    "    </linearGradient>",
    "  </defs>",
    "  <rect id=\"background\" width=\"600\" height=\"400\" fill=\"url(#sky)\"/>",
    "  <!-- the sun -->",
    "  <circle cx=\"300\" cy=\"260\" r=\"80\" fill=\"#C2352B\"/>",
    "  <g transform=\"translate(0, 280)   scale(1 1)\" opacity=\".9\" aria-hidden=\"true\">",
    "    <path d=\"M0 40 C 150 0, 450 80, 600 40\n      L600 120 L0 120 Z\" fill=\"#0E2A35\"/>",
    "    <polygon points=\"100,60 140,20 180,60\" fill='#ffffff' stroke=\"#0E2A35\" stroke-width=\"4\" stroke-linejoin=\"round\"/>",
    "  </g>",
    "</svg>",
  ].join("\n");
  expect(cleanSvg(drawn, SIZE)).toEqual({
    ok: true,
    svg: HEAD
      + "<defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#F2A541\"/><stop offset=\"100%\" stop-color=\"#E6EFEA\" stop-opacity=\"0.8\"/></linearGradient></defs>"
      + "<rect width=\"600\" height=\"400\" fill=\"url(#sky)\"/>"
      + "<circle cx=\"300\" cy=\"260\" r=\"80\" fill=\"#C2352B\"/>"
      + "<g transform=\"translate(0, 280) scale(1 1)\" opacity=\".9\"><path d=\"M0 40 C 150 0, 450 80, 600 40 L600 120 L0 120 Z\" fill=\"#0E2A35\"/>"
      + "<polygon points=\"100,60 140,20 180,60\" fill=\"#ffffff\" stroke=\"#0E2A35\" stroke-width=\"4\" stroke-linejoin=\"round\"/></g>"
      + "</svg>",
  });
});

test("the root is written with the picture's size and covers it; its own painting is kept, its size and version are not", () => {
  const cleaned = cleanSvg(svg(BACKGROUND, "viewBox=\"0,0,300,300\" fill=\"#0E2A35\" width=\"10\" preserveAspectRatio=\"none\""), { width: 1024, height: 1024 });
  expect(cleaned).toEqual({ ok: true, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="1024" height="1024" preserveAspectRatio="xMidYMid slice" fill="#0E2A35">${BACKGROUND}</svg>` });
  // Every shape, and a radial gradient with its focus.
  const shapes = [
    "<radialGradient id=\"glow\" cx=\"50%\" cy=\"50%\" r=\"50%\" fx=\"40%\" fy=\"40%\" gradientUnits=\"objectBoundingBox\" spreadMethod=\"pad\"><stop offset=\".2\" stop-color=\"rgb(242, 165, 65)\"/></radialGradient>",
    "<ellipse cx=\"10\" cy=\"10\" rx=\"5\" ry=\"3\" fill=\"url(#glow)\"/>",
    "<line x1=\"0\" y1=\"0\" x2=\"10\" y2=\"10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-dasharray=\"4 2\"/>",
    "<polyline points=\"0 0 5 5 10 0\" fill=\"none\" stroke=\"black\"/>",
    "<rect x=\"1\" y=\"1\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#fff8\" fill-rule=\"evenodd\" transform=\"rotate(45 5 5) matrix(1,0,0,1,0,0)\"/>",
  ].join("");
  expect(cleanSvg(svg(shapes), SIZE)).toEqual({ ok: true, svg: `${HEAD}${shapes}</svg>` });
});

// Each hostile illustration, and a piece of why it is refused.
const HOSTILE: Array<[string, string, RegExp]> = [
  ["a script", svg(`${BACKGROUND}<script>alert(1)</script>`), /script element/],
  ["a script with a prefix", svg(`${BACKGROUND}<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>`), /svg:script element/],
  ["a script in a group", svg(`<g>${BACKGROUND}<script type="text/javascript">fetch('https://x.example')</script></g>`), /script element/],
  ["an event handler on the root", svg(BACKGROUND, "xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\" onload=\"alert(1)\""), /svg element has onload/],
  ["an event handler on a shape", svg("<rect width=\"600\" height=\"400\" onclick=\"alert(1)\"/>"), /rect element has onclick/],
  ["an event handler in capitals", svg("<rect width=\"600\" height=\"400\" OnMouseOver=\"alert(1)\"/>"), /has OnMouseOver/],
  ["a style attribute", svg("<rect width=\"600\" height=\"400\" style=\"fill:url(https://x.example/a.svg#p)\"/>"), /has style/],
  ["a style element", svg(`<style>@import url(https://x.example/a.css);</style>${BACKGROUND}`), /style element/],
  ["foreign content", svg(`${BACKGROUND}<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>`), /foreignObject element/],
  ["an image from another site", svg(`${BACKGROUND}<image href="https://x.example/a.png" width="10" height="10"/>`), /image element/],
  ["an image as a data address", svg(`${BACKGROUND}<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>`), /image element/],
  ["a use of something else", svg(`${BACKGROUND}<use href="https://x.example/a.svg#b"/>`), /use element/],
  ["a link", svg(`<a href="javascript:alert(1)">${BACKGROUND}</a>`), /a element/],
  ["an xlink:href on a gradient", svg(`<linearGradient id="a" xlink:href="https://x.example/a.svg#b"/>${BACKGROUND}`), /has xlink:href/],
  ["an href on a gradient", svg(`<linearGradient id="a" href="#b"><stop offset="0" stop-color="#000"/></linearGradient>${BACKGROUND}`), /has href/],
  ["a fill from another document", svg("<rect width=\"600\" height=\"400\" fill=\"url(https://x.example/a.svg#p)\"/>"), /fill is "url\(https/],
  ["a stroke from a script address", svg("<rect width=\"600\" height=\"400\" stroke=\"url('javascript:alert(1)')\"/>"), /stroke is/],
  ["a fill from a gradient it does not define", svg("<rect width=\"600\" height=\"400\" fill=\"url(#nowhere)\"/>"), /url\(#nowhere\), a gradient it does not define/],
  ["a filter", svg(`<filter id="f"><feImage href="https://x.example/a.png"/></filter>${BACKGROUND}`), /filter element/],
  ["a filter named on a shape", svg("<rect width=\"600\" height=\"400\" filter=\"url(#f)\"/>"), /has filter/],
  ["a clip path", svg(`<clipPath id="c"><rect width="1" height="1"/></clipPath>${BACKGROUND}`), /clipPath element/],
  ["an animation that rewrites a link", svg(`${BACKGROUND}<set attributeName="href" to="javascript:alert(1)"/>`), /set element/],
  ["an animation", svg(`<rect width="600" height="400"><animate attributeName="x" from="0" to="10" dur="1s"/></rect>`), /animate element/],
  ["words", svg(`${BACKGROUND}<text x="10" y="20">Sale!</text>`), /text element/],
  ["words in the root", svg(`${BACKGROUND}Free entry`), /svg element holds words/],
  ["words in a group", svg(`<g>${BACKGROUND}Free</g>`), /g element holds words/],
  ["a DOCTYPE with entities", `<!DOCTYPE svg [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>${svg(BACKGROUND)}`, /DOCTYPE/],
  ["an entity declared alone", `<!ENTITY x "y">${svg(BACKGROUND)}`, /declares an entity/],
  ["a named entity", svg(`${BACKGROUND}<g>&lt;script&gt;</g>`), /entity or a character reference/],
  ["a character reference in a value", svg("<rect width=\"600\" height=\"400\" fill=\"&#x23;fff\"/>"), /entity or a character reference/],
  ["CDATA", svg(`${BACKGROUND}<g><![CDATA[<script>alert(1)</script>]]></g>`), /CDATA/],
  ["a stylesheet instruction", `<?xml-stylesheet href="https://x.example/a.css"?>${svg(BACKGROUND)}`, /not written as an SVG document/],
  ["an instruction inside", svg(`${BACKGROUND}<?php echo 1; ?>`), /declaration or an instruction/],
  ["an xml:base", svg(`<g xml:base="https://x.example/">${BACKGROUND}</g>`), /has xml:base/],
  ["another namespace", svg(BACKGROUND, "xmlns=\"http://www.w3.org/1999/xhtml\" viewBox=\"0 0 600 400\""), /namespace is http:\/\/www\.w3\.org\/1999\/xhtml/],
  ["a namespace of its own", svg(BACKGROUND, "xmlns=\"http://www.w3.org/2000/svg\" xmlns:x=\"https://x.example/\" viewBox=\"0 0 600 400\""), /has xmlns:x/],
  ["a page, not a picture", `<html><body>${svg(BACKGROUND)}</body></html>`, /root is html, not svg/],
  ["a metadata element", svg(`<metadata><rdf:RDF/></metadata>${BACKGROUND}`), /metadata element/],
  ["an element that never ends", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\"><rect width=\"600\"", /written wrongly|never ends/],
  ["an element closed by another", svg("<g><rect width=\"600\" height=\"400\"/></rect>"), /closed by another/],
  ["an attribute twice", svg("<rect width=\"600\" width=\"10\" height=\"400\"/>"), /width twice/],
  ["an attribute with no quotes", svg("<rect width=600 height=\"400\"/>"), /written wrongly/],
  ["a value holding <", svg("<rect width=\"600\" height=\"400\" fill=\"<script>\"/>"), /written wrongly/],
  ["something after it", `${svg(BACKGROUND)}<script>alert(1)</script>`, /follows its svg element/],
  ["a transform that is not numbers", svg("<rect width=\"600\" height=\"400\" transform=\"translate(javascript:alert(1))\"/>"), /transform is/],
  ["path data that is not a path", svg("<path d=\"M0 0 L10 10 url(https://x.example)\"/>"), /d is/],
  ["a length that is not one", svg("<rect width=\"expression(alert(1))\" height=\"400\"/>"), /width is/],
  ["no viewBox", svg(BACKGROUND, "xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"400\""), /no viewBox/],
  ["a viewBox of three numbers", svg(BACKGROUND, "viewBox=\"0 0 600\""), /viewBox, "0 0 600"/],
  ["a viewBox of no size", svg(BACKGROUND, "viewBox=\"0 0 0 400\""), /size above nothing/],
  ["nothing drawn", svg("<defs><linearGradient id=\"a\"><stop offset=\"0\" stop-color=\"#000\"/></linearGradient></defs>"), /draws nothing/],
  ["a shape inside a shape", svg("<rect width=\"600\" height=\"400\"><circle r=\"5\"/></rect>"), /circle element inside its rect element/],
  ["a stop astray", svg(`${BACKGROUND}<stop offset="0"/>`), /stop element inside its svg element/],
  ["two gradients of one id", svg(`<linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient><linearGradient id="a"><stop offset="0" stop-color="#fff"/></linearGradient>${BACKGROUND}`), /two gradients a/],
  ["nothing at all", "   ", /empty/],
  ["too large", svg(`${BACKGROUND}<path d="M0 0 ${"L1 1 ".repeat(Math.ceil(SVG_MOST / 5))}"/>`), /at most 64 KB/],
  ["nested too deep", svg(`${"<g>".repeat(17)}${BACKGROUND}${"</g>".repeat(17)}`), /nested more than 16 deep/],
  ["too many elements", svg("<circle cx=\"1\" cy=\"1\" r=\"1\"/>".repeat(1500)), /more than 1500 elements/],
];

test.each(HOSTILE)("refused whole, said why: %s", (_name, drawn, why) => {
  const cleaned = cleanSvg(drawn, SIZE);
  expect(cleaned.ok).toBe(false);
  expect(cleaned.ok ? "" : cleaned.reason).toMatch(why);
});

test("a value made to be slow to check is refused at once, whatever its length", () => {
  const spaces = " ".repeat(60_000);
  for (const [attribute, value] of [["points", `1${spaces}x`], ["transform", `translate(1${spaces}x)`], ["fill", `rgb(1${spaces}x`], ["stroke-dasharray", `1,${spaces},x`]] as const) {
    const started = performance.now();
    const cleaned = cleanSvg(svg(`<polyline ${attribute}="${value}"/>`), SIZE);
    expect(cleaned.ok, attribute).toBe(false);
    expect(performance.now() - started, attribute).toBeLessThan(200);
  }
});

test("what is not text is no illustration", () => {
  for (const raw of [null, undefined, 42, { svg: BACKGROUND }]) expect(cleanSvg(raw, SIZE)).toEqual({ ok: false, reason: "it is empty" });
});
