import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = path.join(root, "src");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const main = read("src/main.ts");
assert.doesNotMatch(main, /bootstrap/);
assert.doesNotMatch(main, /__EA_TEST_HOOKS__/);
assert.doesNotMatch(main, /captureTestSurface/);
assert.match(main, /startEvolveRuntime\(/);

assert.equal(
  fs.existsSync(path.join(sourceRoot, "automation", "dependencies.ts")),
  false,
  "the shared legacy dependency bag must remain deleted",
);

const sourceFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(entryPath);
    } else if (/\.(?:js|ts)$/.test(entry.name)) {
      sourceFiles.push(entryPath);
    }
  }
}
collect(sourceRoot);

const sourceJavaScript = sourceFiles
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
  .sort();
assert.deepEqual(sourceJavaScript, [
  "src/adapters/evolve/evolve-runtime.js",
  "src/userscript.meta.js",
]);

const customExpressionPath = path.join(
  sourceRoot,
  "adapters",
  "evolve",
  "custom-expression.ts",
);
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (file !== customExpressionPath) {
    assert.doesNotMatch(
      source,
      /\b(?:Function|eval)\s*\(/,
      `${path.relative(root, file)} must not evaluate custom expressions`,
    );
  }
  assert.doesNotMatch(
    source,
    /__EAperf/,
    `${path.relative(root, file)} must not expose the removed performance singleton`,
  );
}

const tsconfig = JSON.parse(read("tsconfig.json"));
assert.equal(tsconfig.compilerOptions.strict, true);
assert.equal(tsconfig.compilerOptions.noImplicitAny, true);
assert.equal(tsconfig.compilerOptions.strictNullChecks, true);

const architectureConfig = JSON.parse(read("tsconfig.architecture.json"));
assert.equal(architectureConfig.compilerOptions.noUncheckedIndexedAccess, true);
assert.equal(
  architectureConfig.compilerOptions.exactOptionalPropertyTypes,
  true,
);
assert.equal(
  architectureConfig.compilerOptions.useUnknownInCatchVariables,
  true,
);

console.log("Milestone 5 bootstrap and legacy-boundary audit passed");
