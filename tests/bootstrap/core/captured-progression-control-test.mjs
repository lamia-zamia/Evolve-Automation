import assert from "node:assert/strict";
import { createCapturedProgressionControl } from "../../../src/bootstrap/captured-progression-control.ts";
import { createDiscoveryAttempts } from "../../../src/bootstrap/discovery-attempts.ts";
import { createCapturedResourceDemand } from "../../../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { withControlCaptureAuthority } from "../../support/fixtures/control-capture-fixture.mjs";
import { makeCapturedBuildingMechanics } from "../../support/fixtures/captured-building-test-fixtures.mjs";
import { makeCapturedTechMechanicsFixture } from "../../support/fixtures/captured-tech-mechanics-fixture.mjs";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SUB_TAB_CONTROLS,
} from "../../../src/adapters/evolve/captured-tab-discovery.ts";

const emptyArpaMechanics = Object.freeze({
  ensureCaptured: () => ({ kind: "captured" }),
  readOffers: () => [],
  buildPercent: () => ({
    kind: "unavailable",
    reason: "project builds are not exercised by this test",
  }),
});
const inertBindings = () => () => {};

const control = createCapturedProgressionControl({
  rootState: {
    readRoot: () => undefined,
    subscribeRootReplaced: () => () => {},
  },
  controls: withControlCaptureAuthority({
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [],
  }),
  bindings: inertBindings,
  mechanics: makeCapturedBuildingMechanics(undefined),
  mountSuppression: {
    begin: () => undefined,
  },
  panels: { open: () => undefined },
  drawnActions: {
    read: () => [],
    count: () => 0,
    exists: () => false,
  },
  arpa: emptyArpaMechanics,
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
assert.equal(control.readEstablishedStorageBuildTargets(), undefined);
assert.equal(control.readEstablishedProjects(), undefined);

// The captured native authority survives a panel draw; established reads restate live project fields.
{
  const projectRoot = {
    settings: { civTabs: 5 },
    race: {},
    tech: {},
    resource: { Money: {} },
    arpa: { lhc: { rank: 2, complete: 35 } },
  };
  let projectClock = 0;
  let projectReads = 0;
  let projectOfferSampleAvailable = true;
  let projectRowsEmpty = false;
  const projectReplacements = [];
  const projectControl = createCapturedProgressionControl({
    rootState: {
      readRoot: () => projectRoot,
      subscribeRootReplaced: (listener) => {
        projectReplacements.push(listener);
        return () => {};
      },
    },
    controls: withControlCaptureAuthority({
      resolve: () => undefined,
      invoke: () => {
        throw new Error("project mechanics do not invoke row controls");
      },
      capturedElementIds: () => [],
    }),
    mountSuppression: {
      available: false,
      withoutMounting: () => {
        throw new Error("must not discover");
      },
    },
    panels: {
      open: () => {
        throw new Error("must not open panels");
      },
    },
    drawnActions: { read: () => [], count: () => 0, exists: () => false },
    bindings: inertBindings,
    arpa: {
      ensureCaptured: () => ({ kind: "captured" }),
      readOffers: () => {
        projectReads++;
        if (!projectOfferSampleAvailable) return undefined;
        return projectRowsEmpty
          ? []
          : [
              {
                projectId: "lhc",
                rank: projectRoot.arpa.lhc.rank,
                progress: projectRoot.arpa.lhc.complete,
                percentCosts: { Money: 10 },
              },
            ];
      },
      buildPercent: () => ({
        kind: "unavailable",
        reason: "project builds are not exercised by this test",
      }),
    },
    readSettings: () => ({}),
    nowMs: () => projectClock,
  });
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  assert.equal(projectReads, 0);
  assert.equal(projectControl.readProjects()[0].progress, 35);
  projectRoot.arpa.lhc.complete = 40;
  assert.deepEqual(projectControl.readEstablishedProjects()[0], {
    elementId: "arpalhc",
    projectId: "lhc",
    cost: { Money: 10 },
    rank: 2,
    progress: 40,
  });
  assert.equal(
    projectReads,
    2,
    "established reads use the current native project state",
  );
  projectRoot.arpa.lhc.rank++;
  assert.equal(
    projectControl.readEstablishedProjects(),
    undefined,
    "rank changes invalidate the drawn price",
  );
  projectRoot.arpa.lhc.rank--;
  projectControl.resetProjectSample();
  assert.equal(
    projectControl.readProjects()[0].progress,
    35,
    "the current cycle keeps its established ARPA sample",
  );
  projectClock = 60000;
  const readsBeforeFreshEstablishedSample = projectReads;
  assert.equal(projectControl.readEstablishedProjects()[0].progress, 40);
  assert.equal(
    projectReads,
    readsBeforeFreshEstablishedSample + 1,
    "established reads refresh state and native price without a panel draw",
  );
  assert.equal(projectControl.readProjects()[0].progress, 40);
  projectRoot.arpa.lhc.complete = 45;
  projectControl.beginProcessedCycle();
  assert.equal(
    projectControl.readProjects()[0].progress,
    45,
    "a new processed cycle refreshes progress when price and offer membership are unchanged",
  );
  projectOfferSampleAvailable = false;
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  projectControl.resetProjectSample();
  assert.equal(projectControl.readProjects(), undefined);
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  projectOfferSampleAvailable = true;
  projectControl.resetProjectSample();
  projectControl.readProjects();
  for (const listener of projectReplacements) listener();
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  projectRowsEmpty = true;
  projectControl.resetProjectSample();
  assert.deepEqual(projectControl.readProjects(), []);
  assert.deepEqual(
    projectControl.readEstablishedProjects(),
    [],
    "an authoritative empty catalog is distinct from unknown",
  );
  projectRowsEmpty = false;
  projectClock = 120000;
  projectControl.resetProjectSample();
  assert.equal(projectControl.readProjects()[0].projectId, "lhc");
  const establishedReads = projectReads;
  projectControl.invalidateConstructionOffers();
  assert.equal(projectControl.readEstablishedProjects()[0].projectId, "lhc");
  assert.equal(projectControl.readProjects()[0].projectId, "lhc");
  assert.equal(
    projectReads,
    establishedReads + 1,
    "Building-only invalidation reuses the captured authority for a live read",
  );
  projectRoot.arpa.lhc.rank++;
  projectControl.resetProjectSample();
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  assert.equal(projectControl.readProjects()[0].rank, 3);
  assert.equal(projectReads, establishedReads + 2);
  projectRoot.tech.new_unlock = 1;
  projectControl.resetProjectSample();
  assert.equal(projectControl.readEstablishedProjects(), undefined);
  assert.equal(projectControl.readProjects()[0].rank, 3);
  assert.equal(projectReads, establishedReads + 3);
}

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
let researchDrawAvailable = true;
let offeredRows = [
  { id: "tech-mining", cost: { Knowledge: 5 }, costComplete: true },
];
let researchDraws = 0;
let researchHandleResolutions = 0;
let researchControlRevision = 0;
const rootReplacementListeners = [];
const researchBindingListeners = new Set();
const observeResearchBindings = (listener) => {
  researchBindingListeners.add(listener);
  return () => researchBindingListeners.delete(listener);
};
const emitResearchBinding = (id) => {
  for (const listener of researchBindingListeners) listener(id, {});
};
const researchMainTabId = "#mainColumn div.content";
const techHandles = new Map([
  [researchMainTabId, { elementId: researchMainTabId, generation: 1 }],
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
  controls: withControlCaptureAuthority({
    readRevision: () => researchControlRevision,
    resolve: (id) => {
      researchHandleResolutions += 1;
      return techHandles.get(id);
    },
    invoke: (handle, method, args = []) => {
      if (handle.elementId === researchMainTabId && method === "swapTab") {
        if (!researchDrawAvailable)
          return {
            ok: false,
            reason: "threw",
            detail: "Research draw unavailable",
          };
        if (args[0] === 3)
          for (const row of [...offeredRows, { id: "tech-old-mining" }])
            emitResearchBinding(row.id);
        return { ok: true, value: args[0] };
      }
      return { ok: false, reason: "unknown-control" };
    },
    capturedElementIds: () => [...techHandles.keys()],
  }),
  bindings: observeResearchBindings,
  mechanics: {
    ...makeCapturedBuildingMechanics(root),
    ...makeCapturedTechMechanicsFixture([
      "tech-mining",
      "tech-old-mining",
      "tech-current-cycle",
      "tech-redrawn-later",
      "tech-after-progression",
      "tech-after-control-rebind",
      "tech-next-cycle",
      "tech-last-successful-cycle",
    ]),
  },
  costs: {
    readCost: () => ({
      cost: offeredRows[0]?.cost ?? {},
      pool: undefined,
    }),
  },
  mountSuppression: { available: true, withoutMounting: (draw) => draw() },
  panels: {
    open: () => ({
      discard: () => true,
      release: () => {},
      isIntact: () => true,
    }),
  },
  drawnActions: {
    exists: (selector) => selector === "#tech" && researchPanelVisible,
    read: (selector) => {
      if (selector === "#tech .action") {
        researchDraws += 1;
        return offeredRows;
      }
      return [{ id: "tech-old-mining", cost: {} }];
    },
    count: (selector) =>
      selector === "#tech .action" ? offeredRows.length : 1,
  },
  arpa: emptyArpaMechanics,
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
  {
    id: "tech-current-cycle",
    cost: { Knowledge: 5, Polymer: 700 },
    costComplete: true,
  },
];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-current-cycle"],
);
assert.equal(researchDraws, 2);
assert.equal(demand.sample().storageRequired("Polymer"), 721);
offeredRows = [
  {
    id: "tech-redrawn-later",
    cost: { Knowledge: 5 },
    costComplete: true,
  },
];
nowMs = 20_000;
researchControl.runResearchCycle();
const beforeRepeatedResearchSample = researchHandleResolutions;
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-current-cycle"],
);
assert.equal(researchHandleResolutions - beforeRepeatedResearchSample, 0);
assert.equal(
  researchControl.readOfferedTechs()?.[0]?.elementId,
  "tech-current-cycle",
);
assert.equal(researchDraws, 2);

// Research progression changes the epoch, so the next current-cycle reader must sample the game's
// newly offered technology instead of keeping the pre-action catalog indefinitely.
root.tech["research-completed"] = 1;
offeredRows = [
  {
    id: "tech-after-progression",
    cost: { Knowledge: 5, Polymer: 800 },
    costComplete: true,
  },
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
researchControlRevision += 1;
assert.equal(researchControl.readOfferedTechs(), undefined);
offeredRows = [
  {
    id: "tech-after-control-rebind",
    cost: { Knowledge: 5 },
    costComplete: true,
  },
];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-after-control-rebind"],
);
assert.equal(researchDraws, 4);

// The next processed cycle samples its own offers, even if the progression epoch did not change.
researchControl.beginProcessedCycle?.();
assert.equal(researchControl.readOfferedTechs(), undefined);
offeredRows = [
  {
    id: "tech-next-cycle",
    cost: { Knowledge: 5, Polymer: 900 },
    costComplete: true,
  },
];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-next-cycle"],
);
assert.equal(researchDraws, 5);
assert.equal(demand.sample().storageRequired("Polymer"), 927);

