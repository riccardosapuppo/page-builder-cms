# Decisions

Each note says what was decided, what it costs, and the command that shows
it holds.

- [The editor reaches the CMS's API through its development server's proxy](editor-api-through-the-dev-proxy.md)
  (2 October 2026): one origin in development, no CORS; what a build
  without the proxy, or an API on another origin, then needs.
