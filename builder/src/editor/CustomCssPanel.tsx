// Custom CSS, a level below the Page tab beside Site style: the site's own
// stylesheet, drawn inside the site on every page after the theme's
// (../shared/custom-css.ts, scopedCss). Its rules reach blocks by the
// classes and anchors their Advanced group gives them (.hero, #prices).
//
// It is checked after a pause in the writing, or when the field is left,
// and kept with the site style once it keeps to the site; the canvas draws
// it then. While it waits for its pause it is held as a field's text is
// (./pending.ts): a command, another page or the tab's close hands it over
// first, and so does the panel going. What does not keep to the site is
// said with its line and stays a draft, unsaved, the rules kept last still
// drawn: the panel shows it again when it opens, and the tab's close warns
// of it.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { checkCustomCss, CUSTOM_CSS_MAX, type CssProblem } from "../shared/custom-css.ts";
import { useEnv, useUi } from "./context.tsx";
import { COMMIT_AFTER_MS, ErrorList } from "./controls.tsx";
import { Icon } from "./icons.tsx";
import { useSession } from "./session.tsx";

const count = (text: string) => [...text].length.toLocaleString("en-US");

export function CustomCssPanel({ onClose, onHide }: { onClose: () => void; onHide?: () => void }) {
  const kept = useUi((u) => u.siteStyle?.customCss ?? null);
  const { clock, ui } = useEnv();
  const session = useSession();
  const { styleSave } = session;
  const headId = useId();
  const fieldId = useId();
  const [text, setText] = useState(() => ui.getState().customCssDraft ?? kept ?? "");
  // The problem found at the last check, shown until the next one: a
  // draft's at once, when the panel opens on it.
  const [problem, setProblem] = useState<CssProblem | null>(() => {
    const draft = ui.getState().customCssDraft;
    return draft === null ? null : checkCustomCss(draft);
  });
  // The text last handed to the session, the pause's timer, and the hold
  // on the handover while the text waits.
  const sent = useRef(kept ?? "");
  const timer = useRef<unknown>(null);
  const release = useRef<(() => void) | null>(null);

  // Checks the text and, when it keeps to the site and is new, keeps it
  // with the rest of the style as it is now; when it does not, keeps it as
  // the draft.
  const keep = (value: string) => {
    if (timer.current !== null) {
      clock.clearTimeout(timer.current);
      timer.current = null;
    }
    release.current?.();
    release.current = null;
    const found = checkCustomCss(value);
    setProblem(found);
    ui.getState().setCustomCssDraft(found && value !== sent.current ? value : null);
    const style = ui.getState().siteStyle;
    if (found || value === sent.current || !style) return;
    sent.current = value;
    session.saveSiteStyle({ palette: style.palette, typeScale: style.typeScale, letterWidth: style.letterWidth, customCss: value });
  };
  const latest = useRef({ text, keep });
  useLayoutEffect(() => {
    latest.current = { text, keep };
  });

  // The stylesheet changed from elsewhere (a refused save put back, another
  // tab): shown, unless the person is writing here or has a draft.
  useEffect(() => {
    if (kept === null || timer.current !== null || kept === sent.current || ui.getState().customCssDraft !== null) return;
    sent.current = kept;
    setText(kept);
    setProblem(null);
  }, [kept, ui]);

  // What waits for its pause is kept when the panel goes.
  useEffect(() => () => {
    if (timer.current !== null) latest.current.keep(latest.current.text);
    release.current?.();
  }, []);

  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <section className="view custom-css" aria-labelledby={headId}>
      <div className="tray-head tray-head-title">
        <div>
          <button className="sb-back" type="button" aria-label="Back to Page" onClick={onClose}><Icon name="arrow-left" className="i i-xs" />Page</button>
          <h2 id={headId}>Custom CSS</h2>
          <p>Your own rules, on every page of your site.</p>
          {styleSave.phase === "failed"
            ? <p className="error" role="alert"><Icon name="error" />{styleSave.message}</p>
            : <p className="style-save" role="status">{styleSave.phase === "saving" ? "Saving…" : styleSave.phase === "saved" ? "Saved for every page" : ""}</p>}
        </div>
        {onHide && <button className="ibtn" type="button" aria-label="Hide the sidebar" title="Hide the sidebar" onClick={onHide}><Icon name="close" /></button>}
      </div>
      <div className="tray-body">
        {kept === null ? (
          <p className="hint" role="status">The site style is not loaded yet.</p>
        ) : (
          <div className={`field${problem ? " field-error" : ""}`}>
            <label className="label" htmlFor={fieldId}>Rules</label>
            <textarea
              id={fieldId}
              className="input css-input"
              rows={18}
              value={text}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              data-autofocus=""
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
              onChange={(event) => {
                const value = event.target.value;
                setText(value);
                latest.current = { ...latest.current, text: value };
                if (timer.current !== null) clock.clearTimeout(timer.current);
                release.current ??= ui.getState().pending.hold(() => {
                  latest.current.keep(latest.current.text);
                });
                timer.current = clock.setTimeout(() => {
                  timer.current = null;
                  latest.current.keep(latest.current.text);
                }, COMMIT_AFTER_MS);
              }}
              onBlur={() => keep(text)}
            />
            <ErrorList id={errorId} errors={problem ? [`Line ${problem.line}: ${problem.message} Until then the page keeps the rules saved last.`] : []} />
            <p className="hint" id={hintId}>
              Style a block by a class or an anchor from its Advanced group: <code>.hero {"{ … }"}</code>, <code>#prices {"{ … }"}</code>. The rules stay inside the site, after its own styles; @import is not allowed. {count(text)} of {CUSTOM_CSS_MAX.toLocaleString("en-US")} characters.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
