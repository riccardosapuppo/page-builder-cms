// The editor's validator: ajv 8.20.0 with the project's configuration. The
// Ruby side is JSONSchemer.schema(schema, regexp_resolver: "ecma",
// format: false), in validate.rb and, later, in the Rails app.
import Ajv2020Module from "ajv/dist/2020.js";

// ajv is CommonJS: the constructor is module.exports.default.
const Ajv2020 = Ajv2020Module.default;
export type Ajv = InstanceType<typeof Ajv2020>;

export function makeAjv(): Ajv {
  return new Ajv2020({
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
  });
}
