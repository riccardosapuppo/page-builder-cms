// The numbers a test run takes from the environment, such as a seed or a
// number of runs to replay a failure. Unset or empty, the test's own default
// applies; anything else must be a whole number at least `min`, or the run
// stops. Number() alone would turn "abc" into NaN and "" into 0, and a
// property run 0 times passes having checked nothing.
export function wholeNumberFromEnv(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^-?[0-9]+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min}, not "${raw}"`);
  }
  return value;
}
