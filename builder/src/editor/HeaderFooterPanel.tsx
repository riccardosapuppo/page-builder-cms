// Header and footer: the one screen that changes the site's header and
// footer, a level below the Page tab beside Site style, and laid out as
// Site style is (design/layout/, the site-style state): the way back to
// Page, the title, one line on what a change does. The site's name (the
// mark beside it stays the design's); the menu, from no link up to the most
// the header holds, each link with its words and its address, the address
// in the link field the button and the heading have, which offers the
// site's pages and the sections of a page to choose from; links added,
// taken away and moved up and down by named buttons, so the mouse and the
// keyboard do the same; the header's button, or none; the footer's two
// lines. Each limit is said where it applies.
//
// The canvas draws the values as they are typed (the interface store's
// siteDraft). Save sends them whole, after the editor's own check of
// $defs/site, and every published page shows them at its next visit, with
// nothing to publish. A refusal marks each value at fault, the editor's
// own or the storage's; a change another tab saved first stops the save
// until the person takes it (Reload) or saves theirs over it (Keep mine),
// as the page's conflict bar asks. The focus stays where the person is:
// on the new link's words, on the link that took a removed one's place,
// on the move button of the link moved, on the first value at fault.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { sameJson } from "../document/json.ts";
import { validateSite } from "../shared/validate.ts";
import type { FieldError, SiteLink, SiteValues } from "../storage/adapter.ts";
import { afterRender } from "./act.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { describedBy, ErrorList } from "./controls.tsx";
import {
  addLink, EMPTY_LINK, linkChoices, moveLink, removeLink, sectionTargets, sentencesAt, setActionPart, setAction, setFooter, setLink, setName,
  SITE_LIMITS, siteValues,
} from "./header-footer.ts";
import { Icon } from "./icons.tsx";
import { useSession, type SectionTarget } from "./session.tsx";

// The line under the title: what a change does, in one sentence.
export const REACHES_EVERY_PAGE = "Saved changes show on every published page at once, with nothing to publish.";

const LINK_HINT = "Choose a page or a section of one, or paste a full address (https://…), mailto: or tel:.";

// The field a pointer names, as the panel draws it.
const fieldAt = (pointer: string) => document.querySelector<HTMLElement>(`.header-footer [data-field="${pointer}"]`);

export function focusSiteField(pointer: string): void {
  afterRender(() => (fieldAt(pointer) ?? document.querySelector<HTMLElement>(".header-footer [data-autofocus]"))?.focus());
}

