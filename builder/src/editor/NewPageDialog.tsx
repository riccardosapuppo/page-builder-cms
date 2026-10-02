// A new page: its title, and its address, offered from the title until the
// person writes one of their own. The CMS makes the page with an empty
// document holding the title, nothing live; the editor then opens it, on
// the empty page's invitation to add a first section.
import { useId, useState } from "react";
import type { FieldError } from "../storage/adapter.ts";
import { describedBy, ErrorList } from "./controls.tsx";
import { Dialog } from "./dialog.tsx";
import { explain } from "./errors.ts";
import { slugFrom, useSession } from "./session.tsx";

export function NewPageDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const id = useId();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const address = slugEdited ? slug : slugFrom(title);

  const at = (field: "title" | "slug") => errors
    .filter((e) => e.pointer === `/${field}` || e.pointer.startsWith(`/${field}/`))
    .map((e) => explain(e.keyword, e.message, field === "slug" ? { kind: "slug", maxLength: 64 } : { kind: "line", maxLength: 120 }));
  const elsewhere = errors.filter((e) => !/^\/(title|slug)(\/|$)/.test(e.pointer)).map((e) => e.message);
  const titleErrors = at("title");
  const slugErrors = at("slug");

  const submit = async () => {
    if (busy) return;
    if (title.trim() === "") {
      setErrors([{ pointer: "/title", keyword: "required", blockPointer: null, message: "A page needs a title." }]);
      return;
    }
    setBusy(true);
    const problems = await session.createPage({ title: title.trim(), slug: address });
    setBusy(false);
    if (problems) setErrors(problems);
    else onClose();
  };

  return (
    <Dialog
      title="New page"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark" type="button" aria-disabled={busy ? true : undefined} onClick={() => void submit()}>{busy ? "Creating…" : "Create page"}</button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className={`field${titleErrors.length > 0 ? " field-error" : ""}`} style={{ marginTop: 4 }}>
          <label className="label" htmlFor={`${id}-title`}>Title</label>
          <input
            id={`${id}-title`}
            className="input"
            type="text"
            data-autofocus
            value={title}
            aria-invalid={titleErrors.length > 0 ? true : undefined}
            aria-describedby={describedBy(`${id}-title`, "hint", titleErrors)}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="hint" id={`${id}-title-hint`}>Shown in the browser tab and in search results.</p>
          <ErrorList id={`${id}-title-error`} errors={titleErrors} />
        </div>
        <div className={`field${slugErrors.length > 0 ? " field-error" : ""}`}>
          <label className="label" htmlFor={`${id}-slug`}>Address</label>
          <div className="input input-icon">
            <span className="input-prefix" aria-hidden="true">/</span>
            <input
              id={`${id}-slug`}
              type="text"
              spellCheck={false}
              value={address}
              aria-invalid={slugErrors.length > 0 ? true : undefined}
              aria-describedby={describedBy(`${id}-slug`, "hint", slugErrors)}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
            />
          </div>
          <p className="hint" id={`${id}-slug-hint`}>Lowercase letters, digits and hyphens. Visitors find the page there once it is published.</p>
          <ErrorList id={`${id}-slug-error`} errors={slugErrors} />
        </div>
        <ErrorList id={`${id}-other`} errors={elsewhere} />
        {/* Enter in a field sends the form. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
