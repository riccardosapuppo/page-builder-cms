// What Vitest's global setups hand the tests (inject("cmsUrl")): the
// address of the CMS e2e/harness/vitest-rails.ts started for the run.
import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    cmsUrl: string;
  }
}