export function HeaderFooterPanel({ onClose, onHide }: { onClose: () => void; onHide?: () => void }) {
  const { ui } = useEnv();
  const session = useSession();
  const site = useUi((u) => u.site);
  const draft = useUi((u) => u.siteDraft);
  const refused = useUi((u) => u.siteErrors);
  const headId = useId();
  const choicesId = useId();
  // The values the person has been in and left: their problems show from
  // then on; before, only a limit passed shows, as it is typed.
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());
  const [said, setSaid] = useState("");
  // The button last taken away, which Add a button brings back.
  const lastAction = useRef<SiteLink | null>(null);
  const choices = useLinkChoices();
  const stored = useMemo(() => (site ? siteValues(site) : null), [site]);
  const values = draft ?? stored;
  const live = useMemo<readonly FieldError[]>(() => {
    if (!values) return [];
    const check = validateSite(values);
    return check.valid ? [] : check.errors.map((e) => ({ pointer: e.pointer, keyword: e.keyword, blockPointer: null, message: e.message }));
  }, [values]);

  if (!site || !stored || !values) {
    return (
      <section className="view header-footer" aria-labelledby={headId}>
        <Head id={headId} dirty={false} onClose={onClose} onHide={onHide} onTake={() => {}} onKeep={() => {}} />
        <div className="tray-body"><p className="hint" role="status">The header and footer are not loaded yet.</p></div>
      </section>
    );
  }

  const dirty = !sameJson(values, stored);
  const saving = session.siteSave.phase === "saving";
  // A change: kept as the change waiting (none, when it is what is
  // stored), and the refusals it answers, those whose pointer `answered`
  // names, no longer stand.
  const change = (next: SiteValues, answered: (pointer: string) => boolean) => {
    ui.getState().setSiteDraft(sameJson(next, stored) ? null : next);
    ui.getState().setSiteErrors(ui.getState().siteErrors.filter((e) => !answered(e.pointer)));
  };
  const at = (pointer: string) => (p: string) => p === pointer;
  const under = (pointer: string) => (p: string) => p === pointer || p.startsWith(`${pointer}/`);
  const errorsAt = (pointer: string, value?: string): string[] => {
    const shown = visited.has(pointer) ? live.filter((e) => e.pointer === pointer) : live.filter((e) => e.pointer === pointer && (e.keyword === "maxLength" || e.keyword === "maxItems"));
    return sentencesAt([...refused.filter((e) => e.pointer === pointer), ...shown], pointer, value);
  };
  const leave = (pointer: string) => {
    if (!visited.has(pointer)) setVisited(new Set(visited).add(pointer));
  };
  const field = (pointer: string, label: string, value: string, set: (text: string) => SiteValues, options: { hint?: ReactNode; link?: boolean; long?: boolean; autoFocus?: boolean } = {}) => (
    <SiteField
      key={pointer}
      pointer={pointer}
      label={label}
      value={value}
      hint={options.hint}
      link={options.link ? choicesId : undefined}
      long={options.long}
      autoFocus={options.autoFocus}
      errors={errorsAt(pointer, value)}
      onChange={(text) => change(set(text), at(pointer))}
      onLeave={() => leave(pointer)}
    />
  );

  const name = (link: SiteLink, index: number) => link.label.trim() || `link ${index + 1}`;
  const add = () => {
    const added = values.menu.length;
    change(addLink(values), at("/menu"));
    setSaid(`Link ${added + 1} added.`);
    focusSiteField(`/menu/${added}/label`);
  };
  const remove = (index: number) => {
    const gone = name(values.menu[index]!, index);
    const next = removeLink(values, index);
    // The links after it move up a place: what was said of them, at their
    // old places, no longer fits.
    change(next, under("/menu"));
    setVisited(new Set([...visited].filter((p) => !p.startsWith("/menu/"))));
    setSaid(`${gone} removed. ${next.menu.length === 1 ? "1 link" : `${next.menu.length} links`} left.`);
    if (next.menu.length === 0) afterRender(() => document.querySelector<HTMLElement>(".header-footer [data-add-link]")?.focus());
    else focusSiteField(`/menu/${Math.min(index, next.menu.length - 1)}/label`);
  };
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    const moved = name(values.menu[index]!, index);
    change(moveLink(values, index, by), (p) => under(`/menu/${index}`)(p) || under(`/menu/${to}`)(p));
    setVisited(new Set([...visited].filter((p) => !p.startsWith(`/menu/${index}/`) && !p.startsWith(`/menu/${to}/`))));
    setSaid(`${moved} moved ${by < 0 ? "up" : "down"}: link ${to + 1} of ${values.menu.length}.`);
    // The focus stays on the same button of the link moved; at an end,
    // where that button no longer moves it, on the other one.
    const atEnd = by < 0 ? to === 0 : to === values.menu.length - 1;
    const button = atEnd ? (by < 0 ? "down" : "up") : by < 0 ? "up" : "down";
    afterRender(() => document.querySelector<HTMLElement>(`.header-footer [data-link="${to}"] [data-move="${button}"]`)?.focus());
  };
  const removeButton = () => {
    lastAction.current = values.action;
    change(setAction(values, null), under("/action"));
    setSaid("Button removed: the header has none.");
    afterRender(() => document.querySelector<HTMLElement>(".header-footer [data-add-action]")?.focus());
  };
  const addButton = () => {
    change(setAction(values, lastAction.current ?? stored.action ?? EMPTY_LINK), under("/action"));
    setSaid("Button added.");
    focusSiteField("/action/label");
  };
  const firstAtFault = () => afterRender(() => document.querySelector<HTMLElement>('.header-footer [data-field][aria-invalid="true"]')?.focus());
  const save = async () => {
    if (!dirty || saving) return;
    const result = await session.saveSite(values);
    if (result === "invalid") firstAtFault();
    else if (result === "conflict") afterRender(() => document.querySelector<HTMLElement>(".header-footer .hf-conflict button")?.focus());
  };
  const keepMine = async () => {
    if (session.siteSave.phase !== "conflict") return;
    const result = await session.saveSite(values, session.siteSave.revision);
    if (result === "invalid") firstAtFault();
    else afterRender(() => document.querySelector<HTMLElement>(".header-footer [data-save]")?.focus());
  };
  const takeTheirs = async () => {
    await session.reloadSite();
    setVisited(new Set());
    setSaid("The header and footer as saved in the other tab.");
    afterRender(() => document.querySelector<HTMLElement>(".header-footer [data-autofocus]")?.focus());
  };
  const discard = () => {
    if (!dirty) return;
    ui.getState().setSiteDraft(null);
    ui.getState().setSiteErrors([]);
    setVisited(new Set());
    setSaid("Changes discarded: the header and footer are as saved.");
  };
  const full = values.menu.length >= SITE_LIMITS.links;

  return (
    <section className="view header-footer" aria-labelledby={headId}>
      <Head id={headId} dirty={dirty} onClose={onClose} onHide={onHide} onTake={() => void takeTheirs()} onKeep={() => void keepMine()} />
      <div className="tray-body">
        <datalist id={choicesId}>{choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</datalist>
        <p className="visually-hidden" role="status">{said}</p>

        <h3 className="group-title">Header</h3>
        {field("/name", "Site name", values.name, (text) => setName(values, text), { autoFocus: true, hint: `Beside the site’s mark, which stays the design’s. Up to ${SITE_LIMITS.name} characters; on a phone, a long name puts Menu on a row of its own.` })}

        <h3 className="group-title hf-title" id={`${headId}-menu`}>Menu</h3>
        <p className="hint hf-hint">Up to {SITE_LIMITS.links} links, each up to {SITE_LIMITS.label} characters. Where they do not fit the bar, they fold into Menu.</p>
        {values.menu.length === 0
          ? <p className="hint hf-none">No links: the header has no menu.</p>
          : (
            <ol className="hf-links" aria-labelledby={`${headId}-menu`}>
              {values.menu.map((link, index) => (
                <li key={index} className="hf-link" data-link={index}>
                  <fieldset>
                    <legend>Link {index + 1}</legend>
                    <div className="hf-link-keys">
                      <button className="ibtn ibtn-small" type="button" data-move="up" aria-label={`Move ${name(link, index)} up`} title="Move up" aria-disabled={index === 0 || undefined} onClick={() => index > 0 && move(index, -1)}><Icon name="arrow-up" /></button>
                      <button className="ibtn ibtn-small" type="button" data-move="down" aria-label={`Move ${name(link, index)} down`} title="Move down" aria-disabled={index === values.menu.length - 1 || undefined} onClick={() => index < values.menu.length - 1 && move(index, 1)}><Icon name="arrow-down" /></button>
                      <button className="ibtn ibtn-small" type="button" data-remove="" aria-label={`Remove ${name(link, index)}`} title="Remove" onClick={() => remove(index)}><Icon name="trash" /></button>
                    </div>
                    {field(`/menu/${index}/label`, "Text", link.label, (text) => setLink(values, index, "label", text))}
                    {field(`/menu/${index}/href`, "Link", link.href, (text) => setLink(values, index, "href", text), { link: true, hint: LINK_HINT })}
                  </fieldset>
                </li>
              ))}
            </ol>
          )}
        <ErrorList id={`${headId}-menu-error`} errors={errorsAt("/menu")} />
        <div className="hf-row">
          <button className="btn btn-small btn-secondary" type="button" data-add-link="" aria-disabled={full || undefined} aria-describedby={full ? `${headId}-full` : undefined} onClick={() => !full && add()}><Icon name="plus" />Add a link</button>
          {full && <span className="hint" id={`${headId}-full`}>{SITE_LIMITS.links} links, the most the header holds.</span>}
        </div>

        <h3 className="group-title hf-title" id={`${headId}-button`}>Button</h3>
        <div role="group" aria-labelledby={`${headId}-button`}>
          {values.action ? (
            <>
              {field("/action/label", "Text", values.action.label, (text) => setActionPart(values, "label", text), { hint: `Up to ${SITE_LIMITS.button} characters.` })}
              {field("/action/href", "Link", values.action.href, (text) => setActionPart(values, "href", text), { link: true, hint: LINK_HINT })}
              <div className="hf-row">
                <button className="btn btn-small btn-secondary" type="button" data-remove-action="" onClick={removeButton}><Icon name="trash" />Remove the button</button>
              </div>
            </>
          ) : (
            <div className="hf-row">
              <p className="hint hf-none">No button in the header.</p>
              <button className="btn btn-small btn-secondary" type="button" data-add-action="" onClick={addButton}><Icon name="plus" />Add a button</button>
            </div>
          )}
        </div>

        <h3 className="group-title hf-title" id={`${headId}-footer`}>Footer</h3>
        <div role="group" aria-labelledby={`${headId}-footer`}>
          {field("/footer/lead", "Bold words", values.footer.lead, (text) => setFooter(values, "lead", text), { hint: `First, in bold. Up to ${SITE_LIMITS.lead} characters.` })}
          {field("/footer/text", "Words after them", values.footer.text, (text) => setFooter(values, "text", text), { long: true, hint: `On the same line. Up to ${SITE_LIMITS.text} characters.` })}
        </div>
      </div>
      {/* Under the values, always in view however far they scroll. */}
      <div className="hf-actions">
        <button className="btn btn-small btn-secondary" type="button" data-discard="" aria-disabled={!dirty || saving || undefined} onClick={discard}>Discard changes</button>
        <button className="btn btn-small btn-primary" type="button" data-save="" aria-disabled={!dirty || saving || undefined} onClick={() => void save()}>Save</button>
      </div>
    </section>
  );
}

