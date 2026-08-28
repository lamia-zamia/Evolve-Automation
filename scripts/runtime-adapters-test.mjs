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
  const counts = new Map();
  const asked = [];
  const jquery = (selector) => ({
    length: lengths.get(selector) ?? 0,
    next: () => ({ length: 0 }),
    parent: () => ({ append() {} }),
    eq: (index) => ({ click: () => trace.push(`click:${index}`) }),
  });
  // The repair pass counts its own nodes inside a named container rather than
  // running a descendant selector; the surface reports 0 for an absent one.
  const uiSurface = {
    countByClassIn(containerId, className) {
      const key = `${containerId} ${className}`;
      asked.push(key);
      return counts.get(key) ?? 0;
    },
  };
  return {
    trace,
    lengths,
    counts,
    asked,
    jquery,
    uiSurface,
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
context.counts.set("mechList ea-mech-info", 1);
context.counts.set("mechList mechRow", 2);
const { repairRuntimeAdapters } = createRuntimeAdapters({
  getSettings: () => context.settings,
  getSettingsRaw: () => context.settingsRaw,
  getState: () => context.state,
  getGame: () => context.game,
  getJQuery: () => context.jquery,
  getUiSurface: () => context.uiSurface,
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
context.counts.set("mTabCivil ea-building-toggle", 1);
repairRuntimeAdapters({ ...scriptNode, next: () => ({ length: 0 }) });
assert.deepEqual(context.trace, ["createBuildingToggles"]);

// The panels are counted by container and class, never by descendant selector:
// a `#container .class` lookup re-parses and re-walks the subtree every tick.
context = makeContext();
repairRuntimeAdapters({ ...scriptNode, next: () => ({ length: 0 }) });
assert.deepEqual(context.asked, [
  "resources ea-craft-toggle",
  "mTabCivil ea-building-toggle",
  "resStorage ea-storage-toggle",
  "market ea-market-toggle",
  "resEjector ea-eject-toggle",
  "resCargo ea-supply-toggle",
  "arpaPhysics ea-arpa-toggle",
  "mechList ea-mech-info",
  "mechList mechRow",
]);

console.log("Runtime adapter module tests passed");
