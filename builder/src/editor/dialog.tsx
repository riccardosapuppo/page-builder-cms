// A modal dialog in the design's look (.dialog, .scrim): it takes the focus
// when it opens, keeps Tab inside itself, closes on Escape, and gives the
// focus back to what had it before. The rest of the editor is inert while
// it is open.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons.tsx";
import { coarsePointer, TYPING } from "./layout-mode.ts";
import { keepBeside } from "./place-dialog.ts";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  // A dialog of its own size and body (the shortcuts window's .dlg-keys),
  // in place of the form and wide ones.
  className?: string;
  bodyClassName?: string;
  // Drawn in the header before the close button (a search).
  tools?: ReactNode;
  closeLabel?: string;
  // A line under everything, on the footer's tint.
  note?: ReactNode;
  // A small window with no header bar (the About window): what is drawn
  // above its title, then the title, the body and the footer, one under
  // the other; its footer closes it.
  plain?: { lead: ReactNode };
  // The id of what says, under the title, what the dialog is for.
  describedBy?: string;
  // A selector for the element on the page the dialog is about (the yellow
  // line a key was dropped at): the dialog stands beside it and not over
  // it, instead of in the middle of the window (./place-dialog.ts).
  beside?: string | undefined;
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

// The dialogs open, the one on top last. A dialog may open over another
// (the media library over Collections, to pick an entry's image): the one
// under it is inert too while it waits, and only the one on top answers a
// key that reached no dialog.
const opened: HTMLElement[] = [];

export function Dialog({ title, onClose, children, footer, wide = false, className, bodyClassName, tools, closeLabel = "Close", note, plain, describedBy, beside }: DialogProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  // Beside the element it is about, before the first paint, and again
  // when the page under it or the browser's window changes; the room it
  // may have given the canvas to stand there is taken back as it closes.
  useLayoutEffect(() => {
    const dialog = box.current;
    if (!beside || !dialog) return undefined;
    return keepBeside(dialog, beside);
  }, [beside]);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.querySelector<HTMLElement>(".app");
    app?.setAttribute("inert", "");
    const own = box.current;
    opened.at(-1)?.setAttribute("inert", "");
    if (own) opened.push(own);
    // What the dialog marks, else its first key: with a finger, the first
    // that takes no typing (./layout-mode.ts, TYPING).
    const keys = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? (coarsePointer() ? keys.find((key) => !key.matches(TYPING)) : keys[0]);
    first?.focus();
    // A focus that left the dialog for the page (the field it was in went
    // away): Esc still closes it, and Tab comes back into it. A key in a
    // dialog opened over this one is that dialog's.
    const outside = (event: KeyboardEvent) => {
      if (!box.current || opened.at(-1) !== box.current || (event.target instanceof Node && box.current.contains(event.target))) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      } else if (event.key === "Tab") {
        const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const to = event.shiftKey ? items.at(-1) : items[0];
        if (!to) return;
        event.preventDefault();
        to.focus();
      }
    };
    document.addEventListener("keydown", outside);
    return () => {
      document.removeEventListener("keydown", outside);
      const at = own ? opened.indexOf(own) : -1;
      if (at !== -1) opened.splice(at, 1);
      // The dialog under it, if any, takes the keys back; the editor only
      // once none is left. Before the focus goes back, which an inert
      // element would not take.
      const under = opened.at(-1);
      if (under) under.removeAttribute("inert");
      else app?.removeAttribute("inert");
      if (before?.isConnected) before.focus();
    };
  }, []);

  // A body that scrolls with nothing in it to focus (a list to read, in a
  // window shorter than it): the keyboard scrolls it once it takes the
  // focus, so it does, as a region named by the dialog. Asked again when
  // its size or its content changes.
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return undefined;
    const check = () => {
      const reachable = element.scrollHeight > element.clientHeight + 1 && element.querySelector(FOCUSABLE) === null;
      if (reachable === (element.getAttribute("tabindex") === "0")) return;
      if (reachable) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "region");
        element.setAttribute("aria-label", title);
      } else {
        element.removeAttribute("tabindex");
        element.removeAttribute("role");
        element.removeAttribute("aria-label");
      }
    };
    check();
    const resized = new ResizeObserver(check);
    resized.observe(element);
    const changed = new MutationObserver(check);
    changed.observe(element, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [title]);

  // Outside .app, which is inert while the dialog is open.
  return createPortal(
    <>
      <div className="scrim" aria-hidden="true" onClick={() => close.current()} />
      <div
        ref={box}
        className={`dialog chrome ${className ?? (wide ? "dlg-wide" : "dlg-form")}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={describedBy}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close.current();
            return;
          }
          if (event.key !== "Tab" || !box.current) return;
          const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
          const first = items[0];
          const last = items.at(-1);
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {plain ? (
          <>
            {plain.lead}
            <h2 id={`${id}-title`}>{title}</h2>
            {children}
            {footer}
          </>
        ) : (
          <>
            <header className="dlg-head">
              <h2 id={`${id}-title`}>{title}</h2>
              {tools}
              <button className="ibtn" type="button" aria-label={closeLabel} onClick={() => close.current()}><Icon name="close" /></button>
            </header>
            <div ref={body} className={`dlg-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
            {footer && <footer className="dlg-foot">{footer}</footer>}
            {note && <footer className="dlg-foot dlg-foot-note">{note}</footer>}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
