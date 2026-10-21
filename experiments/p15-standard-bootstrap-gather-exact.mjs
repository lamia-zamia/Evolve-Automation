import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = path.join(root, "test-artifacts/benchmark/tmp");
const savePath = path.join(artifactDirectory, "p14-postfix2-fresh-50000.txt");
const manualSavePath = path.join(
  artifactDirectory,
  "p14-native-progress-standard.txt",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const bundlePath = path.join(artifactDirectory, "p15-test-surface.user.js");
const evidencePath = path.join(
  root,
  "experiments/p15-standard-bootstrap-gather-evidence.json",
);
const seed = 42;
const commonPeriod = 5000;
const continuationPeriods = 5000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [saveText, manualSaveText, settingsText, gameBytes, metadata] =
  await Promise.all([
    readFile(savePath),
    readFile(manualSavePath),
    readFile(settingsPath, "utf8"),
    readFile(gamePath),
    readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
  ]);
const settings = JSON.parse(settingsText);
assert.equal(settings.buildingAlwaysClick, false);
await mkdir(artifactDirectory, { recursive: true });
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await writeFile(bundlePath, built.outputFiles[0].contents);
const bundleBytes = built.outputFiles[0].contents;
const save = parseSave(saveText.toString("utf8"));
const manualSave = parseSave(manualSaveText.toString("utf8"));
const runner = await createChromiumRunner({ game: gamePath });
const sessions = [];

async function configureTarget(session) {
  return session.evaluate(() => {
    const hooks = window.__EA_TEST_HOOKS__;
    if (hooks === null || typeof hooks !== "object") return false;
    hooks.gatherIntervention = {
      standardResearchTargetActionId: "tech-sundial",
      standardResearchTargetClickBudget: 10,
    };
    return true;
  });
}

async function firstSundialActionPeriod(session) {
  return session.evaluate(async () => {
    const runner = window.__EA_RUNNER__;
    for (let steps = 0; steps < 5000; steps += 1) {
      const advanced = await runner.advance(1);
      if (advanced.stopped || advanced.reloading) return null;
      const count =
        runner.diagnostics().controlUsage["tech-sundial.action"]?.returned ?? 0;
      if (count > 0) return runner.periods();
    }
    return null;
  });
}

async function collect(session, periods) {
  const [state, diagnostics, exported] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.exportSave(),
  ]);
  const usage = diagnostics.controlUsage ?? {};
  const gatherCalls = Object.fromEntries(
    Object.entries(usage).filter(([id]) =>
      [
        "undefined-food.action",
        "city-food.action",
        "city-lumber.action",
        "city-stone.action",
        "undefined-stone.action",
        "city-chrysotile.action",
        "city-slaughter.action",
      ].includes(id),
    ),
  );
  const researchCalls = Object.fromEntries(
    Object.entries(usage).filter(([id]) => id.startsWith("tech-")),
  );
  const activeJobs = Object.fromEntries(
    Object.entries(state.civic ?? {})
      .filter(([, job]) => Number(job?.workers) > 0)
      .map(([id, job]) => [id, job.workers]),
  );
  return {
    periods,
    state: {
      universe: state.race?.universe,
      species: state.race?.species,
      day: state.stats?.days,
      population: Object.values(state.race?.zonePop ?? {}).reduce(
        (total, quantity) => total + Number(quantity || 0),
        0,
      ),
      starved: state.stats?.starved,
      died: state.stats?.died,
      starved: state.stats?.starved,
      died: state.stats?.died,
      tech: state.tech,
      stock: Object.fromEntries(
        ["Food", "Lumber", "Stone", "Knowledge"].map((id) => [
          id,
          state.resource?.[id]?.amount,
        ]),
      ),
      activeJobs,
      market: state.city?.market?.active,
      quarry: state.city?.rock_quarry?.count,
    },
    gatherCalls,
    researchCalls,
    controlUsage: usage,
    execution: {
      periods: diagnostics.periods,
      randomCalls: diagnostics.randomCalls,
      workTicks: diagnostics.workTicks,
      counts: diagnostics.counts,
    },
    nativeFailures: Object.fromEntries(
      Object.entries(usage).filter(([, count]) => count.threw > 0),
    ),
    diagnosticEvents: diagnostics.events,
    diagnosticsCounts: diagnostics.counts,
    exportSha256: hash(exported),
  };
}

