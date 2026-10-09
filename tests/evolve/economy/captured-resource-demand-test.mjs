import assert from "node:assert/strict";

import { calculateArpaStorageTargetCosts } from "../../../src/domain/economy/storage/storage-requirements.ts";
import {
  createCapturedResourceDemand,
  hasCapturedProjectStorageDemand,
} from "../../../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { createCapturedTriggers } from "../../../src/adapters/evolve/progression/build/captured-triggers.ts";
import { createCapturedQueueReservationSource } from "../../../src/adapters/evolve/captured-queue-reservations.ts";
import { actionPrice } from "../../support/action-price.mjs";

assert.equal(
  hasCapturedProjectStorageDemand({ autoARPA: true, arpa_lhc: false }),
  false,
);
assert.equal(
  hasCapturedProjectStorageDemand({ autoARPA: false, arpa_lhc: true }),
  true,
);
assert.equal(hasCapturedProjectStorageDemand({ arpaStep: true }), false);
const persistedProjectDemandSettings = { arpa_lhc: true };
const effectiveProjectDemandSettings = Object.create(
  persistedProjectDemandSettings,
);
assert.equal(
  hasCapturedProjectStorageDemand(
    effectiveProjectDemandSettings,
    persistedProjectDemandSettings,
  ),
  true,
);
effectiveProjectDemandSettings.arpa_lhc = false;
assert.equal(
  hasCapturedProjectStorageDemand(
    effectiveProjectDemandSettings,
    persistedProjectDemandSettings,
  ),
  false,
);
effectiveProjectDemandSettings.arpa_new_project = true;
assert.equal(
  hasCapturedProjectStorageDemand(
    effectiveProjectDemandSettings,
    persistedProjectDemandSettings,
  ),
  true,
);

const root = {
  race: {},
  resource: {
    Stone: { amount: 100, max: 1000, stackable: true },
    Lumber: { amount: 900, max: 1000, stackable: true },
    Money: { amount: 0, max: 500, stackable: false },
    Plywood: { amount: 0, max: -1, stackable: false },
  },
};

// Exact demand preserves missing observations instead of manufacturing an empty commitment.
{
  let reservationUnavailable = false;
  let offered;
  const exactDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({
        targets: [
          { name: "known queue", cause: "Queue", cost: { Stone: 400 } },
        ],
        unavailable: reservationUnavailable,
      }),
    },
    readOfferedTechs: () => offered,
    readSettings: () => ({}),
  });
  assert.equal(
    exactDemand.sampleExact().reason.message,
    "offered technology snapshot unavailable",
    "missing technology observation",
  );
  offered = [];
  assert.equal(
    exactDemand.sampleExact().sample.requestedQuantity("Stone"),
    400,
  );
  reservationUnavailable = true;
  assert.equal(
    exactDemand.sampleExact().status,
    "unavailable",
    "incomplete reservation set",
  );
  assert.equal(
    exactDemand.sample().requestedQuantity("Stone"),
    400,
    "explicit best effort retains known targets",
  );
  reservationUnavailable = false;
  offered = undefined;
  assert.equal(
    exactDemand.sampleExact().reason.message,
    "offered technology snapshot unavailable",
    "expired technology observation",
  );
  offered = [];
  assert.equal(
    exactDemand.sampleExact().sample.requestedQuantity("Stone"),
    400,
    "authoritative empty technology observation",
  );
}

// Compose the real reservation owner: unknown queue prices cannot become an empty exact demand.
for (const [label, queuedRoot] of [
  [
    "unavailable queued research offer",
    {
      ...root,
      settings: { qAny_res: false },
      tech: { r_queue: 1 },
      r_queue: {
        display: true,
        pause: false,
        queue: [
          { id: "tech-mining", type: "mining", req: true, label: "Mining" },
        ],
      },
    },
  ],
  [
    "unavailable queued build cost",
    {
      ...root,
      settings: { qAny: false },
      queue: {
        display: true,
        pause: false,
        queue: [{ id: "city-mine", label: "Mine" }],
      },
    },
  ],
]) {
  const rootState = { readRoot: () => queuedRoot };
  const reservations = createCapturedQueueReservationSource({
    rootState,
    costs: { readCost: () => undefined },
    readOfferedTechs: () => undefined,
  });
  assert.equal(reservations.readReservations().unavailable, true, label);
  const exactDemand = createCapturedResourceDemand({
    rootState,
    reservations,
    // Isolate reservation incompleteness from the demand owner's separate technology guard.
    readOfferedTechs: () => [],
    readSettings: () => ({}),
  });
  assert.match(
    exactDemand.sampleExact().reason.message,
    /queue reservation unavailable/,
    label,
  );
  assert.match(
    exactDemand.sampleExact().reason.message,
    /tech-mining|city-mine/,
  );
  assert.equal(exactDemand.sampleExact().reason.code, "queue-reservation");
}

// A single prepared sample prices the same native action once across its queue and managed-build
// readers. The queue and Building catalog are independent authorities, but the action price is not.
{
  let nativePriceReads = 0;
  let demandEpoch = 0;
  const queuedRoot = {
    ...root,
    settings: { qAny: true },
    queue: {
      display: true,
      pause: false,
      queue: [{ id: "city-mine", label: "Mine" }],
    },
  };
  const costs = {
    readCost(actionId) {
      nativePriceReads += 1;
      assert.equal(actionId, "city-mine");
      return actionPrice({ Stone: 10 });
    },
  };
  const reservations = createCapturedQueueReservationSource({
    rootState: { readRoot: () => queuedRoot },
    costs,
  });
  const demand = createCapturedResourceDemand({
    rootState: { readRoot: () => queuedRoot },
    readActionCostEpoch: () => demandEpoch,
    reservations,
    costs,
    readSettings: () => ({}),
    readBuildTargets: () => [{ elementId: "city-mine", label: "Mine" }],
  });
  demand.sample();
  demand.sample();
  assert.equal(nativePriceReads, 1);
  demandEpoch += 1;
  demand.sample();
  assert.equal(
    nativePriceReads,
    2,
    "a new demand epoch re-reads native prices",
  );
}

function withTargets(targets, settings = {}, saving = null, craftCosts) {
  return createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets, unavailable: false }),
    },
    construction: {
      readSavingTarget: () => saving,
      readKnowledgeRequirement: () => 0,
    },
    readSettings: () => settings,
    craftCosts,
  });
}

// A composed catalog's missing observation differs from its authoritative empty catalog.
for (const catalogKind of ["building", "project"]) {
  let catalog;
  const catalogDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({ arpa_lhc: true }),
    ...(catalogKind === "building"
      ? { readBuildTargets: () => catalog }
      : { readProjects: () => catalog }),
  });
  assert.equal(
    catalogDemand.sampleExact().status,
    "unavailable",
    `missing ${catalogKind} catalog`,
  );
  assert.equal(catalogDemand.sample().requestedQuantity("Stone"), 0);
  catalog = [];
  assert.equal(
    catalogDemand.sampleExact().sample.requestedQuantity("Stone"),
    0,
    `empty ${catalogKind} catalog`,
  );
}

