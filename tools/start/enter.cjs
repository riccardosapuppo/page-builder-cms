// Loaded by ../start.cjs once it has seen that this Node can read
// TypeScript. It is a file of its own because import() is syntax that an
// old enough Node cannot even parse, and that Node must still be able to
// read the guard and its sentence.
"use strict";

import("./main.ts").catch(function (error) {
  console.log(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
