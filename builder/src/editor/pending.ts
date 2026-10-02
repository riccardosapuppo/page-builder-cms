// Text typed in a panel's field becomes a command when the person pauses,
// leaves the field or presses Enter (./controls.tsx, TextField). Until
// then it is pending, and it is held here: every other command on the
// document, and the start of every drag, hands it over first (as a command
// of its own), so a delete, a paste or a move never lands between the
// typing and the command that keeps it, and the history reads in the order
// the person worked. The canvas's rich text joins in stage 3.
export class PendingText {
  readonly #commits = new Set<() => void>();

  // A field with text waiting, by the function that hands it over. The
  // field calls the release once its text is handed over or dropped.
  hold(commit: () => void): () => void {
    this.#commits.add(commit);
    return () => {
      this.#commits.delete(commit);
    };
  }

  // Hands every waiting text over, in the order it was typed. A field
  // releases itself before it hands its text over, so a command it causes
  // finds nothing left to deliver from it.
  deliver(): void {
    // A copy: each field lets go of its hold as it hands its text over.
    for (const commit of Array.from(this.#commits)) commit();
  }

  get waiting(): number {
    return this.#commits.size;
  }
}