function arpaProductionScenario({
  capacities = { Iron: 1000 },
  perPercentCosts = { Iron: 100 },
  stackable = { Iron: true },
  progress = 20,
  autoTrigger = true,
  requirementCount = 3,
} = {}) {
  const root = {
    race: {},
    city: { farm: { count: 3 } },
    arpa: { lhc: { rank: 0, complete: progress } },
    resource: Object.fromEntries(
      Object.entries(capacities).map(([id, max]) => [
        id,
        { amount: 0, max, stackable: stackable[id] ?? true, display: true },
      ]),
    ),
  };
  const project = {
    elementId: "arpalhc",
    projectId: "lhc",
    rank: 0,
    progress,
    cost: perPercentCosts,
  };
  const settings = {
    autoTrigger,
    triggers: [
      {
        seq: 0,
        priority: 0,
        requirementType: "BuildingCount",
        requirementId: "city-farm",
        requirementCount,
        actionType: "arpa",
        actionId: "arpalhc",
        actionCount: 1,
      },
    ],
    arpaStep: 5,
    storageAssignExtra: true,
    arpa_lhc: true,
  };
  const rootState = { readRoot: () => root };
  const triggerReader = createCapturedTriggers({
    rootState,
    controls: {
      resolve: (elementId) =>
        elementId === "arpalhc"
          ? { elementId, generation: 3, methods: [] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => ["arpalhc"],
    },
    costs: { readCost: () => undefined },
    readSettings: () => settings,
    readOfferedTechs: () => [],
    readOfferedProjects: () => [project],
  });
  const sample = createCapturedResourceDemand({
    rootState,
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => settings,
    triggers: triggerReader,
    readProjects: () => [project],
  }).sample();
  return { targets: triggerReader.read(), sample };
}

// Fleet demand uses the shipyard's rendered costs and only participates when the two script
// settings ask the prioritizer to preserve the current blueprint.
{
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({ autoFleet: true, prioritizeOuterFleet: "req" }),
    fleet: {
      read: () => ({
        nextShipAffordable: true,
        nextShipCost: [
          { resourceId: "Stone", amount: 250 },
          { resourceId: "Lumber", amount: 80 },
        ],
      }),
    },
  }).sample();
  assert.equal(sample.requestedQuantity("Stone"), 250);
  assert.equal(sample.requestedQuantity("Lumber"), 80);
}

// A queued building's cost is what the queue is accumulating.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400, Lumber: 300 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 400);
  assert.equal(sample.isDemanded("Stone"), true);
  // Lumber is wanted, but the player already has more than the queue needs.
  assert.equal(sample.requestedQuantity("Lumber"), 300);
  assert.equal(sample.isDemanded("Lumber"), false);
  assert.equal(sample.isDemanded("Copper"), false);
}

// The same commitments expose their largest single cost, or 0 when nothing names the resource.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400, Lumber: 300 } },
  ]).sample();
  assert.equal(sample.maxCost?.("Stone"), 400);
  assert.equal(sample.maxCost?.("Lumber"), 300);
  assert.equal(sample.maxCost?.("Copper"), 0);
}

// Requests combine by maximum, as the script's own `requestQuantity` does.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400 } },
    { name: "Lodge", cause: "Queue", cost: { Stone: 250 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 400);
}

// No request can exceed what storage holds; an uncapped resource has no ceiling.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 900, Plywood: 40 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Money"), 500);
  assert.equal(sample.requestedQuantity("Plywood"), 40);
}

// The player's own setting decides whether the queue expresses demand at all.
{
  const sample = withTargets(
    [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
    { prioritizeQueue: "save" },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 0);
  assert.equal(sample.isDemanded("Stone"), false);
}

// An active trigger's action is a commitment too, and the player's own setting gates it.
{
  const triggers = {
    read: () => [
      { actionId: "city-mine", actionType: "build", cost: { Stone: 350 } },
    ],
  };
  const withTriggers = (settings = {}) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => root },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => settings,
      triggers,
    }).sample();
  const sample = withTriggers();
  assert.equal(sample.requestedQuantity("Stone"), 350);
  assert.equal(sample.isDemanded("Stone"), true);
  assert.equal(
    withTriggers({ prioritizeTriggers: "save" }).requestedQuantity("Stone"),
    0,
  );
}

// A project trigger reserves the whole remaining project, with the same doubling any part-built
// project target takes.
{
  const projectTriggers = (progress) => ({
    read: () => [
      {
        actionId: "arpalhc",
        actionType: "arpa",
        cost: { Stone: 350 },
        projectId: "lhc",
        steps: 100 - progress,
        progress,
      },
    ],
  });
  const withProjectTriggers = (progress) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => root },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => ({}),
      triggers: projectTriggers(progress),
    }).sample();
  assert.equal(withProjectTriggers(10).requestedQuantity("Stone"), 700);
  assert.equal(withProjectTriggers(99).requestedQuantity("Stone"), 350);
}

// An empty queue plans nothing.
{
  const sample = withTargets([]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 0);
  assert.equal(sample.isDemanded("Stone"), false);
}

