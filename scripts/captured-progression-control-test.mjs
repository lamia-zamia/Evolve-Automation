import assert from "node:assert/strict";
import { createCapturedProgressionControl } from "../src/bootstrap/captured-progression-control.ts";
import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const control = createCapturedProgressionControl({
  rootState: {
    readRoot: () => undefined,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [],
  },
  mountSuppression: {
    begin: () => undefined,
  },
  panels: { open: () => undefined },
  drawnActions: {
    read: () => [],
    exists: () => false,
  },
  drawnProjects: {
    read: () => undefined,
    exists: () => false,
  },
  getBuildingManager: () => {
    throw new Error("must not read the manager before a cycle");
  },
  readSettings: () => ({}),
  getState: () => ({}),
  getResources: () => ({}),
  nowMs: () => 0,
});

assert.deepEqual(control.runConstructionCycle(), {
  status: "rejected",
  failure: {
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  },
});
assert.deepEqual(control.runResearchCycle(), {
  status: "rejected",
  failure: {
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  },
});
assert.deepEqual(control.readUnlockedStorageBuildTargets(), []);

let root = {
  settings: { civTabs: 3 },
  race: {},
  tech: {},
  resource: {
    Knowledge: { amount: 0, max: 100, display: true },
    Polymer: { amount: 0, max: 100, display: true, stackable: true },
  },
};
let nowMs = 0;
const unavailable = [];
let researchPanelVisible = true;
let offeredRows = [{ id: "tech-mining", cost: { Knowledge: 5 } }];
let researchDraws = 0;
const rootReplacementListeners = [];
const techHandles = new Map([
  ["tech-mining", { elementId: "tech-mining", generation: 1 }],
]);
const researchControl = createCapturedProgressionControl({
  rootState: {
    readRoot: () => root,
    subscribeRootReplaced: (listener) => {
      rootReplacementListeners.push(listener);
      return () => {};
    },
  },
  controls: {
    resolve: (id) => techHandles.get(id),
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [...techHandles.keys()],
  },
  mountSuppression: { available: false, withoutMounting: () => undefined },
  panels: { open: () => ({ close: () => {} }) },
  drawnActions: {
    exists: (selector) => selector === "#tech" && researchPanelVisible,
    read: (selector) => {
      if (selector === "#tech .action") {
        researchDraws += 1;
        return offeredRows;
      }
      return [{ id: "tech-old-mining", cost: {} }];
    },
  },
  drawnProjects: { read: () => undefined, exists: () => false },
  readSettings: () => ({}),
  needGrantedTechs: () => true,
  onUnavailable: (reason) => unavailable.push(reason),
  nowMs: () => nowMs,
});
const demand = createCapturedResourceDemand({
  rootState: { readRoot: () => root },
  reservations: {
    readReservations: () => ({ targets: [], unavailable: false }),
  },
  readOfferedTechs: researchControl.readOfferedTechs,
  readSettings: () => ({ researchRequest: false }),
});

assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-mining"],
  unavailable.join("; "),
);
assert.deepEqual([...researchControl.readGrantedTechs()], ["tech-old-mining"]);

// A processed cycle starts with no carried offer. Its one sample remains coherent for Storage
// and later Research even when the discovery scope's ordinary age expires.
researchControl.beginProcessedCycle?.();
assert.equal(researchControl.readOfferedTechs(), undefined);
offeredRows = [
  { id: "tech-current-cycle", cost: { Knowledge: 5, Polymer: 700 } },
];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-current-cycle"],
);
assert.equal(researchDraws, 2);
assert.equal(demand.sample().storageRequired("Polymer"), 721);
offeredRows = [{ id: "tech-redrawn-later", cost: { Knowledge: 5 } }];
nowMs = 20_000;
researchControl.runResearchCycle();
assert.equal(
  researchControl.readOfferedTechs()?.[0]?.elementId,
  "tech-current-cycle",
);
assert.equal(researchDraws, 2);

// Research progression changes the epoch, so the next current-cycle reader must sample the game's
// newly offered technology instead of keeping the pre-action catalog indefinitely.
root.tech["research-completed"] = 1;
offeredRows = [
  { id: "tech-after-progression", cost: { Knowledge: 5, Polymer: 800 } },
];
assert.equal(researchControl.readOfferedTechs(), undefined);
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-after-progression"],
);
assert.equal(researchDraws, 3);
assert.equal(demand.sample().storageRequired("Polymer"), 824);

// A changed research-control generation means the current panel can describe a replacement offer;
// invalidate the previous ids/prices and capture the replacement once.
techHandles.set("tech-after-progression", {
  elementId: "tech-after-progression",
  generation: 9,
});
assert.equal(researchControl.readOfferedTechs(), undefined);
offeredRows = [{ id: "tech-after-control-rebind", cost: { Knowledge: 5 } }];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-after-control-rebind"],
);
assert.equal(researchDraws, 4);

