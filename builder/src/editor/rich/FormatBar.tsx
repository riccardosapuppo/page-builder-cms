// The link's field of a text written on the canvas, opened from the
// clamp's Link key or its keys (../Clamp.tsx carries bold, italic and
// link while the text is written): under the block, at the editor's own
// size. It acts through the editor's commands (./tools.ts), so it lives
// in the editor's main chunk while TipTap waits in its own.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { describedBy, ErrorList } from "../controls.tsx";
import { Icon } from "../icons.tsx";
import { usePageLinks } from "../session.tsx";
import type { TextTools } from "./tools.ts";

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
    <div className={`ov-link${errors.length > 0 ? " field-error" : ""}`} role="group" aria-labelledby={`${id}-label`}>
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
