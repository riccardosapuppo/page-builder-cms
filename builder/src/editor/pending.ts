// Text typed in a panel's field becomes a command when the person pauses,
// leaves the field or presses Enter (./controls.tsx, TextField). Until
// then it is pending, and it is held here: every other command on the
// document, and the start of every drag, hands it over first (as a command
// of its own), so a delete, a paste or a move never lands between the
// typing and the command that keeps it, and the history reads in the order
// the person worked. The text written on the canvas joins in
// (./rich/text-session.ts).
//
// A text the page refuses is not let go: its holder keeps the hold, and
// says why. deliver() then answers false, and the command or drag that
// asked waits (./act.ts), so nothing typed is dropped behind its back.
// Said when a text the page refused is still held and its holder has not
// said why (./context.tsx, ./App.tsx).
export const STILL_HELD = "A text the page cannot keep is still being written.";

export class PendingText {
  readonly #commits = new Set<() => boolean | void>();

  // A field with text waiting, by the function that hands it over: true
  // (or nothing) once handed over, false when the page refused it and the
  // field still holds it. The field calls the release once its text is
  // handed over or dropped.
  hold(commit: () => boolean | void): () => void {
    this.#commits.add(commit);
    return () => {
      this.#commits.delete(commit);
    };
  }

  // Hands every waiting text over, in the order it was typed; false when
  // one of them is still held because the page refused it. A field
  // releases itself before it hands its text over, so a command it causes
  // finds nothing left to deliver from it.
  deliver(): boolean {
    let all = true;
    // A copy: each field lets go of its hold as it hands its text over.
    for (const commit of Array.from(this.#commits)) if (commit() === false) all = false;
    return all;
  }

  get waiting(): number {
    return this.#commits.size;
  }
}
