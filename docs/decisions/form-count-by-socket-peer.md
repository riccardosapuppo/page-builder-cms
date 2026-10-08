# A visitor's form is counted under the socket's own address, and the cost is one count behind a proxy

Decided on 5 October 2026, with the forms and their rate limit.
Written down on 8 October 2026.

## The question

A form on a published page is the one write the public can make. The page
is cached and shared, so it has no session and no token, and Rails'
forgery protection, which keeps its token in the session, cannot be used.
In its place there are guards (the `Origin` must be the site's, a field for
robots must be empty, the body has a limit), and one more: a visitor may
send ten forms in ten minutes. The question is whose ten.

Rails' own `rate_limit` counts by `request.remote_ip`, which takes
`X-Forwarded-For` or `Client-Ip` from any peer, not only from a proxy. Then
one header changed at every send gives a form a count of its own, and one
naming another visitor's address uses up that visitor's ten.

## The decision

The count is kept under `request.remote_addr`, the address of the peer on
the socket, set in `config.x.submission_limit_by` and read at every send.
A form refused for its `Origin` is refused before it is counted, so a page
of another site cannot use up the count through its visitors' browsers. The
store that keeps the counts is named for it (`config.x.submission_limit_store`)
and is Solid Cache everywhere but in the tests, which count in memory:
the tests' `:null_store` counts nothing, and the limit could never fire.

A deployment that must count each visitor behind its proxy sets
`config.x.submission_limit_by` to read the address the proxy names
(`request.remote_ip`, with `config.action_dispatch.trusted_proxies` set to
an array holding the proxy), and its proxy must overwrite `X-Forwarded-For`
with the peer it saw and drop `Client-Ip`.

## What it costs

- **Behind a front proxy on this machine, every visitor is 127.0.0.1**, so
  ten forms in ten minutes is the whole site's. The site's eleventh form in
  ten minutes is refused, whoever sends it.
- **One client can use up the count for everyone.** A program other than a
  browser can name this site's `Origin`, and ten of its forms, kept or
  refused for what they hold, give every visitor a 429 for ten minutes.
- **Rails' own check that `Client-Ip` agrees with `X-Forwarded-For` is off**
  (`config.action_dispatch.ip_spoofing_check`). It raised wherever
  `request.remote_ip` is read, Rails' own log line on every request
  included, so one header added by any client gave a bare 500 at every
  address. Nothing here decides on `remote_ip`.
- **A visitor is counted by the whole IPv6 address**, so one with a whole
  prefix has many.

## The proof

From `cms/`, with the lock described in its README held:

```
ruby bin/rails test test/integration/submissions_test.rb
```

sends eleven forms from one peer, each naming another address in one
header or the other, and the eleventh gets 429; with the limit keyed on
`remote_ip` it fails. Another test sends the two headers disagreeing, to a
page, its form and the confirmation; with Rails' check on, each gets 500.
From the repository's root, `node tools/check-production.ts` sends forms
from one address to a production boot, each naming another in
`X-Forwarded-For`, and sees the eleventh counted get its 429 from Solid
Cache. On 8 October 2026 the Rails test ran 19 tests with 311 assertions and
no failure, and the production check, in the run of the whole check,
`RESULT: 50 checks passed`.
