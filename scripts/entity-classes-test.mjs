import assert from "node:assert/strict";
import { createEntityClasses } from "../src/game/entities.ts";

const dependencyNames = [
  "$",
  "arpaIds",
  "buildingIds",
  "buildings",
  "checkAffordableCustom",
  "checkTypes",
  "conflictingTraits",
  "document",
  "fanatAchievements",
  "Fibonacci",
  "game",
  "GameLog",
  "getAchievementStar",
  "getCitadelConsumption",
  "getStarLevel",
  "getVueById",
  "haveTask",
  "haveTech",
  "jobs",
  "KeyManager",
  "logIgnore",
  "logPrestige",
  "MutableTraitManager",
  "mutationCostMultipliers",
  "mutationCostMultipliersGenus",
  "normalizeProperties",
  "poly",
  "races",
  "resources",
  "retBools",
  "settings",
  "settingsRaw",
  "specialRaceTraits",
  "state",
  "techIds",
  "ticksPerSecond",
  "traitVal",
  "TriggerManager",
  "WarManager",
  "win",
  "WindowManager",
];

const context = Object.fromEntries(dependencyNames.map((name) => [name, {}]));
Object.assign(context, {
  $: () => ({}),
  checkAffordableCustom: () => true,
  Fibonacci: (value) => value,
  getAchievementStar: () => 0,
  getCitadelConsumption: () => 0,
  getStarLevel: () => 0,
  getVueById: () => undefined,
  haveTask: () => false,
  haveTech: () => false,
  logPrestige: () => {},
  normalizeProperties: (flags) => flags,
  ticksPerSecond: () => 10,
  traitVal: (_name, fallback) => fallback,
  settings: { craftIron: true },
  settingsRaw: {},
  game: {
    global: {
      civic: { farmer: { job: "farmer", name: "Farmer", display: true } },
      resource: { Iron: {} },
    },
  },
});

const dependencies = Object.fromEntries(
  dependencyNames.map((name) => [name, () => context[name]]),
);
const classes = createEntityClasses({ dependencies });

assert.equal(Object.keys(classes).length, 32);
assert.equal(classes.BasicJob.prototype instanceof classes.Job, true);
assert.equal(classes.SoulGem.prototype instanceof classes.Resource, true);
assert.equal(classes.CityAction.prototype instanceof classes.Action, true);

const job = new classes.Job("farmer", "fallback", { basic: true });
assert.equal(job.name, "Farmer");
assert.equal(job.is.basic, true);

context.game = {
  global: {
    civic: {
      farmer: { job: "farmer", name: "Live Farmer", display: true },
    },
    resource: { Iron: {} },
  },
};
assert.equal(job.name, "Live Farmer");

const resource = new classes.Resource("Iron", "Iron", { tradable: true });
assert.equal(resource.autoCraftEnabled, true);
context.settings = { craftIron: false };
assert.equal(resource.autoCraftEnabled, false);

context.normalizeProperties = (flags) => ({ wrapped: flags });
const nextJob = new classes.Job("farmer", "fallback", { basic: true });
assert.equal(nextJob.is.wrapped.basic, true);

console.log("Entity classes module tests passed");