// A level below the Page tab, as Site style's head: the way back to it,
// the title, what a change does, and where the last save is.
function Head({ id, dirty, onClose, onHide, onTake, onKeep }: { id: string; dirty: boolean; onClose: () => void; onHide?: (() => void) | undefined; onTake: () => void; onKeep: () => void }) {
  const { siteSave } = useSession();
  // A refusal for values the panel marked is said until the person has
  // changed each of them.
  const marked = useUi((u) => u.siteErrors.length > 0);
  let state: ReactNode;
  if (siteSave.phase === "conflict") {
    state = (
      <div className="hf-conflict" role="alert">
        <p><strong>Changed in another tab.</strong> The header and footer were saved in another tab after you opened them. Nothing is saved until you choose.</p>
        <div className="banner-actions">
          <button className="btn btn-small btn-dark" type="button" title="Take the header and footer as saved in the other tab, leaving the changes made here" onClick={onTake}>Reload</button>
          <button className="btn btn-small btn-secondary" type="button" title="Save the header and footer as they are here, over the other tab's" onClick={onKeep}>Keep mine</button>
        </div>
      </div>
    );
  } else if (siteSave.phase === "failed" && (!siteSave.marked || marked)) {
    state = <p className="error" role="alert"><Icon name="error" />{siteSave.message}</p>;
  } else {
    state = <p className="style-save" role="status">{siteSave.phase === "saving" ? "Saving…" : dirty ? "Not saved yet" : siteSave.phase === "saved" ? "Saved for every page" : ""}</p>;
  }
  return (
    <div className="tray-head tray-head-title">
      <div>
        <button className="sb-back" type="button" aria-label="Back to Page" onClick={onClose}><Icon name="arrow-left" className="i i-xs" />Page</button>
        <h2 id={id}>Header and footer</h2>
        <p>{REACHES_EVERY_PAGE}</p>
        {state}
      </div>
      {onHide && <button className="ibtn" type="button" aria-label="Hide the sidebar" title="Hide the sidebar" onClick={onHide}><Icon name="close" /></button>}
    </div>
  );
}

