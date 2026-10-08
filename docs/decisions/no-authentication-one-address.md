# The API has no authentication, so the servers listen on 127.0.0.1 and refuse to listen anywhere else

Decided on 1 October 2026, with the Rails application. Written down on
8 October 2026.

## The question

A CMS has people, and people have accounts, roles and permissions. Doing
that properly is a second project: sign-in, sessions, who may publish,
who may see which page, and a screen for each, each with its own tests
and its own ways to go wrong. This project is about the editor, the
document and the pages Rails serves. But an API that writes pages and
publishes them, with no sign-in, must not be one a network can reach.

## The decision

- **No authentication, no users, no roles.** There is no sign-in and no
  session; the published pages carry no cookie.
- **The servers listen on 127.0.0.1 and nowhere else.** This is not left
  to the command line. `bin/rails` makes 127.0.0.1 and 3900 the defaults of
  `rails server` (without it, production would listen on 0.0.0.0:3000);
  `config/puma.rb` does the same for `puma` started by itself; and a Puma
  plugin there stops the boot, before any socket is opened, when the server
  is asked to listen elsewhere (`-b 0.0.0.0`, `BINDING`, a bind line, a host
  name). The editor's development server listens on 127.0.0.1 only too, and
  stops rather than take another port.
- **Other sites cannot write through a visitor's browser.** Every write
  must be `application/json`, which a browser cannot send to another origin
  without a preflight the API never grants; a request that says it comes
  from another site, or names another origin, is refused with a 403. The
  form a visitor sends from a published page is the one write open to the
  public, and has its own guards
  ([form-count-by-socket-peer.md](form-count-by-socket-peer.md)).
- **Hosts are limited in production** to `127.0.0.1`, `localhost` and
  `[::1]`, so a domain made to resolve to 127.0.0.1 cannot pass for the
  CMS's own origin.

## What it costs

- **It is a tool for one person on one machine.** Nothing in the
  repository puts it on a network, and nothing could safely: the editor's
  API and the published pages are served by the same process, so a proxy in
  front would have to pass the published pages and the forms and nothing
  under `/api`. That is a deployment's job, and none is described here.
- **There are no permissions to show.** The editor has no sign-in screen,
  no roles, and no page that one person may edit and another may not.
- **Anyone at the machine is the owner.** Another program running as
  another user on the same machine can reach 127.0.0.1.

## The proof

From `cms/`, with the lock described in its README held:

```
ruby bin/rails test test/config/puma_binding_test.rb test/integration/api/other_sites_test.rb
```

The first builds Puma's configuration from the file as Puma does and starts
its plugins as Puma's launcher does; the second sends the text/plain
create, the empty form post that publishes, and JSON from a foreign origin,
and with the rule taken out five of its seven tests failed. From the
repository's root, `node tools/check-production.ts` asks a production boot
to listen on 192.0.2.1, an address no machine has, checks the refusal and
that nothing listened; then starts it with no address and asks the system
who listens, which must be 127.0.0.1 and the process it started. On
8 October 2026 the two Rails test files ran 13 tests with 63 assertions and
no failure, and the production check printed `RESULT: 50 checks passed`.
