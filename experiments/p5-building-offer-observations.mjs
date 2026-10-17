import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "../src/adapters/evolve/progression/build/captured-building-bindings.generated.ts";
import { CAPTURED_BUILD_REGIONS } from "../src/adapters/evolve/progression/build/captured-building-metadata.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.resolve(root, "../Evolve-Automation/test-artifacts");
const toolsRoot = path.resolve(root, "../Evolve-Automation/tools");
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(path.join(toolsRoot, "chromium-evolve-runner.mjs"))
);
const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    return match ? [match[1], match[2]] : [];
  }),
);
const getPath = (key, fallback) => path.resolve(options[key] ?? fallback);
const game = getPath(
  "game",
  path.join(fixtureRoot, "game/evolve-deadspace.js"),
);
const settingsPath = getPath(
  "settings",
  path.join(
    fixtureRoot,
    "benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
  ),
);
const scenarios = [
  [
    "late",
    getPath(
      "late-save",
      path.join(
        fixtureRoot,
        "benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
      ),
    ),
  ],
  [
    "mid",
    getPath(
      "mid-save",
      path.join(
        fixtureRoot,
        "benchmark/slice0/saves/stage2f-through-7600-export.json",
      ),
    ),
  ],
];
const warmupPeriods = 600;
const measuredPeriods = 1000;
const seed = 42;
const outputPath = getPath(
  "out",
  path.join(root, "test-artifacts/perf-profile/p5-building-observations.json"),
);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();

