import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const outputPath = process.argv
  .find((value) => value.startsWith("--out="))
  ?.slice(6);
const temporaryDirectory = path.join(root, "test-artifacts/benchmark/tmp");
const baselineBundlePath = path.join(
  temporaryDirectory,
  "p12a-baseline.user.js",
);
const candidateBundlePath = path.join(
  temporaryDirectory,
  "p12a-candidate.user.js",
);
const candidateTestBundlePath = path.join(
  temporaryDirectory,
  "p12a-candidate-test.user.js",
);
const effectiveSettingsPath = path.join(
  temporaryDirectory,
  "p12a-settings.json",
);
const periods = 200;
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const baselineCommit = "a69d615f09cd012caddd0235d70ce036ea1dda53";

const baselineBundle = execFileSync(
  "git",
  ["show", `${baselineCommit}:evolve_automation.user.js`],
  { cwd: root, maxBuffer: 8 * 1024 * 1024 },
);
const candidateBundle = await readFile(
  path.join(root, "evolve_automation.user.js"),
);
assert.equal(
  hash(baselineBundle),
  "517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7",
  "the pre-P12A production bundle must remain the pinned immutable baseline",
);
assert.notEqual(
  hash(candidateBundle),
  hash(baselineBundle),
  "candidate and baseline bundle identities must be distinct",
);
await writeFile(baselineBundlePath, baselineBundle);
await writeFile(candidateBundlePath, candidateBundle);
const saveText = await readFile(savePath, "utf8");
const sourceSettingsText = await readFile(settingsPath, "utf8");
const sourceSettings = JSON.parse(sourceSettingsText);
const settings = { ...sourceSettings, autoResearch: true };
await writeFile(effectiveSettingsPath, JSON.stringify(settings));
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const testBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\nif (globalThis.__EA_TEST_HOOKS__) globalThis.__EA_TEST_HOOKS__ = { ...globalThis.__EA_TEST_HOOKS__ };\n// Generated for P12A exact-runner observation.`,
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
await writeFile(candidateTestBundlePath, testBundle.outputFiles[0].contents);

const runner = await createChromiumRunner({ game: gamePath });

