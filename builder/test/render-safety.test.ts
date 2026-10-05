// The safety check (render-safety.ts), shown finding each thing a page must
// not carry, in markup planted for it, and finding nothing in markup that
// only looks like it.
// @vitest-environment node
import { expect, test } from "vitest";
import { browserUrl, safetyProblems } from "./render-safety.ts";

const wrap = (inner: string) => `<section class="sec" data-block-id="s"><div class="col" data-block-id="c">${inner}</div></section>`;

test.each([
  ["a script", "<script>alert(1)</script>", /a <script> element/],
  ["a script inside an svg", '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', /a <script> element/],
  ["a style element", "<style>body{}</style>", /a <style> element/],
  ["a base", '<base href="https://evil.example/">', /a <base> element/],
  ["an object", '<object data="x.swf"></object>', /a <object> element/],
  ["an embed", '<embed src="x.swf">', /a <embed> element/],
  ["a form outside the form widget", '<form class="sw-form" method="post"></form>', /a <form> that is not the form widget's own/],
  ["the form widget's form sent elsewhere", '<div class="w w-form" data-block-type="form"><form class="sw-form" method="post" action="https://evil.example/"></form></div>', /a <form> that is not the form widget's own/],
  ["the form widget's form sent by get", '<div class="w w-form" data-block-type="form"><form class="sw-form" method="get"></form></div>', /a <form> that is not the form widget's own/],
  ["a form deeper in the form widget than its own", '<div class="w w-form" data-block-type="form"><div class="sw-field"><form class="sw-form" method="post"></form></div></div>', /a <form> that is not the form widget's own/],
  ["a button that sends the form elsewhere", '<div class="w w-form" data-block-type="form"><form class="sw-form" method="post"><button formaction="https://evil.example/">Send</button></form></div>', /formaction, which sends a form elsewhere/],
  ["a button that sends the form to another window", '<button formtarget="_blank">Send</button>', /formtarget, which sends a form elsewhere/],
  ["an event handler", '<img src="/x.png" alt="" onerror="alert(1)">', /an event handler, onerror/],
  ["an event handler in capitals", '<div ONMOUSEOVER="alert(1)"></div>', /an event handler, onmouseover/],
  ["a javascript: link", '<a href="javascript:alert(1)">x</a>', /href is a javascript: address/],
  ["a javascript: link in mixed case, spaced and split by a tab", '<a href=" JaVa&#9;ScRiPt:alert(1)">x</a>', /href is a javascript: address/],
  ["a javascript: link behind a control character", '<a href="&#1;javascript:alert(1)">x</a>', /href is a javascript: address/],
  ["a data: image", '<img src="data:image/svg+xml,<svg onload=alert(1)>" alt="">', /src is a data: address/],
  ["a data: image in a srcset", '<img src="/x.png" srcset="/x.png 1x, data:image/png;base64,AA 2x" alt="">', /srcset is a data: address/],
  ["a vbscript: link", '<a href="vbscript:msgbox(1)">x</a>', /href is a vbscript: address/],
  ["an svg link", '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', /xlink:href is a javascript: address/],
  ["an iframe from elsewhere", '<iframe src="https://evil.example/embed"></iframe>', /an iframe from "https:\/\/evil\.example\/embed"/],
  ["an iframe from an allowed host's look-alike", '<iframe src="https://www.youtube-nocookie.com.evil.example/x"></iframe>', /an iframe from/],
  ["srcdoc", '<iframe src="https://player.vimeo.com/video/1" srcdoc="<script>alert(1)</script>"></iframe>', /srcdoc/],
  ["a script inside a template", "<template><script>alert(1)</script></template>", /a <script> element/],
])("finds %s", (_name, inner, problem) => {
  const problems = safetyProblems(wrap(inner));
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.join("\n")).toMatch(problem);
});

test("finds nothing in markup that only looks dangerous", () => {
  expect(
    safetyProblems(wrap(
      '<h1>&lt;script&gt;alert(1)&lt;/script&gt; javascript:alert(1)</h1><a href="/javascript:not-a-scheme">x</a><a href="https://example.com/?u=javascript:x">y</a>' +
        '<img src="/media/data:x.png" alt="data:"><p title="onclick">on</p><iframe src="https://www.openstreetmap.org/export/embed.html?bbox=1"></iframe>' +
        '<div class="w w-form" data-block-type="form"><form method="post" class="sw-form"><input type="hidden" name="form" value="f"><button type="submit">Send</button></form></div>',
    )),
  ).toEqual([]);
});

test("reads an address as a browser does", () => {
  expect(browserUrl("\u0000 \tJaVa\nScRipt:alert(1) \u001f")).toBe("javascript:alert(1)");
  expect(browserUrl("/path with space")).toBe("/path with space");
});
