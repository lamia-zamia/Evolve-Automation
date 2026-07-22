import assert from "node:assert/strict";

import { createBrowserRandomSource } from "../src/adapters/browser/random.ts";

const originalRandom = Math.random;
try {
  Math.random = () => 0.375;
  assert.equal(createBrowserRandomSource().nextUnit(), 0.375);
} finally {
  Math.random = originalRandom;
}

console.log("Random adapter tests passed");