async function run(label, bundle) {
  const session = await runner.openSession({
    bundle,
    save: parseSave(saveText),
    settings,
    seed,
    epoch,
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
  });
  const forcedCatalog =
    label === "candidate-test"
      ? await session.evaluate(() => {
          const hooks = window.__EA_TEST_HOOKS__;
          return hooks.readCurrentResearchCatalog("tech-mad", true);
        })
      : undefined;
  try {
    await session.advance(periods);
    const state = await session.readState();
    const diagnostics = await session.diagnostics();
    const frontierEvaluation = (diagnostics.perfSummaries ?? []).flatMap(
      ([, phases]) => {
        const phaseNames = [
          "research.offer-acquisition",
          "research.computed-requirements.capture-and-draw",
          "research.computed-requirements.read",
          "research.catalog.registry-read",
          "research.binding.restate",
          "goal.mad.prerequisite-preparation",
          "goal.mad.research-prerequisites",
          "goal.mad.research-graph-cache-reuse",
          "goal.mad.obligation-classification",
          "goal.mad.frontier-resource-acquisition",
          "goal.mad.candidate-feasibility-ranking",
          "research.computed-requirements.capture-and-draw",
        ];
        return phaseNames.flatMap((name) => {
          const phase = phases[name];
          return phase?.count ? [{ name, ...phase }] : [];
        });
      },
    );
    const operationCounts = Object.create(null);
    for (const [, , counters] of diagnostics.perfSummaries ?? []) {
      for (const [name, counter] of Object.entries(counters ?? {})) {
        const previous = operationCounts[name] ?? {
          total: 0,
          max: 0,
          windows: 0,
        };
        operationCounts[name] = {
          total: previous.total + counter.total,
          max: Math.max(previous.max, counter.max),
          windows: previous.windows + 1,
        };
      }
    }
    const frontierOperationCounts = Object.fromEntries(
      Object.entries(operationCounts).filter(([name]) =>
        name.startsWith("goal.mad."),
      ),
    );
    const nativeResearchDrawCounts = Object.fromEntries(
      Object.entries(operationCounts).filter(
        ([name]) =>
          name.startsWith("research.observation.") ||
          name === "discovery.actual-draw research-catalog",
      ),
    );
    return {
      label,
      state,
      stateHash: hash(JSON.stringify(state)),
      controlUsage: diagnostics.controlUsage,
      nativeInvocations: diagnostics.nativeInvocations,
      counts: diagnostics.counts,
      workTicks: diagnostics.workTicks,
      forcedCatalog: forcedCatalog
        ? {
            current: forcedCatalog.current,
            source: forcedCatalog.source,
            computedRequirementCount:
              forcedCatalog.definitions?.reduce(
                (count, definition) =>
                  count + (definition.computedRequirements?.length ?? 0),
                0,
              ) ?? 0,
          }
        : undefined,
      frontierEvaluation: frontierEvaluation.map((phase) => ({
        name: phase.name,
        count: phase.count,
        totalMs: phase.totalMs,
        perTickMs: phase.perTickMs,
        maxMs: phase.maxMs,
      })),
      operationCounts,
      frontierOperationCounts,
      nativeResearchDrawCounts,
      researchEvaluation:
        label === "candidate-test"
          ? await session.evaluate(() => {
              const evaluation =
                window.__EA_TEST_HOOKS__?.researchGoalCandidateEvaluation;
              const firstEvaluation =
                window.__EA_TEST_HOOKS__?.researchGoalCandidateEvaluationFirst;
              return evaluation
                ? {
                    first: firstEvaluation
                      ? {
                          frontierSelection: firstEvaluation.frontierSelection,
                          candidates: firstEvaluation.candidates.map(
                            (candidate) => ({
                              actionId: candidate.actionId,
                              dependencyRelation: candidate.dependencyRelation,
                              pathApplicability: candidate.pathApplicability,
                              frontierTime: candidate.frontierTime,
                            }),
                          ),
                        }
                      : undefined,
                    latest: {
                      frontierSelection: evaluation.frontierSelection,
                      candidates: evaluation.candidates.map((candidate) => ({
                        actionId: candidate.actionId,
                        dependencyRelation: candidate.dependencyRelation,
                        pathApplicability: candidate.pathApplicability,
                        frontierTime: candidate.frontierTime,
                      })),
                    },
                  }
                : undefined;
            })
          : undefined,
    };
  } finally {
    await session.close();
  }
}

