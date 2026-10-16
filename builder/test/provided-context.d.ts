// What Vitest's global setups hand the tests (inject("cmsUrl")): the
// address of the CMS e2e/harness/vitest-rails.ts started for the run, the
// folder its databases and storage are in, and the address of the tests'
// fake Stripe its shop's checkout goes to.
import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    cmsUrl: string;
    cmsFolder: string;
    stripeUrl: string;
  }
}
