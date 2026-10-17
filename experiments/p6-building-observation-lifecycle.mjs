import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

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
  path.join(root, "test-artifacts/perf-profile/p6-building-observations.json"),
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
    js: `${metadata}\n\nwindow.__EA_TEST_HOOKS__ ??= {};\nwindow.__EA_TEST_HOOKS__.buildingUnlockObservations = [];\nwindow.__EA_TEST_HOOKS__.buildingUnlockEvents = [];\nwindow.__EA_TEST_HOOKS__.buildingUnlockSequence = 0;\nwindow.__EA_TEST_HOOKS__.buildingUnlockCurrentEvaluations = 0;\nwindow.__EA_TEST_HOOKS__.buildingUnlockWorktick = 0;\nwindow.__EA_TEST_HOOKS__.buildingUnlockCurrentCallsite = "unclassified";\nwindow.__EA_TEST_HOOKS__.buildingUnlockEvaluationObserver = () => { window.__EA_TEST_HOOKS__.buildingUnlockCurrentEvaluations++; };\nwindow.__EA_TEST_HOOKS__.buildingUnlockReadObserver = (regions, phase, details) => { const hooks = window.__EA_TEST_HOOKS__; const current = new Set(details?.catalog?.unlocked ?? []); const previousMembership = new Set(hooks.buildingUnlockPreviousMembership ?? []); const added = [...current].filter((value) => !previousMembership.has(value)); const removed = [...previousMembership].filter((value) => !current.has(value)); hooks.buildingUnlockPreviousMembership = [...current]; const resolvedPhase = phase === "unclassified" ? hooks.buildingUnlockCurrentPhase ?? "outside-runPhase" : phase; const previous = hooks.buildingUnlockPreviousObservation; const observation = { sequence: ++hooks.buildingUnlockSequence, worktick: hooks.buildingUnlockWorktick, regions: [...regions].sort(), phase: resolvedPhase, callsite: hooks.buildingUnlockCurrentCallsite === "unclassified" ? resolvedPhase : hooks.buildingUnlockCurrentCallsite, rootGeneration: details?.rootGeneration, progressionEpoch: details?.progressionEpoch, kind: "current", catalogComplete: details?.catalog !== undefined && regions.every((region) => details.catalog.regions.includes(region)), sampledRegions: details?.catalog?.regions ?? [], nativeAvailabilityEvaluations: hooks.buildingUnlockCurrentEvaluations, catalogMembershipAdded: added, catalogMembershipRemoved: removed, establishedCatalogChanged: JSON.stringify(details?.establishedBefore ?? []) !== JSON.stringify(details?.establishedAfter ?? []), establishedKeysBefore: details?.establishedBefore ?? [], establishedKeysAfter: details?.establishedAfter ?? [], settingsFingerprint: JSON.stringify(details?.settings ?? null), settingsChangedSincePreviousObservation: previous !== undefined && previous.settingsFingerprint !== JSON.stringify(details?.settings ?? null), controlRevision: details?.controlRevision, controlRevisionChangedSincePreviousObservation: previous !== undefined && previous.controlRevision !== details?.controlRevision, rootGenerationChangedSincePreviousObservation: previous !== undefined && previous.rootGeneration !== details?.rootGeneration, progressionEpochChangedSincePreviousObservation: previous !== undefined && previous.progressionEpoch !== details?.progressionEpoch, interveningEvents: hooks.buildingUnlockEvents.splice(0) }; hooks.buildingUnlockPreviousObservation = observation; hooks.buildingUnlockObservations.push(observation); };`,
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
      name: "p6-building-observation-lifecycle-probe",
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
              `const hooks = globalThis.__EA_TEST_HOOKS__;\n    if (hooks !== undefined) hooks.buildingUnlockCurrentEvaluations = 0;\n    const establishedSnapshot = () => [...establishedBuildingOffers].map(([key, sample]) => ({ key, epoch: sample.epoch, regions: [...sample.regions].sort(), unlocked: [...sample.catalog.unlocked].sort() }));\n    const establishedBefore = establishedSnapshot();\n    ${call}\n    const establishedAfter = establishedSnapshot();\n    const observer = hooks?.buildingUnlockReadObserver;\n    if (typeof observer === "function") observer([...regions], phase, { rootGeneration: epoch.readRootGeneration(), progressionEpoch: epoch.read(), catalog: catalog === undefined ? undefined : { regions: [...catalog.regions], unlocked: [...catalog.unlocked] }, establishedBefore, establishedAfter, settings: readSettings(), controlRevision: controls.readRevision?.() });`,
            );
            const established =
              "const candidates = [...establishedBuildingOffers.values()].reverse();";
            assert.equal(contents.split(established).length - 1, 1);
            contents = contents.replace(
              established,
              `const hooks = globalThis.__EA_TEST_HOOKS__;\n    if (typeof hooks?.buildingUnlockEvents !== "undefined") hooks.buildingUnlockEvents.push({ kind: "established-read", phase: hooks.buildingUnlockCurrentPhase ?? "outside-runPhase", callsite: hooks.buildingUnlockCurrentCallsite, regions: [...regions].sort(), epoch: epoch.read(), availableKeys: [...establishedBuildingOffers.keys()] });\n    ${established}`,
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
            const ensureBuildControls = "const ensureBuildControls = () => {";
            assert.equal(contents.split(ensureBuildControls).length - 1, 1);
            contents = contents.replace(
              ensureBuildControls,
              'const ensureBuildControls = () => {\n    globalThis.__EA_TEST_HOOKS__?.buildingUnlockEvents.push({ kind: "ensure-build-controls", phase: globalThis.__EA_TEST_HOOKS__?.buildingUnlockCurrentPhase ?? "outside-runPhase" });',
            );
            const sweep = "const succeeded = sweepBuildControls(index);";
            assert.equal(contents.split(sweep).length - 1, 1);
            contents = contents.replace(
              sweep,
              'globalThis.__EA_TEST_HOOKS__?.buildingUnlockEvents.push({ kind: "building-control-sweep", phase: globalThis.__EA_TEST_HOOKS__?.buildingUnlockCurrentPhase ?? "outside-runPhase", index });\n      const succeeded = sweepBuildControls(index);',
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
              `const hooks = globalThis.__EA_TEST_HOOKS__;\n      const previousPhase = hooks?.buildingUnlockCurrentPhase;\n      if (hooks !== undefined) { hooks.buildingUnlockCurrentPhase = name; hooks.buildingUnlockEvents.push({ kind: "phase-start", phase: name, worktick: hooks.buildingUnlockWorktick }); }\n      try { return activeRuntimeMeasure.measure(name, body); }\n      finally { if (hooks !== undefined) { hooks.buildingUnlockEvents.push({ kind: "phase-end", phase: name, worktick: hooks.buildingUnlockWorktick }); hooks.buildingUnlockCurrentPhase = previousPhase; } }` +
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
            const worktick = "progression.beginProcessedCycle();";
            assert.equal(contents.split(worktick).length - 1, 1);
            contents = contents.replace(
              worktick,
              "globalThis.__EA_TEST_HOOKS__.buildingUnlockWorktick++; progression.beginProcessedCycle();",
            );
            return { contents, loader: "ts" };
          },
        );
        build.onLoad(
          { filter: /captured-building-unlocks\.ts$/ },
          async (args) => {
            let contents = await readFile(args.path, "utf8");
            const availability =
              "availability = structure.readAvailability(root);";
            assert.equal(contents.split(availability).length - 1, 1);
            contents = contents.replace(
              availability,
              'const evaluate = globalThis.__EA_TEST_HOOKS__?.buildingUnlockEvaluationObserver;\n            if (typeof evaluate === "function") evaluate(binding);\n            availability = structure.readAvailability(root);',
            );
            return { contents, loader: "ts" };
          },
        );
        build.onLoad(
          { filter: /captured-construction-control\.ts$/ },
          async (args) => {
            let contents =
              options.source === "baseline"
                ? execFileSync(
                    "git",
                    [
                      "show",
                      "HEAD:src/bootstrap/captured-construction-control.ts",
                    ],
                    { cwd: root, encoding: "utf8" },
                  )
                : await readFile(args.path, "utf8");
            const anchor =
              "  const resources = createCapturedResourceSource(rootState);";
            assert.equal(contents.split(anchor).length - 1, 1);
            contents = contents.replace(
              anchor,
              `  const p6ReadPolicy = (callsite: string) => {\n    const hooks = globalThis.__EA_TEST_HOOKS__;\n    const previous = hooks?.buildingUnlockCurrentCallsite;\n    if (hooks !== undefined) hooks.buildingUnlockCurrentCallsite = callsite;\n    try { return readPolicy(); }\n    finally { if (hooks !== undefined) hooks.buildingUnlockCurrentCallsite = previous; }\n  };\n${anchor}`,
            );
            const target = "readTargets: () => readPolicy().buildings,";
            assert.equal(contents.split(target).length - 1, 1);
            contents = contents.replace(
              target,
              'readTargets: () => p6ReadPolicy("construction-build-source").buildings,',
            );
            const optionsAnchor = "readOptions: readPolicy,";
            assert.equal(contents.split(optionsAnchor).length - 1, 1);
            contents = contents.replace(
              optionsAnchor,
              'readOptions: () => p6ReadPolicy("construction-options"),',
            );
            return { contents, loader: "ts" };
          },
        );
        build.onLoad({ filter: /vue-capture\.ts$/ }, async (args) => {
          let contents = await readFile(args.path, "utf8");
          const invoke = "const value = Reflect.apply(";
          assert.equal(contents.split(invoke).length - 1, 1);
          contents = contents.replace(
            invoke,
            `const hooks = globalThis.__EA_TEST_HOOKS__;\n      if (typeof hooks?.buildingUnlockEvents !== "undefined") hooks.buildingUnlockEvents.push({ kind: "native-control-invoke", worktick: hooks.buildingUnlockWorktick, phase: hooks.buildingUnlockCurrentPhase ?? "outside-runPhase", elementId: handle.elementId, method, generation: handle.generation });\n      ${invoke}`,
          );
          const returned = 'record("returned");';
          assert.equal(contents.split(returned).length - 1, 1);
          contents = contents.replace(
            returned,
            'globalThis.__EA_TEST_HOOKS__?.buildingUnlockEvents.push({ kind: "native-control-result", worktick: globalThis.__EA_TEST_HOOKS__?.buildingUnlockWorktick, phase: globalThis.__EA_TEST_HOOKS__?.buildingUnlockCurrentPhase ?? "outside-runPhase", elementId: handle.elementId, method, outcome: "returned" });\n      record("returned");',
          );
          const threw = 'record("threw");';
          assert.equal(contents.split(threw).length - 1, 1);
          contents = contents.replace(
            threw,
            'globalThis.__EA_TEST_HOOKS__?.buildingUnlockEvents.push({ kind: "native-control-result", worktick: globalThis.__EA_TEST_HOOKS__?.buildingUnlockWorktick, phase: globalThis.__EA_TEST_HOOKS__?.buildingUnlockCurrentPhase ?? "outside-runPhase", elementId: handle.elementId, method, outcome: "threw" });\n      record("threw");',
          );
          return { contents, loader: "ts" };
        });
      },
    },
  ],
});
const bundlePath = path.join(
  root,
  "test-artifacts/perf-profile/p6-building-observation-probe.user.js",
);
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, instrumented.outputFiles[0].contents);

