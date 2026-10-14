import assert from "node:assert/strict";
import * as esbuild from "esbuild";

async function bundle(testSurfaceEnabled) {
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": String(testSurfaceEnabled),
      __EA_TEST_SURFACE_ENABLED__: String(testSurfaceEnabled),
    },
    minifySyntax: true,
    treeShaking: true,
  });
  return result.outputFiles[0].text;
}

const markers = [
  "capturedTradeRouteControlForTest",
  "resolveTradeRouteOperationsForTest",
  "recordTradeRouteTraceForTest",
];
const production = await bundle(false);
for (const marker of markers)
  assert.equal(
    production.includes(marker),
    false,
    `production bundle contains Market test surface marker ${marker}`,
  );

const test = await bundle(true);
for (const marker of markers)
  assert.equal(
    test.includes(marker),
    true,
    `test bundle omitted Market test surface marker ${marker}`,
  );

console.log("stage3x Market test-surface isolation tests passed");