function spaceMissionDemand({
  space = 2,
  tech = {},
  missionId = "space-moon_mission",
  resourceId = "Oil",
  control = true,
  cost = { Oil: 300 },
  costUnavailable = false,
} = {}) {
  const missionRoot = {
    tech: { space, ...tech },
    resource: { [resourceId]: { amount: 0, max: 100, stackable: true } },
  };
  return createCapturedResourceDemand({
    rootState: { readRoot: () => missionRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls: {
      resolve: (elementId) =>
        control && elementId === missionId
          ? { elementId, generation: 1, methods: ["setData"] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => (control ? [missionId] : []),
    },
    costs: {
      readCost: () => (costUnavailable ? undefined : actionPrice(cost)),
    },
    readSettings: () => ({
      missionRequest: true,
      [`bat${missionId}`]: true,
    }),
  });
}

// A captured, requested Moon mission reserves the game's own Oil cost, capped by storage.
{
  const sample = spaceMissionDemand().sample();
  assert.equal(sample.requestedQuantity("Oil"), 100);
  assert.equal(sample.isDemanded("Oil"), true);
}

// The mission grant completes at space level three, and an uncaptured or unpriceable action is
// not guessed into the demand model.
{
  assert.equal(
    spaceMissionDemand({ space: 3 }).sample().requestedQuantity("Oil"),
    0,
  );
  assert.equal(
    spaceMissionDemand({ control: false }).sample().requestedQuantity("Oil"),
    0,
  );
  assert.equal(
    spaceMissionDemand({ costUnavailable: true })
      .sample()
      .requestedQuantity("Oil"),
    0,
  );
}

// The Red mission has a distinct upstream gate and resource cost, so it is not inferred from the
// Moon mission's completion level.
{
  const sample = spaceMissionDemand({
    space: 3,
    missionId: "space-red_mission",
    resourceId: "Helium_3",
    cost: { Helium_3: 250 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(sample.isDemanded("Helium_3"), true);
  assert.equal(
    spaceMissionDemand({
      space: 4,
      missionId: "space-red_mission",
      resourceId: "Helium_3",
      cost: { Helium_3: 250 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// The Hell mission completes on a different technology field and has its own captured price.
{
  const sample = spaceMissionDemand({
    space: 3,
    tech: { hell: 0 },
    missionId: "space-hell_mission",
    resourceId: "Helium_3",
    cost: { Helium_3: 400 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 3,
      tech: { hell: 1 },
      missionId: "space-hell_mission",
      resourceId: "Helium_3",
      cost: { Helium_3: 400 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// Sun completion is keyed by solar technology, not by the generic space level.
{
  const sample = spaceMissionDemand({
    space: 4,
    tech: { solar: 0 },
    missionId: "space-sun_mission",
    resourceId: "Helium_3",
    cost: { Helium_3: 500 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 4,
      tech: { solar: 1 },
      missionId: "space-sun_mission",
      resourceId: "Helium_3",
      cost: { Helium_3: 500 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// Gas completion is the next space-level grant and uses a separately priced mission action.
{
  const sample = spaceMissionDemand({
    space: 4,
    missionId: "space-gas_mission",
    resourceId: "Helium_3",
    cost: { Helium_3: 600 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 5,
      missionId: "space-gas_mission",
      resourceId: "Helium_3",
      cost: { Helium_3: 600 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// Gas Moon follows the gas grant and keeps its own captured action cost.
{
  const sample = spaceMissionDemand({
    space: 5,
    missionId: "space-gas_moon_mission",
    resourceId: "Helium_3",
    cost: { Helium_3: 700 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 6,
      missionId: "space-gas_moon_mission",
      resourceId: "Helium_3",
      cost: { Helium_3: 700 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// Belt and Dwarf use their own discovery technologies rather than the space-level completion field.
for (const [missionId, completionTech, resourceId] of [
  ["space-belt_mission", "asteroid", "Helium_3"],
  ["space-dwarf_mission", "dwarf", "Helium_3"],
]) {
  const sample = spaceMissionDemand({
    space: 5,
    tech: { [completionTech]: 0 },
    missionId,
    resourceId,
    cost: { [resourceId]: 800 },
  }).sample();
  assert.equal(sample.requestedQuantity(resourceId), 100);
  assert.equal(
    spaceMissionDemand({
      space: 5,
      tech: { [completionTech]: 1 },
      missionId,
      resourceId,
      cost: { [resourceId]: 800 },
    })
      .sample()
      .requestedQuantity(resourceId),
    0,
  );
}

// Portal missions use their own Hell technology counters and remain demandable through the same
// captured action/cost surface as space missions.
for (const [missionId, completionTech] of [
  ["portal-pit_mission", "hell_pit"],
  ["portal-ruins_mission", "hell_ruins"],
  ["portal-gate_mission", "hell_gate"],
  ["portal-lake_mission", "hell_lake"],
  ["portal-spire_mission", "hell_spire"],
]) {
  const sample = spaceMissionDemand({
    space: 0,
    tech: { [completionTech]: 0 },
    missionId,
    resourceId: "Money",
    cost: { Money: 500 },
  }).sample();
  assert.equal(sample.requestedQuantity("Money"), 100);
  assert.equal(sample.isDemanded("Money"), true);
}

assert.equal(
  spaceMissionDemand({
    space: 0,
    tech: { hell_gate: 1 },
    missionId: "portal-gate_mission",
    resourceId: "Money",
    cost: { Money: 500 },
  })
    .sample()
    .requestedQuantity("Money"),
  0,
);

// Interstellar missions keep the same captured price path while advancing distinct technology
// counters; wormhole is the one that completes at a non-initial level.
for (const [missionId, completionTech, completionLevel] of [
  ["interstellar-alpha_mission", "alpha", 1],
  ["interstellar-proxima_mission", "proxima", 1],
  ["interstellar-nebula_mission", "nebula", 1],
  ["interstellar-neutron_mission", "neutron", 1],
  ["interstellar-blackhole_mission", "blackhole", 1],
  ["interstellar-wormhole_mission", "stargate", 3],
  ["interstellar-sirius_mission", "ascension", 3],
]) {
  const sample = spaceMissionDemand({
    space: 0,
    tech: { [completionTech]: 0 },
    missionId,
    resourceId: "Helium_3",
    cost: { Helium_3: 900 },
  }).sample();
  assert.equal(sample.requestedQuantity("Helium_3"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 0,
      tech: { [completionTech]: completionLevel },
      missionId,
      resourceId: "Helium_3",
      cost: { Helium_3: 900 },
    })
      .sample()
      .requestedQuantity("Helium_3"),
    0,
  );
}

// Galaxy missions use their own grant technology counters and the same captured action/cost
// surface after the galaxy space tab has been discovered.
for (const [missionId, completionTech, completionLevel] of [
  ["galaxy-gateway_mission", "gateway", 2],
  ["galaxy-gorddon_mission", "xeno", 3],
  ["galaxy-alien2_mission", "conflict", 1],
  ["galaxy-chthonian_mission", "chthonian", 2],
]) {
  const sample = spaceMissionDemand({
    space: 0,
    tech: { [completionTech]: 0 },
    missionId,
    resourceId: "Deuterium",
    cost: { Deuterium: 1100 },
  }).sample();
  assert.equal(sample.requestedQuantity("Deuterium"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 0,
      tech: { [completionTech]: completionLevel },
      missionId,
      resourceId: "Deuterium",
      cost: { Deuterium: 1100 },
    })
      .sample()
      .requestedQuantity("Deuterium"),
    0,
  );
}

// Grant actions that are not named *_mission still participate in the legacy mission list. The
// Jump Ship keeps the whitehole-specific demand exception marker; Sirius-B is ordinary demand.
for (const [missionId, completionTech, completionLevel] of [
  ["interstellar-sirius_b", "ascension", 4],
]) {
  const sample = spaceMissionDemand({
    space: 0,
    tech: { [completionTech]: 0 },
    missionId,
    resourceId: "Knowledge",
    cost: { Knowledge: 1200 },
  }).sample();
  assert.equal(sample.requestedQuantity("Knowledge"), 100);
  assert.equal(
    spaceMissionDemand({
      space: 0,
      tech: { [completionTech]: completionLevel },
      missionId,
      resourceId: "Knowledge",
      cost: { Knowledge: 1200 },
    })
      .sample()
      .requestedQuantity("Knowledge"),
    0,
  );
}

{
  const jumpRoot = {
    tech: { stargate: 0 },
    resource: { Money: { amount: 0, max: 100, stackable: true } },
  };
  const readJumpDemand = (settings) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => jumpRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId === "interstellar-jump_ship"
            ? { elementId, generation: 1, methods: ["setData"] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => ["interstellar-jump_ship"],
      },
      costs: { readCost: () => actionPrice({ Money: 2000 }) },
      readSettings: () => settings,
    }).sample();
  assert.equal(
    readJumpDemand({ missionRequest: true }).requestedQuantity("Money"),
    100,
  );
  assert.equal(
    readJumpDemand({
      missionRequest: true,
      prestigeBioseedConstruct: true,
      prestigeType: "whitehole",
    }).requestedQuantity("Money"),
    0,
  );
}

// A root without resources yet is not a demand claim.
{
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => undefined },
    reservations: {
      readReservations: () => ({
        targets: [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
        unavailable: false,
      }),
    },
    readSettings: () => ({}),
  }).sample();
  assert.equal(sample.isDemanded("Stone"), false);
}

// The construction cycle's saving target demands its cost even with nothing queued, and does so
// whatever the queue setting says, because it is not the player's queue.
{
  const sample = withTargets(
    [],
    { prioritizeQueue: "save" },
    {
      name: "city-cottage",
      cost: { Stone: 700 },
    },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 700);
  assert.equal(sample.isDemanded("Stone"), true);
}

// Queue and saving demands combine by maximum, like every other request.
{
  const sample = withTargets(
    [{ name: "Lodge", cause: "Queue", cost: { Stone: 800 } }],
    {},
    { name: "city-cottage", cost: { Stone: 300 } },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 800);
}

// Nothing queued and nothing being saved for is no demand at all.
{
  const sample = withTargets([], {}, null).sample();
  assert.equal(sample.isDemanded("Stone"), false);
}

// Storage requirements come from the same commitments: a queued cost the player can store raises
// the requirement, and the 3% buffer the script asks for is applied.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 412);
  // Nothing is saving for Lumber, so it keeps the script's own baseline of one.
  assert.equal(sample.storageRequired("Lumber"), 1);
}

// A stackable resource can always grow into the cost, so the buffer applies whatever the cost is.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Stone: 2000 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 2060);
}

// A resource with no crates or containers cannot grow past its cap, so a cost the buffer would push
// over it is planned for half way instead of demanding the impossible.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 490 } },
  ]).sample();
  assert.equal(sample.storageRequired("Money"), 495);
}

// A cost that resource's storage can never hold takes the whole target out of the plan, rather than
// reserving storage for the parts of it that would fit.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 900, Stone: 100 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 1);
  assert.equal(sample.storageRequired("Money"), 1);
}

// The saving target contributes its own storage requirement.
{
  const sample = withTargets(
    [],
    {},
    {
      name: "city-cottage",
      cost: { Stone: 200 },
    },
  ).sample();
  assert.equal(sample.storageRequired("Stone"), 206);
}

// Nothing committed at all leaves every resource at the baseline.
{
  const sample = withTargets([]).sample();
  assert.equal(sample.storageRequired("Stone"), 1);
}

// DeadSpace's market gate is race.no_trade. A different race trait must not suppress the
// auto-market storage buffer, while no_trade must suppress it.
{
  const marketRoot = {
    race: { terrifying: true, no_trade: false },
    resource: {
      Stone: { amount: 100, max: 1000, stackable: true },
    },
  };
  const demand = (noTrade) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          ...marketRoot,
          race: { ...marketRoot.race, no_trade: noTrade },
        }),
      },
      reservations: {
        readReservations: () => ({
          targets: [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
          unavailable: false,
        }),
      },
      readSettings: () => ({
        autoMarket: true,
        sellStone: true,
        res_sell_r_Stone: 0.5,
      }),
    }).sample();
  assert.equal(demand(false).storageRequired("Stone"), 824);
  assert.equal(demand(true).storageRequired("Stone"), 412);
}

// An already-captured offered technology participates in the research fallback. The adapter
// trusts the game's offer qualification and only checks its current resource holdings.
{
  const offeredRoot = {
    race: {},
    resource: {
      Knowledge: { amount: 150, max: 500, stackable: false },
      Stone: { amount: 100, max: 1000, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => offeredRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readOfferedTechs: () => [
      { elementId: "tech-stonework", cost: { Knowledge: 100, Stone: 40 } },
      { elementId: "tech-forge", cost: { Knowledge: 200 } },
    ],
    readSettings: () => ({ researchRequestSpace: true }),
  }).sample();
  assert.equal(sample.requestedQuantity("Knowledge"), 100);
  assert.equal(sample.requestedQuantity("Stone"), 40);
  assert.equal(sample.isDemanded("Knowledge"), false);
  assert.equal(sample.isDemanded("Stone"), false);
}

// Research demand uses the captured pre-MAD gate and reserves every resource in an affordable
// current offer: an ordinary fresh run uses the ordinary setting, while post-MAD uses Space+.
{
  const demand = (tech, settings) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race: {},
          tech,
          resource: {
            Knowledge: { amount: 100, max: 500, stackable: false },
            Polymer: { amount: 50, max: 500, stackable: true },
          },
        }),
      },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readOfferedTechs: () => [
        {
          elementId: "tech-polymer-process",
          cost: { Knowledge: 100, Polymer: 50 },
        },
      ],
      readSettings: () => settings,
    }).sample();
  const ordinary = demand({}, { researchRequest: true });
  assert.equal(ordinary.requestedQuantity("Knowledge"), 100);
  assert.equal(ordinary.requestedQuantity("Polymer"), 50);
  const postMadWithoutSpace = demand({ mad: 1 }, { researchRequest: true });
  assert.equal(postMadWithoutSpace.requestedQuantity("Knowledge"), 0);
  const space = demand(
    { mad: 1 },
    { researchRequest: true, researchRequestSpace: true },
  );
  assert.equal(space.requestedQuantity("Knowledge"), 100);
  assert.equal(space.requestedQuantity("Polymer"), 50);
}

// True Path and sludge races leave the early-game window at high_tech 7, while the special
// challenge races are never treated as early game.
{
  const demand = (race, tech) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race,
          tech,
          resource: { Knowledge: { amount: 100, max: 500, stackable: false } },
        }),
      },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readOfferedTechs: () => [
        { elementId: "tech-stonework", cost: { Knowledge: 100 } },
      ],
      readSettings: () => ({ researchRequest: true }),
    }).sample();
  assert.equal(
    demand({ truepath: true }, { high_tech: 6 }).requestedQuantity("Knowledge"),
    100,
  );
  assert.equal(
    demand({ truepath: true }, { high_tech: 7 }).requestedQuantity("Knowledge"),
    0,
  );
  assert.equal(demand({ warlord: true }, {}).requestedQuantity("Knowledge"), 0);
}

// A fully captured city factory reserves its active recipe materials even without a queue target.
{
  const factoryRoot = {
    race: {},
    tech: { factory: 1 },
    city: { factory: { on: 2 } },
    resource: {
      Alloy: { amount: 0, max: 1000, stackable: true },
      Copper: { amount: 0, max: 1000, stackable: true },
      Aluminium: { amount: 0, max: 1000, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => factoryRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      productionFactoryFocusMaterials: true,
      production_Lux: false,
      production_Furs: false,
      production_Alloy: true,
      production_Polymer: false,
      production_Nano: false,
      production_Stanene: false,
      production_w_Alloy: 1,
      productionFactoryMinIngredients: 0,
    }),
  }).sample();
  assert.equal(sample.requestedQuantity("Copper"), 273.8);
  assert.equal(sample.requestedQuantity("Aluminium"), 365);
  assert.equal(sample.storageRequired("Copper"), 5.15);
}

// Factory-focus demand also reserves the materials for captured Foundry recipes. The recipe
// reader is the game's own cost path, while the root contributes the available ordinary and
// skilled craftsman pools.
{
  const foundryRoot = {
    city: { foundry: {} },
    civic: { craftsman: { max: 4 } },
    race: { servants: { smax: 2 } },
    resource: {
      Lumber: { amount: 0, max: 1000, stackable: true },
      Plywood: { amount: 0, max: -1, stackable: false, display: true },
    },
  };
  const demand = createCapturedResourceDemand({
    rootState: { readRoot: () => foundryRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      productionFactoryFocusMaterials: true,
      foundry_p_Plywood: 0,
    }),
    craftCosts: {
      read: (resourceId) =>
        resourceId === "Plywood" ? new Map([["Lumber", 2]]) : undefined,
    },
  });
  const sample = demand.sample();
  assert.equal(sample.requestedQuantity("Lumber"), (6 * 120 * 2) / 140);
  assert.equal(sample.isDemanded("Lumber"), true);

  const focusOff = createCapturedResourceDemand({
    rootState: { readRoot: () => foundryRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({}),
    craftCosts: {
      read: () => new Map([["Lumber", 2]]),
    },
  }).sample();
  assert.equal(focusOff.requestedQuantity("Lumber"), 0);
}

// DeadSpace regional storage is scoped by the paying pool. A Mars cost that exceeds Mars's
// ledger must fail closed even when the civilization-wide cap could hold it.
{
  const regionalRoot = {
    race: { supplyZones: true, supplySplit: true },
    tech: { shadow: 5 },
    resource: {
      Iron: {
        amount: 0,
        max: 1000,
        stackable: false,
        reg: { spc_mars: 0 },
        regMax: { spc_mars: 100 },
      },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => regionalRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    construction: {
      readSavingTarget: () => ({
        name: "Mars depot",
        pool: "spc_mars",
        cost: { Iron: 150 },
      }),
      readKnowledgeRequirement: () => 0,
    },
    readSettings: () => ({}),
  }).sample();
  assert.equal(sample.storageRequired("Iron", "spc_mars"), 1);
  assert.equal(sample.storageRequired("Iron"), 1);
}

// The Inflation assist reserves the game's own win total while the shared captured
// save-money answer says to stop spending.
{
  const inflationRoot = {
    race: { inflation: 1, universe: "standard" },
    tech: {},
    resource: {
      Money: { amount: 0, max: 30e10, diff: 1e9, stackable: false },
    },
    stats: { achieve: { wheelbarrow: {} } },
  };
  const demand = (assist) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => inflationRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => ({
        inflationChallengeAssist: assist,
        inflationChallengeSaveMinutes: 30,
      }),
    }).sample();
  assert.equal(demand(true).requestedQuantity("Money"), 25e10);
  assert.equal(demand(true).isDemanded("Money"), true);
  assert.equal(demand(false).requestedQuantity("Money"), 0);
}

// The Retirement assist reserves the Tau Graphene plan while Isolation Protocol is unresearched.
{
  const retirementRoot = (isolation, truepath = true) => ({
    race: { truepath },
    tech: isolation > 0 ? { isolation } : {},
    resource: {
      Graphene: { amount: 0, max: 300e6, stackable: true },
    },
  });
  const demand = (isolation, truepath) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => retirementRoot(isolation, truepath) },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => ({
        retirementChallengeAssist: true,
        prestigeType: "retire",
      }),
    }).sample();
  assert.equal(demand(0).requestedQuantity("Graphene"), 200e6);
  assert.equal(demand(0, 1).requestedQuantity("Graphene"), 200e6);
  assert.equal(demand(0).isDemanded("Graphene"), true);
  assert.equal(demand(1).requestedQuantity("Graphene"), 0);
}

