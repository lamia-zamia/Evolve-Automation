import assert from "node:assert/strict";

import { createRuntimeAdapters } from "../src/ui/runtime-adapters.ts";

const actionNames = [
  "buildActiveTargetsUI",
  "buildBuildPlannerUI",
  "buildScriptSettings",
  "createCraftToggles",
  "createBuildingToggles",
  "createStorageToggles",
  "createMarketToggles",
  "createEjectToggles",
  "createSupplyToggles",
  "createArpaToggles",
  "createMechInfo",
];

function makeContext(enabled = true) {
  const trace = [];
  const lengths = new Map();
  const jquery = (selector) => ({
    length: lengths.get(selector) ?? 0,
    next: () => ({ length: 0 }),
    parent: () => ({ append() {} }),
    eq: (index) => ({ click: () => trace.push(`click:${index}`) }),
  });
  return {
    trace,
    lengths,
    jquery,
    settings: { hellTurnOffLogMessages: enabled },
    settingsRaw: Object.fromEntries(
      [
        "activeTargetsUI",
        "buildPlannerUI",
        "showSettings",
        "autoCraft",
        "autoBuild",
        "autoStorage",
        "autoMarket",
        "autoEject",
        "autoSupply",
        "autoARPA",
        "autoMech",
      ].map((key) => [key, enabled]),
    ),
    state: { buildingToggles: 2 },
    game: {
      global: {
        settings: {
          showStorage: enabled,
          showMarket: enabled,
          showEjector: enabled,
          showCargo: enabled,
          showGenetics: enabled,
          showMechLab: enabled,
        },
        portal: { fortress: { notify: "Yes", s_ntfy: "Yes" } },
      },
    },
    actions: Object.fromEntries(
      actionNames.map((name) => [name, () => trace.push(name)]),
    ),
  };
}

let context = makeContext();
context.lengths.set("#mechList .ea-mech-info", 1);
context.lengths.set("#mechList .mechRow", 2);
const { repairRuntimeAdapters } = createRuntimeAdapters({
  getSettings: () => context.settings,
  getSettingsRaw: () => context.settingsRaw,
  getState: () => context.state,
  getGame: () => context.game,
  getJQuery: () => context.jquery,
  getActions: () => context.actions,
});

const scriptTrace = [];
const scriptNode = {
  length: 1,
  next: () => ({ length: 1 }),
  parent: () => ({ append: () => scriptTrace.push("reordered") }),
  eq: () => ({ click() {} }),
};
assert.equal(repairRuntimeAdapters(scriptNode), true);
assert.deepEqual(scriptTrace, ["reordered"]);
assert.deepEqual(context.trace, [...actionNames, "click:0", "click:1"]);

// Every context object is live; a replacement with all features disabled is inert.
const stale = context;
context = makeContext(false);
assert.equal(
  repairRuntimeAdapters({ ...scriptNode, next: () => ({ length: 0 }) }),
  false,
);
assert.deepEqual(context.trace, []);
assert.equal(stale.trace.length, actionNames.length + 2);

// A nonzero but stale building-toggle count still triggers repair when it differs from state.
context = makeContext(false);
context.settingsRaw.autoBuild = true;
context.lengths.set("#mTabCivil .ea-building-toggle", 1);
repairRuntimeAdapters({ ...scriptNode, next: () => ({ length: 0 }) });
assert.deepEqual(context.trace, ["createBuildingToggles"]);

console.log("Runtime adapter module tests passed");
