// The canvas's text editor for one text block, drawn in the block's place
// while it is edited (../Canvas.tsx gives it to the text's renderer
// through the decoration's `editing`). Its element becomes TipTap's own,
// so the text's paragraphs sit where the page draws them, one element
// below the block. Everything it does is ./text-session.ts's; this is the
// part React mounts and unmounts. A chunk of its own, with TipTap and
// ProseMirror: the default export, for React's lazy().
import { useLayoutEffect, useRef } from "react";
import { useEnv } from "../context.tsx";
import { TextSession } from "./text-session.ts";

export default function TextEditor({ blockId, label }: { blockId: string; label: string }) {
  const env = useEnv();
  const host = useRef<HTMLDivElement>(null);
  // The words a screen reader hears, as they were when the editor opened.
  const named = useRef(label);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const at = env.ui.getState().editingText?.at ?? "end";
    const session = new TextSession(env, blockId, element, named.current, at);
    return () => session.dispose();
  }, [env, blockId]);
  return <div ref={host} />;
}
