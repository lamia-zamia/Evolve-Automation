import assert from "node:assert/strict";

import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const root = {
  race: {},
  resource: {
    Stone: { amount: 100, max: 1000, stackable: true },
    Lumber: { amount: 900, max: 1000, stackable: true },
    Money: { amount: 0, max: 500, stackable: false },
    Plywood: { amount: 0, max: -1, stackable: false },
  },
};

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
        generation: 1,
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
    costs: { readCost: () => (costUnavailable ? undefined : cost) },
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
      costs: { readCost: () => ({ Money: 2000 }) },
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

// Research demand uses the captured pre-MAD gate: an ordinary fresh run uses the ordinary
// research setting, while a post-MAD run uses the separate Space+ setting.
{
  const demand = (tech) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          race: {},
          tech,
          resource: {
            Knowledge: { amount: 100, max: 500, stackable: false },
          },
        }),
      },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      readOfferedTechs: () => [
        { elementId: "tech-stonework", cost: { Knowledge: 100 } },
      ],
      readSettings: () => ({
        researchRequest: true,
        researchRequestSpace: false,
      }),
    }).sample();
  assert.equal(demand({}).requestedQuantity("Knowledge"), 100);
  assert.equal(demand({ mad: 1 }).requestedQuantity("Knowledge"), 0);
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

console.log("Captured resource-demand adapter tests passed");