// A failed current sample is unknown; it cannot fall back to the previous cycle's catalog.
researchControl.beginProcessedCycle?.();
offeredRows = [
  {
    id: "tech-last-successful-cycle",
    cost: { Polymer: 700 },
    costComplete: true,
  },
];
assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-last-successful-cycle"],
);
assert.equal(demand.sample().storageRequired("Polymer"), 721);
researchControl.beginProcessedCycle?.();
researchDrawAvailable = false;
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
// native semantic offer catalog. A managed unavailable action and an offered disabled action do not reserve
// capacity; every unlocked managed candidate does, whether or not construction is saving for it.
{
  const buildSettings = {
    civTabs: 3,
    spaceTabs: 0,
    animated: true,
    autoBuild: true,
    "batcity-bank": false,
  };
  const buildRoot = {
    settings: buildSettings,
    race: {},
    tech: { currency: 1 },
    city: {
      foundry: { count: 0 },
      metal_refinery: { count: 0 },
      library: { count: 0 },
      bank: { count: 0 },
    },
    resource: {
      Crates: { amount: 5, max: 5, display: true },
      Containers: { amount: 5, max: 5, display: true },
      Knowledge: { amount: 0, max: 100, display: true },
      Alloy: { amount: 0, max: 100, display: true, stackable: true },
    },
  };
  const buildRootListeners = [];
  let buildingCatalogDraws = 0;
  let semanticAvailabilityReads = 0;
  let invalidNativeAnswer = false;
  const buildIds = [
    "civTabs",
    "spaceTabs",
    "city-foundry",
    "city-metal_refinery",
    "city-library",
    "city-bank",
  ];
  const offeredBindings = new Set([
    "city-foundry",
    "city-metal_refinery",
    "city-bank",
  ]);
  const buildActs = new Map([
    ["city-foundry", buildRoot.city.foundry],
    ["city-metal_refinery", buildRoot.city.metal_refinery],
    ["city-library", buildRoot.city.library],
    ["city-bank", buildRoot.city.bank],
  ]);
  const buildControl = createCapturedProgressionControl({
    rootState: {
      readRoot: () => buildRoot,
      subscribeRootReplaced: (listener) => {
        buildRootListeners.push(listener);
        return () => {};
      },
    },
    controls: withControlCaptureAuthority({
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        data: { act: buildActs.get(elementId) },
      }),
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => buildIds,
    }),
    bindings: inertBindings,
    mountSuppression: {
      available: true,
      withoutMounting: (action) => action(),
    },
    panels: {
      open: () => ({ release: () => {}, isIntact: () => true }),
    },
    drawnActions: {
      exists: (selector) =>
        ["#city", "#space", "#outerSol", "#interstellar"].includes(selector),
      read: () => {
        buildingCatalogDraws++;
        return [];
      },
      count: () => 0,
    },
    mechanics: makeCapturedBuildingMechanics(buildRoot, {
      availability: (liveRoot, binding) => {
        semanticAvailabilityReads += 1;
        if (invalidNativeAnswer && binding === "city-farm")
          return { kind: "invalid" };
        return {
          kind: "value",
          value:
            offeredBindings.has(binding) &&
            (binding !== "city-foundry" || liveRoot.tech.currency !== 0),
        };
      },
    }),
    arpa: emptyArpaMechanics,
    readSettings: () => buildSettings,
    nowMs: () => 0,
  });
  const priced = [];
  assert.equal(buildControl.readEstablishedStorageBuildTargets(), undefined);
  assert.equal(
    buildControl.readCapturedBuildingUnlocked("city-foundry", "city"),
    undefined,
    "availability lookup does not draw an unsampled region",
  );
  assert.deepEqual(
    buildControl.readManagedBuildTargets().map(({ elementId }) => elementId),
    ["city-foundry", "city-metal_refinery"],
    "production build policy intersects managed controls with semantic offers",
  );
  assert.equal(
    buildControl.readCapturedBuildingUnlocked("city-foundry", "city"),
    true,
  );
  assert.equal(
    buildControl.readCapturedBuildingUnlocked("city-library", "city"),
    false,
  );
  assert.equal(
    buildControl.readCapturedBuildingUnlocked("space-relay", "space"),
    undefined,
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
            : elementId === "city-metal_refinery"
              ? 650
              : elementId === "city-bank"
                ? 2000
                : 3000;
        return { cost: { Alloy: amount }, pool: undefined };
      },
    },
    readSettings: () => buildSettings,
  }).sample();
  assert.deepEqual(priced, ["city-foundry", "city-metal_refinery"]);
  assert.equal(buildDemand.storageRequired("Alloy"), 669.5);
  assert.deepEqual(
    buildControl
      .readEstablishedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["city-foundry", "city-metal_refinery"],
    "established offers remain readable without discovery",
  );
  const broadBuildingRegions = new Set(["city", "space", "interstellar"]);
  const broadBuildingSample =
    buildControl.readBuildingUnlocks(broadBuildingRegions);
  const narrowBuildingSample = buildControl.readBuildingUnlocks(
    new Set(["city"]),
  );
  buildIds.push("space-relay", "interstellar-relay");
  assert.deepEqual(
    buildControl
      .readEstablishedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["city-foundry", "city-metal_refinery"],
    "established construction demand survives a narrower trigger catalog",
  );
  buildIds.splice(-2);
  const drawsBeforeEstablishedLookup = buildingCatalogDraws;
  const availabilityReadsBeforeEstablishedLookup = semanticAvailabilityReads;
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(broadBuildingRegions).unlocked,
    broadBuildingSample.unlocked,
    "a narrow trigger sample preserves the original broad authority",
  );
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["city"])).unlocked,
    narrowBuildingSample.unlocked,
    "an exact fresh region set is preferred to the broad superset",
  );
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["space"])).unlocked,
    broadBuildingSample.unlocked,
    "one fresh superset can answer a region without an exact sample",
  );
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["city", "portal"])),
    undefined,
    "unsampled coverage is unavailable",
  );
  assert.equal(buildingCatalogDraws, drawsBeforeEstablishedLookup);
  assert.equal(
    semanticAvailabilityReads,
    availabilityReadsBeforeEstablishedLookup,
  );
  invalidNativeAnswer = true;
  assert.equal(buildControl.readBuildingUnlocks(new Set(["city"])), undefined);
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(broadBuildingRegions),
    undefined,
    "an invalid current read cannot fall back to an older compatible superset",
  );
  invalidNativeAnswer = false;
  const readsBeforeMissingSnapshot = semanticAvailabilityReads;
  buildControl.resetBuildingUnlockSample();
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(broadBuildingRegions),
    undefined,
    "an established read never creates a missing semantic sample",
  );
  assert.equal(semanticAvailabilityReads, readsBeforeMissingSnapshot);
  assert.equal(buildingCatalogDraws, drawsBeforeEstablishedLookup);
  const refreshedBroadBuildingSample =
    buildControl.readBuildingUnlocks(broadBuildingRegions);
  const readsBeforeEstablishedSuperset = semanticAvailabilityReads;
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["city"])).unlocked,
    refreshedBroadBuildingSample.unlocked,
    "one fresh semantic superset can answer a narrower request",
  );
  assert.equal(semanticAvailabilityReads, readsBeforeEstablishedSuperset);
  assert.equal(buildingCatalogDraws, drawsBeforeEstablishedLookup);
  buildIds.push("portal-relay");
  assert.equal(
    buildControl.readEstablishedStorageBuildTargets(),
    undefined,
    "a newly captured region absent from the established catalog stays unavailable",
  );
  buildIds.pop();
  buildControl.resetBuildingUnlockSample();
  assert.equal(buildControl.readEstablishedStorageBuildTargets(), undefined);
  buildControl.readBuildingUnlocks(new Set(["city"]));
  buildControl.readBuildingUnlocks(new Set(["space"]));
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["city", "space"])),
    undefined,
    "independent scopes are never combined into a synthetic catalog",
  );
  buildRoot.tech.currency = 0;
  for (const listener of buildRootListeners) listener();
  assert.equal(
    buildControl.readEstablishedBuildingUnlocks(new Set(["city"])),
    undefined,
  );
  assert.equal(
    buildControl.readCapturedBuildingUnlocked("city-foundry", "city"),
    undefined,
  );
  assert.deepEqual(
    buildControl
      .readBuildingUnlocks(new Set(["city"]))
      .unlocked.has("city-foundry"),
    false,
    "a fresh native sample observes changed root facts without a panel draw",
  );
  assert.deepEqual(
    buildControl
      .readUnlockedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["city-metal_refinery"],
  );
}

