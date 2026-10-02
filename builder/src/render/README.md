# src/render/

The document drawn with React, the editor's twin of the server's block
partials (`../../../cms/app/views/blocks/`), with the same markup rules
(`../../../contract/README.md`): every block root carries `data-block-id`
and `data-block-type`, `data-style` repeats its style canonically, style
tokens become the classes of `tokens.css`, addresses go through the URL
policy.

- One renderer, used three ways: the canvas (with the editor's handles),
  the preview, and the contract test.
- `policy.ts`: the URL policy, the twin of
  `../../../cms/app/models/render_policy.rb`, kept in step by the contract.
- The contract test reads `../../../contract/fixtures/` and the server's
  goldens in `../../../contract/rendered/`, fails when a golden is missing
  or stale against `manifest.json`, renders each fixture, and compares the
  trees with parse5. It runs with React's production build or small
  fixtures: the development build is many times slower.
- Library images resolve through an injected resolver; in the contract
  test, the same stub as the server's (`/media/<id>.png`, 800 by 600).
- The published page's CSS, with its container queries, is
  `../shared/site.css`.

Each widget's own renderer lives in `../widgets/<widget>/`; this folder
walks the tree and calls them through the registry.
