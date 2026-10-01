import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  GOV_TABS_SETTING,
  SUB_TAB_CONTROLS,
  GOV_TAB_INDEX,
} from "../src/adapters/evolve/captured-tab-discovery.ts";
import { capturedPowerMetadataForBinding } from "../src/adapters/evolve/economy/production/captured-power-metadata.ts";

const save = parseSave(
  await readFile(
    resolve("test-artifacts/benchmark/saves/ds-late-2809.txt"),
    "utf8",
  ),
);

const bundleDirectory = await mkdtemp(join(tmpdir(), "captured-power-reader-"));
const testBundle = join(bundleDirectory, "captured-power-reader.test.js");
const userscriptMetadata = await readFile(
  resolve("src/userscript.meta.js"),
  "utf8",
);
await esbuild.build({
  absWorkingDir: process.cwd(),
  entryPoints: ["scripts/captured-power-reader-live-entry.ts"],
  outfile: testBundle,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["esnext"],
  banner: { js: userscriptMetadata },
  define: { __EA_TEST_SURFACE_ENABLED__: "true" },
  logLevel: "silent",
});

const runner = await createChromiumRunner();
process.stdout.write(
  `${JSON.stringify({ gameSnapshot: runner.inputs.gameSnapshot })}\n`,
);
let mechanics;
try {
  const session = await runner.openSession({
    bundle: testBundle,
    save,
    settings: {},
    seed: 42,
  });
  try {
    await session.advance(4);
    mechanics = await session.evaluate(() => {
      const capture = globalThis[Symbol.for("evolve-automation.page-capture")];
      if (!capture || !capture.mechanics) return undefined;
      const structures = capture.mechanics.readStructures();
      const production = capture.mechanics.readProductionBreakdown();
      const root = capture.rootState.readRoot();
      const powerOrder = capture.mechanics.readPowerOrder(root);
      const mapKeys = structures?.map((entry) => entry.entryKey) ?? [];
      const powerKeys =
        powerOrder.kind === "value"
          ? powerOrder.value.map((entry) => entry.entryKey)
          : [];
      const supportOrder =
        powerOrder.kind === "value"
          ? powerOrder.value
              .flatMap((entry) => {
                const supportTypes = entry.readSupportTypes();
                return supportTypes.kind === "value" ? supportTypes.value : [];
              })
              .map((type) => [
                type,
                capture.mechanics.readSupportOrder(root, type),
              ])
          : [];
      const selectedSupportOrder = supportOrder.find(([, read]) => {
        if (read.kind !== "value" || read.value.length < 2) return false;
        const supportKeys = new Set(read.value.map((entry) => entry.entryKey));
        const mapSupportOrder = mapKeys.filter((key) => supportKeys.has(key));
        return read.value.some(
          (entry, index) => entry.entryKey !== mapSupportOrder[index],
        );
      });
      const stateFor = (entry) => {
        const region = root?.[entry.region];
        return region && typeof region === "object"
          ? region[entry.struct]
          : undefined;
      };
      const producerRows =
        structures?.flatMap((entry) => {
          const powered = entry.readPowered();
          const fuel = entry.readFuel();
          if (
            powered.kind !== "value" ||
            powered.value >= 0 ||
            fuel.kind !== "value" ||
            fuel.value === false ||
            fuel.value.length === 0
          ) {
            return [];
          }
          const state = stateFor(entry);
          const on = Number(state?.on ?? 0);
          const title = entry.readTitle();
          return [
            {
              entry,
              state,
              on,
              title: title.kind === "value" ? title.value : undefined,
              fuel: fuel.value,
            },
          ];
        }) ?? [];
      const activeProducer = producerRows.find(({ on }) => on > 0);
      const inactiveProducer = producerRows.find(
        ({ state, on }) => state !== undefined && on === 0,
      );
      const unavailableProducer = producerRows.find(
        ({ state }) => state === undefined,
      );
      const supportZero =
        structures?.find((entry) => {
          const supportTypes = entry.readSupportTypes();
          const fuel = entry.readSupportFuel();
          const state = stateFor(entry);
          return (
            supportTypes.kind === "value" &&
            supportTypes.value.length > 0 &&
            fuel.kind === "value" &&
            fuel.value !== false &&
            fuel.value.length > 0 &&
            state !== undefined &&
            Number(state.on ?? 0) === 0
          );
        }) ?? undefined;
      const supportOverrides =
        structures?.flatMap((entry) => {
          const types = entry.readSupportTypes();
          const base = entry.readSupport();
          if (types.kind !== "value" || base.kind !== "value") return [];
          return types.value.flatMap((type) => {
            const value = entry.readSupportValue(type);
            return value.kind === "value" && value.value !== base.value
              ? [
                  {
                    entry,
                    type,
                    base: base.value,
                    value: value.value,
                    provider: entry.readSupportProvider(),
                  },
                ]
              : [];
          });
        }) ?? [];
      const supportOverride =
        supportOverrides.find(
          ({ provider }) => provider.kind === "value" && provider.value,
        ) ?? supportOverrides[0];
      const activeFuelLedger = activeProducer
        ? activeProducer.fuel.map(({ resourceId, amount }) => {
            const rows = production?.consumption[resourceId];
            const hasSource =
              rows !== undefined &&
              activeProducer.title !== undefined &&
              Object.hasOwn(rows, activeProducer.title);
            return {
              resourceId,
              rawAmount: amount,
              hasSource,
              observedTotal:
                hasSource && activeProducer.title !== undefined
                  ? rows[activeProducer.title]
                  : undefined,
              rootOn: activeProducer.on,
            };
          })
        : [];
      const generatorRead = structures?.find((entry) => {
        const powered = entry.readPowered();
        const fuel = entry.readFuel();
        return (
          powered.kind === "value" &&
          Number.isFinite(Number(powered.value)) &&
          Number(powered.value) < 0 &&
          fuel.kind === "value"
        );
      });
      const poweredRead =
        generatorRead ??
        structures?.find((entry) => {
          const powered = entry.readPowered();
          return (
            powered.kind === "value" && Number.isFinite(Number(powered.value))
          );
        });
      const powered = poweredRead?.readPowered();
      const rootBeforeFuelProbes = JSON.stringify(root);
      const nativeToFixed = Object.getOwnPropertyDescriptor(
        Number.prototype,
        "toFixed",
      );
      const solarFuelAdjustment = capture.mechanics.readAdjustedFuelFactor(
        "space",
        "Oil",
      );
      const interstellarFuelAdjustment =
        capture.mechanics.readAdjustedFuelFactor("interstellar", "Helium_3");
      const rootAfterFuelProbes = JSON.stringify(root);
      const restoredToFixed = Object.getOwnPropertyDescriptor(
        Number.prototype,
        "toFixed",
      );
      const toFixedRestored =
        restoredToFixed?.value === nativeToFixed?.value &&
        restoredToFixed?.get === nativeToFixed?.get &&
        restoredToFixed?.set === nativeToFixed?.set &&
        restoredToFixed?.configurable === nativeToFixed?.configurable &&
        restoredToFixed?.enumerable === nativeToFixed?.enumerable &&
        restoredToFixed?.writable === nativeToFixed?.writable;
      const managedCandidates =
        structures?.flatMap((entry) => {
          const state = stateFor(entry);
          if (
            !state ||
            typeof state !== "object" ||
            !Object.hasOwn(state, "on") ||
            Number(state.count ?? 0) <= 0
          ) {
            return [];
          }
          return [{ binding: entry.actionId, entryKey: entry.entryKey }];
        }) ?? [];
      return {
        captureComplete: capture.isComplete(),
        structureCount: structures?.length,
        uniqueEntryKeys: new Set(structures?.map((entry) => entry.entryKey))
          .size,
        rootPowerOrderIsDistinct:
          powerKeys.length > 1 && powerKeys[0] !== mapKeys[0],
        rootSupportOrderIsDistinct: selectedSupportOrder !== undefined,
        powerOrderCount: powerKeys.length,
        selectedRootExamples: {
          activeProducer: activeProducer?.entry.entryKey,
          inactiveProducer: inactiveProducer?.entry.entryKey,
          unavailableProducer: unavailableProducer?.entry.entryKey,
          zeroOnSupport: supportZero?.entryKey,
          supportOverride: supportOverride
            ? {
                entryKey: supportOverride.entry.entryKey,
                type: supportOverride.type,
                base: supportOverride.base,
                effectiveBase: supportOverride.value,
                provider: supportOverride.provider,
              }
            : undefined,
        },
        activeFuelLedger,
        capturedFuels:
          structures?.map((entry) => ({
            binding: entry.actionId,
            power: entry.readFuel(),
            support: entry.readSupportFuel(),
          })) ?? [],
        sampleIdentity: poweredRead
          ? {
              entryKey: poweredRead.entryKey,
              region: poweredRead.region,
              sector: poweredRead.sector,
              struct: poweredRead.struct,
              actionId: poweredRead.actionId,
            }
          : undefined,
        selectedByNegativePoweredResult: generatorRead !== undefined,
        samplePowerMechanics: {
          title: poweredRead?.readTitle(),
          powered,
          fuel: poweredRead?.readFuel(),
          fuelAdjustmentRequested: poweredRead?.readFuelAdjustmentRequested(),
          powerLimit: poweredRead?.readPowerLimit(),
          support: poweredRead?.readSupport(),
          supportFuel: poweredRead?.readSupportFuel(),
          powerBalancer: poweredRead?.readPowerBalancer(),
        },
        liveFuelProbe: {
          solarFuelAdjustment,
          interstellarFuelAdjustment,
          rootUnchanged: rootBeforeFuelProbes === rootAfterFuelProbes,
          toFixedRestored,
        },
        managedCandidates,
        productionResources: production
          ? Object.keys(production.production).length
          : undefined,
        consumptionResources: production
          ? Object.keys(production.consumption).length
          : undefined,
        hasLiveFoodConsumption: Boolean(production?.consumption.Food),
        mapSetIsNative: /\[native code\]/.test(
          Function.prototype.toString.call(Map.prototype.set),
        ),
        privateHelpersVisibleOnGlobal: {
          solarFuel: typeof globalThis.fuel_adjust === "function",
          interstellarFuel: typeof globalThis.int_fuel_adjust === "function",
          infiltrator: typeof globalThis.infiltratorFactor === "function",
          powerLedger: globalThis.power_generated !== undefined,
        },
        consumePrototypeDescriptor: Object.getOwnPropertyDescriptor(
          Object.prototype,
          "consume",
        ),
      };
    });

    assert.ok(mechanics, "document-start page capture exposes mechanics");
    assert.equal(mechanics.captureComplete, true);
    assert.ok(mechanics.structureCount > 0);
    assert.equal(mechanics.uniqueEntryKeys, mechanics.structureCount);
    assert.equal(mechanics.rootPowerOrderIsDistinct, true);
    assert.equal(mechanics.rootSupportOrderIsDistinct, true);
    assert.ok(mechanics.powerOrderCount > 0);
    assert.ok(mechanics.selectedRootExamples.activeProducer);
    assert.ok(mechanics.selectedRootExamples.unavailableProducer);
    assert.ok(mechanics.selectedRootExamples.supportOverride);
    assert.ok(mechanics.activeFuelLedger.some((entry) => entry.hasSource));
    assert.equal(mechanics.liveFuelProbe.solarFuelAdjustment.kind, "value");
    assert.equal(
      mechanics.liveFuelProbe.interstellarFuelAdjustment.kind,
      "value",
    );
    assert.equal(mechanics.liveFuelProbe.rootUnchanged, true);
    assert.equal(mechanics.liveFuelProbe.toFixedRestored, true);
    assert.ok(mechanics.sampleIdentity);
    assert.equal(mechanics.samplePowerMechanics.powered.kind, "value");
    if (mechanics.selectedByNegativePoweredResult) {
      assert.ok(Number(mechanics.samplePowerMechanics.powered.value) < 0);
    }
    assert.ok(mechanics.productionResources >= 0);
    assert.ok(mechanics.consumptionResources >= 0);
    assert.equal(mechanics.mapSetIsNative, true);
    assert.deepEqual(mechanics.privateHelpersVisibleOnGlobal, {
      solarFuel: false,
      interstellarFuel: false,
      infiltrator: false,
      powerLedger: false,
    });
    assert.equal(mechanics.consumePrototypeDescriptor, undefined);
  } finally {
    await session.close();
  }

  mechanics.declaredFuelOverlaps = mechanics.capturedFuels.flatMap((entry) => {
    const declarations = capturedPowerMetadataForBinding(
      entry.binding,
    ).consumptions;
    if (declarations.length === 0) return [];
    const gameFuels = [
      ...(entry.power.kind === "value" && entry.power.value !== false
        ? entry.power.value
        : []),
      ...(entry.support.kind === "value" && entry.support.value !== false
        ? entry.support.value
        : []),
    ];
    return declarations.flatMap((declaration) =>
      gameFuels
        .filter((fuel) => fuel.resourceId === declaration.resourceId)
        .map((fuel) => ({
          binding: entry.binding,
          resourceId: declaration.resourceId,
          declaredRate:
            declaration.policy.kind === "fixed"
              ? declaration.policy.value
              : declaration.policy.kind,
          gameFuelAmount: fuel.amount,
        })),
    );
  });
  delete mechanics.capturedFuels;
  assert.deepEqual(
    mechanics.declaredFuelOverlaps,
    [],
    "game-owned p_fuel/support_fuel rows are not duplicated as automation declarations",
  );
  process.stdout.write(
    `${JSON.stringify({ declaredFuelOverlaps: mechanics.declaredFuelOverlaps })}\n`,
  );

  const prioritySettings = Object.assign(Object.create(null), {
    autoBuild: false,
    autoARPA: false,
    autoResearch: false,
    autoMech: false,
    autoStorage: false,
  });
  const priorityCandidates = [...mechanics.managedCandidates].reverse();
  for (let index = 0; index < priorityCandidates.length; index++) {
    const { binding } = priorityCandidates[index];
    prioritySettings[`bld_s_${binding}`] = true;
    prioritySettings[`bld_p_${binding}`] = index;
  }
  const cycleSave = structuredClone(save);
  cycleSave.settings.cLabels = false;
  cycleSave.settings.tabLoad = false;
  cycleSave.settings.civTabs = 2;
  cycleSave.settings.govTabs = 0;
  const cycleSession = await runner.openSession({
    bundle: testBundle,
    save: cycleSave,
    settings: prioritySettings,
    seed: 42,
  });
  try {
    await cycleSession.advance(1);
    const captured = await cycleSession.evaluate(() => {
      const hooks = globalThis.__EA_TEST_HOOKS__;
      if (!hooks || typeof hooks.readPowerCycle !== "function")
        return undefined;
      const beforeReadCityControls = globalThis[
        Symbol.for("evolve-automation.page-capture")
      ].controls
        .capturedElementIds()
        .filter((id) => id.startsWith("city-"));
      const tabSettingsBeforeRead = JSON.stringify(
        globalThis[
          Symbol.for("evolve-automation.page-capture")
        ].rootState.readRoot().settings,
      );
      hooks.samplePowerDemand();
      const result = hooks.readPowerCycle();
      const afterReadCityControls = globalThis[
        Symbol.for("evolve-automation.page-capture")
      ].controls
        .capturedElementIds()
        .filter((id) => id.startsWith("city-"));
      const readTabsUnchanged =
        JSON.stringify(
          globalThis[
            Symbol.for("evolve-automation.page-capture")
          ].rootState.readRoot().settings,
        ) === tabSettingsBeforeRead;
      if (!result) return undefined;
      const root =
        globalThis[
          Symbol.for("evolve-automation.page-capture")
        ].rootState.readRoot();
      const race = root?.race;
      const tasks = race?.governor?.tasks;
      const replicatorActive =
        tasks && Object.values(tasks).includes("replicate");
      const expectedPowerCurrent =
        (Number(root?.city?.power) || 0) +
        (replicatorActive ? Number(race?.replicator?.pow) || 0 : 0);
      const species = race?.species;
      const speciesResource = species ? root?.resource?.[species] : undefined;
      const population = result.cycle.resources.find(
        (resource) => resource.id === species,
      );
      const specialPayloads = result.cycle.buildings
        .filter((building) => building.rule.kind !== "ordinary")
        .map((building) => ({
          binding: building.binding,
          kind: building.rule.kind,
          rule: building.rule,
        }));
      const specialPayload =
        specialPayloads.find(
          ({ kind, rule }) =>
            (kind === "belt-space-station" && rule.stationStorage > 0) ||
            (kind === "triton-lander" && rule.healingRate > 0) ||
            (kind === "chthonian-mine-layer" && rule.rating > 0) ||
            (kind === "job-dependent" && rule.jobCount > 0),
        ) ?? null;
      const forcingBuilding = result.cycle.buildings.find(
        (building) => building.powered > 0 && building.count > 0,
      );
      let forcedPlan;
      if (forcingBuilding && typeof hooks.planPowerCycle === "function") {
        const forcedPower = Math.max(1000000, expectedPowerCurrent);
        const forcedCycle = {
          ...result.cycle,
          powerCurrent: forcedPower,
          powerMaximum: Math.max(result.cycle.powerMaximum, forcedPower),
          resources: result.cycle.resources.map((resource) =>
            resource.id === "Power"
              ? {
                  ...resource,
                  currentQuantity: forcedPower,
                  rateOfChange: forcedPower,
                  maxQuantity: Math.max(resource.maxQuantity, forcedPower),
                  storageRatio: 1,
                }
              : resource,
          ),
          buildings: result.cycle.buildings.map((building) =>
            building.binding === forcingBuilding.binding
              ? { ...building, stateOn: 0 }
              : building,
          ),
        };
        forcedPlan = hooks.planPowerCycle(forcedCycle);
      }
      return {
        beforeReadCityControls,
        afterReadCityControls,
        readTabsUnchanged,
        freshPowerBuildings: hooks.freshPowerBuildings,
        buildingCount: result.cycle.buildings.length,
        powerUnlocked: result.cycle.powerUnlocked,
        powerCurrent: result.cycle.powerCurrent,
        expectedPowerCurrent,
        powerResource:
          result.cycle.resources.find((resource) => resource.id === "Power") ??
          null,
        gameHasPowerResource: Boolean(root?.resource?.Power),
        civilianPopulation: result.cycle.civilianPopulation,
        population: population ?? null,
        species,
        speciesPopulation: Number(speciesResource?.amount) || 0,
        positivePower: result.cycle.buildings.filter(
          (building) => building.powered > 0,
        ).length,
        negativePower: result.cycle.buildings.filter(
          (building) => building.powered < 0,
        ).length,
        resourceCount: result.cycle.resources.length,
        plannerReturned: Boolean(result.plan),
        decisionKind: result.plan.decision?.kind ?? null,
        decisionOperations: result.plan.decision?.operations.length ?? 0,
        specialPayload,
        specialPayloads,
        forcedPlanKind: forcedPlan?.decision?.kind ?? null,
        forcedPlanOperations: forcedPlan?.decision?.operations ?? [],
        buildingOrder: result.cycle.buildings.map(
          (building) => building.binding,
        ),
      };
    });
    assert.ok(
      captured,
      "the complete captured cycle is available to the retained planner",
    );
    assert.ok(captured.buildingCount > 0);
    assert.deepEqual(captured.beforeReadCityControls, []);
    assert.deepEqual(
      captured.afterReadCityControls,
      [],
      "Power read does not discover the City panel",
    );
    assert.equal(captured.readTabsUnchanged, true);
    const freshManaged = captured.freshPowerBuildings.filter(
      (building) =>
        building.hasState &&
        (building.powered !== 0 || building.count > 0) &&
        captured.buildingOrder.includes(building.binding),
    );
    assert.ok(freshManaged.length > 0);
    assert.equal(
      freshManaged.every((building) => !building.panelCaptured),
      true,
      "semantic Building state is captured before normal panels or runtime discovery",
    );
    assert.deepEqual(
      priorityCandidates
        .map(({ binding }) => binding)
        .filter((binding) =>
          freshManaged.some((building) => building.binding === binding),
        ),
      captured.buildingOrder,
      "fresh undrawn semantic Building states produce the same managed ordering",
    );

    assert.equal(
      captured.powerUnlocked,
      true,
      "the late save has unlocked Power",
    );
    assert.equal(
      captured.powerCurrent,
      captured.expectedPowerCurrent,
      "Power current matches city.power plus the active Replicator task output",
    );
    assert.equal(
      captured.powerResource?.currentQuantity,
      captured.powerCurrent,
      "the cycle contains a synthetic Power resource backed by city.power",
    );
    assert.equal(
      captured.gameHasPowerResource,
      false,
      "synthetic Power does not depend on a global.resource.Power entry",
    );
    assert.ok(captured.species, "the late save names a current species");
    assert.ok(captured.speciesPopulation > 0, "species population is nonzero");
    assert.equal(
      captured.population?.currentQuantity,
      captured.speciesPopulation,
    );
    assert.equal(captured.civilianPopulation, captured.speciesPopulation);
    assert.ok(
      captured.positivePower > 0,
      "captured cycle contains positive-power consumers",
    );
    assert.ok(
      captured.negativePower > 0,
      "captured cycle contains negative-power generators",
    );
    assert.ok(captured.resourceCount > 0);
    assert.equal(captured.plannerReturned, true);
    assert.equal(
      captured.decisionKind,
      "apply-power-cycle",
      "the retained planner passes the unlocked-Power guard",
    );
    assert.ok(
      captured.decisionOperations > 0,
      "the late save's planned Power decision contains operations",
    );
    assert.ok(
      captured.specialPayload,
      `at least one special Power rule has live values: ${JSON.stringify(captured.specialPayloads)}`,
    );
    assert.equal(captured.forcedPlanKind, "apply-power-cycle");
    assert.ok(
      captured.forcedPlanOperations.some(
        (operation) => operation.kind === "adjust-building",
      ),
      "a captured Power consumer forced off in the test scenario gets a real adjustment operation",
    );
    assert.deepEqual(
      captured.buildingOrder,
      priorityCandidates
        .map(({ binding }) => binding)
        .filter((binding) => captured.buildingOrder.includes(binding)),
      "the captured cycle follows stored building priorities rather than root.power",
    );
    process.stdout.write(
      `${JSON.stringify({ capturedPowerCycle: captured })}\n`,
    );
    const execution = await cycleSession.evaluate(() => {
      const hooks = globalThis.__EA_TEST_HOOKS__;
      const capture = globalThis[Symbol.for("evolve-automation.page-capture")];
      const root = capture.rootState.readRoot();
      const before = hooks.readPowerCycle();
      const candidate = before.cycle.buildings.find(
        (building) => building.powered > 0 && building.count > 0,
      );
      if (!candidate) return { error: "no consumer" };
      const structure = capture.mechanics
        .readStructures()
        .find((entry) => entry.actionId === candidate.binding);
      const state = root[structure.region][structure.struct];
      state.on = 0;
      root.city.power = 1000000;
      const settingsBefore = JSON.stringify(root.settings);
      const controlsBefore = capture.controls.capturedElementIds();
      const offered = structure.readAvailability(root);
      const sampled = hooks.readPowerCycle();
      const adjustment = sampled?.plan.decision?.operations.find(
        (operation) =>
          operation.kind === "adjust-building" &&
          operation.binding === candidate.binding &&
          operation.amount > 0,
      );
      const outcome = hooks.runPowerAutomation();
      return {
        binding: candidate.binding,
        offered,
        tabLoad: root.settings.tabLoad,
        civTabs: root.settings.civTabs,
        normalPanelCaptured:
          capture.controls.resolve(candidate.binding) !== undefined,
        beforeOn: 0,
        plannedAmount: adjustment?.amount,
        outcome,
        afterOn: state.on,
        settingsUnchanged: JSON.stringify(root.settings) === settingsBefore,
        controlsUnchanged:
          JSON.stringify(capture.controls.capturedElementIds()) ===
          JSON.stringify(controlsBefore),
        buildingOrder: hooks
          .readPowerCycle()
          ?.cycle.buildings.map((building) => building.binding),
      };
    });

    assert.equal(
      execution.normalPanelCaptured,
      false,
      "production Power executes before the Building panel is rendered",
    );
    assert.equal(execution.offered?.kind, "value");
    assert.equal(execution.offered.value, true);
    assert.ok(execution.plannedAmount > 0, JSON.stringify(execution));
    assert.equal(
      execution.outcome.status,
      "succeeded",
      JSON.stringify(execution),
    );
    assert.equal(
      execution.afterOn,
      execution.beforeOn + execution.plannedAmount,
    );
    assert.equal(
      execution.settingsUnchanged,
      true,
      "Power does not change tab settings",
    );
    assert.equal(
      execution.controlsUnchanged,
      true,
      "Power does not discover Building panels",
    );
    assert.deepEqual(execution.buildingOrder, captured.buildingOrder);
    process.stdout.write(
      `${JSON.stringify({ productionPowerExecution: execution })}\n`,
    );
    const rendered = await cycleSession.evaluate(
      ({ main, civic, sub, industry, binding }) => {
        const capture =
          globalThis[Symbol.for("evolve-automation.page-capture")];
        const root = capture.rootState.readRoot();
        root.settings.civTabs = civic;
        const mainHandle = capture.controls.resolve(main);
        capture.controls.invoke(mainHandle, "swapTab", [civic]);
        root.settings.govTabs = industry;
        const subHandle = capture.controls.resolve(sub);
        capture.controls.invoke(subHandle, "swapTab", [industry]);
        return Boolean(globalThis.document.getElementById(`pg${binding}power`));
      },
      {
        main: MAIN_TAB_CONTROL,
        civic: MAIN_TAB_INDEX.civic,
        sub: SUB_TAB_CONTROLS[GOV_TABS_SETTING],
        industry: GOV_TAB_INDEX.powerGrid,
        binding: execution.binding,
      },
    );
    assert.equal(
      rendered,
      execution.offered.value,
      "industry gridEnabled rendered result agrees with the semantic offer qualification",
    );
  } finally {
    await cycleSession.close();
  }

  // Exercise the production cycle's demand owner, rather than manually pre-sampling Power.
  for (const scenario of [
    { name: "power-only", autoBuild: false, autoStorage: false },
    { name: "build-and-power", autoBuild: true, autoStorage: false },
    { name: "storage-and-power", autoBuild: false, autoStorage: true },
    {
      name: "broad-build-narrow-trigger-and-power",
      autoBuild: true,
      narrowTrigger: true,
    },
    { name: "research-mutation-and-power", autoResearch: true },
    {
      name: "failed-post-research-catalog",
      autoResearch: true,
      failResearch: true,
      stale: true,
    },
    {
      name: "research-queue-unavailable-catalog",
      researchQueue: true,
      failResearch: true,
      stale: true,
    },
    { name: "build-queue-unavailable-cost", buildQueue: true, stale: true },
    { name: "project-demand-without-owner", projectDemand: true, stale: true },
    { name: "arpa-and-power", autoARPA: true, projectDemand: true },
    {
      name: "project-storage-without-autoarpa",
      autoStorage: true,
      projectDemand: true,
    },
    {
      name: "failed-arpa-establishment",
      autoARPA: true,
      projectDemand: true,
      failArpa: true,
      stale: true,
    },
    {
      name: "expired-arpa-scope",
      autoARPA: true,
      projectDemand: true,
      expireArpa: true,
      stale: true,
    },
    {
      name: "unavailable-demand-prerequisite",
      autoBuild: false,
      autoStorage: false,
      unavailable: true,
    },
  ]) {
    const runtimeSession = await runner.openSession({
      bundle: testBundle,
      save: structuredClone(cycleSave),
      settings: {
        ...prioritySettings,
        masterScriptToggle: true,
        autoPower: true,
        autoBuild: scenario.autoBuild === true,
        autoStorage: scenario.autoStorage === true,
        autoARPA: scenario.autoARPA === true,
        autoResearch: scenario.autoResearch === true,
        autoTrigger: scenario.narrowTrigger === true,
        triggers: scenario.narrowTrigger
          ? [
              {
                priority: 0,
                requirementType: "BuildingUnlocked",
                requirementId: "city-basic_housing",
                requirementCount: 0,
                actionType: "build",
                actionId: "city-basic_housing",
                actionCount: 1000000,
              },
            ]
          : [],
        ...Object.fromEntries(
          Object.keys(cycleSave.arpa).map((id) => [`arpa_${id}`, false]),
        ),
        arpa_lhc: scenario.projectDemand === true,
        tickRate: 1000,
      },
      seed: 42,
    });
    try {
      await runtimeSession.advance(1);
      const runtimePower = await runtimeSession.evaluate(
        ({
          unavailable,
          failArpa,
          expireArpa,
          autoResearch,
          failResearch,
          researchQueue,
          buildQueue,
        }) => {
          const hooks = globalThis.__EA_TEST_HOOKS__;
          const capture =
            globalThis[Symbol.for("evolve-automation.page-capture")];
          const root = capture.rootState.readRoot();
          const structure = capture.mechanics.readStructures().find((entry) => {
            const powered = entry.readPowered();
            const state = root[entry.region]?.[entry.struct];
            const offered = entry.readAvailability(root);
            return (
              powered.kind === "value" &&
              powered.value > 0 &&
              state?.count > 0 &&
              Object.hasOwn(state, "on") &&
              offered.kind === "value" &&
              offered.value === true
            );
          });
          if (!structure) return { error: "no offered Power consumer" };
          const state = root[structure.region][structure.struct];
          state.on = 0;
          root.city.power = 1000000;
          if (autoResearch) {
            // Upstream tech.js: cement grants cement=1 for 500 Knowledge and has no side effects
            // beyond initializing its existing structure. Re-offer it in this disposable world.
            delete root.tech.cement;
            for (const resource of Object.values(root.resource)) {
              if (resource && typeof resource === "object") {
                resource.amount = Math.max(resource.amount ?? 0, 1000000000000);
                resource.max = Math.max(resource.max ?? 0, 1000000000000);
              }
            }
          }
          if (researchQueue) {
            root.tech.r_queue = 1;
            root.r_queue = {
              display: true,
              pause: false,
              queue: [
                {
                  id: "tech-unavailable-test",
                  label: "Unavailable test",
                  req: true,
                  cna: false,
                },
              ],
            };
          }
          if (buildQueue)
            root.queue = {
              display: true,
              pause: false,
              queue: [
                { id: "city-unavailable-test", label: "Unavailable test" },
              ],
            };
          const techBeforeResearch = JSON.stringify(root.tech);
          let researchChanged = false;
          let researchControlsBeforePower;
          let researchControlsAfterPower;
          let researchPanelBeforePower;
          let researchPanelAfterPower;
          let powerStateBefore;
          let powerStateAfter;
          const readResearchControlSignature = () =>
            capture.controls
              .capturedElementIds()
              .filter((id) => id.startsWith("tech-") || id === "resContent")
              .map((id) => ({
                id,
                generation: capture.controls.resolve(id)?.generation,
              }));
          const querySelectorAllBefore = globalThis.document.querySelectorAll;
          // Hiding `#tech` is not enough: the catalog pass draws the panel and reads its rows, so
          // the sabotage has to reach the row read the research catalog owns. An unreadable panel
          // reports itself unavailable; an empty row list would be the game's own answer instead.
          const failResearchCatalogRead = () => {
            globalThis.document.querySelectorAll = function (selector) {
              if (
                selector === "#tech .action" ||
                selector === "#oldTech .action"
              )
                throw new Error("the drawn research panel cannot be read");
              return querySelectorAllBefore.call(this, selector);
            };
          };
          if (failResearch && !autoResearch) failResearchCatalogRead();
          const phases = [];
          let constructionDemand;
          let readyDemand;
          let settingsBeforePower;
          let controlsBeforePower;
          let powerOutcome;
          let settingsUnchangedByPower;
          let controlsUnchangedByPower;
          let arpaControlsBeforePower;
          let arpaControlsAfterPower;
          let arpaPanelBeforePower;
          let arpaPanelAfterPower;
          const readTabCalls = () =>
            capture.controlUsage
              .readUsage()
              .filter((entry) => entry.method === "swapTab")
              .reduce((sum, entry) => sum + entry.returned + entry.threw, 0);
          let tabCallsBeforePower;
          const arpaBefore = root.arpa;
          if (failArpa) delete root.arpa;
          const dateBefore = Date;
          hooks.observePowerDemandPhase = (stage, demand, outcome) => {
            phases.push({ stage, demandAvailable: demand !== undefined });
            if (stage === "research-complete") {
              researchChanged =
                JSON.stringify(root.tech) !== techBeforeResearch;
              if (failResearch) failResearchCatalogRead();
            }
            if (stage === "construction-complete") constructionDemand = demand;
            if (stage === "power-handoff-start") {
              if (expireArpa)
                globalThis.Date = class extends dateBefore {
                  static now() {
                    return dateBefore.now() + 60000;
                  }
                };
              settingsBeforePower = JSON.stringify(root.settings);
              controlsBeforePower = JSON.stringify(
                capture.controls.capturedElementIds(),
              );
              arpaControlsBeforePower = capture.controls
                .capturedElementIds()
                .filter((id) => id.startsWith("arpa"));
              arpaPanelBeforePower = Boolean(
                globalThis.document.getElementById("arpaPhysics"),
              );
              tabCallsBeforePower = readTabCalls();
              powerStateBefore = hooks.readPowerAutomationState();
              researchControlsBeforePower = readResearchControlSignature();
              researchPanelBeforePower = Boolean(
                globalThis.document.getElementById("tech"),
              );
            }
            if (stage === "power-ready") readyDemand = demand;
            if (stage === "power-complete") {
              powerOutcome = outcome;
              settingsUnchangedByPower =
                JSON.stringify(root.settings) === settingsBeforePower;
              controlsUnchangedByPower =
                JSON.stringify(capture.controls.capturedElementIds()) ===
                controlsBeforePower;
              arpaControlsAfterPower = capture.controls
                .capturedElementIds()
                .filter((id) => id.startsWith("arpa"));
              arpaPanelAfterPower = Boolean(
                globalThis.document.getElementById("arpaPhysics"),
              );
              powerStateAfter = hooks.readPowerAutomationState();
              researchControlsAfterPower = readResearchControlSignature();
              researchPanelAfterPower = Boolean(
                globalThis.document.getElementById("tech"),
              );
            }
          };
          const resources = root.resource;
          if (unavailable) delete root.resource;
          try {
            hooks.runCapturedRuntimeCycle();
            return {
              binding: structure.actionId,
              phases,
              constructionDemandAvailable: constructionDemand !== undefined,
              demandRefreshed:
                readyDemand !== undefined && readyDemand !== constructionDemand,
              outcome: powerOutcome,
              afterOn: state.on,
              normalPanelCaptured:
                capture.controls.resolve(structure.actionId) !== undefined,
              settingsUnchangedByPower,
              controlsUnchangedByPower,
              arpaControlsBeforePower,
              arpaControlsAfterPower,
              arpaPanelBeforePower,
              arpaPanelAfterPower,
              tabCallsBeforePower,
              tabCallsDuringPower: readTabCalls() - tabCallsBeforePower,
              powerStateBefore,
              powerStateAfter,
              researchChanged,
              researchControlsBeforePower,
              researchControlsAfterPower,
              researchPanelBeforePower,
              researchPanelAfterPower,
            };
          } finally {
            root.resource = resources;
            root.arpa = arpaBefore;
            globalThis.Date = dateBefore;
            globalThis.document.querySelectorAll = querySelectorAllBefore;
            delete hooks.observePowerDemandPhase;
          }
        },
        scenario,
      );
      assert.equal(runtimePower.error, undefined, JSON.stringify(runtimePower));
      assert.deepEqual(
        runtimePower.phases.filter(({ stage }) =>
          stage.endsWith("invalidated"),
        ),
        [
          { stage: "construction-invalidated", demandAvailable: false },
          { stage: "factory-invalidated", demandAvailable: false },
        ],
      );
      assert.equal(
        runtimePower.settingsUnchangedByPower,
        true,
        "tab settings stay unchanged from before demand refresh through Power completion",
      );
      assert.equal(
        runtimePower.controlsUnchangedByPower,
        true,
        "demand refresh and Power must not discover any captured controls",
      );
      assert.equal(runtimePower.tabCallsDuringPower, 0);
      assert.deepEqual(
        runtimePower.researchControlsAfterPower,
        runtimePower.researchControlsBeforePower,
      );
      assert.equal(
        runtimePower.researchPanelAfterPower,
        runtimePower.researchPanelBeforePower,
      );
      if (scenario.autoResearch)
        assert.equal(
          runtimePower.researchChanged,
          true,
          JSON.stringify(await runtimeSession.diagnostics()),
        );
      assert.deepEqual(
        runtimePower.arpaControlsAfterPower,
        runtimePower.arpaControlsBeforePower,
      );
      assert.equal(
        runtimePower.arpaPanelAfterPower,
        runtimePower.arpaPanelBeforePower,
      );
      if (scenario.projectDemand && !scenario.stale)
        assert.ok(runtimePower.arpaControlsBeforePower.length > 0);
      if (scenario.unavailable || scenario.stale) {
        assert.equal(runtimePower.outcome.status, "stale");
        assert.equal(
          runtimePower.outcome.failure.code,
          "captured-power-cycle-unavailable",
        );
        assert.equal(runtimePower.afterOn, 0);
        assert.deepEqual(
          runtimePower.powerStateAfter,
          runtimePower.powerStateBefore,
          "unavailable demand preserves Power automation state",
        );
        const diagnostics = await runtimeSession.diagnostics();
        assert.ok(
          diagnostics.events.some(({ text }) =>
            text.includes("autoPower: captured-power-cycle-unavailable:"),
          ),
          "the production autoPower failure path logs unavailable demand",
        );
      } else {
        // Only a cycle that still has a construction phase rebuilds a shared sample after
        // Storage ends it. A Storage-only cycle deliberately carries none into the tail, and the
        // invariant there is that Power's own handoff still gets an exact sample.
        if (scenario.autoBuild)
          assert.equal(runtimePower.constructionDemandAvailable, true);
        assert.equal(runtimePower.demandRefreshed, true);
        assert.equal(runtimePower.outcome.status, "succeeded");
        assert.ok(runtimePower.afterOn > 0, JSON.stringify(runtimePower));
        if (
          !scenario.autoBuild &&
          !scenario.autoStorage &&
          !scenario.autoARPA
        ) {
          assert.equal(
            runtimePower.normalPanelCaptured,
            false,
            "Power-only production cycles act with the normal Building panel undrawn",
          );
        }
      }
      process.stdout.write(
        `${JSON.stringify({ productionPowerRuntimeCycle: { scenario: scenario.name, ...runtimePower } })}\n`,
      );
    } finally {
      await runtimeSession.close();
    }
  }

  const earlySave = parseSave(
    await readFile(
      resolve("test-artifacts/benchmark/saves/ds-early-bootstrap.json"),
      "utf8",
    ),
  );
  const earlySession = await runner.openSession({
    bundle: testBundle,
    save: earlySave,
    settings: prioritySettings,
    seed: 42,
  });
  try {
    await earlySession.advance(4);
    const inactiveFacts = await earlySession.evaluate(() => {
      const capture = globalThis[Symbol.for("evolve-automation.page-capture")];
      const root = capture.rootState.readRoot();
      const structures = capture.mechanics.readStructures() ?? [];
      const production = capture.mechanics.readProductionBreakdown();
      const stateFor = (entry) => root?.[entry.region]?.[entry.struct];
      const generators = structures.flatMap((entry) => {
        const powered = entry.readPowered();
        const fuel = entry.readFuel();
        const title = entry.readTitle();
        const state = stateFor(entry);
        if (
          powered.kind !== "value" ||
          powered.value >= 0 ||
          fuel.kind !== "value" ||
          fuel.value === false ||
          fuel.value.length === 0 ||
          title.kind !== "value" ||
          state === undefined ||
          Number(state.on ?? 0) !== 0
        ) {
          return [];
        }
        const fuelRowsPresent = fuel.value.map(({ resourceId }) => {
          const rows = production?.consumption[resourceId];
          return rows !== undefined && Object.hasOwn(rows, title.value);
        });
        return [
          { entryKey: entry.entryKey, fuel: fuel.value, fuelRowsPresent },
        ];
      });
      const supportWithNoActiveState = structures.find((entry) => {
        const types = entry.readSupportTypes();
        const fuel = entry.readSupportFuel();
        const state = stateFor(entry);
        return (
          types.kind === "value" &&
          types.value.length > 0 &&
          fuel.kind === "value" &&
          fuel.value !== false &&
          fuel.value.length > 0 &&
          (state === undefined || Number(state.on ?? 0) === 0)
        );
      });
      const supportTypes = supportWithNoActiveState?.readSupportTypes();
      const supportFuel = supportWithNoActiveState?.readSupportFuel();
      const supportTitle = supportWithNoActiveState?.readTitle();
      const supportSourceKey =
        supportWithNoActiveState !== undefined && supportTitle?.kind === "value"
          ? `${supportTitle.value}+${supportWithNoActiveState.actionId}`
          : undefined;
      const hooks = globalThis.__EA_TEST_HOOKS__;
      hooks.samplePowerDemand();
      const cycle = hooks.readPowerCycle()?.cycle;
      const highTech = Number(root?.tech?.high_tech ?? 0);
      const rawOnCapabilities = structures.flatMap((entry) => {
        const state = stateFor(entry);
        if (!entry.ownsPowered || !state || !Object.hasOwn(state, "on"))
          return [];
        const requirements = entry.readPowerRequirements();
        const switchable = entry.readSwitchable();
        const requirementsMet =
          requirements.kind === "absent" ||
          (requirements.kind === "value" &&
            requirements.value.every(
              ({ techId, level }) =>
                Boolean(root?.tech?.[techId]) &&
                Number(root.tech[techId]) >= level,
            ));
        return [
          {
            actionId: entry.actionId,
            count: Number(state.count ?? 0),
            highTech,
            requirements,
            requirementsMet,
            switchable,
            manageable:
              (highTech >= 2 && requirementsMet) ||
              (switchable.kind === "value" && switchable.value),
            included:
              cycle?.buildings.some(
                (building) => building.binding === entry.actionId,
              ) ?? false,
          },
        ];
      });
      const rawOnExcludedCandidate = rawOnCapabilities.find(
        (entry) => entry.count > 0 && !entry.manageable,
      );
      return {
        captureComplete: capture.isComplete(),
        powerCycleCaptured: cycle !== undefined,
        highTech,
        rawOnCapabilities,
        rawOnExcludedCandidate,
        zeroOnGenerator: generators[0],
        zeroActiveSupportDefinition: supportWithNoActiveState
          ? {
              entryKey: supportWithNoActiveState.entryKey,
              hasState: stateFor(supportWithNoActiveState) !== undefined,
              fuel: supportFuel,
              provider: supportWithNoActiveState.readSupportProvider(),
              supportValue:
                supportTypes?.kind === "value"
                  ? supportWithNoActiveState.readSupportValue(
                      supportTypes.value[0],
                    )
                  : undefined,
              fuelRowsPresent:
                supportFuel?.kind === "value" &&
                supportFuel.value !== false &&
                supportSourceKey !== undefined
                  ? supportFuel.value.map(({ resourceId }) => {
                      const rows = production?.consumption[resourceId];
                      return (
                        rows !== undefined &&
                        Object.hasOwn(rows, supportSourceKey)
                      );
                    })
                  : [],
            }
          : undefined,
      };
    });
    assert.equal(inactiveFacts.captureComplete, true);
    assert.equal(inactiveFacts.powerCycleCaptured, true);
    assert.ok(Number.isFinite(inactiveFacts.highTech));
    assert.ok(inactiveFacts.rawOnCapabilities.length > 0);
    for (const capability of inactiveFacts.rawOnCapabilities) {
      assert.notEqual(capability.requirements.kind, "invalid");
      assert.notEqual(capability.switchable.kind, "invalid");
      if (!capability.manageable) {
        assert.equal(
          capability.included,
          false,
          `${capability.actionId}: raw on does not bypass the live state capability gate`,
        );
      }
    }
    if (inactiveFacts.rawOnExcludedCandidate) {
      assert.equal(inactiveFacts.rawOnExcludedCandidate.included, false);
    }
    assert.ok(inactiveFacts.zeroOnGenerator);
    assert.ok(inactiveFacts.zeroOnGenerator.fuel.length > 0);
    assert.deepEqual(
      inactiveFacts.zeroOnGenerator.fuelRowsPresent,
      inactiveFacts.zeroOnGenerator.fuelRowsPresent.map(() => false),
      "an off generator keeps its p_fuel definition but contributes no current fuel ledger row",
    );
    assert.ok(inactiveFacts.zeroActiveSupportDefinition);
    assert.ok(
      inactiveFacts.zeroActiveSupportDefinition.fuelRowsPresent.every(
        (present) => !present,
      ),
    );
    process.stdout.write(`${JSON.stringify({ inactiveFacts })}\n`);
  } finally {
    await earlySession.close();
  }
} finally {
  await runner.close();
  await rm(bundleDirectory, { recursive: true, force: true });
}
