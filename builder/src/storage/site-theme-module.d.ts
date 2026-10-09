// The theme's parts around every page, read from cms/config/site.yml when
// the editor is built (build/site-theme.ts): the header and footer's
// defaults, which the build holds to the rules a change from the editor is
// held to ($defs/site of the page schema) before it serves them, as the
// CMS does before it starts, so they have its shape; and the site's time
// zone.
declare module "virtual:site-theme" {
  export const SITE_THEME: {
    readonly name: string;
    readonly menu: ReadonlyArray<{ readonly label: string; readonly href: string }>;
    readonly action: { readonly label: string; readonly href: string } | null;
    readonly footer: { readonly lead: string; readonly text: string };
    readonly timeZone: string;
  };
}