// Pinned truepath.js: the first space-titan_quarters increments only structure count; that
// condition makes space-titan_mine appear without a tech change or progression epoch change.
{
  const titanRoot = {
    settings: { civTabs: 3, spaceTabs: 2, animated: true, showSpace: true },
    race: {},
    tech: {},
    space: { titan_quarters: { count: 0 }, titan_mine: { count: 0 } },
    resource: {
      Alloy: { amount: 0, max: 100, display: true, stackable: true },
    },
  };
  const techBeforeBuild = JSON.stringify(titanRoot.tech);
  let titanDraws = 0;
  let researchDraws = 0;
  const titanControl = createCapturedProgressionControl({
    rootState: {
      readRoot: () => titanRoot,
      subscribeRootReplaced: () => () => {},
    },
    controls: withControlCaptureAuthority({
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        data: {
          act:
            elementId === "space-titan_quarters"
              ? titanRoot.space.titan_quarters
              : titanRoot.space.titan_mine,
        },
      }),
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => ["space-titan_quarters", "space-titan_mine"],
    }),
    bindings: inertBindings,
    mountSuppression: { available: true, withoutMounting: (draw) => draw() },
    panels: { open: () => ({ release: () => {}, isIntact: () => true }) },
    drawnActions: {
      exists: () => true,
      read: (selector) => {
        if (selector === "#tech .action") researchDraws++;
        if (selector !== "#space .action") return [];
        titanDraws++;
        return [
          { id: "space-titan_quarters" },
          ...(titanRoot.space.titan_quarters.count > 0
            ? [{ id: "space-titan_mine" }]
            : []),
        ];
      },
      count: (selector) =>
        selector === "#tech .action"
          ? 0
          : selector === "#space .action"
            ? 1 + Number(titanRoot.space.titan_quarters.count > 0)
            : 0,
    },
    mechanics: makeCapturedBuildingMechanics(titanRoot, {
      availability: (_liveRoot, binding) => ({
        kind: "value",
        value:
          binding === "space-titan_quarters" ||
          (binding === "space-titan_mine" &&
            titanRoot.space.titan_quarters.count > 0),
      }),
    }),
    arpa: emptyArpaMechanics,
    readSettings: () => ({
      autoBuild: true,
      "batspace-titan_quarters": true,
      "batspace-titan_mine": true,
    }),
    nowMs: () => 0,
  });
  const regions = new Set(["space"]);
  assert.deepEqual(titanControl.sampleOfferedTechs(), []);
  assert.deepEqual(
    titanControl
      .readUnlockedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["space-titan_quarters"],
  );
  assert.deepEqual(
    [...titanControl.readBuildingUnlocks(regions).unlocked],
    ["space-titan_quarters"],
  );
  assert.equal(titanDraws, 0, "Building offers do not read drawn action rows");
  titanRoot.space.titan_quarters.count++;
  assert.equal(JSON.stringify(titanRoot.tech), techBeforeBuild);
  titanControl.invalidateConstructionOffers();
  assert.deepEqual(titanControl.sampleOfferedTechs(), []);
  assert.equal(
    researchDraws,
    1,
    "Construction keeps unrelated Research discovery cached",
  );
  assert.equal(titanControl.readEstablishedBuildingUnlocks(regions), undefined);
  const postBuild = titanControl.readBuildingUnlocks(regions);
  assert.equal(
    titanDraws,
    0,
    "post-Construction semantic sampling does not redraw the Building panel",
  );
  assert.equal(postBuild.unlocked.has("space-titan_mine"), true);
  assert.deepEqual(
    titanControl
      .readUnlockedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["space-titan_quarters", "space-titan_mine"],
  );
  const exactDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => titanRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readBuildTargets: titanControl.readUnlockedStorageBuildTargets,
    costs: {
      readCost: (elementId) => ({
        cost: { Alloy: elementId === "space-titan_mine" ? 500 : 100 },
        pool: undefined,
      }),
    },
    readSettings: () => ({}),
  }).sample();
  assert.ok(
    exactDemand.storageRequired("Alloy") > 500,
    "exact demand consumes Titan Mine's post-Build offer",
  );
  assert.equal(
    titanDraws,
    0,
    "Power's demand reads the established semantic catalog without DOM rows",
  );
}

