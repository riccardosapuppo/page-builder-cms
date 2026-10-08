// The settings the editor reads at build time (Vite's import.meta.env).
interface ImportMetaEnv {
  // Where the CMS's API is: /api by default, through the development
  // server's proxy; an absolute address points at another server, which
  // must then allow this origin by CORS (src/storage/config.ts).
  readonly VITE_API_BASE?: string;
  // The CMS's own origin, where its pages open (the draft's preview, the
  // live page): http://127.0.0.1:3900 by default; the development server
  // takes it from CMS_URL (src/storage/config.ts).
  readonly VITE_CMS_ORIGIN?: string;
  // Where the editor keeps its pages: rails (the CMS, by default) or
  // browser (IndexedDB, the editor in the browser alone)
  // (src/storage/config.ts).
  readonly VITE_STORAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