try {
  const upstreamCommit = execFileSync(
    "git",
    [
      "-C",
      runner.inputs.upstream,
      "rev-parse",
      `${runner.inputs.gameSnapshot.commit}^{commit}`,
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(
    upstreamCommit,
    "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    "the characterization requires the pinned DeadSpace snapshot",
  );
  const baseline = await run("baseline", baselineBundlePath);
  const baselineRepeat = await run("baseline-repeat", baselineBundlePath);
  const candidate = await run("candidate", candidateBundlePath);
  const candidateTest = await run("candidate-test", candidateTestBundlePath);
  assert.deepEqual(
    baseline.state,
    baselineRepeat.state,
    "the exact-runner same-bundle control must match",
  );
  assert.deepEqual(
    baselineRepeat.controlUsage,
    baseline.controlUsage,
    "baseline A/A native control usage must match exactly",
  );
  assert.deepEqual(
    baselineRepeat.nativeInvocations,
    baseline.nativeInvocations,
    "baseline A/A native invocation sequence must match exactly",
  );
  const nativeResearchCounts = (result) =>
    Object.fromEntries(
      Object.entries(result.operationCounts).filter(
        ([name]) =>
          name.startsWith("research.observation.") ||
          name === "discovery.actual-draw research-catalog",
      ),
    );
  assert.deepEqual(
    nativeResearchCounts(candidate),
    nativeResearchCounts(baseline),
    "production candidate must not add a native Research catalog draw",
  );
  assert.deepEqual(
    candidate.state,
    baseline.state,
    "shadow frontier selection must preserve ordinary production game state",
  );
  assert.deepEqual(
    candidate.controlUsage,
    baseline.controlUsage,
    "shadow frontier selection must not change native control calls",
  );
  assert.deepEqual(
    candidate.nativeInvocations,
    baseline.nativeInvocations,
    "shadow frontier selection must not invoke a new native command",
  );
  assert.ok(
    candidate.frontierEvaluation.length > 0,
    "the candidate must execute the real goal/frontier evaluator under the exact runner",
  );
  assert.deepEqual(
    candidateTest.state,
    baseline.state,
    "test-only frontier observation must preserve ordinary production game state",
  );
  assert.ok(
    candidateTest.researchEvaluation?.latest.frontierSelection,
    "the exact-runner replay must expose the real runtime frontier selection",
  );
  assert.equal(
    candidateTest.forcedCatalog?.current,
    true,
    "the current native Research observation must remain valid in the test candidate",
  );
  const report = {
    runner: "tools/chromium-evolve-runner.mjs",
    upstreamCommit,
    snapshotCommit: runner.inputs.gameSnapshot.commit,
    gameSnapshot: {
      path: "test-artifacts/game/evolve-deadspace.js",
      sha256: await readFile(gamePath).then(hash),
    },
    inputs: {
      saveSha256: hash(saveText),
      settingsSourceSha256: hash(sourceSettingsText),
      effectiveSettingsSha256: hash(JSON.stringify(settings)),
      periods,
      seed,
      epoch,
    },
    bundles: {
      baselineCommit,
      baselineIdentity: "pre-P12A committed production userscript",
      candidateIdentity: "working-tree P12A.1 production userscript",
      baselineSha256: hash(baselineBundle),
      candidateSha256: hash(candidateBundle),
      candidateTestSha256: hash(testBundle.outputFiles[0].contents),
    },
    results: {
      baselineExportSha256: baseline.stateHash,
      baselineRepeatExportSha256: baselineRepeat.stateHash,
      candidateExportSha256: candidate.stateHash,
      candidateTestExportSha256: candidateTest.stateHash,
      baselineAndCandidateEqual: candidate.stateHash === baseline.stateHash,
      controlUsageEqual:
        JSON.stringify(candidate.controlUsage) ===
        JSON.stringify(baseline.controlUsage),
      nativeInvocationsEqual:
        JSON.stringify(candidate.nativeInvocations) ===
        JSON.stringify(baseline.nativeInvocations),
      baselineWorkTicks: baseline.workTicks,
      candidateWorkTicks: candidate.workTicks,
      candidateTestWorkTicks: candidateTest.workTicks,
      candidateTestCatalog: candidateTest.forcedCatalog,
      candidateFrontierSelection:
        candidateTest.researchEvaluation?.first?.frontierSelection,
      candidateLatestFrontierSelection:
        candidateTest.researchEvaluation?.latest.frontierSelection,
      candidateFrontierCandidates:
        candidateTest.researchEvaluation?.first?.candidates,
      frontierPhasesMsByWindow: candidate.frontierEvaluation,
      candidateCounts: candidate.counts,
      baselineCounts: baseline.counts,
      testOnlyObservationCounts: candidateTest.counts,
      baselineOperationCounts: baseline.operationCounts,
      candidateOperationCounts: candidate.operationCounts,
      testOnlyObservationOperationCounts: candidateTest.operationCounts,
      candidateFrontierOperationCounts: candidate.frontierOperationCounts,
      baselineNativeResearchDrawCounts: baseline.nativeResearchDrawCounts,
      candidateNativeResearchDrawCounts: candidate.nativeResearchDrawCounts,
      testOnlyNativeResearchDrawCounts: candidateTest.nativeResearchDrawCounts,
      productionNativeResearchDrawCounts: nativeResearchCounts(candidate),
      baselineConsoleErrors: baseline.counts?.error,
      candidateConsoleErrors: candidate.counts?.error,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath === undefined) process.stdout.write(serialized);
  else await writeFile(path.resolve(outputPath), serialized);
} finally {
  await runner.close();
}
