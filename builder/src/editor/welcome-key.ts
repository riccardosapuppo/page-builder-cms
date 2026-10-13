// What the browser keeps once the first-run note's Got it is pressed
// (./Welcome.tsx), and what the tests of the rest of the editor set before
// they start (../../test/setup-dom.ts, ../../e2e/helpers/welcome.ts, the
// pictures and the measurements), so that only the note's own tests see it.
export const WELCOME_KEY = "page-builder-cms:welcome";
