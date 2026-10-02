// The fonts reach the bundle from where the repository already keeps them,
// never copied into builder/:
// - Archivo and Source Serif 4, the published page's, from
//   cms/app/assets/fonts, named by cms/app/assets/stylesheets/site.css as
//   bare file names (Propshaft finds them on its load path);
// - Instrument Sans, the editor's own, from design/fonts.
// The aliases below send those bare names to their folders, so Vite
// resolves the stylesheet's url()s to the real files and emits them with
// the bundle. Each font is under the SIL Open Font License, which asks that
// the licence travel with the font: the plugin emits each font's licence
// file beside it, and fails the build for a font it has no licence for.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Alias, Plugin } from "vite";
import { cmsFonts, designFonts } from "./paths.ts";

export function fontAliases(): Alias[] {
  const aliases: Alias[] = [];
  for (const folder of [cmsFonts, designFonts]) {
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".woff2"))) {
      // The editor's font comes from the design; the page's from cms/,
      // whose copies are the ones the published pages serve.
      if (folder === designFonts && existsSync(join(cmsFonts, file))) continue;
      aliases.push({ find: new RegExp(`^${file.replaceAll(".", "\\.")}$`), replacement: join(folder, file) });
    }
  }
  return aliases;
}

// "source-serif-4-variable-italic.woff2" -> "sourceserif4"; "LICENSE-SourceSerif4.txt" -> "sourceserif4".
function family(fontFile: string): string {
  return basename(fontFile).replace(/-variable(-italic)?\.woff2$/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

// The licence file next to a font, found by family name.
export function licenceFor(fontPath: string): string | undefined {
  const folder = dirname(fontPath);
  const want = family(fontPath);
  const match = readdirSync(folder).find((name) => /^LICENSE-.+\.txt$/.test(name)
    && name.replace(/^LICENSE-/, "").replace(/\.txt$/, "").replace(/[^a-z0-9]/gi, "").toLowerCase() === want);
  return match ? join(folder, match) : undefined;
}

export function fontLicences(): Plugin {
  return {
    name: "page-builder-cms:font-licences",
    apply: "build",
    generateBundle(_options, bundle) {
      const emitted = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !output.fileName.endsWith(".woff2")) continue;
        const source = output.originalFileNames[0];
        if (!source) this.error(`${output.fileName}: no source file recorded, so its licence cannot be found`);
        const licence = licenceFor(source);
        if (!licence) this.error(`${output.fileName} (from ${source}) has no LICENSE-<family>.txt beside it`);
        const fileName = `${dirname(output.fileName)}/${basename(licence)}`;
        if (emitted.has(fileName)) continue;
        emitted.add(fileName);
        this.emitFile({ type: "asset", fileName, source: readFileSync(licence) });
      }
    },
  };
}