// The next processed cycle samples its own offers, even if the progression epoch did not change.
researchControl.beginProcessedCycle?.();
assert.equal(researchControl.readOfferedTechs(), undefined);
offeredRows = [{ id: "tech-next-cycle", cost: { Knowledge: 5, Polymer: 900 } }];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-next-cycle"],
);
assert.equal(researchDraws, 5);
assert.equal(demand.sample().storageRequired("Polymer"), 927);

// A failed current sample is unknown; it cannot fall back to the previous cycle's catalog.
researchControl.beginProcessedCycle?.();
offeredRows = [{ id: "tech-last-successful-cycle", cost: { Polymer: 700 } }];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-last-successful-cycle"],
);
assert.equal(demand.sample().storageRequired("Polymer"), 721);
researchControl.beginProcessedCycle?.();
researchPanelVisible = false;
assert.equal(researchControl.sampleOfferedTechs(), undefined);
assert.equal(researchControl.readOfferedTechs(), undefined);
assert.equal(demand.sample().storageRequired("Polymer"), 1);

// Root replacement drops the held offers as well as the panel scope.
researchPanelVisible = true;
researchControl.beginProcessedCycle?.();
researchControl.sampleOfferedTechs();
for (const listener of rootReplacementListeners) listener();
assert.equal(researchControl.readOfferedTechs(), undefined);

root = undefined;
assert.equal(researchControl.sampleOfferedTechs(), undefined);
assert.equal(researchControl.readGrantedTechs(), undefined);

// Storage's build targets share the build-policy/settings authority but are filtered through the
// game's drawn unlock catalog. A managed, locked row and an unlocked, disabled row do not reserve
// capacity; every unlocked managed candidate does, whether or not construction is saving for it.
{
  const buildSettings = {
    civTabs: 3,
    spaceTabs: 0,
    animated: true,
    autoBuild: true,
    "batcity-disabled": false,
  };
  const buildRoot = {
    settings: buildSettings,
    race: {},
    tech: {},
    city: {
      foundry: { count: 0 },
      refinery: { count: 0 },
      locked: { count: 0 },
      disabled: { count: 0 },
    },
    resource: {
      Crates: { amount: 5, max: 5, display: true },
      Containers: { amount: 5, max: 5, display: true },
      Knowledge: { amount: 0, max: 100, display: true },
      Alloy: { amount: 0, max: 100, display: true, stackable: true },
    },
  };
  let unlockedRows = [
    { id: "city-foundry" },
    { id: "city-refinery" },
    { id: "city-disabled" },
  ];
  const buildRootListeners = [];
  const buildIds = [
    "civTabs",
    "spaceTabs",
    "city-foundry",
    "city-refinery",
    "city-locked",
    "city-disabled",
  ];
  const buildActs = new Map([
    ["city-foundry", buildRoot.city.foundry],
    ["city-refinery", buildRoot.city.refinery],
    ["city-locked", buildRoot.city.locked],
    ["city-disabled", buildRoot.city.disabled],
  ]);
  const buildControl = createCapturedProgressionControl({
    rootState: {
      readRoot: () => buildRoot,
      subscribeRootReplaced: (listener) => {
        buildRootListeners.push(listener);
        return () => {};
      },
    },
    controls: {
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        data: { act: buildActs.get(elementId) },
      }),
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => buildIds,
    },
    mountSuppression: {
      available: true,
      withoutMounting: (action) => action(),
    },
    panels: {
      open: () => ({ release: () => {}, isIntact: () => true }),
    },
    drawnActions: {
      exists: (selector) => selector === "#city",
      read: (selector) => (selector === "#city .action" ? unlockedRows : []),
    },
    drawnProjects: { read: () => undefined, exists: () => false },
    readSettings: () => buildSettings,
    nowMs: () => 0,
  });
  const priced = [];
  assert.deepEqual(
    buildControl.readManagedBuildTargets().map(({ elementId }) => elementId),
    ["city-foundry", "city-refinery"],
    "production build policy intersects cumulative controls with the drawn city rows",
  );
  const buildDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => buildRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readBuildTargets: buildControl.readUnlockedStorageBuildTargets,
    costs: {
      readCost: (elementId) => {
        priced.push(elementId);
        const amount =
          elementId === "city-foundry"
            ? 500
            : elementId === "city-refinery"
              ? 650
              : elementId === "city-disabled"
                ? 2000
                : 3000;
        return { cost: { Alloy: amount }, pool: undefined };
      },
    },
    readSettings: () => buildSettings,
  }).sample();
  assert.deepEqual(priced, ["city-foundry", "city-refinery"]);
  assert.equal(buildDemand.storageRequired("Alloy"), 669.5);
  unlockedRows = [{ id: "city-refinery" }];
  for (const listener of buildRootListeners) listener();
  assert.deepEqual(
    buildControl.readManagedBuildTargets().map(({ elementId }) => elementId),
    ["city-refinery"],
    "an old captured control leaves normal Auto Build after the new draw omits it",
  );
  assert.deepEqual(
    buildControl
      .readUnlockedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["city-refinery"],
  );
}

console.log("captured-progression-control ok");