// The True Path AI hardware target reserves the game's own price for the planned building.
// Core 3 with titan 8 and eris 4 unlocks the complete field, so the pure planner ranks all
// four: the Decoder removes the most Colonists per Money here and wins.
{
  const aiRoot = {
    race: { truepath: true },
    tech: { titan: 8, titan_ai_core: 3, eris: 4 },
    space: {
      decoder: { count: 1, on: 1 },
      ai_colonist: { count: 0, on: 0 },
      shock_trooper: { count: 0, on: 0 },
      tank: { count: 0, on: 0 },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const aiPrices = {
    "space-decoder": { Money: 12.5e6 },
    "space-ai_colonist": { Money: 112e6 },
    "space-shock_trooper": { Money: 4.25e6 },
    "space-tank": { Money: 8.5e6 },
  };
  const aiDemand = (prestigeType, prices = aiPrices) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => aiRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId in prices
            ? { elementId, generation: 1, methods: ["setData"] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => Object.keys(prices),
      },
      costs: {
        readCost: (actionId) =>
          actionId in prices ? actionPrice(prices[actionId]) : undefined,
      },
      readSettings: () => ({ prestigeType }),
    }).sample();
  assert.equal(aiDemand("apocalypse").requestedQuantity("Money"), 12.5e6);
  assert.equal(aiDemand("apocalypse").isDemanded("Money"), true);
  aiRoot.race.truepath = 1;
  assert.equal(aiDemand("apocalypse").requestedQuantity("Money"), 12.5e6);
  assert.equal(aiDemand("none").requestedQuantity("Money"), 0);
}

