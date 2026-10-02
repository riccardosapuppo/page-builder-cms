// The settings the editor reads at build time (Vite's import.meta.env).
interface ImportMetaEnv {
  // Where the CMS's API is: /api by default, through the development
  // server's proxy; an absolute address points at another server, which
  // must then allow this origin by CORS (src/storage/config.ts).
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
