import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const fromRoot = (path) => resolve(root, path);
const baseline = fromRoot(
  option("baseline", "test-artifacts/perf-profile/p4-baseline.user.js"),
);
const candidate = fromRoot(option("candidate", "evolve_automation.user.js"));
const game = fromRoot(
  option("game", "test-artifacts/game/evolve-deadspace.js"),
);
const savePath = fromRoot(
  option(
    "save",
    "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
  ),
);
const settingsPath = fromRoot(
  option(
    "settings",
    "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
  ),
);
const out = fromRoot(
  option("out", "test-artifacts/perf-profile/p4-switch-paths.json"),
);
const periodCount = 40;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(root, "tools/chromium-evolve-runner.mjs"))
);

const saveText = await readFile(savePath, "utf8");
const save = parseSave(saveText);
const baseSettings = JSON.parse(await readFile(settingsPath, "utf8"));
const cases = [
  {
    name: "BuildingEnabled offered switchable city-mine",
    buildingId: "city-mine",
    requirementType: "BuildingEnabled",
    requirementCount: 1,
    expectedFromSave:
      "city.mine.on is 0; condition must be false at threshold 1",
    expectedSwitchRead: true,
    expectedDecision: false,
  },
  {
    name: "BuildingDisabled offered switchable city-mine",
    buildingId: "city-mine",
    requirementType: "BuildingDisabled",
    requirementCount: 1,
    expectedFromSave:
      "city.mine.count is 36 and on is 0; condition must be true",
    expectedSwitchRead: true,
    expectedDecision: true,
  },
  {
    name: "BuildingDisabled offered city-farm without a native switch",
    buildingId: "city-farm",
    requirementType: "BuildingDisabled",
    requirementCount: 0,
    expectedFromSave:
      "city.farm has no on field; a nonswitch operand is zero and condition is true",
    expectedSwitchRead: false,
    expectedDecision: true,
  },
];

assert.equal(save.city.mine.on, 0);
assert.equal(save.city.mine.count, 36);
assert.equal(Object.hasOwn(save.city.farm, "on"), false);
function fixtureOperand(scenario) {
  if (scenario.buildingId === "city-farm") return 0;
  if (scenario.requirementType === "BuildingEnabled") return save.city.mine.on;
  // DeadSpace actions.js fallback for ordinary buildings is count; city-mine has
  // no custom on_cap, so its unpowered count is native cap minus current on.
  return save.city.mine.count - save.city.mine.on;
}
const runner = await createChromiumRunner({ game });
const results = [];
try {
  for (const scenario of cases) {
    const pair = {};
    for (const [label, bundle] of [
      ["baseline", baseline],
      ["candidate", candidate],
    ]) {
      const settings = structuredClone(baseSettings);
      settings.autoTrigger = true;
      settings.triggers = [
        {
          seq: 0,
          priority: 0,
          requirementType: scenario.requirementType,
          requirementId: scenario.buildingId,
          requirementCount: scenario.requirementCount,
          actionType: "build",
          actionId: "city-mine",
          actionCount: 999_999,
          complete: false,
        },
      ];
      const session = await runner.openSession({
        bundle,
        save,
        settings,
        seed: 42,
      });
      try {
        await session.advance(periodCount);
        const exported = await session.exportSave();
        const state = await session.readState();
        const diagnostics = await session.diagnostics();
        const usage = Object.fromEntries(
          Object.entries(diagnostics.controlUsage).map(([id, count]) => [
            id,
            count.returned ?? 0,
          ]),
        );
        const ownSwitchCalls = usage[`${scenario.buildingId}.on_cap`] ?? 0;
        const actionUsage = Object.fromEntries(
          Object.entries(usage).filter(([id]) => id.endsWith(".action")),
        );
        pair[label] = {
          exportSha256: digest(exported),
          state,
          controlUsage: usage,
          actionUsage,
          ownSwitchCalls,
          captureComplete: diagnostics.captureComplete,
          errors: diagnostics.events.filter(({ kind }) =>
            ["error", "pageerror", "rejection"].includes(kind),
          ),
        };
      } finally {
        await session.close();
      }
    }
    assert.equal(
      pair.baseline.captureComplete,
      true,
      `${scenario.name}: baseline capture incomplete`,
    );
    assert.equal(
      pair.candidate.captureComplete,
      true,
      `${scenario.name}: candidate capture incomplete`,
    );
    assert.deepEqual(
      pair.baseline.errors,
      [],
      `${scenario.name}: baseline errored`,
    );
    assert.deepEqual(
      pair.candidate.errors,
      [],
      `${scenario.name}: candidate errored`,
    );
    const expectedOperand = fixtureOperand(scenario);
    assert.equal(
      expectedOperand >= scenario.requirementCount,
      scenario.expectedDecision,
      `${scenario.name}: fixture does not produce its declared condition decision`,
    );
    assert.equal(
      pair.baseline.exportSha256,
      pair.candidate.exportSha256,
      `${scenario.name}: save diverged`,
    );
    assert.equal(
      pair.candidate.ownSwitchCalls > 0,
      scenario.expectedSwitchRead,
      `${scenario.name}: candidate did not follow expected native switch path`,
    );
    for (const label of ["baseline", "candidate"]) {
      assert.deepEqual(
        pair[label].actionUsage,
        pair[label === "baseline" ? "candidate" : "baseline"].actionUsage,
        `${scenario.name}: native action usage differed between bundles`,
      );
    }
    results.push({
      name: scenario.name,
      fixtureExpectation: scenario.expectedFromSave,
      conditionDecision: {
        operand: expectedOperand,
        threshold: scenario.requirementCount,
        expectedResult: scenario.expectedDecision,
        fixtureFields:
          scenario.buildingId === "city-mine"
            ? { count: save.city.mine.count, on: save.city.mine.on }
            : { count: save.city.farm.count, hasNativeSwitch: false },
      },
      nativeSwitchExpected: scenario.expectedSwitchRead,
      baseline: {
        exportSha256: pair.baseline.exportSha256,
        ownSwitchCalls: pair.baseline.ownSwitchCalls,
        nativeActions: pair.baseline.actionUsage,
        farmCount: pair.baseline.farmCount,
      },
      candidate: {
        exportSha256: pair.candidate.exportSha256,
        ownSwitchCalls: pair.candidate.ownSwitchCalls,
        nativeActions: pair.candidate.actionUsage,
        farmCount: pair.candidate.farmCount,
      },
      stableGameStateEqual:
        JSON.stringify(pair.baseline.state) ===
        JSON.stringify(pair.candidate.state),
    });
    assert.equal(
      results.at(-1).stableGameStateEqual,
      true,
      `${scenario.name}: game state diverged`,
    );
  }
} finally {
  await runner.close();
}
const report = {
  gameSha256: digest(await readFile(game)),
  baselineSha256: digest(await readFile(baseline)),
  candidateSha256: digest(await readFile(candidate)),
  saveSha256: digest(saveText),
  seed: 42,
  periods: periodCount,
  settingsSource: settingsPath,
  syntheticBoundary:
    "No state fields are fabricated. Stored trigger rows are configured against the natural late save. Expected decisions are asserted from the fixture fields and threshold; candidate native method-call counts confirm the current switch reader is invoked for switchable conditions. The trigger's downstream action target is not observable in this fixture because the configured native action is unavailable.",
  results,
};
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, results }, null, 2));
