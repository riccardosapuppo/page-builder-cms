// The icon box's icons, read from schema/icons.svg when the editor is built
// (build/site-icons.ts): by name, the symbol's viewBox (null when it has
// none) and its shapes, each an element name and its attributes, in the
// file's order.
declare module "virtual:site-icons" {
  export const SITE_ICONS: Readonly<Record<string, {
    readonly viewBox: string | null;
    readonly shapes: ReadonlyArray<readonly [element: string, attributes: Readonly<Record<string, string>>]>;
  }>>;
}
