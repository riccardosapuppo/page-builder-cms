// The first-run note (src/editor/Welcome.tsx) opens under the page's title
// the first time a browser opens the editor, over what the tests, the
// README's pictures and the measures look at. Their browsers start as one
// that has seen it, with this storage state for the editor's origin: the
// three Playwright configs give it to every context of their runs, and the
// tools that drive Chromium themselves pass it where they open the editor.
// e2e/welcome.spec.ts opens the note itself, from a browser with nothing
// stored.
import { WELCOME_KEY } from "../../src/editor/welcome-key.ts";

export function welcomeSeen(url: string) {
  return { cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [{ name: WELCOME_KEY, value: "seen" }] }] };
}
