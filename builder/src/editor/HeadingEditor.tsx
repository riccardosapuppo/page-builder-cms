// The canvas's line for one heading while it is written: the heading's
// own element, at its level, holding a line made editable as plain text,
// so the words stand where the page draws them, in the page's own type
// (../widgets/heading/render.tsx, through the decoration's `editing`,
// which ./Canvas.tsx gives it). Everything it does is
// ./heading-session.ts's; this is the part React mounts and unmounts. The
// line's words are the session's to set, never React's, so typing keeps
// its caret.
import { createElement, useLayoutEffect, useRef, useState } from "react";
import { useEnv } from "./context.tsx";
import { HeadingSession } from "./heading-session.ts";

export function HeadingEditor({ blockId, level, label }: { blockId: string; level: 1 | 2 | 3 | 4; label: string }) {
  const env = useEnv();
  const line = useRef<HTMLSpanElement>(null);
  // The words a screen reader hears, as they were when the line opened.
  const [named] = useState(label);
  useLayoutEffect(() => {
    const element = line.current;
    if (!element) return undefined;
    const at = env.ui.getState().editingText?.at ?? "end";
    const session = new HeadingSession(env, blockId, element, at);
    return () => session.dispose();
    // A new level is a new element: the line opens again in it.
  }, [env, blockId, level]);
  return createElement(
    `h${level}`,
    null,
    <span
      ref={line}
      className="rte rte-line"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={named}
      aria-multiline="false"
      spellCheck
    />,
  );
}