// Core 3 alone unlocks only the Colonist, so a lone captured Colonist price is the complete
// eligible field rather than a partial one, and reserves exactly.
{
  const singleRoot = {
    race: { truepath: true },
    tech: { titan_ai_core: 3 },
    space: {
      decoder: { count: 1, on: 1 },
      ai_colonist: { count: 0, on: 0 },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => singleRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls: {
      resolve: (elementId) =>
        elementId === "space-ai_colonist"
          ? { elementId, generation: 1, methods: ["setData"] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => ["space-ai_colonist"],
    },
    costs: {
      readCost: (actionId) =>
        actionId === "space-ai_colonist"
          ? actionPrice({ Money: 112e6 })
          : undefined,
    },
    readSettings: () => ({ prestigeType: "apocalypse" }),
  }).sample();
  assert.equal(sample.requestedQuantity("Money"), 112e6);
  assert.equal(sample.isDemanded("Money"), true);
}

// Titan 8 with core 3 but eris below 3 leaves the Trooper and Tank locked: the eligible
// Decoder and Colonist rank alone. An eligible price gone missing instead stands the
// target down, because a missing candidate must never win by absence.
{
  const unlockRoot = {
    race: { truepath: true },
    tech: { titan: 8, titan_ai_core: 3 },
    space: {
      decoder: { count: 1, on: 1 },
      ai_colonist: { count: 0, on: 0 },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const unlockDemand = (priced) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => unlockRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId in priced
            ? { elementId, generation: 1, methods: ["setData"] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => Object.keys(priced),
      },
      costs: {
        readCost: (actionId) =>
          actionId in priced ? actionPrice(priced[actionId]) : undefined,
      },
      readSettings: () => ({ prestigeType: "apocalypse" }),
    }).sample();
  assert.equal(
    unlockDemand({
      "space-decoder": { Money: 12.5e6 },
      "space-ai_colonist": { Money: 112e6 },
    }).requestedQuantity("Money"),
    12.5e6,
  );
  assert.equal(
    unlockDemand({ "space-ai_colonist": { Money: 112e6 } }).requestedQuantity(
      "Money",
    ),
    0,
  );
}

// With a ready report the missing Tank is a locked competitor (eris 4), so the eligible
// subset ranks and the Decoder reserves exactly. A failed capture instead reports
// unavailable, and the sample holds Money to its storage envelope rather than freeing it.
{
  const reportedRoot = {
    race: { truepath: true },
    tech: { titan: 8, titan_ai_core: 3, eris: 3 },
    space: {
      decoder: { count: 1, on: 1 },
      ai_colonist: { count: 0, on: 0 },
      shock_trooper: { count: 0, on: 0 },
      tank: { count: 0, on: 0 },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const reportedPrices = {
    "space-decoder": { Money: 12.5e6 },
    "space-ai_colonist": { Money: 112e6 },
    "space-shock_trooper": { Money: 4.25e6 },
  };
  const reportedDemand = (report) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => reportedRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId in reportedPrices
            ? { elementId, generation: 1, methods: ["setData"] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => Object.keys(reportedPrices),
      },
      costs: {
        readCost: (actionId) =>
          actionId in reportedPrices
            ? actionPrice(reportedPrices[actionId])
            : undefined,
      },
      readSettings: () => ({ prestigeType: "apocalypse" }),
      readPrerequisites: () => report,
    }).sample();
  const subset = reportedDemand({ spy: "not-needed", ai: "ready" });
  assert.equal(subset.requestedQuantity("Money"), 12.5e6);
  assert.equal(subset.isDemanded("Money"), true);
  const held = reportedDemand({ spy: "not-needed", ai: "unavailable" });
  assert.equal(held.requestedQuantity("Money"), 1e12);
  assert.equal(held.isDemanded("Money"), true);
}

// A visible Purchase-policy government reserves its government price within Money storage.
// Money holdings of zero keep the strategy's Purchase policy standing in this sample.
{
  const spyRoot = {
    race: {},
    tech: { unify: 1 },
    civic: {
      foreign: {
        gov0: {
          mil: 50,
          hstl: 20,
          unrest: 10,
          eco: 10,
          spy: 3,
          sab: 0,
          occ: false,
          anx: false,
          buy: false,
        },
      },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
    stats: { attacks: 0, achieve: { pacifist: { l: 9 } } },
  };
  const spyDemand = (autoFight, settingsOverride = {}, invokeOverride) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => spyRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId === "foreign"
            ? { elementId, generation: 1, methods: ["vis", "gvis"] }
            : undefined,
        invoke: invokeOverride ?? (() => ({ ok: true, value: true })),
        capturedElementIds: () => ["foreign"],
      },
      readSettings: () => ({
        autoFight,
        foreignUnification: true,
        foreignPolicyInferior: "Purchase",
        foreignPolicySuperior: "Occupy",
        ...settingsOverride,
      }),
    }).sample();
  const purchaseSample = spyDemand(true);
  assert.equal(purchaseSample.requestedQuantity("Money"), 197992);
  assert.equal(purchaseSample.spyPurchaseMoney, 197992);
  assert.equal(purchaseSample.isDemanded("Money"), true);
  assert.equal(spyDemand(false).requestedQuantity("Money"), 0);

  const unavailableSpyReservation = createCapturedResourceDemand({
    rootState: { readRoot: () => spyRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      autoFight: true,
      foreignUnification: true,
      foreignPolicyInferior: "Purchase",
    }),
    readPrerequisites: () => ({ spy: "unavailable", ai: "not-needed" }),
  }).sample();
  assert.equal(unavailableSpyReservation.spyPurchaseMoney, undefined);
  assert.ok(
    unavailableSpyReservation.storageRequired("Money") > 0,
    "an unavailable reserve must keep Money held",
  );

  // Unification wanted by nothing — no setting, no achievement goal, pacifist guard off —
  // reserves nothing, exactly like the compatibility purchaseMoney staying zero.
  assert.equal(
    spyDemand(true, {
      foreignUnification: false,
      achievementGuards: true,
      guardWorldDomination: false,
      guardSyndicate: false,
      guardPacifist: true,
    }).requestedQuantity("Money"),
    0,
  );
  // A hidden panel answers no reservation even when a child gvis would still say true.
  assert.equal(
    createCapturedResourceDemand({
      rootState: { readRoot: () => spyRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls: {
        resolve: (elementId) =>
          elementId === "foreign"
            ? { elementId, generation: 1, methods: ["vis", "gvis"] }
            : undefined,
        invoke: (_handle, method) => ({
          ok: true,
          value: method !== "vis",
        }),
        capturedElementIds: () => ["foreign"],
      },
      readSettings: () => ({
        autoFight: true,
        foreignUnification: true,
        foreignPolicyInferior: "Purchase",
        foreignPolicySuperior: "Occupy",
      }),
    })
      .sample()
      .requestedQuantity("Money"),
    0,
  );
}

