// The site's own files, read from cms/ when the editor is built
// (build/site-theme.ts): the header's and footer's starters, the documents
// a site draws until it publishes its own parts, which the build holds to
// the rules a part's draft is held to before it serves them, as the CMS
// does before it starts; and the site's time zone.
declare module "virtual:site-theme" {
  import type { PageDocument } from "../shared/document.ts";

  export const SITE_THEME: {
    readonly parts: { readonly header: PageDocument; readonly footer: PageDocument };
    readonly timeZone: string;
  };
}
