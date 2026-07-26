import assert from "node:assert/strict";

import {
  replaceUserscriptVersion,
  validatePackageVersion,
} from "./versioning.mjs";

assert.equal(validatePackageVersion("3.3.3"), "3.3.3");
assert.equal(validatePackageVersion("3.3.3-beta.1"), "3.3.3-beta.1");
assert.throws(() => validatePackageVersion("TS 1.0.0"), TypeError);

const metadata = [
  "// ==UserScript==",
  "// @name         Evolve",
  "// @version      3.3.2.1",
  "// ==/UserScript==",
].join("\n");

assert.equal(
  replaceUserscriptVersion(metadata, "3.3.3"),
  [
    "// ==UserScript==",
    "// @name         Evolve",
    "// @version      3.3.3",
    "// ==/UserScript==",
  ].join("\n"),
);
assert.throws(
  () => replaceUserscriptVersion("// @name Evolve", "3.3.3"),
  /exactly one @version line/,
);

console.log("Versioning tests passed");
