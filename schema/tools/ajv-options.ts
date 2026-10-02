// The options ajv validates page documents with, in the comparator here
// (ajv.ts) and in the editor's build, which compiles the schema ahead of
// time with the same options (builder/build/validator.ts). One object, so
// the two can never be configured apart. No imports: the editor's build
// reads this file as it is, without this folder's node_modules.
export const AJV_OPTIONS = {
  strict: true,
  // strictTuples wants minItems equal to the prefixItems length, which
  // refuses the list item shape "a paragraph, then anything". It is a lint
  // of the schema, not a change in what validates.
  strictTuples: false,
  allErrors: true,
  // format is not used: the patterns are the contract.
  validateFormats: false,
  // Already ajv's default, written down so a change of default cannot
  // change what the patterns mean.
  unicodeRegExp: true,
} as const;