// A Purchase operation already running owns its Money: the government is excluded while
// its `act` reads "purchase", matching the compatibility purchaseMoney filter.
{
  const runningRoot = {
    race: {},
    tech: { unify: 1 },
    civic: {
      foreign: {
        gov0: {
          mil: 50,
          hstl: 20,
          unrest: 10,
          eco: 10,
          spy: 3,
          sab: 4,
          act: "purchase",
          occ: false,
          anx: false,
          buy: false,
        },
      },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => runningRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls: {
      resolve: (elementId) =>
        elementId === "foreign"
          ? { elementId, generation: 1, methods: ["vis", "gvis"] }
          : undefined,
      invoke: () => ({ ok: true, value: true }),
      capturedElementIds: () => ["foreign"],
    },
    readSettings: () => ({
      autoFight: true,
      foreignUnification: true,
      foreignPolicyInferior: "Purchase",
      foreignPolicySuperior: "Occupy",
    }),
  }).sample();
  assert.equal(sample.requestedQuantity("Money"), 0);
  assert.equal(sample.spyPurchaseMoney, 0);
  assert.equal(sample.isDemanded("Money"), false);
}

// Research offers are storage-capacity targets even when their non-Knowledge cost is not
// currently affordable. Requested quantity and storage requirement stay separate.
{
  const sample = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Polymer: { amount: 0, max: 100, stackable: true },
        },
      }),
    },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readOfferedTechs: () => [
      { elementId: "tech-polymer-heavy", cost: { Polymer: 700 } },
    ],
    readSettings: () => ({ researchRequest: true }),
  }).sample();
  assert.equal(sample.requestedQuantity("Polymer"), 0);
  assert.equal(sample.storageRequired("Polymer"), 721);
}

// Every managed building candidate contributes its current game price, even when another
// candidate is the construction cycle's saving target. Only best effort drops an unavailable row.
{
  const priced = [];
  let missingBuildCost = true;
  const managedBuildDemand = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Alloy: { amount: 0, max: 100, stackable: true },
        },
      }),
    },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({ autoBuild: true }),
    construction: { readSavingTarget: () => null },
    readBuildTargets: () => [
      { key: "city-foundry", elementId: "city-foundry", weighting: 10 },
      { key: "city-refinery", elementId: "city-refinery", weighting: 5 },
      { key: "city-unpriced", elementId: "city-unpriced", weighting: 1 },
    ],
    costs: {
      readCost: (elementId) => {
        priced.push(elementId);
        if (elementId === "city-unpriced" && missingBuildCost) return undefined;
        return {
          cost: { Alloy: elementId === "city-foundry" ? 500 : 650 },
          pool: undefined,
        };
      },
    },
  });
  const sample = managedBuildDemand.sample();
  assert.deepEqual(priced, ["city-foundry", "city-refinery", "city-unpriced"]);
  assert.equal(sample.storageRequired("Alloy"), 669.5);
  assert.equal(
    managedBuildDemand.sampleExact().reason.message,
    "managed build target cannot be priced: city-unpriced",
    "fresh build offers cannot replace missing costs",
  );
  missingBuildCost = false;
  assert.equal(
    managedBuildDemand.sampleExact().sample.storageRequired("Alloy"),
    669.5,
  );
}

// Storage scales the drawn one-percent A.R.P.A. price to the same effective step the old project
// updater exposed. Per-project enablement still contributes with the global action gate off.
{
  const sample = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Iron: { amount: 0, max: 1000, stackable: true },
        },
      }),
    },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      autoARPA: false,
      arpaStep: 10,
      storageAssignExtra: true,
      arpa_enabled: true,
      arpa_disabled: false,
      arpa_missing: true,
    }),
    readProjects: () => [
      {
        elementId: "arpaenabled",
        projectId: "enabled",
        rank: 0,
        progress: 0,
        cost: { Iron: 100 },
      },
      {
        elementId: "arpadisabled",
        projectId: "disabled",
        rank: 0,
        progress: 0,
        cost: { Iron: 2000 },
      },
      // Locked projects are absent from the game's current offered catalog.
    ],
  }).sample();
  assert.equal(sample.storageRequired("Iron"), 1030);
}

// The old updater floors the selected step and keeps one step even at the last fraction of a
// project or when storage cannot hold one percent. Capacity across all priced resources limits
// normal targets; a trigger target instead asks for the remaining project up to 100%.
{
  const resources = (maxima) =>
    Object.entries(maxima).map(([id, maxQuantity]) => ({
      id,
      maxQuantity,
      maxCost: 0,
      storageRequired: 1,
      hasStorage: true,
      autoSellEnabled: false,
      autoSellRatio: 0,
    }));
  const targetCosts = ({
    perPercentCosts,
    progress = 0,
    stepPercent = 10,
    trigger = false,
    maxima,
  }) =>
    Object.fromEntries(
      calculateArpaStorageTargetCosts({
        perPercentCosts: Object.entries(perPercentCosts).map(
          ([resourceId, amount]) => ({ resourceId, amount }),
        ),
        progress,
        stepPercent,
        isTriggerTarget: trigger,
        resources: resources(maxima),
      }).map(({ resourceId, amount }) => [resourceId, amount]),
    );

  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100 },
      stepPercent: 1,
      maxima: { Iron: 1000 },
    }),
    { Iron: 100 },
  );
  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100 },
      progress: 99.9,
      maxima: { Iron: 1000 },
    }),
    { Iron: 100 },
  );
  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100 },
      maxima: { Iron: 350 },
    }),
    { Iron: 300 },
  );
  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100 },
      maxima: { Iron: 50 },
    }),
    { Iron: 100 },
  );
  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100, Polymer: 20 },
      maxima: { Iron: 800, Polymer: 50 },
    }),
    { Iron: 200, Polymer: 40 },
  );
  assert.deepEqual(
    targetCosts({
      perPercentCosts: { Iron: 100 },
      progress: 20,
      trigger: true,
      maxima: { Iron: 10000 },
    }),
    { Iron: 8000 },
  );
}

