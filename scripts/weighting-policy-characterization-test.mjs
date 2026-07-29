import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  cloneInto: (value) => value,
  console,
  localStorage: { getItem: () => null },
  Math,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  unsafeWindow: {},
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const policy = hooks.weightingPolicy;
assert.ok(policy, "weighting policy hook missing");
assert.deepEqual(Array.from(Object.keys(policy)), [
  "authorityCapBuildings",
  "INFLATION_CHALLENGE_MONEY",
  "RETIREMENT_PREP",
  "inflationMoneyStorageBuildings",
  "inflationMoneyIncomeBuildings",
  "galaxyCombatShips",
  "weightingRules",
]);
assert.equal(policy.INFLATION_CHALLENGE_MONEY, 250_000_000_000);
assert.deepEqual(
  { ...policy.RETIREMENT_PREP },
  {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200_000_000,
  },
);
const rulePhases = ["enabled", "match", "describe", "multiplier"];
assert.equal(
  policy.weightingRules.every(
    (rule) =>
      typeof rule.id === "string" &&
      rule.id !== "" &&
      rulePhases.every((phase) => typeof rule[phase] === "function"),
  ),
  true,
);

// Ordered rule identities. Rule order is still significant: the executor stops
// applying rules as soon as a candidate's weighting reaches zero.
assert.deepEqual(
  Array.from(policy.weightingRules, (rule) => rule.id),
  [
    "autobuild-off",
    "locked",
    "queued-target",
    "trigger-target",
    "autobuild-disabled",
    "maximum-amount-reached",
    "unaffordable",
    "truepath-test-launch-sabotage",
    "eris-digsite-unsecured",
    "andromeda-miners-disabled",
    "piracy-fully-supressed",
    "piracy-covered-by-fleet",
    "mech-supply-saving",
    "prestige-unneeded-ascension-towers",
    "gate-supression-too-low",
    "saving-soul-gems-for-prestige",
    "best-freighter",
    "lake-transport-vs-bireme",
    "spire-port-vs-base-camp",
    "spire-waygate-done",
    "spire-edenic-gate-done",
    "elysium-fire-support-base-blocked",
    "warehouse-cap",
    "spire-sphinx-done",
    "assembling-not-possible",
    "no-empty-housings",
    "embassy-knowledge-required",
    "wrong-shrine",
    "slave-market-blocked",
    "sacrificial-altar-blocked",
    "missing-consumption",
    "missing-support",
    "useless-support",
    "tau-belt-ship-efficiency",
    "womling-overlord-guard",
    "authority-cap",
    "banana-republic-objective",
    "inflation-money",
    "retirement-preparation",
    "achievement-guard",
    "non-operating-city-buildings",
    "non-operating-buildings",
    "geck-limit",
    "prestige-blocked-eden",
    "prestige-blocked-ignition",
    "prestige-unneeded",
    "prestige-unneeded-bioseed",
    "prestige-unneeded-whitehole",
    "prestige-unneeded-vacuum",
    "prestige-unneeded-ascension-missions",
    "prestige-unneeded-witch-hunter",
    "prestige-unneeded-terraform",
    "awaiting-mad-prestige",
    "new-building",
    "need-more-energy",
    "no-need-for-more-energy",
    "not-enough-energy",
    "no-need-for-more-knowledge",
    "need-more-knowledge",
    "unused-ejectors",
    "unused-storage",
    "need-more-fuel-production",
    "need-more-fuel-storage",
    "horseshoes-useless",
    "meditation-space-unneeded",
    "gate-demons-supressed",
    "need-more-storage",
    "no-more-houses-needed",
    "destroyed-after-impact",
    "randomized-weighting",
    "solar-system-building",
    "vacuum-collapse-mana-producer",
  ],
);

function normalizeFunctionSource(fn) {
  return fn
    .toString()
    .replace(/\b([A-Za-z_$][A-Za-z0-9_$]*?)\d+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
const ruleSourceHash = createHash("sha256")
  .update(
    JSON.stringify(
      policy.weightingRules.map((rule) => [
        rule.id,
        ...rulePhases.map((phase) => normalizeFunctionSource(rule[phase])),
      ]),
    ),
  )
  .digest("hex");
const bindings = (items) => Array.from(items, (item) => item._vueBinding);
assert.deepEqual(
  {
    rules: policy.weightingRules.length,
    hash: ruleSourceHash,
    authority: bindings(policy.authorityCapBuildings),
    storage: bindings(policy.inflationMoneyStorageBuildings),
    income: bindings(policy.inflationMoneyIncomeBuildings),
    ships: bindings(policy.galaxyCombatShips),
  },
  {
    rules: 72,
    hash: "c715f972c8ff301239e7eef0867ab59f987c39dd16c9ee10cc57bd592cff14e6",
    authority: [
      "city-garrison",
      "city-temple",
      "space-space_barracks",
      "interstellar-cruiser",
      "space-space_station",
      "portal-brute",
      "portal-minions",
      "portal-throne",
      "eden-bunker",
    ],
    storage: [
      "city-bank",
      "city-casino",
      "space-spc_casino",
      "space-titan_bank",
      "tauceti-tauceti_casino",
      "interstellar-exchange",
      "portal-vault",
      "portal-war_vault",
      "portal-hell_casino",
      "eden-eternal_bank",
    ],
    income: [
      "city-tourist_center",
      "city-casino",
      "space-spc_casino",
      "tauceti-tauceti_casino",
      "interstellar-luxury_condo",
      "portal-hell_casino",
    ],
    ships: [
      "galaxy-scout_ship",
      "galaxy-corvette_ship",
      "galaxy-frigate_ship",
      "galaxy-cruiser_ship",
      "galaxy-dreadnought",
    ],
  },
);
console.log("Weighting policy bundled characterization tests passed");
