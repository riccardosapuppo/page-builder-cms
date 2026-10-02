// The editor's validator: ajv 8.20.0 with the project's configuration. The
// Ruby side is JSONSchemer.schema(schema, regexp_resolver: "ecma",
// format: false), in validate.rb and, later, in the Rails app.
import Ajv2020Module from "ajv/dist/2020.js";
import { AJV_OPTIONS } from "./ajv-options.ts";

// ajv is CommonJS: the constructor is module.exports.default.
const Ajv2020 = Ajv2020Module.default;
export type Ajv = InstanceType<typeof Ajv2020>;

export function makeAjv(): Ajv {
  return new Ajv2020({ ...AJV_OPTIONS });
}
