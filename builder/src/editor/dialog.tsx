// A modal dialog in the design's look (.dialog, .scrim): it takes the focus
// when it opens, keeps Tab inside itself, closes on Escape, and gives the
// focus back to what had it before. The rest of the editor is inert while
// it is open.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons.tsx";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Dialog({ title, onClose, children, footer, wide = false }: DialogProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.querySelector<HTMLElement>(".app");
    app?.setAttribute("inert", "");
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      app?.removeAttribute("inert");
      if (before?.isConnected) before.focus();
    };
  }, []);

  // Outside .app, which is inert while the dialog is open.
  return createPortal(
    <>
      <div className="scrim" aria-hidden="true" onClick={() => close.current()} />
      <div
        ref={box}
        className={`dialog chrome ${wide ? "dlg-wide" : "dlg-form"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
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
        <header className="dlg-head">
          <h2 id={`${id}-title`}>{title}</h2>
          <button className="ibtn" type="button" aria-label="Close" onClick={() => close.current()}><Icon name="close" /></button>
        </header>
        <div className="dlg-body">{children}</div>
        {footer && <footer className="dlg-foot">{footer}</footer>}
      </div>
    </>,
    document.body,
  );
}
