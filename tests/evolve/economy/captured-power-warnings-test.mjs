import assert from "node:assert/strict";
import { createCapturedPowerWarnings } from "../../../src/adapters/evolve/economy/production/captured-power-warnings.ts";
import { planPowerWarningShutdown } from "../../../src/domain/economy/production/power.ts";

for (const [region, id] of [
  ["city", "coal_power"],
  ["space", "geothermal"],
  ["interstellar", "fusion"],
  ["galaxy", "minelayer"],
  ["portal", "attractor"],
  ["tauceti", "fusion_generator"],
  ["eden", "spirit_vacuum"],
]) {
  const binding = `${region}-${id}`;
  const root = {
    race: {},
    tech: { high_tech: 2 },
    resource: { Lake_Support: { max: 0 } },
    [region]: { [id]: { count: 2, on: 2 } },
  };
  const definition = {
    entryKey: `${region}.test.${id}`,
    region,
    sector: "test",
    struct: id,
    actionId: binding,
    readTitle: () => ({ kind: "value", value: id }),
    readAvailability: () => ({ kind: "value", value: true }),
    ownsPowered: true,
    readPowered: () => ({ kind: "value", value: 1 }),
    readPowerRequirements: () => ({ kind: "absent" }),
    readSwitchable: () => ({ kind: "absent" }),
    readSupport: () => ({ kind: "absent" }),
  };
  const settings = { [`bld_s_${binding}`]: false };
  const warnings = createCapturedPowerWarnings({
    rootState: { readRoot: () => root },
    mechanics: { readStructures: () => [definition] },
    controls: { capturedElementIds: () => [binding], resolve: () => undefined },
    readSettings: () => settings,
    getDocument: () => ({
      querySelectorAll: () => [{ parentElement: { id: binding } }],
    }),
  });
  assert.deepEqual(warnings.readWarnedBuildingDomIds(), [binding]);
  const [warning] = warnings.readWarnings([binding]);
  assert.ok(warning, binding);
  assert.equal(warning.domId, binding);
  assert.equal(warning.buildingId, id);
  assert.equal(warning.binding, binding);
  assert.equal(warning.autoStateEnabled, false);
  assert.equal(
    planPowerWarningShutdown([warning]),
    null,
    "full-binding disabled state prevents shutdown",
  );
  settings[`bld_s_${binding}`] = true;
  assert.equal(
    planPowerWarningShutdown(warnings.readWarnings([binding]))?.binding,
    binding,
  );
}
console.log("Captured Power warning identity tests passed");

for (const [region, id, anchorId, supportType] of [
  ["portal", "bireme", "harbor", "lake"],
  ["space", "elerium_ship", "space_station", "belt"],
]) {
  const binding = `${region}-${id}`;
  const anchorBinding = `${region}-${anchorId}`;
  const anchor = { count: 2, on: 1, support: 3, s_max: 4 };
  const supportRoot = {
    race: {},
    tech: { high_tech: 2 },
    civic: { space_miner: { workers: 5 } },
    support: { [supportType]: [`${supportType}:${id}`] },
    [region]: { [id]: { count: 2, on: 2 }, [anchorId]: anchor },
  };
  const definition = (struct) => ({
    entryKey: `${supportType}:${struct}`,
    region,
    sector: supportType,
    struct,
    actionId: `${region}-${struct}`,
    readTitle: () => ({ kind: "value", value: struct }),
    readAvailability: () => ({ kind: "value", value: true }),
    ownsPowered: true,
    readPowered: () => ({ kind: "value", value: 1 }),
    readPowerRequirements: () => ({ kind: "absent" }),
    readSupport: () => ({
      kind: "value",
      value: struct === id ? -1 : 1,
    }),
    readSupportTypes: () => ({ kind: "value", value: [supportType] }),
    readSupportProvider: () => ({ kind: "absent" }),
    readSupportValue: () => ({
      kind: "value",
      value: struct === id ? -1 : supportType === "belt" ? 4 : 1,
    }),
    readSupportTopology: () => ({
      kind: "value",
      value: {
        anchorEntryKey: `${supportType}:${anchorId}`,
        unlimited: false,
        enabled: { kind: "value", value: true },
      },
    }),
  });
  const supportDefinitions = [definition(id), definition(anchorId)];
  const supportWarnings = createCapturedPowerWarnings({
    rootState: { readRoot: () => supportRoot },
    mechanics: {
      readStructures: () => supportDefinitions,
      readEffectivePowerCount: () => ({ kind: "value", value: 1 }),
      readSupportOrder: () => ({
        kind: "value",
        value: [supportDefinitions[0]],
      }),
    },
    controls: {
      capturedElementIds: () => [binding, anchorBinding],
      resolve: () => undefined,
    },
    readSettings: () => ({ [`bld_s_${binding}`]: true }),
    getDocument: () => ({
      querySelectorAll: () => [{ parentElement: { id: binding } }],
    }),
  });
  const [surplus] = supportWarnings.readWarnings([binding]);
  assert.ok(surplus);
  if (supportType === "lake") {
    assert.equal(surplus.lakeSupportNeeded, 3);
    assert.equal(surplus.lakeSupportMaximum, 4);
    assert.equal(
      planPowerWarningShutdown([surplus]),
      null,
      "Lake warning survives when native anchor has spare support",
    );
    anchor.support = 5;
    const [shortage] = supportWarnings.readWarnings([binding]);
    assert.equal(shortage.lakeSupportNeeded, 5);
    assert.equal(
      planPowerWarningShutdown([shortage])?.binding,
      binding,
      "Lake shortage shuts down through shared support ownership",
    );
  } else {
    assert.equal(surplus.beltSupportNeeded, 3);
    assert.equal(
      surplus.beltSupportMaximum,
      4,
      "Belt warning uses effective native station support capacity",
    );
    assert.equal(
      planPowerWarningShutdown([surplus]),
      null,
      "Belt ship remains excluded from generic warning shutdown",
    );
  }
}
