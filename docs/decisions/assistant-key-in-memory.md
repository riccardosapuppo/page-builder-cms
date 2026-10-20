# A visitor's model key stays in the tab's memory, and the page can send it only to its provider

Decided on 14 October 2026, with the Assistant, at the owner's request: a
person brings a key of their own, Anthropic's or OpenAI's, and it is never
kept.

## The question

The Assistant writes with a model the person chooses: a whole page from a
brief, a heading or a text written again, an image's alt text. The model is
paid for with the person's own key. The demo is a public page, so strangers
paste a key there that spends their money. Where may the key live, and
where may it go? There were three ways to hold it:

- **A server of this site in between**, keeping or passing the key.
- **The browser's storage**, plain or encrypted.
- **Memory only**, and nothing else.

## The decision

- **No server in between.** The browser calls the provider straight, with
  the provider's own SDK in its browser mode (`dangerouslyAllowBrowser`).
  That mode guards against a site shipping its own key to its visitors. It
  does not apply to a key the visitor brings. This site never sees the key,
  the brief or the answer, so there is no server to trust and none to keep
  up.
- **Memory only.** The key is kept in a closure
  ([`builder/src/assistant/key.ts`](../../builder/src/assistant/key.ts)), and
  in nothing else:
  - not in local or session storage, IndexedDB, a cookie or the cache;
  - not in an address, the page document, its history or a log.

  It is forgotten when the person asks, after 30 minutes without a call,
  and when the page is left. Leaving covers the tab closed or reloaded and
  another address, even into the back-forward cache, which would otherwise
  bring this memory back. The interface sees the provider and the key's
  last four characters, never more. A provider's error message is shown
  with the key taken out.
- **Not encrypted at rest instead.** A key encrypted in the browser is
  decrypted by code running on the same page, so it protects against a
  disk being read, not against code on the page, which is the real risk.
  Not keeping the key holds against both.
- **The page can connect to the two providers and nothing else.** Every
  build of the editor (the demo, and what `vite preview` serves) carries a
  Content-Security-Policy as the first element of its head
  ([`builder/build/csp.ts`](../../builder/build/csp.ts)):
  - `connect-src` names the site itself and the two providers' APIs;
  - `script-src` names the site's own files and the hash of the page's one
    inline script;
  - `object-src` is `'none'`.

  A fault in the editor, or a script that got onto the page some other
  way, cannot send the key elsewhere: the browser refuses the connection
  and says so.
- **What the model writes is never trusted.** It answers in a small schema
  of its own (structured outputs). The editor reads every value of the
  answer as the page's schema wants it, and puts each section in with a
  command that the store holds to the page's schema like any other.
  - **Links** go only to the plan's own sections, the site's pages, or
    addresses written in the person's brief.
  - **Images** come only from the site's library.

## What it costs

- **A reload forgets the key**, and so does a closed tab: it has to be
  pasted again.
- **The development server has no policy.** `npm start` runs Vite's
  development server, whose hot reload needs inline scripts of its own.
  The guarantee holds for the builds, which is where strangers paste keys:
  the demo.
- **Any `https` image may load (`img-src`).** The pages show images from
  other sites, so `img-src` allows any of them, and code already running on
  the page could still leak the key through an image's address. What keeps
  such code off the page is `script-src`: nothing runs but the site's own
  files.
- **The SDK holds the key while a call lasts.** Its client is made for one
  call and dropped afterwards.
- **Each call costs the person money.** The drawer says what each page
  used, tokens in, cached and out, and estimates their cost at the
  provider's list price. Its foot keeps the total since the key was
  connected, in memory with the key, and forgotten with it.

## The proof

From `builder/`:

```
npx vitest run --project unit src/assistant build/csp.test.ts
E2E_CMS_PORT=3921 E2E_BUILDER_PORT=4921 npx playwright test -c e2e/playwright.config.ts e2e/assistant.spec.ts
npm run e2e:demo
```

- **The unit tests** cover the keeper, the builder and the providers:
  - the keeper's source names no storage of the browser's, and a key goes
    when asked, when idle and when the page is left;
  - the builder leaves out made-up links and images not in the library;
  - the providers send what each API expects, and say an error with the
    key taken out.
- **The second command** runs in Chromium, with the providers' APIs
  answered inside the browser:
  - the key appears in the provider's request header and in no request's
    body;
  - nothing the browser keeps holds it: local and session storage,
    cookies, every IndexedDB record, the caches and the address;
  - a reload forgets it.
- **The third** runs on the built demo: the page's own code asks to send a
  key to another site, and the browser refuses it under `connect-src`.

On 14 October 2026 the Assistant's unit tests, the policy's and the rest of
the editor's passed, 1,113 in all, as did the 7 browser tests and the 11 of
the demo.
