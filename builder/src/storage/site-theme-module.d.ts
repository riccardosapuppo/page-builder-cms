// The theme's parts around every page, read from cms/config/site.yml when
// the editor is built (build/site-theme.ts), as the file has them: the
// browser's storage adapter checks each value as the CMS's controller does.
declare module "virtual:site-theme" {
  export const SITE_THEME: {
    readonly name: unknown;
    readonly menu: unknown;
    readonly action: unknown;
    readonly footer: unknown;
    readonly timeZone: unknown;
  };
}
