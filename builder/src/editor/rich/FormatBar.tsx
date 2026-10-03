// The text's formatting controls on the canvas, drawn on the selected
// text block's floating bar while its editor is open (../Canvas.tsx): bold,
// italic and link, in the bar's own yellow, after the block's name; and
// the link's field under the block. They act through the editor's
// commands (./tools.ts), so they live in the editor's main chunk while
// TipTap waits in its own.
//
// A press on a button keeps the focus in the text, with its selection, as
// the keys do (Ctrl+B, Ctrl+I, Ctrl+K); from the keyboard, Tab reaches the
// buttons from the text, and each puts the focus back in it.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { describedBy, ErrorList } from "../controls.tsx";
import { Icon } from "../icons.tsx";
import { usePageLinks } from "../session.tsx";
import type { TextTools } from "./tools.ts";

const keep = (event: { preventDefault(): void }) => event.preventDefault();

export function FormatButtons({ tools }: { tools: TextTools }) {
  return (
    <span className="ov-format" role="group" aria-label="Formatting">
      <span className="ov-sep" aria-hidden="true" />
      <button type="button" className="ov-fmt ov-fmt-b" aria-label="Bold" aria-pressed={tools.bold} aria-keyshortcuts="Control+B" title="Bold (Ctrl+B)" onMouseDown={keep} onClick={() => tools.run.toggleBold()}>B</button>
      <button type="button" className="ov-fmt ov-fmt-i" aria-label="Italic" aria-pressed={tools.italic} aria-keyshortcuts="Control+I" title="Italic (Ctrl+I)" onMouseDown={keep} onClick={() => tools.run.toggleItalic()}>I</button>
      <button
        type="button"
        className="ov-fmt"
        aria-label={tools.link ? `Link to ${tools.link}` : "Link"}
        aria-pressed={tools.link !== null}
        aria-expanded={tools.linkOpen}
        aria-keyshortcuts="Control+K"
        title="Link (Ctrl+K)"
        onMouseDown={keep}
        onClick={() => (tools.linkOpen ? tools.run.closeLink(true) : tools.run.openLink())}
      >
        <Icon name="link" />
      </button>
      <span className="ov-sep" aria-hidden="true" />
    </span>
  );
}

// The link's field: the address, refused with its reason as the server
// would refuse it (./link-check.ts), the site's pages offered as the
// button's link field offers them. Enter applies, Esc goes back to the
// text without a change.
export function LinkField({ tools }: { tools: TextTools }) {
  const id = useId();
  const pages = usePageLinks();
  const [draft, setDraft] = useState(tools.link ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const apply = () => {
    const why = tools.run.applyLink(draft);
    setRefusal(why);
  };
  const errors = refusal ? [refusal] : [];
  const hint = "A full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:.";
  return (
    <div className="ov-link" role="group" aria-labelledby={`${id}-label`}>
      <label className="label" htmlFor={id} id={`${id}-label`}>Link to</label>
      <div className="input input-icon">
        <Icon name="link" />
        <input
          ref={input}
          id={id}
          type="text"
          spellCheck={false}
          value={draft}
          placeholder="Paste a link or choose a page"
          list={pages.length > 0 ? `${id}-pages` : undefined}
          aria-invalid={errors.length > 0 ? true : undefined}
          aria-describedby={describedBy(id, hint, errors)}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefusal(null);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            } else if (event.key === "Escape") {
              event.preventDefault();
              tools.run.closeLink(true);
            }
          }}
        />
        {pages.length > 0 && <datalist id={`${id}-pages`}>{pages.map((page) => <option key={page.value} value={page.value}>{page.label}</option>)}</datalist>}
      </div>
      <p className="hint" id={`${id}-hint`}>{hint}</p>
      <ErrorList id={`${id}-error`} errors={errors} />
      <div className="ov-link-actions">
        {tools.link && <button type="button" className="btn btn-small btn-secondary" onClick={() => tools.run.removeLink()}>Remove link</button>}
        <button type="button" className="btn btn-small btn-secondary" onClick={() => tools.run.closeLink(true)}>Cancel</button>
        <button type="button" className="btn btn-small btn-primary" onClick={apply}>{tools.link ? "Change link" : "Add link"}</button>
      </div>
    </div>
  );
}
