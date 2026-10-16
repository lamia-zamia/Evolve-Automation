import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const combinedBuild = spawnSync(
  process.execPath,
  ["build.mjs", "--local", "--research-condition-gate"],
  { cwd: root, encoding: "utf8" },
);
assert.notEqual(combinedBuild.status, 0, "combined local pilot build fails");
assert.match(
  `${combinedBuild.stdout}\n${combinedBuild.stderr}`,
  /--local cannot be combined with --research-condition-gate/,
);

const optInBuild = spawnSync(
  process.execPath,
  ["build.mjs", "--research-condition-gate"],
  { cwd: root, encoding: "utf8" },
);
assert.equal(
  optInBuild.status,
  0,
  `${optInBuild.stdout}\n${optInBuild.stderr}`,
);

const productionBundle = await readFile(
  resolve(root, "evolve_automation.user.js"),
  "utf8",
);
const productionMetadata = await readFile(
  resolve(root, "evolve_automation.meta.js"),
  "utf8",
);
const sourceMetadata = await readFile(
  resolve(root, "src/userscript.meta.js"),
  "utf8",
);
const optInDirectory = resolve(root, "test-artifacts/research-condition-gate");
const optInBundle = await readFile(
  resolve(optInDirectory, "evolve_automation.user.js"),
  "utf8",
);
const optInMetadata = await readFile(
  resolve(optInDirectory, "evolve_automation.meta.js"),
  "utf8",
);

for (const marker of [
  "captureCompletedTechConditionsDuring",
  "researchConditionGateCompromised",
  "researchConditionGateObserveRegistry",
  "condition descriptor could not be gated",
  "Research condition gate could not restore",
  "native callback descriptors require a clean reload",
  "researchConditionGateFallback",
]) {
  assert.equal(
    productionBundle.includes(marker),
    false,
    `default production bundle omits ${marker}`,
  );
}
assert.equal(productionMetadata, `${sourceMetadata.trimEnd()}\n`);

for (const marker of [
  "captureCompletedTechConditionsDuring",
  "researchConditionGateCompromised",
  "researchConditionGateObserveRegistry",
  "condition descriptor could not be gated",
  "Research condition gate could not restore",
  "native callback descriptors require a clean reload",
])
  assert.equal(
    optInBundle.includes(marker),
    true,
    `opt-in bundle includes ${marker}`,
  );

assert.match(
  optInMetadata,
  /^\/\/ @name\s+Evolve Automation \(Research Gate Pilot\)$/m,
);
assert.match(
  optInMetadata,
  /^\/\/ @namespace\s+https:\/\/evolve-automation\.local\/research-gate-pilot$/m,
);
assert.doesNotMatch(optInMetadata, /^\/\/ @(?:downloadURL|updateURL)\b/m);
for (const line of sourceMetadata.split("\n")) {
  if (/^\/\/ @(?:match|grant|run-at)\b/.test(line))
    assert.equal(
      optInMetadata.includes(line),
      true,
      `opt-in metadata preserves ${line}`,
    );
}
for (const line of optInMetadata.split("\n")) {
  if (/^\/\/ @(?:downloadURL|updateURL)\b/.test(line))
    assert.fail(`opt-in metadata must not inherit ${line}`);
}

console.log("Research condition gate build boundary passed");
