// npm run measure:server, measure:builder and measure:bundle begin here.
//
// The measurements are TypeScript that Node runs as it is, which Node does
// from version 24, so this file is JavaScript of the oldest kind that any
// Node can read. It checks the running version against "engines" in
// package.json with the guard npm start uses (./start.cjs) and, when Node is
// too old, says so in one sentence and stops before anything is started.
// Only then does it load the TypeScript, through ./measure/enter.cjs, whose
// import() an old enough Node could not even parse.
//
//   node tools/measure.cjs server | builder | bundle
//
// Exits 2, "could not run here", when the version is refused or the name is
// not one of the three.
"use strict";

var guard = require("./start.cjs");

var NAMES = ["server", "builder", "bundle"];

// null when this Node can run the measurement called `name`, otherwise the
// sentence to print.
function problemWith(versionText, range, name) {
  if (NAMES.indexOf(name) === -1) {
    return "Measure what? One of " + NAMES.join(", ") + " (npm run measure:" + NAMES[0] + "), not \"" + name + "\". Nothing was started.";
  }
  var old = guard.problemWith(versionText, range);
  return old ? old.replace("Nothing was installed or started.", "Nothing was measured.") : null;
}

module.exports = { NAMES: NAMES, problemWith: problemWith };

if (require.main === module) {
  var problem = problemWith(process.versions.node, guard.requiredRange(), process.argv[2]);
  if (problem) {
    console.log(problem);
    process.exit(2);
  }
  require("./measure/enter.cjs");
}
