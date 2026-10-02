// The ports the tests start their servers on. The project's own are 3901
// for the CMS and 4901 for the editor (3900 and 4900 are `npm start`'s,
// 3902 the production check's); E2E_CMS_PORT and E2E_BUILDER_PORT move
// them, so two runs can happen side by side.
function portFrom(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`${name} must be a port number, not "${raw}"`);
  return port;
}

export const cmsPort = (): number => portFrom("E2E_CMS_PORT", 3901);
export const builderPort = (): number => portFrom("E2E_BUILDER_PORT", 4901);
