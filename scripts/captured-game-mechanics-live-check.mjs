import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
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

  const prioritySettings = Object.create(null);
  const priorityCandidates = [...mechanics.managedCandidates].reverse();
  for (let index = 0; index < priorityCandidates.length; index++) {
    const { binding } = priorityCandidates[index];
    prioritySettings[`bld_s_${binding}`] = true;
    prioritySettings[`bld_p_${binding}`] = index;
  }
  const cycleSession = await runner.openSession({
    bundle: testBundle,
    save,
    settings: prioritySettings,
    seed: 42,
  });
  try {
    await cycleSession.advance(4);
    const captured = await cycleSession.evaluate(() => {
      const hooks = globalThis.__EA_TEST_HOOKS__;
      if (!hooks || typeof hooks.readPowerCycle !== "function")
        return undefined;
      const result = hooks.readPowerCycle();
      if (!result) return undefined;
      return {
        buildingCount: result.cycle.buildings.length,
        positivePower: result.cycle.buildings.filter(
          (building) => building.powered > 0,
        ).length,
        negativePower: result.cycle.buildings.filter(
          (building) => building.powered < 0,
        ).length,
        resourceCount: result.cycle.resources.length,
        plannerReturned: Boolean(result.plan && result.plan.nextState),
        decisionKind: result.plan.decision?.kind ?? null,
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
    assert.deepEqual(
      captured.buildingOrder,
      priorityCandidates.map(({ binding }) => binding),
      "the captured cycle follows stored building priorities rather than root.power",
    );
    process.stdout.write(
      `${JSON.stringify({ capturedPowerCycle: captured })}\n`,
    );
  } finally {
    await cycleSession.close();
  }

  const earlySave = parseSave(
    await readFile(
      resolve("test-artifacts/benchmark/saves/ds-early-bootstrap.json"),
      "utf8",
    ),
  );
  const earlySession = await runner.openSession({
    save: earlySave,
    settings: {},
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
      return {
        captureComplete: capture.isComplete(),
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