try {
  const baseline = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed,
  });
  sessions.push(baseline);
  const targetSessions = await Promise.all(
    [0, 1].map(() =>
      runner.openSession({ bundle: bundlePath, save, settings, seed }),
    ),
  );
  sessions.push(...targetSessions);
  const [configuredA, configuredB] = await Promise.all(
    targetSessions.map(configureTarget),
  );
  assert.equal(configuredA && configuredB, true);

  const targetPeriods = await Promise.all(
    targetSessions.map(firstSundialActionPeriod),
  );
  assert.ok(targetPeriods[0] !== null, "targeted Gather did not buy Sundial");
  assert.deepEqual(targetPeriods, [targetPeriods[0], targetPeriods[0]]);

  await Promise.all([
    baseline.advance(commonPeriod),
    ...targetSessions.map((session, index) =>
      session.advance(commonPeriod - targetPeriods[index]),
    ),
  ]);
  const [baselineCommon, targetCommonA, targetCommonB] = await Promise.all([
    collect(baseline, commonPeriod),
    collect(targetSessions[0], commonPeriod),
    collect(targetSessions[1], commonPeriod),
  ]);
  assert.equal(
    targetCommonA.exportSha256,
    targetCommonB.exportSha256,
    "matched targeted runs must have identical exports",
  );
  assert.deepEqual(targetCommonA.controlUsage, targetCommonB.controlUsage);

  await Promise.all(
    [baseline, ...targetSessions].map((session) =>
      session.advance(continuationPeriods),
    ),
  );
  const [baselineContinuation, targetContinuationA, targetContinuationB] =
    await Promise.all([
      collect(baseline, commonPeriod + continuationPeriods),
      collect(targetSessions[0], commonPeriod + continuationPeriods),
      collect(targetSessions[1], commonPeriod + continuationPeriods),
    ]);
  assert.equal(
    targetContinuationA.exportSha256,
    targetContinuationB.exportSha256,
    "targeted continuation exports must remain identical",
  );

  const sourceFiles = [
    "src/domain/economy/resources/gather-resources.ts",
    "src/adapters/evolve/economy/resources/captured-gather-resources.ts",
    "src/bootstrap/captured-runtime-control.ts",
    "tools/chromium-evolve-runner.mjs",
    "tools/chromium/chrome.mjs",
    "tools/chromium/page-server.mjs",
    "tools/chromium/bridge.js",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (relative) => [
        relative,
        hash(await readFile(path.join(root, relative))),
      ]),
    ),
  );
  const evidence = {
    experiment: "P15 targeted existing-Gather intervention",
    runner: "chromium-exact",
    seed,
    fixture: {
      path: path.relative(root, savePath).replaceAll("\\", "/"),
      sha256: hash(saveText),
      universe: "standard",
      species: "shroomi",
      primitive: 2,
      stock: { Food: 40, Lumber: 72, Stone: 0 },
    },
    settings: {
      path: path.relative(root, settingsPath).replaceAll("\\", "/"),
      sha256: hash(settingsText),
      buildingAlwaysClick: settings.buildingAlwaysClick,
    },
    game: {
      path: path.relative(root, gamePath).replaceAll("\\", "/"),
      sha256: hash(gameBytes),
      pinned: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    },
    sourceHashes,
    bundles: {
      normal: {
        path: "evolve_automation.user.js",
        sha256: hash(
          await readFile(path.join(root, "evolve_automation.user.js")),
        ),
      },
      testSurface: {
        path: path.relative(root, bundlePath).replaceAll("\\", "/"),
        sha256: hash(bundleBytes),
      },
    },
    runnerInputs: runner.inputs,
    P14References: {
      sundialOffer: {
        path: "test-artifacts/benchmark/tmp/p14-standard-offers.json",
        sha256:
          "387837d8ce8fa12100dbf52c3549c7fec8ee28f34b51195df7155161489f10ad",
        actionId: "tech-sundial",
        exactNativePrice: { Lumber: 8, Stone: 10 },
      },
      manualStoneClicks: {
        path: "test-artifacts/benchmark/tmp/p14-native-progress-standard.json",
        sha256:
          "65d72946796e8976569f646e0968506974267cdb00b88779cb9f0735aaa5f02e",
        clicks: 10,
        exportPath:
          "test-artifacts/benchmark/tmp/p14-native-progress-standard.txt",
        exportSha256: hash(manualSaveText),
        endAt5000: {
          day: manualSave.stats?.days,
          population: Object.values(manualSave.race?.zonePop ?? {}).reduce(
            (total, quantity) => total + Number(quantity || 0),
            0,
          ),
          starved: manualSave.stats?.starved,
          died: manualSave.stats?.died,
          food: manualSave.resource?.Food?.amount,
          lumber: manualSave.resource?.Lumber?.amount,
          stone: manualSave.resource?.Stone?.amount,
          tech: manualSave.tech,
        },
      },
    },
    periods: {
      baselineHorizon: commonPeriod + continuationPeriods,
      comparisonHorizon: commonPeriod,
      continuationPeriods,
      targetedSundialPurchasePeriod: targetPeriods[0],
    },
    deterministicParity: {
      targetedExportSha256At5000: targetCommonA.exportSha256,
      matchingExportSha256At10000: targetContinuationA.exportSha256,
      matchingControlUsage: true,
      matchedContexts: 2,
    },
    arms: {
      A: {
        comparison: baselineCommon,
        continuation: baselineContinuation,
      },
      targeted: {
        comparison: targetCommonA,
        continuation: targetContinuationA,
        duplicate: {
          comparisonExportSha256: targetCommonB.exportSha256,
          continuationExportSha256: targetContinuationB.exportSha256,
          controlUsage: targetContinuationB.controlUsage,
        },
      },
    },
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
        periods: evidence.periods,
        A: {
          final: baselineContinuation.state,
          gather: baselineContinuation.gatherCalls,
          research: baselineContinuation.researchCalls,
          nativeFailures: baselineContinuation.nativeFailures,
        },
        targeted: {
          final: targetContinuationA.state,
          gather: targetContinuationA.gatherCalls,
          research: targetContinuationA.researchCalls,
          nativeFailures: targetContinuationA.nativeFailures,
        },
        deterministicParity: evidence.deterministicParity,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