const runner = await createChromiumRunner({ game });
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const report = {
  gameSnapshot: runner.inputs.gameSnapshot,
  bundle: `source=${options.source ?? "working-tree"}; test-only observer injected during esbuild`,
  seed,
  autoPrestige: false,
  warmupPeriods,
  measuredPeriods,
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
        window.__EA_TEST_HOOKS__.buildingUnlockEvents.length = 0;
        window.__EA_TEST_HOOKS__.buildingUnlockSequence = 0;
        window.__EA_TEST_HOOKS__.buildingUnlockWorktick = 0;
        window.__EA_TEST_HOOKS__.buildingUnlockPreviousMembership = [];
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
      for (const observation of observations) {
        const regions = [...new Set(observation.regions)].sort();
        const key = `${observation.phase}|${observation.callsite}|${regions.join(",")}`;
        const group = grouped.get(key) ?? {
          phase: observation.phase,
          callsite: observation.callsite,
          requestedRegions: regions,
          frequency: 0,
          nativeAvailabilityEvaluations: 0,
          incompleteObservations: 0,
        };
        group.frequency += 1;
        group.nativeAvailabilityEvaluations +=
          observation.nativeAvailabilityEvaluations;
        if (!observation.catalogComplete) group.incompleteObservations += 1;
        grouped.set(key, group);
      }
      const allEvents = observations.flatMap(
        (observation) => observation.interveningEvents,
      );
      const controlInvocations = allEvents.filter(
        ({ kind }) => kind === "native-control-invoke",
      );
      const errors = diagnostics.events.filter(({ kind }) =>
        ["error", "pageerror", "rejection"].includes(kind),
      ).length;
      assert.equal(diagnostics.captureComplete, true, `${name} capture`);
      assert.equal(errors, 0, `${name} page errors`);
      report.fixtures.push({
        name,
        savePath,
        observationCount: observations.length,
        workticks: observations.at(-1)?.worktick ?? 0,
        groups: [...grouped.values()],
        nativeAvailabilityEvaluations: observations.reduce(
          (sum, observation) => sum + observation.nativeAvailabilityEvaluations,
          0,
        ),
        incompleteObservations: observations.filter(
          (observation) => !observation.catalogComplete,
        ).length,
        nativeControlInvocations: controlInvocations.length,
        nativeControlInvocationMethods: Object.fromEntries(
          [...new Set(controlInvocations.map(({ method }) => method))].map(
            (method) => [
              method,
              controlInvocations.filter((event) => event.method === method)
                .length,
            ],
          ),
        ),
        exportSha256: await import("node:crypto").then(({ createHash }) =>
          createHash("sha256").update(exportText).digest("hex"),
        ),
        rootStateCaptured: stateHashData !== undefined,
        workticks: observations.at(-1)?.worktick ?? 0,
        perCallsite: Object.fromEntries(
          [
            ...new Set(observations.map((observation) => observation.callsite)),
          ].map((callsite) => [
            callsite,
            observations.filter(
              (observation) => observation.callsite === callsite,
            ).length,
          ]),
        ),
        perPhase: Object.fromEntries(
          [
            ...new Set(observations.map((observation) => observation.phase)),
          ].map((phase) => [
            phase,
            observations.filter((observation) => observation.phase === phase)
              .length,
          ]),
        ),
        observations,
        pageErrors: errors,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
