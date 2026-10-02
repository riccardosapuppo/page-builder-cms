// A menu opened from a button (the ARIA menu button pattern), or from a
// block (its context menu): the first item takes the focus, the arrows
// move along the items, Escape or a click elsewhere closes it and gives the
// focus back to its button or block.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

interface MenuProps {
  label: string;
  className: string;
  button: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  // Where it opens, for a menu that is not under a button.
  style?: CSSProperties;
}

const ITEMS = "[role=menuitem]:not([aria-disabled=true])";

export function Menu({ label, className, button, onClose, children, style }: MenuProps) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    box.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || button.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [button]);

  return (
    <div
      ref={box}
      className={`menu chrome ${className}`}
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={(event) => {
        const items = [...(box.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        let next: HTMLElement | undefined;
        if (event.key === "ArrowDown") next = items[(at + 1) % items.length];
        else if (event.key === "ArrowUp") next = items[(at - 1 + items.length) % items.length];
        else if (event.key === "Home") next = items[0];
        else if (event.key === "End") next = items.at(-1);
        else if (event.key === "Escape" || event.key === "Tab") {
          if (event.key === "Escape") event.preventDefault();
          close.current();
          button.current?.focus();
          return;
        } else return;
        event.preventDefault();
        next?.focus();
      }}
    >
      {children}
    </div>
  );
}