// Building preparation joins the native City catalog before exact Power demand, without a panel draw.
{
  const root = {
    settings: { civTabs: 3, spaceTabs: 0 },
    race: {},
    tech: {},
    city: {
      farm: { count: 0 },
      chrysotile: { count: 0 },
    },
    resource: {
      Money: { amount: 1000, max: 10000, display: true, diff: 0 },
      Polymer: { amount: 0, max: 1000, display: true, diff: 0 },
    },
  };
  const settings = {
    autoBuild: false,
    autoStorage: true,
    "batcity-farm": true,
    "bld_w_city-farm": 100,
  };
  let panelOpens = 0;
  const mechanics = makeCapturedBuildingMechanics(root, {
    availability: (_liveRoot, binding) => ({
      kind: "value",
      value: binding === "city-farm" || binding === "city-chrysotile",
    }),
    overrides: new Map([
      [
        "city-chrysotile",
        {
          entryKey: "city:chrysotile",
          region: "city",
          sector: "city",
          struct: "chrysotile",
          actionId: "undefined-chrysotile",
        },
      ],
    ]),
  });
  const progression = createCapturedProgressionControl({
    rootState: {
      readRoot: () => root,
      subscribeRootReplaced: () => () => {},
    },
    controls: withControlCaptureAuthority({
      resolve: (elementId) =>
        elementId === "city-farm"
          ? {
              elementId,
              generation: 1,
              data: { act: root.city.farm },
            }
          : undefined,
      invoke: () => ({ ok: false, reason: "unexpected-control" }),
      capturedElementIds: () => ["city-farm"],
    }),
    bindings: inertBindings,
    mountSuppression: {
      available: false,
      withoutMounting: () => {
        throw new Error("Building preparation must not draw a panel");
      },
    },
    panels: {
      open: () => {
        panelOpens++;
        throw new Error("Building preparation must not open a panel");
      },
    },
    drawnActions: {
      exists: () => false,
      read: () => {
        throw new Error("Building preparation must not read DOM rows");
      },
      count: () => {
        throw new Error("Building preparation must not count DOM rows");
      },
    },
    mechanics,
    arpa: emptyArpaMechanics,
    readSettings: () => settings,
    nowMs: () => 0,
  });

  const targets = progression.readUnlockedStorageBuildTargets();
  assert.deepEqual(
    targets.map(({ elementId }) => elementId),
    ["city-farm"],
  );
  assert.deepEqual(
    progression
      .readEstablishedStorageBuildTargets()
      .map(({ elementId }) => elementId),
    ["city-farm"],
    "Building preparation establishes the managed target snapshot",
  );
  const exactDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readBuildTargets: progression.readEstablishedStorageBuildTargets,
    costs: {
      readCost: () => ({ cost: { Polymer: 200 }, pool: undefined }),
    },
    readSettings: () => settings,
  }).sampleExact();
  assert.equal(exactDemand.status, "ready");
  assert.equal(panelOpens, 0);
}