const instrumented = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\nwindow.__EA_TEST_HOOKS__ ??= {};\nwindow.__EA_TEST_HOOKS__.buildingUnlockObservations = [];\nwindow.__EA_TEST_HOOKS__.buildingUnlockReadObserver = (regions, phase) => window.__EA_TEST_HOOKS__.buildingUnlockObservations.push({ regions, phase: phase === "unclassified" ? window.__EA_TEST_HOOKS__.buildingUnlockCurrentPhase ?? "outside-runPhase" : phase });`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
  plugins: [
    {
      name: "p5-building-observation-probe",
      setup(build) {
        build.onLoad(
          { filter: /captured-progression-control\.ts$/ },
          async (args) => {
            let contents = await readFile(args.path, "utf8");
            const signature =
              "const readBuildingUnlocks = (regions: ReadonlySet<string>) => {";
            assert.equal(contents.split(signature).length - 1, 1);
            contents = contents.replace(
              signature,
              'const readBuildingUnlocks = (regions: ReadonlySet<string>, phase = "unclassified") => {',
            );
            const call = "const catalog = buildingUnlocks.read(regions);";
            assert.equal(contents.split(call).length - 1, 1);
            contents = contents.replace(
              call,
              `const observer = globalThis.__EA_TEST_HOOKS__?.buildingUnlockReadObserver;\n    if (typeof observer === "function") observer([...regions], phase);\n    ${call}`,
            );
            const storageCall =
              "readBuildingUnlocks(new Set(targets.map((target) => target.region)));";
            assert.equal(contents.split(storageCall).length - 1, 1);
            contents = contents.replace(
              storageCall,
              "readBuildingUnlocks(new Set(targets.map((target) => target.region)), phase);",
            );
            const mechCall =
              ": readBuildingUnlocks(new Set([CAPTURED_MECH_BUILDINGS.region]));";
            assert.equal(contents.split(mechCall).length - 1, 1);
            contents = contents.replace(
              mechCall,
              ': readBuildingUnlocks(new Set([CAPTURED_MECH_BUILDINGS.region]), "mech-expansion");',
            );
            const storageTargets =
              "const readUnlockedStorageBuildTargets = () => {";
            assert.equal(contents.split(storageTargets).length - 1, 1);
            contents = contents.replace(
              storageTargets,
              'const readUnlockedStorageBuildTargets = (phase = "storage-targets") => {',
            );
            return { contents, loader: "ts" };
          },
        );
        build.onLoad(
          { filter: /captured-runtime-control\.ts$/ },
          async (args) => {
            let contents = await readFile(args.path, "utf8");
            const phaseMeasure =
              "return activeRuntimeMeasure.measure(name, body);";
            assert.equal(contents.split(phaseMeasure).length - 1, 2);
            const phaseMeasureIndex = contents.lastIndexOf(phaseMeasure);
            contents =
              contents.slice(0, phaseMeasureIndex) +
              `const hooks = globalThis.__EA_TEST_HOOKS__;\n      const previousPhase = hooks?.buildingUnlockCurrentPhase;\n      if (hooks !== undefined) hooks.buildingUnlockCurrentPhase = name;\n      try { return activeRuntimeMeasure.measure(name, body); }\n      finally { if (hooks !== undefined) hooks.buildingUnlockCurrentPhase = previousPhase; }` +
              contents.slice(phaseMeasureIndex + phaseMeasure.length);
            const assignment =
              "readBuildingUnlocks: progression.readBuildingUnlocks,";
            assert.equal(contents.split(assignment).length - 1, 2);
            contents = contents.replace(
              assignment,
              'readBuildingUnlocks: (regions) => progression.readBuildingUnlocks(regions, "condition-context"),',
            );
            contents = contents.replace(
              assignment,
              'readBuildingUnlocks: (regions) => progression.readBuildingUnlocks(regions, "trigger-condition"),',
            );
            const prestigeReset =
              "progression.readBuildingUnlocks(new Set(regions))?.unlocked";
            assert.equal(contents.split(prestigeReset).length - 1, 1);
            contents = contents.replace(
              prestigeReset,
              'progression.readBuildingUnlocks(new Set(regions), "prestige-reset-actions")?.unlocked',
            );
            const storageRead =
              "progression.readUnlockedStorageBuildTargets();";
            assert.equal(contents.split(storageRead).length - 1, 3);
            contents = contents.replace(
              storageRead,
              'progression.readUnlockedStorageBuildTargets("construction-demand-preparation");',
            );
            contents = contents.replace(
              storageRead,
              'progression.readUnlockedStorageBuildTargets("post-research-construction-demand");',
            );
            contents = contents.replace(
              storageRead,
              'progression.readUnlockedStorageBuildTargets("pre-power-build-demand");',
            );
            return { contents, loader: "ts" };
          },
        );
      },
    },
  ],
});
const bundlePath = path.join(
  root,
  "test-artifacts/perf-profile/p5-building-observation-probe.user.js",
);
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, instrumented.outputFiles[0].contents);

const bindingsByRegion = new Map();
for (const binding of CAPTURED_AUTOMATION_BUILDING_BINDINGS) {
  const region = binding.slice(0, binding.indexOf("-"));
  const bindings = bindingsByRegion.get(region) ?? [];
  bindings.push(binding);
  bindingsByRegion.set(region, bindings);
}
const allBindingCount = CAPTURED_AUTOMATION_BUILDING_BINDINGS.size;
const runner = await createChromiumRunner({ game });
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const report = {
  gameSnapshot: runner.inputs.gameSnapshot,
  bundle:
    "candidate source with test-only observer injected during esbuild; no production source edits",
  seed,
  autoPrestige: false,
  warmupPeriods,
  measuredPeriods,
  originalFullMapBindingsPerObservation: allBindingCount,
  fixtures: [],
};

try {
  for (const [name, savePath] of scenarios) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(await readFile(savePath, "utf8")),
      settings,
      seed,
    });
    try {
      await session.advance(warmupPeriods);
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__.buildingUnlockObservations.length = 0;
      });
      await session.advance(measuredPeriods);
      const [observations, diagnostics, stateHashData, exportText] =
        await Promise.all([
          session.evaluate(
            () => window.__EA_TEST_HOOKS__.buildingUnlockObservations,
          ),
          session.diagnostics(),
          session.readState(),
          session.exportSave(),
        ]);
      const grouped = new Map();
      let avoidedLookups = 0;
      for (const observation of observations) {
        const regions = [...new Set(observation.regions)].sort();
        const key = `${observation.phase}|${regions.join(",")}`;
        const selectedBindings = regions.reduce(
          (count, region) =>
            count + (bindingsByRegion.get(region)?.length ?? 0),
          0,
        );
        avoidedLookups += allBindingCount - selectedBindings;
        const group = grouped.get(key) ?? {
          phase: observation.phase,
          requestedRegions: regions,
          frequency: 0,
          selectedBindings,
          avoidedStateResolutionLookupsPerObservation:
            allBindingCount - selectedBindings,
        };
        group.frequency += 1;
        grouped.set(key, group);
      }
      const errors = diagnostics.events.filter(({ kind }) =>
        ["error", "pageerror", "rejection"].includes(kind),
      ).length;
      assert.equal(diagnostics.captureComplete, true, `${name} capture`);
      assert.equal(errors, 0, `${name} page errors`);
      report.fixtures.push({
        name,
        savePath,
        observationCount: observations.length,
        groups: [...grouped.values()],
        actualObservationsAvoidedLookups: avoidedLookups,
        allMapTraversalLookups: observations.length * allBindingCount,
        selectedStateResolutionLookups: observations.reduce(
          (sum, observation) => {
            const regions = new Set(observation.regions);
            return (
              sum +
              [...regions].reduce(
                (count, region) =>
                  count + (bindingsByRegion.get(region)?.length ?? 0),
                0,
              )
            );
          },
          0,
        ),
        exportSha256: await import("node:crypto").then(({ createHash }) =>
          createHash("sha256").update(exportText).digest("hex"),
        ),
        rootStateCaptured: stateHashData !== undefined,
        workTicks: diagnostics.workTicks,
        pageErrors: errors,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

const supportedBindingGroups = [...CAPTURED_BUILD_REGIONS].map((region) => [
  region,
  bindingsByRegion.get(region) ?? [],
]);
const broadSelectedBindings = new Set(
  supportedBindingGroups.flatMap(([, bindings]) => bindings),
);
const omittedBindings = [...CAPTURED_AUTOMATION_BUILDING_BINDINGS].filter(
  (binding) => !broadSelectedBindings.has(binding),
);
const omittedAddresses = omittedBindings.map((binding) => {
  const separator = binding.indexOf("-");
  return {
    region: binding.slice(0, separator),
    struct: binding.slice(separator + 1),
  };
});
const stateRoot = {};
for (const binding of CAPTURED_AUTOMATION_BUILDING_BINDINGS) {
  const separator = binding.indexOf("-");
  const region = binding.slice(0, separator);
  const struct = binding.slice(separator + 1);
  (stateRoot[region] ??= {})[struct] = { count: 1, on: 1 };
}
const benchmarkRounds = 7;
const benchmarkIterations = 10000;
const timed = (operation) => {
  const samples = [];
  let sink = 0;
  for (let round = 0; round < benchmarkRounds; round += 1) {
    const start = performance.now();
    for (let index = 0; index < benchmarkIterations; index += 1)
      sink += operation();
    samples.push((performance.now() - start) / benchmarkIterations);
  }
  samples.sort((left, right) => left - right);
  return {
    medianMsPerObservation: samples[Math.floor(samples.length / 2)],
    sink,
  };
};
const broadSelectionCost = timed(() => {
  const selected = new Set();
  for (const [region, bindings] of supportedBindingGroups) {
    if (!CAPTURED_BUILD_REGIONS.has(region)) continue;
    for (const binding of bindings) selected.add(binding);
  }
  return selected.size;
});
const fiveOmittedLookupCost = timed(() => {
  let records = 0;
  for (const { region, struct } of omittedAddresses) {
    if (stateRoot[region]?.[struct] !== undefined) records += 1;
  }
  return records;
});
report.broadRequestSelectionMeasurement = {
  purpose:
    "bounded Node microbenchmark of candidate Set selection versus the five omitted root-address lookups; not production CPU timing",
  rounds: benchmarkRounds,
  iterationsPerRound: benchmarkIterations,
  selectedBindings: broadSelectedBindings.size,
  avoidedLookups: omittedBindings.length,
  medianSelectionMs: broadSelectionCost.medianMsPerObservation,
  medianFiveLookupMs: fiveOmittedLookupCost.medianMsPerObservation,
  selectionToAvoidedLookupRatio:
    broadSelectionCost.medianMsPerObservation /
    fiveOmittedLookupCost.medianMsPerObservation,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