// Storage carries the capacity-clamped effective cost into the existing 3% buffer and keeps the
// legacy one-step floor visible through maxCost even when that exceeds current storage capacity.
{
  const run = (max, progress = 0) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race: {},
          resource: {
            Iron: { amount: 0, max, stackable: true },
          },
        }),
      },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => ({
        arpaStep: 10,
        storageAssignExtra: true,
        arpa_lhc: true,
      }),
      readProjects: () => [
        {
          elementId: "arpalhc",
          projectId: "lhc",
          rank: 0,
          progress,
          cost: { Iron: 100 },
        },
      ],
    }).sample();
  assert.equal(run(350).maxCost?.("Iron"), 300);
  assert.equal(run(350).storageRequired("Iron"), 309);
  assert.equal(run(50).maxCost?.("Iron"), 100);
  // Stackable resources keep the full requirement even when the one-step cost exceeds their
  // current capacity; the 3% buffer therefore remains visible.
  assert.equal(run(50).storageRequired("Iron"), 103);
  assert.equal(run(1000, 99.9).storageRequired("Iron"), 103);
}

// A matching active trigger gets the whole remaining project, still limited by storage capacity.
{
  const sample = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: { Iron: { amount: 0, max: 10000, stackable: true } },
      }),
    },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      arpaStep: 10,
      storageAssignExtra: true,
      arpa_lhc: true,
    }),
    triggers: {
      read: () => [
        {
          actionId: "arpalhc",
          actionType: "arpa",
          cost: { Iron: 100 },
          projectId: "lhc",
          steps: 80,
          progress: 20,
        },
      ],
    },
    readProjects: () => [
      {
        elementId: "arpalhc",
        projectId: "lhc",
        rank: 0,
        progress: 20,
        cost: { Iron: 100 },
      },
    ],
  }).sample();
  assert.equal(sample.storageRequired("Iron"), 8240);
}

// The real captured trigger reader and resource-demand storage planner share the same
// capacity-limited ARPA step. The whole 80% remainder costs 8000 Iron, but current capacity
// supports an actionable 10% chunk that Storage buffers to 1030.
{
  const { targets, sample } = arpaProductionScenario();
  assert.deepEqual(targets, [
    {
      actionId: "arpalhc",
      actionType: "arpa",
      cost: { Iron: 1000 },
      projectId: "lhc",
      steps: 10,
      progress: 20,
      percentCosts: { Iron: 100 },
    },
  ]);
  assert.equal(sample.maxCost?.("Iron"), 1000);
  assert.equal(sample.storageRequired("Iron"), 1030);
}

// The trigger uses the full remaining project when it fits, and the minimum one-percent step
// when capacity allows exactly one.
{
  const fullyAffordable = arpaProductionScenario({
    capacities: { Iron: 10000 },
  });
  assert.equal(fullyAffordable.targets[0]?.steps, 80);
  assert.deepEqual(fullyAffordable.targets[0]?.cost, { Iron: 8000 });

  const oneStep = arpaProductionScenario({ capacities: { Iron: 100 } });
  assert.equal(oneStep.targets[0]?.steps, 1);
  assert.deepEqual(oneStep.targets[0]?.cost, { Iron: 100 });

  const finalFraction = arpaProductionScenario({ progress: 99.9 });
  assert.equal(finalFraction.targets[0]?.steps, 1);
  assert.deepEqual(finalFraction.targets[0]?.cost, { Iron: 100 });
}

// The tightest resource controls a multi-resource project's shared step count.
{
  const { targets } = arpaProductionScenario({
    capacities: { Iron: 1000, Polymer: 450 },
    perPercentCosts: { Iron: 100, Polymer: 50 },
  });
  assert.equal(targets[0]?.steps, 9);
  assert.deepEqual(targets[0]?.cost, { Iron: 900, Polymer: 450 });
}

// An unexpandable resource that cannot hold one percent keeps the trigger unavailable.
{
  const { targets } = arpaProductionScenario({
    capacities: { Iron: 50 },
    stackable: { Iron: false },
  });
  assert.deepEqual(targets, []);
}

// Stackable storage can grow to hold the legacy one-step floor even when it exceeds today's cap.
{
  const { targets, sample } = arpaProductionScenario({
    capacities: { Iron: 50 },
  });
  assert.equal(targets[0]?.steps, 1);
  assert.deepEqual(targets[0]?.cost, { Iron: 100 });
  assert.equal(sample.storageRequired("Iron"), 103);
}

// Disabled or incomplete trigger conditions leave the regular configured ARPA step in Storage.
{
  for (const scenario of [{ autoTrigger: false }, { requirementCount: 4 }]) {
    const { targets, sample } = arpaProductionScenario(scenario);
    assert.deepEqual(targets, []);
    assert.equal(sample.maxCost?.("Iron"), 500);
    assert.equal(sample.storageRequired("Iron"), 515);
  }
}

// Outer-fleet capacity uses expandability and the old non-ignore priority gate, not the
// stricter "request" gate used for spending demand.
{
  const demand = (settings, nextShipExpandable) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race: {},
          resource: {
            Iron: { amount: 0, max: 100, stackable: true },
          },
        }),
      },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readSettings: () => settings,
      fleet: {
        read: () => ({
          nextShipAffordable: false,
          nextShipExpandable,
          nextShipCost: [{ resourceId: "Iron", amount: 700 }],
        }),
      },
    }).sample();
  assert.equal(
    demand(
      { autoFleet: true, prioritizeOuterFleet: "save" },
      true,
    ).storageRequired("Iron"),
    721,
  );
  assert.equal(
    demand(
      { autoFleet: false, prioritizeOuterFleet: "save" },
      true,
    ).storageRequired("Iron"),
    1,
  );
  assert.equal(
    demand(
      { autoFleet: true, prioritizeOuterFleet: "ignore" },
      true,
    ).storageRequired("Iron"),
    1,
  );
  assert.equal(
    demand(
      { autoFleet: true, prioritizeOuterFleet: "save" },
      false,
    ).storageRequired("Iron"),
    1,
  );
}

// The storage inputs this slice extends remain additive: existing queued, trigger, and Mech costs
// still reserve capacity alongside the separately covered factory recipe targets.
{
  const sample = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Stone: { amount: 0, max: 1000, stackable: true },
          Copper: { amount: 0, max: 1000, stackable: true },
          Supply: { amount: 0, max: 1000, stackable: true },
          Soul_Gem: { amount: 0, max: 1000, stackable: true },
        },
      }),
    },
    reservations: {
      readReservations: () => ({
        targets: [{ name: "queued", cause: "Queue", cost: { Stone: 400 } }],
        unavailable: false,
      }),
    },
    triggers: {
      read: () => [
        { actionId: "city-mine", actionType: "build", cost: { Copper: 350 } },
      ],
    },
    mechDemand: {
      read: () => ({
        plan: { status: "ready", cost: { supply: 500, gems: 300, space: 1 } },
        immediatePlan: { status: "none" },
      }),
    },
    readSettings: () => ({}),
  }).sample();
  assert.equal(sample.storageRequired("Stone"), 412);
  assert.equal(sample.storageRequired("Copper"), 360.5);
  assert.equal(sample.storageRequired("Supply"), 515);
  assert.equal(sample.storageRequired("Soul_Gem"), 309);
}

// The three Mech-facing views intentionally use different reservations: ordinary demand includes
// Mech, its budget excludes Mech, and Mech-first priority also excludes construction saving.
{
  const sample = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Iron: { amount: 0, max: 1000 },
          Stone: { amount: 0, max: 1000 },
          Supply: { amount: 0, max: 1000 },
        },
      }),
    },
    reservations: {
      readReservations: () => ({
        targets: [{ name: "queue", cause: "Queue", cost: { Iron: 200 } }],
        unavailable: false,
      }),
    },
    construction: {
      readSavingTarget: () => ({ name: "build", cost: { Stone: 500 } }),
    },
    mechDemand: {
      read: (reserved) => {
        assert.deepEqual(reserved, { supply: 0, soulGems: 0 });
        return {
          plan: { status: "ready", cost: { supply: 300, gems: 0, space: 1 } },
          immediatePlan: { status: "none" },
        };
      },
    },
    readSettings: () => ({ prioritizeQueue: "req" }),
  }).sample();
  assert.equal(sample.requestedQuantity("Supply"), 300);
  assert.equal(sample.requestedQuantityExcludingMech("Supply"), 0);
  assert.equal(sample.requestedQuantity("Stone"), 500);
  assert.equal(sample.requestedQuantityForMechPriority("Stone"), 0);
  assert.equal(sample.requestedQuantityForMechPriority("Iron"), 200);
}