// Native action availability keeps build-control discovery retired until an offered building needs
// a captured mutation capability. Volatile native conditions are checked live, so a count-gated
// action such as Titan Mine does not need an age-driven panel draw.
{
  const root = {
    settings: {
      civTabs: 3,
      spaceTabs: 0,
      animated: true,
      showCity: true,
      showSpace: true,
      showDeep: false,
      showGalactic: false,
      showPortal: false,
      showOuter: false,
      showTau: false,
      showEden: false,
      showUnderground: false,
      showSurface: false,
    },
    race: { species: "human", universe: "standard" },
    tech: {},
    genes: {},
    stats: { achieve: {}, psykill: 0 },
    civic: { govern: { type: "democracy" } },
    arpa: { lhc: { rank: 1, complete: 0 } },
    city: {},
    space: { titan_quarters: { count: 0 } },
  };
  let now = 0;
  let cycle = 0;
  let draws = 0;
  let failBankCapture = true;
  const ids = new Set([MAIN_TAB_CONTROL, SUB_TAB_CONTROLS[SPACE_TABS_SETTING]]);
  const listeners = [];
  const performanceCounts = new Map();
  const performancePhases = new Map();
  const diagnostics = {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: (name) =>
      performancePhases.set(name, (performancePhases.get(name) ?? 0) + 1),
    recordCount: (name, amount) =>
      performanceCounts.set(name, (performanceCounts.get(name) ?? 0) + amount),
  };
  const attempts = createDiscoveryAttempts({ readCycle: () => cycle });
  let includeCityMine = false;
  const mechanics = makeCapturedBuildingMechanics(root, {
    structureSnapshot: (structures) =>
      includeCityMine
        ? structures
        : structures.filter((structure) => structure.actionId !== "city-mine"),
    availability: (currentRoot, binding) => ({
      kind: "value",
      value:
        (binding === "city-farm" && currentRoot.tech.farming === 1) ||
        (binding === "city-bank" && currentRoot.tech.bank === 1) ||
        (binding === "city-mine" && currentRoot.tech.mining === 1) ||
        (binding === "space-titan_mine" &&
          currentRoot.space.titan_quarters.count > 0),
    }),
  });
  const buildControl = createCapturedProgressionControl({
    rootState: {
      readRoot: () => root,
      subscribeRootReplaced: (listener) => {
        listeners.push(listener);
        return () => {};
      },
    },
    controls: withControlCaptureAuthority({
      resolve: (elementId) =>
        ids.has(elementId)
          ? {
              elementId,
              generation: 1,
              methods:
                elementId === MAIN_TAB_CONTROL ||
                elementId === SUB_TAB_CONTROLS[SPACE_TABS_SETTING]
                  ? ["swapTab"]
                  : ["action", "on_cap"],
            }
          : undefined,
      invoke: (handle, method, args = []) => {
        if (method !== "swapTab")
          return { ok: false, reason: "unknown-method" };
        if (handle.elementId === MAIN_TAB_CONTROL) {
          root.settings[MAIN_TAB_SETTING] = args[0];
        } else {
          root.settings[SPACE_TABS_SETTING] = args[0];
          draws += 1;
          if (args[0] === 0 && root.tech.farming === 1) ids.add("city-farm");
          if (args[0] === 0 && root.tech.bank === 1 && !failBankCapture)
            ids.add("city-bank");
          if (args[0] === 0 && root.tech.mining === 1) ids.add("city-mine");
          if (args[0] === 1 && root.space.titan_quarters.count > 0)
            ids.add("space-titan_mine");
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => [...ids],
    }),
    bindings: inertBindings,
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
    },
    panels: { open: () => ({ release: () => {}, isIntact: () => true }) },
    drawnActions: { exists: () => true, read: () => [], count: () => 0 },
    mechanics,
    discoveryAttempts: attempts,
    diagnostics,
    arpa: emptyArpaMechanics,
    readSettings: () => ({}),
    nowMs: () => now,
  });

  const ensureBuildControlsAndAssertOneRead = () => {
    const priorReads = mechanics.readStructureCallCount();
    buildControl.ensureBuildControls();
    assert.equal(
      mechanics.readStructureCallCount(),
      priorReads + 1,
      "one ensureBuildControls call reads and indexes one native structure snapshot",
    );
  };

  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 0, "no native offered building needs a missing control");
  assert.equal(
    performancePhases.get("discovery.capability-snapshot build-controls"),
    1,
    "one call-scoped structure snapshot has its own phase attribution",
  );
  for (const setting of [
    "showDeep",
    "showGalactic",
    "showPortal",
    "showOuter",
    "showTau",
    "showEden",
    "showUnderground",
    "showSurface",
  ])
    root.settings[setting] = true;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 0, "a complete capability set stays retired");
  root.arpa.lhc.rank++;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 0, "unrelated A.R.P.A. rank progress does not draw");
  root.tech.mining = 1;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 0, "unrelated technology progress does not draw");

  root.tech.farming = 1;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 1, "a newly offered city action gets one panel draw");
  assert.equal(ids.has("city-farm"), true);
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 1, "the captured action retires city discovery");

  root.space.titan_quarters.count = 1;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(
    draws,
    2,
    "native count availability reopens the inner-space path",
  );
  assert.equal(ids.has("space-titan_mine"), true);
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 2, "the Titan Mine control retires its path");

  root.tech.bank = 1;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 3, "a second newly offered city action gets one draw");
  assert.equal(
    ids.has("city-bank"),
    false,
    "the failed native capture stays absent",
  );
  ensureBuildControlsAndAssertOneRead();
  assert.equal(draws, 3, "a failed attempt respects same-cycle retry backoff");
  assert.equal(
    performanceCounts.get(
      "discovery.capability-remains-missing build-controls civTabs:1/spaceTabs:0 city-bank",
    ),
    1,
    "profiling identifies the still-missing native building capability",
  );
  cycle += 1;
  failBankCapture = false;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(
    draws,
    4,
    "the failed control is retried and captured next cycle",
  );
  assert.equal(ids.has("city-bank"), true);

  ids.delete("city-farm");
  attempts.invalidate();
  for (const listener of listeners) listener();
  ensureBuildControlsAndAssertOneRead();
  assert.equal(
    draws,
    5,
    "root replacement invalidates retired control authority",
  );
  assert.equal(ids.has("city-farm"), true);

  includeCityMine = true;
  ensureBuildControlsAndAssertOneRead();
  assert.equal(
    ids.has("city-mine"),
    true,
    "a changed native registry is read on the next ensure call",
  );
}

console.log("captured-progression-control ok");
