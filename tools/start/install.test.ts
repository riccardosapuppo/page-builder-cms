// node --test tools/start/install.test.ts (Ruby on the PATH)
//
// Where Bundler writes the gems' launchers, asked of Bundler itself in an
// application folder of the test's own: an empty Gemfile, so nothing is
// installed and nothing outside the folder is written.
// - The planted case of rule 128: one launchers' folder written in
//   .bundle/config, another in the environment, and Bundler asked which
//   one it takes. The two prototypes of the plan disagreed about it, so
//   the answer is printed, and the routine must not depend on it: it
//   writes the same folder in both places.
// - What each place does alone, and what Bundler takes with neither (on a
//   machine-wide RubyInstaller, the user's WindowsApps folder).
// - configureBundler, the routine npm start runs, on that folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askRuby, configureBundler, missingPackages, samePath } from "./install.ts";

function app(): string {
  const folder = mkdtempSync(join(tmpdir(), "pbc-bundler-"));
  writeFileSync(join(folder, "Gemfile"), 'source "https://rubygems.org"\n');
  return folder;
}

function withConfig(folder: string, bindir: string): void {
  mkdirSync(join(folder, ".bundle"), { recursive: true });
  writeFileSync(join(folder, ".bundle", "config"), `---\nBUNDLE_SYSTEM_BINDIR: "${bindir}"\n`);
}

// The environment of this test without either setting, as a shell that
// never heard of them would have it.
function bare(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.BUNDLE_SYSTEM_BINDIR;
  delete env.BUNDLE_PATH;
  delete env.BUNDLE_APP_CONFIG;
  return env;
}

test("planted: a launchers' folder in .bundle/config and another in the environment; Bundler takes one", (t) => {
  const folder = app();
  try {
    const fromConfig = join(folder, "from-config").replace(/\\/g, "/");
    const fromEnv = join(folder, "from-env").replace(/\\/g, "/");
    withConfig(folder, fromConfig);
    const both = askRuby("Bundler.system_bindir", { ...bare(), BUNDLE_SYSTEM_BINDIR: fromEnv }, folder);
    const winner = samePath(both, fromConfig) ? ".bundle/config" : samePath(both, fromEnv) ? "the environment" : `neither (${both})`;
    t.diagnostic(`with both set, Bundler ${askRuby("Bundler::VERSION", bare(), folder)} takes ${winner}`);
    assert.ok(winner !== `neither (${both})`, `Bundler took ${both}, which neither place said`);

    assert.ok(samePath(askRuby("Bundler.system_bindir", bare(), folder), fromConfig), ".bundle/config alone is not taken");
    rmSync(join(folder, ".bundle"), { recursive: true, force: true });
    assert.ok(samePath(askRuby("Bundler.system_bindir", { ...bare(), BUNDLE_SYSTEM_BINDIR: fromEnv }, folder), fromEnv), "the environment alone is not taken");
    t.diagnostic(`with neither, Bundler takes ${askRuby("Bundler.system_bindir", bare(), folder)}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the routine writes the folder inside the application in both places, and Bundler agrees", () => {
  const folder = app();
  try {
    // A folder planted in the user's own settings is overridden too.
    const lines: string[] = [];
    const saved = process.env.BUNDLE_SYSTEM_BINDIR;
    process.env.BUNDLE_SYSTEM_BINDIR = join(folder, "planted-elsewhere");
    let bundler;
    try {
      bundler = configureBundler((line) => lines.push(line), folder);
    } finally {
      if (saved === undefined) delete process.env.BUNDLE_SYSTEM_BINDIR;
      else process.env.BUNDLE_SYSTEM_BINDIR = saved;
    }
    assert.match(bundler.bindir.replace(/\\/g, "/"), /\/vendor\/bundle\/ruby\/[^/]+\/bin$/);
    assert.ok(samePath(bundler.bindir.slice(0, folder.length), folder), `${bundler.bindir} is not inside ${folder}`);
    const config = readFileSync(join(folder, ".bundle", "config"), "utf8");
    assert.match(config, /BUNDLE_PATH: "vendor\/bundle"/);
    assert.ok(config.includes(`BUNDLE_SYSTEM_BINDIR: "${bundler.bindir}"`), config);
    assert.equal(bundler.env.BUNDLE_SYSTEM_BINDIR, bundler.bindir);
    assert.ok(samePath(askRuby("Bundler.system_bindir", bundler.env, folder), bundler.bindir));
    // With the environment's copy taken away, the config alone still says it.
    const configOnly = { ...bundler.env };
    delete configOnly.BUNDLE_SYSTEM_BINDIR;
    assert.ok(samePath(askRuby("Bundler.system_bindir", configOnly, folder), bundler.bindir));
    assert.equal(lines.length, 1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("missingPackages: absent and other versions named, absent optional ones left out", () => {
  const folder = mkdtempSync(join(tmpdir(), "pbc-packages-"));
  try {
    const put = (name: string, version: string) => {
      mkdirSync(join(folder, "node_modules", name), { recursive: true });
      writeFileSync(join(folder, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
    };
    writeFileSync(join(folder, "package-lock.json"), JSON.stringify({
      packages: {
        "": { name: "x" },
        "node_modules/kept": { version: "1.0.0" },
        "node_modules/moved": { version: "2.0.0" },
        "node_modules/gone": { version: "3.0.0", dev: true },
        "node_modules/native-other-system": { version: "4.0.0", optional: true },
      },
    }));
    put("kept", "1.0.0");
    put("moved", "2.1.0");
    assert.deepEqual(missingPackages(folder), ["moved (2.1.0, locked 2.0.0)", "gone (absent)"]);
    put("moved", "2.0.0");
    put("gone", "3.0.0");
    assert.deepEqual(missingPackages(folder), []);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