// One sample owns each mutable authority read; the next sample sees all updated values.
{
  let queueCost = 100;
  let techCost = 120;
  let buildCost = 140;
  let savingCost = 160;
  let maximum = 1000;
  const calls = {
    queue: 0,
    offered: 0,
    build: 0,
    projects: 0,
    fleet: 0,
    saving: 0,
  };
  const demand = createCapturedResourceDemand({
    rootState: {
      readRoot: () => ({
        race: {},
        resource: {
          Iron: { amount: 0, max: maximum },
          Stone: { amount: 0, max: maximum },
          Research: { amount: 0, max: maximum },
          Wood: { amount: 0, max: maximum },
        },
      }),
    },
    reservations: {
      readReservations: () => {
        calls.queue++;
        return {
          targets: [
            { name: "queue", cause: "Queue", cost: { Iron: queueCost } },
          ],
          unavailable: false,
        };
      },
    },
    construction: {
      readSavingTarget: () => {
        calls.saving++;
        return { name: "saving", cost: { Stone: savingCost } };
      },
    },
    readOfferedTechs: () => {
      calls.offered++;
      return [{ elementId: "tech-test", cost: { Research: techCost } }];
    },
    readBuildTargets: () => {
      calls.build++;
      return [{ key: "city-test", elementId: "city-test", weighting: 1 }];
    },
    readProjects: () => {
      calls.projects++;
      return [];
    },
    costs: { readCost: () => ({ cost: { Wood: buildCost } }) },
    fleet: {
      read: () => {
        calls.fleet++;
        return {
          nextShipAffordable: false,
          nextShipExpandable: false,
          nextShipCost: [],
        };
      },
    },
    readSettings: () => ({
      prioritizeQueue: "req",
      researchRequest: true,
      autoBuild: true,
      arpa_lhc: true,
    }),
  });
  const first = demand.sample();
  assert.deepEqual(calls, {
    queue: 1,
    offered: 1,
    build: 1,
    projects: 1,
    fleet: 1,
    saving: 1,
  });
  assert.equal(first.requestedQuantity("Iron"), 100);
  assert.ok(Math.abs(first.storageRequired("Wood") - 144.2) < 1e-9);
  queueCost = 210;
  techCost = 220;
  buildCost = 230;
  savingCost = 240;
  maximum = 200;
  const second = demand.sample();
  assert.deepEqual(calls, {
    queue: 2,
    offered: 2,
    build: 2,
    projects: 2,
    fleet: 2,
    saving: 2,
  });
  assert.equal(second.requestedQuantity("Iron"), 200);
  assert.equal(second.requestedQuantity("Stone"), 200);
  assert.equal(second.storageRequired("Wood"), 1);
}

// Factory material feedback uses the base request map: a requested output demands its recipe,
// while an output with no base request leaves those ingredients unrequested.
{
  const factorySample = (targets) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race: {},
          tech: { factory: 1 },
          city: { factory: { on: 1 } },
          resource: {
            Alloy: { amount: 0, max: 1000 },
            Copper: { amount: 0, max: 1000 },
            Aluminium: { amount: 0, max: 1000 },
            Furs: { amount: 0, max: 1000 },
            Stone: { amount: 0, max: 1000 },
          },
        }),
      },
      reservations: {
        readReservations: () => ({ targets, unavailable: false }),
      },
      readSettings: () => ({
        prioritizeQueue: "req",
        production_Alloy: true,
        productionFactoryMinIngredients: 0,
      }),
    }).sample();
  const feedback = factorySample([
    { name: "alloy", cause: "Queue", cost: { Alloy: 400 } },
  ]);
  assert.equal(feedback.requestedQuantity("Copper"), 139.4);
  assert.equal(
    factorySample([
      { name: "stone", cause: "Queue", cost: { Stone: 400 } },
    ]).requestedQuantity("Copper"),
    0,
  );
}

// The sampler prepares common planner work once and reports its per-sample operations.
{
  const counts = new Map();
  const diagnostics = {
    nowMs: () => 0,
    readPerformanceEnabled: () => true,
    recordPerformance: () => {},
    recordCount: (name, amount) =>
      counts.set(name, (counts.get(name) ?? 0) + amount),
  };
  createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({
        targets: [{ name: "queued", cause: "Queue", cost: { Stone: 100 } }],
        unavailable: false,
      }),
    },
    readSettings: () => ({ prioritizeQueue: "req" }),
    diagnostics,
  }).sample();
  assert.equal(counts.get("demand.sample.planCalls"), 0);
  assert.equal(counts.get("demand.sample.commonPreparations"), 1);
  assert.equal(counts.get("demand.sample.queueReservationReads"), 1);
  assert.equal(counts.get("demand.sample.queueTargetConversions"), 1);
  assert.equal(counts.get("demand.sample.evaluateCalls"), 2);
  assert.equal(counts.get("demand.sample.requestQuantityEvaluations"), 3);
  assert.equal(counts.get("demand.sample.planStorageCalls"), 1);
  assert.equal(counts.get("demand.sample.structureRegistryReads"), 0);
}

// Ordinary and exact views share one completeness-checked input capture in an unchanged epoch.
{
  const counts = new Map();
  let epoch = 0;
  let queueReads = 0;
  const diagnostics = {
    nowMs: () => 0,
    readPerformanceEnabled: () => true,
    recordPerformance: () => {},
    recordCount: (name, amount) =>
      counts.set(name, (counts.get(name) ?? 0) + amount),
  };
  const demand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    readDemandEpoch: () => epoch,
    reservations: {
      readReservations: () => {
        queueReads += 1;
        return { targets: [], unavailable: false };
      },
    },
    readSettings: () => ({ prioritizeQueue: "req" }),
    diagnostics,
  });
  demand.sample();
  assert.equal(demand.sampleExact().status, "ready");
  assert.equal(queueReads, 1);
  assert.equal(counts.get("demand.sample.inputCaptures"), 1);
  assert.equal(counts.get("demand.sampleExact.inputCaptures"), undefined);
  assert.equal(counts.get("demand.sampleExact.preparedReuseHits"), 1);

  epoch += 1;
  assert.equal(demand.sampleExact().status, "ready");
  assert.equal(
    queueReads,
    2,
    "an invalidated epoch performs one new exact capture",
  );
}

// Exact reuse retains unavailable authority metadata; it cannot turn a missing offer catalog empty.
{
  let epoch = 0;
  let offerReads = 0;
  let queueReads = 0;
  const demand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    readDemandEpoch: () => epoch,
    reservations: {
      readReservations: () => {
        queueReads += 1;
        return { targets: [], unavailable: false };
      },
    },
    readSettings: () => ({ prioritizeQueue: "req" }),
    readOfferedTechs: () => {
      offerReads += 1;
      return undefined;
    },
  });
  demand.sample();
  assert.equal(demand.sampleExact().status, "unavailable");
  assert.equal(demand.sampleExact().status, "unavailable");
  assert.equal(offerReads, 1);
  assert.equal(queueReads, 1);

  epoch += 1;
  assert.equal(demand.sampleExact().status, "unavailable");
  assert.equal(offerReads, 2, "a new epoch retries unavailable authority once");
}

console.log("Captured resource-demand adapter tests passed");
