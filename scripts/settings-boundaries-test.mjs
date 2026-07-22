import assert from "node:assert/strict";

import { createPrestigeSettings } from "../src/ui/prestige-settings.ts";
import { createEvolutionSettings } from "../src/ui/evolution-settings.ts";

const specs = [
  [
    "prestige",
    createPrestigeSettings,
    "buildPrestigeSettings",
    "updatePrestigeSettingsContent",
    "prestige",
    "Prestige",
    true,
    [],
  ],
  [
    "evolution",
    createEvolutionSettings,
    "buildEvolutionSettings",
    "updateEvolutionSettingsContent",
    "evolution",
    "Evolution",
    false,
    ["checkbox:autoEvolution"],
  ],
];

const resetName = (name) =>
  `reset${name[0].toUpperCase() + name.slice(1)}Settings`;

for (const [
  name,
  factory,
  buildName,
  updateName,
  id,
  label,
  secondary,
  cleanup,
] of specs) {
  const trace = [];
  const context = {
    [resetName(name)]: (reset) => trace.push(`reset:first:${reset}`),
    updateSettingsFromState: () => trace.push("persist"),
    resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
    removeMechInfo: () => trace.push("remove:mechInfo"),
    removeEjectToggles: () => trace.push("remove:ejectToggles"),
    removeSupplyToggles: () => trace.push("remove:supplyToggles"),
    removeMarketToggles: () => trace.push("remove:marketToggles"),
  };
  const overrides = {
    [updateName]: (...args) => trace.push(`update:${args.join("|")}`),
  };
  let registration;
  context.buildSettingsSection = (...args) => (registration = args);
  context.buildSettingsSection2 = (...args) => (registration = args);
  const boundary = factory({
    getDependency: (dependency) => context[dependency],
    getOverride: (functionName) => overrides[functionName],
  });

  assert.equal(typeof boundary[buildName], "function");
  assert.equal(typeof boundary[updateName], "function");
  const parent = {};
  if (secondary) boundary[buildName](parent, "");
  else boundary[buildName]();

  assert.equal(registration[secondary ? 2 : 0], id);
  assert.equal(registration[secondary ? 3 : 1], label);
  const reset = registration[secondary ? 4 : 2];
  const registeredUpdate = registration[secondary ? 5 : 3];
  assert.equal(registeredUpdate, boundary[updateName]);

  context[resetName(name)] = (value) => trace.push(`reset:second:${value}`);
  reset();
  assert.deepEqual(trace, [
    "reset:second:true",
    "persist",
    "update:",
    ...cleanup,
  ]);
}

console.log("2 settings-boundary module tests passed");