// One value: its label, the input (one line; a text area that keeps to one
// line for the footer's longer text; the link field's own look, with the
// site's pages and sections offered, for an address), its hint and its
// problems, tied to it for a screen reader.
function SiteField({ pointer, label, value, hint, link, long, autoFocus, errors, onChange, onLeave }: {
  pointer: string;
  label: string;
  value: string;
  hint?: ReactNode;
  // The id of the list of addresses to offer.
  link?: string | undefined;
  long?: boolean | undefined;
  autoFocus?: boolean | undefined;
  errors: readonly string[];
  onChange: (text: string) => void;
  onLeave: () => void;
}) {
  const id = useId();
  const common = {
    id,
    value,
    "data-field": pointer,
    "data-autofocus": autoFocus ? "" : undefined,
    "aria-invalid": errors.length > 0 ? true : undefined,
    "aria-describedby": describedBy(id, hint, errors),
    onBlur: onLeave,
  };
  let control: ReactNode;
  if (long) {
    // One line, as the schema has it: Enter and pasted line breaks become
    // spaces rather than a line the save would be refused for.
    control = <textarea className="input" rows={2} {...common} onChange={(event) => onChange(event.target.value.replace(/\r\n?|\n/g, " "))} onKeyDown={(event) => event.key === "Enter" && event.preventDefault()} />;
  } else if (link) {
    control = (
      <div className="input input-icon">
        <Icon name="link" />
        <input type="text" spellCheck={false} placeholder="Paste a link or choose a page" list={link} {...common} onChange={(event) => onChange(event.target.value)} />
      </div>
    );
  } else {
    control = <input type="text" className="input" {...common} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <div className={`field${errors.length > 0 ? " field-error" : ""}`}>
      <label className="label" htmlFor={id}>{label}</label>
      {control}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      <ErrorList id={`${id}-error`} errors={errors} />
    </div>
  );
}

// Where a link of the header can lead: the site's pages, the sections of
// the page being edited (as it is now) and those of the home page (read
// from its draft once, when the panel opens), which is where a site's menu
// most often points.
function useLinkChoices(): Array<{ value: string; label: string }> {
  const session = useSession();
  const document = useEditor((s) => s.document);
  const homeId = session.pages.find((p) => p.home)?.id ?? null;
  const currentId = session.current?.id ?? null;
  const [home, setHome] = useState<{ id: number; sections: readonly SectionTarget[] } | null>(null);
  const read = session.pageSections;
  useEffect(() => {
    if (homeId === null || homeId === currentId) return undefined;
    let gone = false;
    void read(homeId).then((sections) => {
      if (!gone && sections) setHome({ id: homeId, sections });
    });
    return () => {
      gone = true;
    };
  }, [homeId, currentId, read]);
  return useMemo(() => {
    const sections = new Map<number, readonly SectionTarget[]>();
    if (home && home.id === homeId) sections.set(home.id, home.sections);
    if (currentId !== null) sections.set(currentId, sectionTargets(document));
    return linkChoices(session.pages, sections);
  }, [session.pages, home, homeId, currentId, document]);
}
