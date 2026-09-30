import assert from "node:assert/strict";

import { createChromiumRunner } from "../tools/chromium-evolve-runner.mjs";

const runner = await createChromiumRunner();
try {
  const session = await runner.openSession({
    save: null,
    settings: {},
    seed: 42,
  });
  try {
    await session.advance(4);
    const mechanics = await session.evaluate(() => {
      const capture = globalThis[Symbol.for("evolve-automation.page-capture")];
      if (!capture || !capture.mechanics) return undefined;
      const structures = capture.mechanics.readStructures();
      const production = capture.mechanics.readProductionBreakdown();
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
      return {
        captureComplete: capture.isComplete(),
        structureCount: structures?.length,
        uniqueEntryKeys: new Set(structures?.map((entry) => entry.entryKey))
          .size,
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
    process.stdout.write(`${JSON.stringify(mechanics)}\n`);
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
