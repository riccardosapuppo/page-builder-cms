// Loaded by ../measure.cjs once it has seen that this Node can read
// TypeScript and that the name given is one of the measurements. A file of
// its own because import() is syntax that an old enough Node cannot even
// parse, and that Node must still be able to read the guard and its
// sentence. The name picks the file; it never reaches the import as typed.
"use strict";

var names = require("../measure.cjs").NAMES;
var name = names[names.indexOf(process.argv[2])];

import("../measure-" + name + ".ts").catch(function (error) {
  console.log(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
