import assert from "node:assert/strict";

import { createGeneralSettings } from "../src/ui/general-settings.ts";
import { createPrestigeSettings } from "../src/ui/prestige-settings.ts";
import { createGovernmentSettings } from "../src/ui/government-settings.ts";
import { createAuthoritySettings } from "../src/ui/authority-settings.ts";
import { createEvolutionSettings } from "../src/ui/evolution-settings.ts";
import { createPlanetSettings } from "../src/ui/planet-settings.ts";
import { createTriggerSettings } from "../src/ui/trigger-settings.ts";
import { createResearchSettings } from "../src/ui/research-settings.ts";
import { createWarSettings } from "../src/ui/war-settings.ts";
import { createHellSettings } from "../src/ui/hell-settings.ts";
import { createFleetSettings } from "../src/ui/fleet-settings.ts";
import { createMechSettings } from "../src/ui/mech-settings.ts";
import { createEjectorSettings } from "../src/ui/ejector-settings.ts";
import { createMarketSettings } from "../src/ui/market-settings.ts";

const specs = [
  [
    "general",
    createGeneralSettings,
    "buildGeneralSettings",
    "updateGeneralSettingsContent",
    "general",
    "General",
    false,
    ["checkbox:masterScriptToggle|showSettings|autoPrestige"],
  ],
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
    "government",
    createGovernmentSettings,
    "buildGovernmentSettings",
    "updateGovernmentSettingsContent",
    "government",
    "Government",
    true,
    ["checkbox:autoTax|autoGovernment"],
  ],
  [
    "authority",
    createAuthoritySettings,
    "buildAuthoritySettings",
    "updateAuthoritySettingsContent",
    "authority",
    "Authority",
    false,
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
  [
    "planet",
    createPlanetSettings,
    "buildPlanetSettings",
    "updatePlanetSettingsContent",
    "planet",
    "Planet Weighting",
    false,
    [],
  ],
  [
    "trigger",
    createTriggerSettings,
    "buildTriggerSettings",
    "updateTriggerSettingsContent",
    "trigger",
    "Trigger",
    false,
    ["checkbox:autoTrigger"],
  ],
  [
    "research",
    createResearchSettings,
    "buildResearchSettings",
    "updateResearchSettingsContent",
    "research",
    "Research",
    false,
    ["checkbox:autoResearch"],
  ],
  [
    "war",
    createWarSettings,
    "buildWarSettings",
    "updateWarSettingsContent",
    "war",
    "Foreign Affairs",
    true,
    ["checkbox:autoFight"],
  ],
  [
    "hell",
    createHellSettings,
    "buildHellSettings",
    "updateHellSettingsContent",
    "hell",
    "Hell",
    true,
    ["checkbox:autoHell"],
  ],
  [
    "fleet",
    createFleetSettings,
    "buildFleetSettings",
    "updateFleetSettingsContent",
    "fleet",
    "Fleet",
    true,
    ["checkbox:autoFleet"],
  ],
  [
    "mech",
    createMechSettings,
    "buildMechSettings",
    "updateMechSettingsContent",
    "mech",
    "Mech & Spire",
    false,
    ["checkbox:autoMech", "remove:mechInfo"],
  ],
  [
    "ejector",
    createEjectorSettings,
    "buildEjectorSettings",
    "updateEjectorSettingsContent",
    "ejector",
    "Ejector, Supply & Nanite",
    false,
    [
      "checkbox:autoEject|autoSupply|autoNanite",
      "remove:ejectToggles",
      "remove:supplyToggles",
    ],
  ],
  [
    "market",
    createMarketSettings,
    "buildMarketSettings",
    "updateMarketSettingsContent",
    "market",
    "Market",
    false,
    ["checkbox:autoMarket|autoGalaxyMarket", "remove:marketToggles"],
  ],
];

const resetName = (name) =>
  `reset${name[0].toUpperCase() + name.slice(1)}Settings`;

let generalFixture;
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

  if (name === "general") {
    generalFixture = { boundary, context, overrides };
  }
}

const renderTrace = [];
delete generalFixture.overrides.updateGeneralSettingsContent;
generalFixture.context.document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 19 },
};
generalFixture.context.$ = (selector) => ({
  empty() {
    renderTrace.push(`first:empty:${selector}`);
    return this;
  },
  off(events) {
    renderTrace.push(`first:off:${events}`);
    return this;
  },
});
for (const helper of [
  "addSettingsHeader1",
  "addSettingsNumber",
  "addSettingsSelect",
  "addSettingsString",
  "addSettingsToggle",
]) {
  generalFixture.context[helper] = (_node, key) =>
    renderTrace.push(`first:${helper}:${key}`);
}
generalFixture.boundary.updateGeneralSettingsContent();
assert.ok(renderTrace.includes("first:addSettingsNumber:tickRate"));
assert.equal(generalFixture.context.document.documentElement.scrollTop, 19);

renderTrace.length = 0;
generalFixture.context.document = {
  documentElement: { scrollTop: 27 },
  body: { scrollTop: 3 },
};
generalFixture.context.$ = (selector) => ({
  empty() {
    renderTrace.push(`second:empty:${selector}`);
    return this;
  },
  off(events) {
    renderTrace.push(`second:off:${events}`);
    return this;
  },
});
for (const helper of [
  "addSettingsHeader1",
  "addSettingsNumber",
  "addSettingsSelect",
  "addSettingsString",
  "addSettingsToggle",
]) {
  generalFixture.context[helper] = (_node, key) =>
    renderTrace.push(`second:${helper}:${key}`);
}
generalFixture.boundary.updateGeneralSettingsContent();
assert.ok(renderTrace.every((entry) => entry.startsWith("second:")));
assert.equal(generalFixture.context.document.body.scrollTop, 27);

console.log("14 settings-boundary module tests passed");
