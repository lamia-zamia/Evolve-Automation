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
      const numericRead = structures?.find(
        (entry) => typeof entry.readPowered() === "number",
      );
      return {
        captureComplete: capture.isComplete(),
        structureCount: structures?.length,
        uniqueEntryKeys: new Set(structures?.map((entry) => entry.entryKey))
          .size,
        sampleIdentity: numericRead
          ? {
              entryKey: numericRead.entryKey,
              region: numericRead.region,
              sector: numericRead.sector,
              struct: numericRead.struct,
              actionId: numericRead.actionId,
            }
          : undefined,
        samplePowered: numericRead?.readPowered(),
        fuelSample: numericRead?.readFuel(),
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
      };
    });

    assert.ok(mechanics, "document-start page capture exposes mechanics");
    assert.equal(mechanics.captureComplete, true);
    assert.ok(mechanics.structureCount > 0);
    assert.equal(mechanics.uniqueEntryKeys, mechanics.structureCount);
    assert.ok(mechanics.sampleIdentity);
    assert.ok(mechanics.productionResources >= 0);
    assert.ok(mechanics.consumptionResources >= 0);
    assert.equal(mechanics.mapSetIsNative, true);
    process.stdout.write(`${JSON.stringify(mechanics)}\n`);
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
