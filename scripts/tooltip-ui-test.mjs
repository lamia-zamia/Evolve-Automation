import assert from "node:assert/strict";

import { createTooltipUI } from "../src/ui/tooltips.ts";

const appended = [];
const observed = [];
const jquery = (node) => ({
  append(value) {
    appended.push({ node, value });
    return this;
  },
  find() {
    return this;
  },
});
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

let settings = { masterScriptToggle: true, autoARPA: true, autoBuild: true };
const technology = { kind: "technology", cost: {}, isResearched: () => false };
const buildings = {
  AlphaExchange: { title: "Exchange" },
  Hospital: { id: "Hospital" },
  DwarfShipyard: { id: "Shipyard" },
};
const state = {
  queuedTargetsAll: [technology],
  triggerTargets: [],
  tooltips: { custom: "Custom note" },
};
const context = {
  $: jquery,
  document: { hidden: false },
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(node) {
      observed.push(node);
    }
    disconnect() {}
  },
  settings,
  state,
  game: { global: { race: {}, stats: { achieve: {} }, tech: {} } },
  buildings,
  jobs: {},
  resources: { Power: { maxQuantity: 9 } },
  techIds: { tech: technology },
  buildingIds: {},
  arpaIds: {},
  MechManager: { initLab: () => false },
  FleetManagerOuter: { nextShipMsg: "Next ship: scout" },
  poly: { timeFormat: (value) => `time:${value}` },
  getCitadelConsumption: () => 0,
  getNiceNumber: (value) => `nice:${value}`,
  getCostConflict: () => undefined,
  getTechConflict: () => undefined,
  haveTech: () => false,
  getHealingRate: () => 12,
  getGrowthRate: () => 0.5,
  getGovernor: () => "",
  traitVal: () => 1,
};

const tooltips = createTooltipUI({
  getContext: () => ({ ...context, settings }),
  isTechnology: (value) => value.kind === "technology",
});

assert.equal(
  tooltips.getTooltipInfo(technology),
  "Queued research, processing...",
);
state.queuedTargetsAll = [];
context.getCostConflict = () => ({
  status: "unavailable",
  reason: "invalid-resource",
});
assert.equal(
  tooltips.getTooltipInfo(technology),
  "Cost reservation data unavailable; action blocked for safety",
);
context.getCostConflict = () => undefined;
state.queuedTargetsAll = [technology];
assert.equal(
  tooltips.getTooltipInfo(buildings.Hospital),
  "~nice:12 soldiers healed per day<br>~nice:0.5 seconds to increase population",
);
settings = { ...settings, autoFleet: true };
assert.equal(
  tooltips.getTooltipInfo(buildings.DwarfShipyard),
  "Next ship: scout",
);

tooltips.addTooltip({ dataset: { id: "custom" } });
assert.match(appended.at(-1).value, /Custom note/);
appended.length = 0;
tooltips.addTooltip({ dataset: { id: "tech" } });
assert.match(appended.at(-1).value, /Queued research/);

const popper = {
  id: "popper",
  dataset: { id: "custom" },
  querySelector: () => null,
};
tooltips.tooltipObserverCallback([{ addedNodes: [popper] }]);
assert.equal(observed[0], popper);
settings = { ...settings, masterScriptToggle: false };
observed.length = 0;
tooltips.tooltipObserverCallback([{ addedNodes: [popper] }]);
assert.equal(observed.length, 0);

console.log("Tooltip UI module tests passed");
