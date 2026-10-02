// npm start and npm run setup begin here.
//
// The repository's tools are TypeScript that Node runs as it is, which
// Node does from version 24. An older Node cannot read them at all: it
// would stop on the first type annotation with a stack trace that says
// nothing about versions. So this file is JavaScript of the oldest kind
// (var, function, CommonJS), which any Node can read: it checks the running
// version against "engines" in package.json and, when it is too old, says
// so in one sentence and stops before anything is installed or started.
// Only then does it load the TypeScript, through ./start/enter.cjs, whose
// import() an old enough Node could not even parse.
//
// Exits 2, "could not run here", when the version is refused.
"use strict";

var fs = require("fs");
var path = require("path");

// A version as three numbers. "24" and "24.1" are read as 24.0.0 and
// 24.1.0, as npm reads them in a range. Anything else is refused rather
// than guessed (a pre-release, a "v", an "x").
function parseVersion(text) {
  var match = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

function compare(a, b) {
  for (var i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// One part of a range: ">=24.0.0", "^22.13.0" or an exact "24.1.2".
// "^" allows changes that do not touch the leftmost non-zero number.
function satisfiesPart(version, part) {
  var text = part.replace(/\s+/g, "");
  if (text.indexOf(">=") === 0) {
    var floor = parseVersion(text.slice(2));
    if (!floor) throw new Error("cannot read the version range part \"" + part + "\"");
    return compare(version, floor) >= 0;
  }
  if (text.charAt(0) === "^") {
    var low = parseVersion(text.slice(1));
    if (!low) throw new Error("cannot read the version range part \"" + part + "\"");
    var high = low[0] > 0 ? [low[0] + 1, 0, 0] : low[1] > 0 ? [0, low[1] + 1, 0] : [0, 0, low[2] + 1];
    return compare(version, low) >= 0 && compare(version, high) < 0;
  }
  var exact = parseVersion(text);
  if (!exact) throw new Error("cannot read the version range part \"" + part + "\"");
  return compare(version, exact) === 0;
}

// The forms the engines fields of this repository use: the parts above,
// joined with "||". Throws on any other form, so that a range written some
// new way is noticed here instead of letting every version through.
function satisfies(versionText, range) {
  var version = parseVersion(versionText);
  if (!version) throw new Error("cannot read the version \"" + versionText + "\"");
  var parts = range.split("||");
  for (var i = 0; i < parts.length; i++) {
    if (satisfiesPart(version, parts[i])) return true;
  }
  return false;
}

// The root package.json's engines.node: the tools' own requirement.
function requiredRange() {
  var file = path.join(__dirname, "..", "package.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).engines.node;
}

// null when this Node can run the tools, otherwise the sentence to print.
function problemWith(versionText, range) {
  if (satisfies(versionText, range)) return null;
  return "This is Node " + versionText + ", and the repository's tools need Node " + range +
    " (\"engines\" in package.json): they are TypeScript that Node runs without a build step," +
    " which Node does from version 24. Install Node 24 (https://nodejs.org/) and run the command again." +
    " Nothing was installed or started.";
}

module.exports = { satisfies: satisfies, problemWith: problemWith, requiredRange: requiredRange };

if (require.main === module) {
  var problem = problemWith(process.versions.node, requiredRange());
  if (problem) {
    console.log(problem);
    process.exit(2);
  }
  require("./start/enter.cjs");
}
