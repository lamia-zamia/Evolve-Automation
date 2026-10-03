import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createCapturedFleetControls } from "../src/adapters/evolve/combat/captured-fleet-controls.ts";
import { createCapturedOuterFleetAdapter } from "../src/adapters/evolve/combat/captured-fleet-outer.ts";
import { parseShipyardPartCatalog } from "../src/adapters/evolve/combat/captured-outer-fleet-parts.ts";
import {
  planOuterFleetBlueprint,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
} from "../src/domain/combat/fleet-outer.ts";
import { createCapturedOuterFleetControl } from "../src/bootstrap/captured-fleet-outer-control.ts";
import { element, parseTestMarkup } from "./dom-fixture.mjs";

/**
 * The yard's own part catalogue, as the option markup `drawShipYard()` emits it.
 *
 * `ships.js:shipParts` is transcribed here in the unlock order the yard walks it, because that order
 * *is* a part's option index and `avail()` is called with it. This is fixture data standing in for
 * markup the game produced — the transcription of the whole yard, markup included, is
 * `captured-outer-fleet-dispatch-test.mjs`.
 */
function shipyardCatalog(shipParts) {
  const plans = element("div", { id: "shipPlans" });
  for (const [type, values] of Object.entries(shipParts)) {
    values.forEach((value, index) => {
      plans.append(
        ...parseTestMarkup(
          `<b-dropdown-item class="${type} a${index}" data-val="${value}"></b-dropdown-item>`,
        ),
      );
    });
  }
  const catalog = parseShipyardPartCatalog(plans);
  if (catalog === undefined)
    throw new Error("the fixture catalogue did not parse");
  return catalog;
}

const WEAPONS = [
  "railgun",
  "laser",
  "p_laser",
  "plasma",
  "phaser",
  "disruptor",
  "gauss",
];

const SHIP_PARTS = {
  class: [
    "corvette",
    "frigate",
    "destroyer",
    "cruiser",
    "battlecruiser",
    "dreadnought",
    "freighter",
    "explorer",
    "supply_ship",
  ],
  power: ["solar", "diesel", "fission", "fusion", "elerium", "antimatter"],
  weapon: WEAPONS,
  armor: ["steel", "alloy", "neutronium", "aerographene"],
  engine: [
    "ion",
    "tie",
    "pulse",
    "photon",
    "vacuum",
    "emdrive",
    "electrokinetic",
  ],
  sensor: ["visual", "radar", "lidar", "quantum"],
  special: [
    "none",
    "massdriver",
    "extra_fuel",
    "extra_cargo",
    "extra_thruster",
    "mobile_storage",
    "fuel_tanker",
    "repair_ship",
  ],
};

function createFixture({ append = true } = {}) {
  const ships = [];
  const calls = [];
  const avail = [];
  const data = { s: { ships, sort: false } };
  const methods = {
    avail: (type, index, part) => {
      avail.push([type, index, part]);
      return part === "railgun";
    },
    setVal: (type, part) => calls.push(["setVal", type, part]),
    powerText: () => "100kW",
    build: () => {
      calls.push(["build"]);
      if (append) ships.push({ location: outerAssignmentPoint("spc_dwarf") });
    },
  };
  const handle = {
    elementId: "shipPlans",
    generation: 1,
    methods: Object.keys(methods),
    data,
  };
  const controls = {
    resolve: (elementId) => (elementId === "shipPlans" ? handle : undefined),
    invoke: (current, method, args = []) => {
      const fn = methods[method];
      if (current !== handle || fn === undefined) {
        return { ok: false, reason: "unknown-method" };
      }
      return { ok: true, value: fn(...args) };
    },
    capturedElementIds: () => ["shipPlans"],
  };
  return {
    controls: createCapturedFleetControls({
      controls,
      parts: { catalog: () => shipyardCatalog({ weapon: WEAPONS }) },
    }),
    calls,
    avail,
    ships,
  };
}

const ready = createFixture();
assert.equal(ready.controls.isRendered("shipPlans"), true);
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
  }),
  true,
);
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "laser",
  }),
  false,
);
// The index that reached `avail` is the one the yard's markup gave the part, not one the caller chose.
assert.deepEqual(ready.avail, [
  ["weapon", 0, "railgun"],
  ["weapon", 1, "laser"],
]);
// A part the yard never offered is unavailable, whatever the control would answer about it.
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "bolt_caster",
  }),
  false,
);
assert.equal(ready.avail.length, 2, "an uncatalogued part was asked about");
assert.deepEqual(ready.controls.currentDesign("shipPlans"), undefined);
assert.equal(
  ready.controls.setPart({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
  }),
  true,
);
assert.equal(ready.controls.hasShipPower("shipPlans"), true);
assert.deepEqual(ready.controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: 0,
});
assert.equal(ready.ships.length, 1);

const noTransition = createFixture({ append: false });
assert.deepEqual(noTransition.controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: null,
});
assert.equal(noTransition.ships.length, 0);

// A full captured composition. One pass builds a ship and the same pass sends it: the dispatch is
// reached through the game's own ship-row closure, and whether it worked is judged from the yard's
// own report of the ship afterwards, never from the captured handler returning normally.
const yard = {
  blueprint: {
    class: "corvette",
    armor: "steel",
    weapon: "railgun",
    engine: "ion",
    power: "diesel",
    sensor: "radar",
    // `drawShipYard()` normalizes a special into every blueprint, so a captured yard always has one.
    special: "none",
  },
  ships: [],
};
const root = {
  race: { truepath: true, universe: "evil", grenadier: false },
  tech: { syndicate: 1, tauceti: 0, eris: 2, outer: 0 },
  space: {
    shipyard: yard,
    syndicate: { spc_red: 600 },
    operating_base: { on: 0 },
    sam: { on: 0 },
    fob: { on: 0 },
  },
  civic: {
    foreign: { gov3: { hstl: 50 } },
    govern: { type: "democracy" },
    garrison: { workers: 100, crew: 0 },
  },
  portal: {},
  resource: Object.assign(
    Object.fromEntries(
      [
        "Money",
        "Aluminium",
        "Adamantite",
        "Steel",
        "Alloy",
        "Neutronium",
        "Titanium",
        "Copper",
        "Iridium",
        "Iron",
        "Nano_Tube",
        "Quantium",
        "Orichalcum",
        "Tungsten",
      ].map((id) => [id, { amount: 1e12, max: 1e12 }]),
    ),
    { Authority: { amount: 100, max: 100, display: true } },
  ),
};
const capturedSettings = {
  fleetOuterShips: "custom",
  fleetOuterCrew: 30,
  fleetExploreTau: false,
  fleet_outer_pr_spc_red: 1,
  fleet_outer_def_spc_red: 0.9,
  fleet_outer_sc_spc_red: 0,
  fleet_outer_class: "corvette",
  fleet_outer_power: "diesel",
  fleet_outer_weapon: "railgun",
  fleet_outer_armor: "steel",
  fleet_outer_engine: "ion",
  fleet_outer_sensor: "radar",
  fleet_scout_class: "corvette",
  fleet_scout_power: "diesel",
  fleet_scout_weapon: "railgun",
  fleet_scout_armor: "steel",
  fleet_scout_engine: "ion",
  fleet_scout_sensor: "radar",
  authorityManage: false,
  generalMinimumAuthority: 100,
};
/**
 * What the runtime actually hands this control: the layered effective view, whose own properties
 * are the active overrides alone and whose every other key resolves through the raw record behind
 * it. Copying such a view rather than layering over it loses every ordinary setting, so the outer
 * fleet is driven through the layered shape here and nowhere through a copy of it.
 */
const effectiveSettings = Object.create(capturedSettings);
let capturedBuilds = 0;
const capturedMethods = {
  avail: () => true,
  setVal: (type, part) => {
    yard.blueprint[type] = part;
  },
  powerText: () => "100kW",
  build: () => {
    capturedBuilds++;
    yard.ships.push({
      class: yard.blueprint.class,
      power: yard.blueprint.power,
      weapon: yard.blueprint.weapon,
      armor: yard.blueprint.armor,
      engine: yard.blueprint.engine,
      sensor: yard.blueprint.sensor,
      special: yard.blueprint.special,
      location: outerAssignmentPoint("spc_dwarf"),
      fueled: true,
      damage: 0,
    });
  },
  // The yard's own answer to whether a ship is under way, mirroring `shipMoving(ships[id])`.
  show: (id) => yard.ships[id]?.movement !== undefined,
};
const capturedHandle = {
  elementId: "shipPlans",
  generation: 1,
  methods: Object.keys(capturedMethods),
  data: { s: yard },
};
const capturedRegistry = {
  resolve: (elementId) =>
    elementId === "shipPlans" ? capturedHandle : undefined,
  invoke: (handle, method, args = []) => {
    if (handle !== capturedHandle || capturedMethods[method] === undefined) {
      return { ok: false, reason: "unknown-method" };
    }
    return {
      ok: true,
      value: capturedMethods[method](...args),
    };
  },
  capturedElementIds: () => ["shipPlans"],
};

/**
 * A stand-in for the game's own dispatch capture, which has its own file and its own tests against a
 * transcription of `shipDispatchModal`. What this composition needs from it is the shape of the
 * answer: the ship's live state moves, or it does not.
 */
function createDispatchStub(kind = "launched") {
  const requests = [];
  return {
    requests,
    blockedByPlayerModal: () => false,
    dispatchShipyardShip(request) {
      requests.push({ ...request });
      if (kind !== "launched") return { kind };
      const ship = yard.ships[request.index];
      if (ship === undefined) return { kind: "no-destination" };
      ship.movement = {
        from: ship.location,
        left: 10,
        legs: [{ to: outerAssignmentPoint(request.region), days: 10 }],
      };
      return { kind: "launched" };
    },
  };
}

let dispatch = createDispatchStub();
let playerModalOpen = false;

/**
 * The yard's own cost row, as the only price this composition may quote.
 *
 * The figures are deliberately not a ship cost formula. A per-part character-code tag and a per-tier
 * multiplier produce amounts no replica of upstream's arithmetic would predict, while still moving
 * for exactly the two things that do move a design's price upstream — the parts it names, and how
 * many built ships share its cost tier. Affordability is the game's separate verdict, carried
 * alongside and never folded into the price.
 */
function partTag(part) {
  return (
    String(part)
      .split("")
      .reduce((total, character) => total + character.charCodeAt(0), 0) % 997
  );
}

function pricedAmounts(blueprint, ships) {
  const tag = [
    "class",
    "armor",
    "weapon",
    "engine",
    "power",
    "sensor",
    "special",
  ].reduce((total, type) => total + partTag(blueprint[type] ?? ""), 0);
  const sameTier = ships.filter(
    (ship) => ship.class === blueprint.class,
  ).length;
  return ["Iron", "Money"].map((resourceId) => {
    const amount = (resourceId === "Money" ? 1000 : 7) * (tag + sameTier);
    return {
      resourceId,
      amount,
      affordable: this.unaffordable.has(resourceId) !== true,
    };
  });
}

function createCostStub() {
  return {
    nativeCrew: 2,
    requests: [],
    /** The resources the game's own marking calls unaffordable. */
    unaffordable: new Set(),
    current() {
      this.requests.push(["current", yard.blueprint]);
      return {
        pool: "spc_dwarf",
        amounts: pricedAmounts.call(this, yard.blueprint, yard.ships),
      };
    },
    quote(blueprint) {
      this.requests.push(["quote", blueprint]);
      if (this.nativeCrew === undefined) return undefined;
      return {
        crew: this.nativeCrew,
        costs: {
          pool: "spc_dwarf",
          amounts: pricedAmounts.call(this, blueprint, yard.ships),
        },
      };
    },
  };
}

/**
 * The running game's own Syndicate result, which is the only authority on how defended a region is.
 *
 * The figures are deliberately distinctive: `0.7319` is not what any arithmetic over this save's
 * piracy (`spc_red: 600`), the regional cap, the rival hostility or the ships in the yard produces, so
 * a pass that reaches `spc_red` is provably following the game's answer rather than a table that
 * happens to agree with this fixture. `"unavailable"` is the game's own "no piracy" readout, which
 * rounds nothing and so leaves a caller with nothing to read.
 */
function createSyndicateStub(samples = { spc_red: { p: 0.7319, s: 47 } }) {
  return {
    samples,
    requests: [],
    read(region) {
      this.requests.push(region);
      const sample = samples[region];
      if (sample === undefined || sample === "unavailable") {
        return { kind: "invalid" };
      }
      return { kind: "value", value: { p: sample.p, s: sample.s } };
    },
  };
}
let syndicate = createSyndicateStub();
// This composition consumes the mechanics port's verdict, independently of the game's formulas.
function createOuterRegionMechanicsStub(samples = {}) {
  return {
    requests: [],
    read(region) {
      this.requests.push(region);
      return (
        samples[region] ?? {
          kind: "value",
          value: { reachable: true, syndicateEnabled: true },
        }
      );
    },
  };
}
const defaultRegionMechanics = createOuterRegionMechanicsStub();
let regionMechanics = defaultRegionMechanics;

let costs = createCostStub();
/** The one catalogue every composition here shares, as the yard's own markup would have produced it. */
const partCatalog = shipyardCatalog(SHIP_PARTS);
function createOuterControl(
  registry = capturedRegistry,
  stub = dispatch,
  costAuthority = costs,
  catalogSource = { catalog: () => partCatalog },
) {
  return createCapturedOuterFleetControl({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: registry,
    costs: costAuthority,
    parts: catalogSource,
    dispatch: {
      blockedByPlayerModal: () => playerModalOpen,
      dispatchShipyardShip: (request) => stub.dispatchShipyardShip(request),
    },
    syndicate,
    regionMechanics,
    readSettings: () => effectiveSettings,
  });
}
const outerControl = createOuterControl();
dispatch.requests.length = 0;
const built = outerControl.autoFleetOuter();
assert.equal(built.outcome.status, "succeeded");
// A confirmed build is the one pass that moves the ship the next one will be: the composition ends
// the cycle's shared demand sample on exactly this signal, because `CapturedFleetDemand` freezes
// the shipyard's own next-ship cost.
assert.equal(built.shipTargetChanged, true);
assert.equal(yard.ships.length, 1);
// Build and dispatch are one pass. The ship was sent the moment it was assembled.
assert.equal(dispatch.requests.length, 1);
assert.deepEqual(dispatch.requests[0], { index: 0, region: "spc_red" });
assert.equal(capturedMethods.show(0), true);
assert.equal(yard.ships[0].movement.legs.at(-1).to.id, "spc_red");
// Sending a ship that was already built changes where it is, not what the yard builds next.
assert.equal(outerControl.autoFleetOuter().shipTargetChanged, true);
assert.equal(dispatch.requests.length, 2);
yard.ships.length = 0;

// The game's own destination closure ran and declined. The ship was still built — that is what the
// build control confirmed — but nothing is reported as sent and no success is claimed.
const decliningControl = createOuterControl(
  capturedRegistry,
  createDispatchStub("refused"),
);
const declined = decliningControl.autoFleetOuter();
assert.equal(declined.outcome.status, "rejected");
assert.equal(
  declined.outcome.failure?.code,
  "captured-outer-fleet-dispatch-declined",
);
assert.equal(yard.ships.length, 1);
assert.equal(capturedMethods.show(0), false);
yard.ships.length = 0;

const unreachableControl = createOuterControl(
  capturedRegistry,
  createDispatchStub("unreachable"),
);
const unreachable = unreachableControl.autoFleetOuter();
assert.equal(unreachable.outcome.status, "rejected");
assert.equal(
  unreachable.outcome.failure?.code,
  "captured-outer-fleet-dispatch-unavailable",
);
yard.ships.length = 0;

// A window the player owns is on screen. Building and sending are one pass, so a pass that could not
// finish its own send must not start either half.
const buildsBeforePlayerModal = capturedBuilds;
dispatch.requests.length = 0;
playerModalOpen = true;
const playerModalResult = outerControl.autoFleetOuter();
assert.equal(playerModalResult.outcome.status, "succeeded");
assert.equal(playerModalResult.shipTargetChanged, false);
assert.equal(capturedBuilds, buildsBeforePlayerModal);
assert.equal(yard.ships.length, 0);
assert.equal(dispatch.requests.length, 0);
playerModalOpen = false;

// Authority management must reach the existing policy before build execution. A corvette removes
// two soldiers; at 100 Authority and a 99 target, the policy predicts 98 and must stand down.
const buildsBeforeAuthority = capturedBuilds;
capturedSettings.authorityManage = true;
capturedSettings.generalMinimumAuthority = 99;
yard.ships.length = 0;
assert.equal(createOuterControl().autoFleetOuter().outcome.status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeAuthority);
assert.equal(yard.ships.length, 0);

// Native crew feeds the Authority policy independently of hull/race inference.
{
  const savedClass = capturedSettings.fleet_outer_class;
  const savedSetVal = capturedMethods.setVal;
  let writes = 0;
  capturedMethods.setVal = (...args) => {
    writes++;
    savedSetVal(...args);
  };
  function authorityCandidate() {
    const adapter = createCapturedOuterFleetAdapter({
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: createCapturedFleetControls({
        controls: capturedRegistry,
        parts: { catalog: () => partCatalog },
      }),
      costs,
      parts: { catalog: () => partCatalog },
      dispatch,
      syndicate,
      regionMechanics,
      readSettings: () => effectiveSettings,
    });
    const cycle = planOuterFleetCycle(adapter.reader.readCycle());
    assert.equal(cycle.kind, "select-target");
    const target = planOuterFleetTarget(
      cycle,
      adapter.reader.readTargeting(cycle),
    );
    assert.equal(target.kind, "select-blueprint");
    const candidate = planOuterFleetBlueprint(
      adapter.reader.readBlueprint(target),
    );
    assert.equal(candidate.kind, "check-candidate");
    const input = adapter.reader.readCandidate(candidate);
    return { input, decision: planOuterFleetCandidate(input) };
  }
  function blockedAuthority(predicted, target, crew) {
    yard.ships.length = 0;
    costs.requests.length = 0;
    dispatch.requests.length = 0;
    const builds = capturedBuilds;
    const beforeWrites = writes;
    const { input, decision } = authorityCandidate();
    assert.equal(input.shipCrew, crew);
    assert.deepEqual(input.authority, {
      status: "ready",
      target,
      predicted,
      blocksRemoval: true,
    });
    assert.equal(decision.kind, "outer-fleet-status");
    assert.match(
      decision.messageAfterUpdate,
      /would lower Authority to .*below the .* target/,
    );
    const result = createOuterControl().autoFleetOuter();
    assert.equal(result.outcome.status, "succeeded");
    assert.equal(result.shipTargetChanged, false);
    assert.equal(writes, beforeWrites);
    assert.equal(capturedBuilds, builds);
    assert.equal(yard.ships.length, 0);
    assert.deepEqual(dispatch.requests, []);
    assert.equal(
      costs.requests.filter(([method]) => method === "quote").length,
      2,
    );
  }
  capturedSettings.fleet_outer_class = "destroyer";
  capturedSettings.generalMinimumAuthority = 97;
  root.race.grenadier = 1;
  costs.nativeCrew = 3;
  blockedAuthority(96, 97, 3);
  root.race.grenadier = 0;
  costs.nativeCrew = 2;
  assert.equal(authorityCandidate().input.authority.blocksRemoval, false);
  let builds = capturedBuilds;
  createOuterControl().autoFleetOuter();
  assert.equal(capturedBuilds, builds + 1);
  yard.ships.length = 0;

  capturedSettings.fleet_outer_class = "corvette";
  capturedSettings.generalMinimumAuthority = 98;
  root.tech.evil = 2;
  root.race.despot = 10;
  blockedAuthority(97, 98, 2);
  delete root.race.despot;
  assert.equal(authorityCandidate().input.authority.blocksRemoval, false);
  builds = capturedBuilds;
  createOuterControl().autoFleetOuter();
  assert.equal(capturedBuilds, builds + 1);
  yard.ships.length = 0;
  delete root.tech.evil;

  // Authority-only state is never needed for a disabled guard.
  capturedSettings.authorityManage = false;
  let despotReads = 0;
  Object.defineProperty(root.race, "despot", {
    configurable: true,
    get() {
      despotReads++;
      throw new Error("disabled Authority read");
    },
  });
  root.race.high_pop = 9;
  const disabled = authorityCandidate();
  assert.equal(disabled.input.authority.status, "not-required");
  assert.equal(despotReads, 0);
  delete root.race.high_pop;
  builds = capturedBuilds;
  createOuterControl().autoFleetOuter();
  assert.equal(capturedBuilds, builds + 1);
  assert.equal(despotReads, 0);
  yard.ships.length = 0;
  capturedSettings.authorityManage = true;
  capturedSettings.generalMinimumAuthority = 0;
  assert.equal(authorityCandidate().input.authority.status, "not-required");
  capturedSettings.generalMinimumAuthority = 98;
  root.resource.Authority.display = false;
  assert.equal(authorityCandidate().input.authority.status, "not-required");
  assert.equal(despotReads, 0);
  root.resource.Authority.display = true;
  delete root.race.despot;
  root.race.despot = "bad rank";
  assert.equal(authorityCandidate().input.authority.status, "unavailable");
  const beforeMalformed = capturedBuilds;
  assert.equal(
    createOuterControl().autoFleetOuter().outcome.status,
    "succeeded",
  );
  assert.equal(capturedBuilds, beforeMalformed);
  delete root.race.despot;
  root.race.grenadier = false;
  capturedSettings.fleet_outer_class = savedClass;
  capturedMethods.setVal = savedSetVal;
  yard.ships.length = 0;
}

// Missing root capture must stand down without touching the shipyard.
capturedSettings.authorityManage = false;
capturedSettings.generalMinimumAuthority = 0;
capturedSettings.fleetOuterShips = "custom";
const buildsBeforeMissingRoot = capturedBuilds;
const missingRootControl = createCapturedOuterFleetControl({
  rootState: {
    readRoot: () => undefined,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: capturedRegistry,
  costs,
  parts: { catalog: () => partCatalog },
  dispatch,
  syndicate,
  regionMechanics,
  readSettings: () => effectiveSettings,
});
assert.equal(missingRootControl.autoFleetOuter().outcome.status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeMissingRoot);

// A control click that appends no ship is not a successful construction.
yard.ships.length = 0;
let noTransitionBuilds = 0;
const noTransitionMethods = {
  ...capturedMethods,
  build: () => {
    noTransitionBuilds += 1;
  },
};
const noTransitionHandle = {
  elementId: "shipPlans",
  generation: 1,
  methods: Object.keys(noTransitionMethods),
  data: { s: yard },
};
const noTransitionRegistry = {
  resolve: (elementId) =>
    elementId === "shipPlans" ? noTransitionHandle : undefined,
  invoke: (handle, method, args = []) => {
    const fn = noTransitionMethods[method];
    if (handle !== noTransitionHandle || fn === undefined) {
      return { ok: false, reason: "unknown-method" };
    }
    return { ok: true, value: fn(...args) };
  },
  capturedElementIds: () => ["shipPlans"],
};
const noTransitionControl = createOuterControl(noTransitionRegistry);
assert.equal(noTransitionControl.autoFleetOuter().outcome.status, "stale");
assert.equal(noTransitionBuilds, 1);
assert.equal(yard.ships.length, 0);

// A distinctive native quote controls the exact minimum-garrison boundary despite race state.
costs.nativeCrew = 37;
root.race.grenadier = 1;
root.race.high_pop = 9;
capturedSettings.fleetOuterCrew = 64;
yard.ships.length = 0;
const beforeDistinctiveCrew = capturedBuilds;
costs.requests.length = 0;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, beforeDistinctiveCrew);
assert.equal(costs.requests.filter(([method]) => method === "quote").length, 1);
capturedSettings.fleetOuterCrew = 63;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, beforeDistinctiveCrew + 1);
costs.nativeCrew = 2;

// The native quote decides crew, even with identical hull and race state.
capturedSettings.fleetOuterCrew = 99;
delete root.race.high_pop;
root.race.grenadier = false;
yard.ships.length = 0;
let buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate);
assert.equal(yard.ships.length, 0);

costs.nativeCrew = 1;
buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate + 1);
assert.equal(yard.ships.length, 1);

// A distinctive native result must feed the minimum-garrison gate.
yard.ships.length = 0;
root.race.grenadier = false;
root.race.high_pop = 1;
costs.nativeCrew = 8;
capturedSettings.fleetOuterCrew = 93;
buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate);
assert.equal(yard.ships.length, 0);

// The same rank-one crew value feeds the Authority prediction. Eight crew at a
// 26% high_pop authority factor lowers 100 to 98, crossing a target of 99.
capturedSettings.fleetOuterCrew = 0;
capturedSettings.authorityManage = true;
capturedSettings.generalMinimumAuthority = 99;
buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate);
assert.equal(yard.ships.length, 0);

// A successful setVal invocation is not evidence that the live blueprint
// changed. A stale laser blueprint must not be built as the configured railgun.
root.race.high_pop = undefined;
costs.nativeCrew = 2;
capturedSettings.authorityManage = false;
capturedSettings.generalMinimumAuthority = 0;
yard.blueprint.weapon = "laser";
yard.ships.length = 0;
dispatch.requests.length = 0;
const originalSetVal = capturedMethods.setVal;
const originalBuild = capturedMethods.build;
capturedMethods.setVal = () => {};
const buildsBeforeStaleBlueprint = capturedBuilds;
capturedMethods.build = () => {
  capturedBuilds++;
  yard.ships.push({
    ...yard.blueprint,
    location: outerAssignmentPoint("spc_dwarf"),
  });
};
const staleBlueprintResult = createOuterControl().autoFleetOuter();
assert.equal(staleBlueprintResult.outcome.status, "rejected");
// `setVal` was stubbed out, so the live blueprint stayed on the laser it already had and
// `buildShip` refused before invoking anything. Nothing the demand sample froze moved.
assert.equal(staleBlueprintResult.shipTargetChanged, false);
assert.equal(
  staleBlueprintResult.outcome.failure?.code,
  "captured-outer-fleet-build-not-invoked",
);
assert.equal(capturedBuilds, buildsBeforeStaleBlueprint);
assert.equal(yard.ships.length, 0);
assert.equal(dispatch.requests.length, 0);
capturedMethods.setVal = originalSetVal;
capturedMethods.build = originalBuild;
yard.blueprint.weapon = "railgun";

// Even with the requested blueprint selected, a new row that does not copy it
// cannot be accepted, dispatched or queued.
yard.ships.length = 0;
dispatch.requests.length = 0;
const buildsBeforeWrongShip = capturedBuilds;
capturedMethods.build = () => {
  capturedBuilds++;
  yard.ships.push({
    ...yard.blueprint,
    class: "frigate",
    location: outerAssignmentPoint("spc_dwarf"),
  });
};
const wrongShipControl = createOuterControl();
const wrongShipResult = wrongShipControl.autoFleetOuter();
assert.equal(wrongShipResult.outcome.status, "stale");
// The appended frigate is outside this blueprint's cost tier and the blueprint itself was left
// alone, so `shipCosts()` returns the same row it did before the pass.
assert.equal(wrongShipResult.shipTargetChanged, false);
assert.equal(capturedBuilds, buildsBeforeWrongShip + 1);
assert.equal(yard.ships.length, 1);
assert.equal(yard.ships[0].class, "frigate");
assert.equal(dispatch.requests.length, 0);
capturedSettings.fleetOuterShips = "none";
wrongShipControl.autoFleetOuter();
assert.equal(dispatch.requests.length, 0);
capturedSettings.fleetOuterShips = "custom";
capturedMethods.build = originalBuild;

// What follows covers the passes that move the shipyard's cost row without reporting success.
// `CapturedFleetDemand` freezes `nextShipCost` for the cycle and upstream writes that row from the
// live blueprint and the live per-tier ship count, so the flag has to come from the adapter
// observing the yard. A rejected or stale outcome is not evidence either way.
/**
 * The same registry over a yard the captured control reads instead of `root`'s own.
 *
 * The requested design is the root clone's blueprint — the save's snapshot — while the live design is
 * what the captured `shipPlans` control holds, which is the whole reason `currentDesign()` does not
 * read the root. A save whose blueprint predates a field the yard has since normalized therefore
 * carries it in one and not the other, and that is the only way to hand a requested design a field the
 * yard's own live design never mentions.
 */
function createRegistryWith(overrides, live = yard) {
  const methods = { ...capturedMethods, ...overrides };
  const handle = {
    elementId: "shipPlans",
    generation: 1,
    methods: Object.keys(methods),
    data: { s: live },
  };
  return {
    resolve: (elementId) => (elementId === "shipPlans" ? handle : undefined),
    invoke: (current, method, args = []) => {
      const fn = methods[method];
      if (current !== handle || fn === undefined) {
        return { ok: false, reason: "unknown-method" };
      }
      return { ok: true, value: fn(...args) };
    },
    capturedElementIds: () => ["shipPlans"],
  };
}

// Upstream renders a power shortfall with its `danger` class, which is what `hasShipPower` looks
// for. The pass refuses to build, having already rewritten the laser into the configured railgun —
// and `shipCosts()` prices a railgun in Iron where a laser is paid in Iridium and Nano Tube, so the
// row the demand sample froze no longer exists.
yard.ships.length = 0;
yard.blueprint.weapon = "laser";
let powerShortBuilds = 0;
const powerShortResult = createOuterControl(
  createRegistryWith({
    powerText: () => '<span class="danger">-50kW</span>',
    build: () => {
      powerShortBuilds += 1;
    },
  }),
).autoFleetOuter();
assert.equal(powerShortResult.outcome.status, "rejected");
assert.equal(powerShortBuilds, 0);
assert.equal(yard.blueprint.weapon, "railgun");
assert.equal(powerShortResult.shipTargetChanged, true);

// The same refusal with the yard already holding the configured ship. Nothing was written and no
// ship was appended, so the cycle's sample survives.
yard.ships.length = 0;
const idlePowerShortResult = createOuterControl(
  createRegistryWith({ powerText: () => '<span class="danger">-50kW</span>' }),
).autoFleetOuter();
assert.equal(idlePowerShortResult.outcome.status, "rejected");
assert.equal(yard.blueprint.weapon, "railgun");
assert.equal(idlePowerShortResult.shipTargetChanged, false);

// The build control fires and the game appends no ship. The postcondition fails, and the weapon the
// pass rewrote alone already moved the row.
yard.ships.length = 0;
yard.blueprint.weapon = "laser";
let silentBuilds = 0;
const silentResult = createOuterControl(
  createRegistryWith({
    build: () => {
      silentBuilds += 1;
    },
  }),
).autoFleetOuter();
assert.equal(silentResult.outcome.status, "stale");
assert.equal(silentBuilds, 1);
assert.equal(yard.ships.length, 0);
assert.equal(yard.blueprint.weapon, "railgun");
assert.equal(silentResult.shipTargetChanged, true);

// The yard appends a same-tier corvette that does not copy the requested blueprint, so the
// postcondition rejects the row and nothing is sent. `shipCosts()` still rescales by one more
// ship in this blueprint's tier.
yard.ships.length = 0;
dispatch.requests.length = 0;
let staleRowBuilds = 0;
const staleRowResult = createOuterControl(
  createRegistryWith({
    build: () => {
      staleRowBuilds += 1;
      yard.ships.push({
        ...yard.blueprint,
        weapon: "laser",
        location: outerAssignmentPoint("spc_dwarf"),
      });
    },
  }),
).autoFleetOuter();
assert.equal(staleRowResult.outcome.status, "stale");
assert.equal(staleRowBuilds, 1);
assert.equal(yard.ships.length, 1);
assert.equal(dispatch.requests.length, 0);
assert.equal(staleRowResult.shipTargetChanged, true);
yard.ships.length = 0;
yard.blueprint.weapon = "railgun";

// The counterpart is the build that appends a row outside this blueprint's tier while leaving the
// blueprint alone — the wrong-tier block above. `shipCosts()` counts only ships sharing the
// blueprint's class, so that pass moves nothing.

// A disabled outer fleet only reports the blueprint it found; it moves nothing.
dispatch.requests.length = 0;
capturedSettings.fleetOuterShips = "none";
assert.equal(createOuterControl().autoFleetOuter().shipTargetChanged, false);
assert.equal(dispatch.requests.length, 0);
capturedSettings.fleetOuterShips = "custom";

// The flag reports one cycle. A pass that changed the yard must not make every later cycle report a
// change, or the composition would clear a freshly sampled demand cache forever.
assert.equal(createOuterControl().autoFleetOuter().shipTargetChanged, true);
yard.ships.length = 0;
yard.blueprint.weapon = "laser";
assert.equal(createOuterControl().autoFleetOuter().shipTargetChanged, true);

// ---------------------------------------------------------------------------
// The cost authority, not an arithmetic answer.
// ---------------------------------------------------------------------------

// Which designs were priced, and by which question: readiness asks for the candidate, the target
// fingerprint for the live one.
yard.ships.length = 0;
yard.blueprint.weapon = "laser";
costs.requests.length = 0;
createOuterControl().autoFleetOuter();
const pricedCandidates = costs.requests
  .filter(([question]) => question === "quote")
  .map(([, blueprint]) => blueprint);
const currentSamples = costs.requests
  .filter(([question]) => question === "current")
  .map(([, blueprint]) => blueprint);
assert.equal(pricedCandidates.length, 1);
assert.deepEqual(pricedCandidates[0], {
  class: "corvette",
  power: "diesel",
  weapon: "railgun",
  armor: "steel",
  engine: "ion",
  sensor: "radar",
});
assert.ok(
  currentSamples.length >= 2,
  "the target observation is bracketed around the mutation window",
);
for (const sampled of currentSamples) {
  assert.equal(
    sampled,
    yard.blueprint,
    "the fingerprint priced something but the live blueprint",
  );
}

// Affordability is the game's own marking. Every resource in the save reads as empty, and the yard
// still builds, because the row says the yard can pay it from its supply pool.
yard.ships.length = 0;
yard.blueprint.weapon = "railgun";
const globalAmounts = Object.fromEntries(
  Object.keys(root.resource).map((id) => [
    id,
    { ...root.resource[id], amount: 0 },
  ]),
);
root.resource = globalAmounts;
const buildsBeforeGlobalAmounts = capturedBuilds;
const pricedResult = createOuterControl().autoFleetOuter();
assert.equal(pricedResult.outcome.status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeGlobalAmounts + 1);
assert.deepEqual(
  Object.values(globalAmounts).every((resource) => resource.amount === 0),
  true,
  "the save was not emptied",
);
yard.ships.length = 0;

// The same save, with the game marking a cost as not payable right now.
costs.unaffordable.add("Iron");
const buildsBeforeUnaffordable = capturedBuilds;
const unaffordableResult = createOuterControl().autoFleetOuter();
assert.equal(unaffordableResult.outcome.status, "succeeded");
assert.equal(
  capturedBuilds,
  buildsBeforeUnaffordable,
  "an unaffordable cost built a ship",
);
assert.equal(
  unaffordableResult.outcome.status === "succeeded",
  true,
  "the refusal is a status, not a failure",
);
costs.unaffordable.delete("Iron");

// Stock moving is not the ship target moving. The pass changes what the yard can pay and appends a
// hull outside this design's cost tier, so nothing about the next ship changed.
yard.ships.length = 0;
const stockOnlyResult = createOuterControl(
  createRegistryWith({
    build: () => {
      capturedBuilds++;
      costs.unaffordable.add("Money");
      yard.ships.push({
        ...yard.blueprint,
        class: "frigate",
        location: outerAssignmentPoint("spc_dwarf"),
      });
    },
  }),
).autoFleetOuter();
assert.equal(stockOnlyResult.outcome.status, "stale");
assert.equal(
  stockOnlyResult.shipTargetChanged,
  false,
  "a stock change reported a new ship target",
);
costs.unaffordable.delete("Money");
yard.ships.length = 0;

// No price from the yard is no build. A cost the capture cannot produce must not be read as one the
// yard can pay.
const buildsBeforeCostless = capturedBuilds;
const costless = createOuterControl(capturedRegistry, dispatch, {
  requests: [],
  unaffordable: new Set(),
  current: () => undefined,
  quote: () => undefined,
}).autoFleetOuter();
assert.equal(costless.outcome.status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeCostless);
yard.ships.length = 0;

// ---------------------------------------------------------------------------
// No catalogue authority: unreadable, absent, or readable and not whole.
// ---------------------------------------------------------------------------

/**
 * Every effect the composition could reach the yard or the game's answers with, counted.
 *
 * The counters exist because having no catalogue authority is not the absence of work: asked over an
 * empty dimension set, availability is true for every design, a match is true for every ship, and a
 * build postcondition is an empty record that any appended hull satisfies. So the list below must stay
 * empty, rather than merely ending in a refusal.
 */
function countingRegistry(live = yard) {
  const seen = { avail: 0, setVal: 0, build: 0 };
  return {
    seen,
    registry: createRegistryWith(
      {
        avail: () => {
          seen.avail += 1;
          return true;
        },
        setVal: (type, part) => {
          seen.setVal += 1;
          live.blueprint[type] = part;
        },
        build: () => {
          seen.build += 1;
        },
      },
      live,
    ),
  };
}

/** The direct form of an unreadable yard: the source simply cannot answer. */
const unavailableCatalog = { catalog: () => undefined };

/**
 * A catalogue over the yard's own markup with one dimension left out — what a catalogue missing that
 * dimension looks like from the outside: readable throughout, internally valid, and short.
 *
 * The dimension dropped here is `special`, on purpose. It is a dimension the settings never configure,
 * so no preset this script builds names it in any blueprint at all: with the catalogue proving itself
 * against the yard's own live design, this is the one catalogue defect that a check of the *requested*
 * design alone cannot see. Upstream keeps the special slot in `shipParts` beside the other six, and
 * `drawShipYard()` normalizes one entry into every modern blueprint, so the live design is what carries
 * the proof that the catalogue is missing something.
 */
function catalogWithout(dimension) {
  const catalog = shipyardCatalog(
    Object.fromEntries(
      Object.entries(SHIP_PARTS).filter(([type]) => type !== dimension),
    ),
  );
  assert.ok(
    !catalog.types.includes(dimension),
    `${dimension}: the catalogue kept the dimension it was meant to drop`,
  );
  return { catalog: () => catalog };
}

/** A non-empty catalogue that is nonetheless not the whole yard. */
const specialLessCatalog = catalogWithout("special");

/**
 * One pass against a source that cannot be the yard's whole catalogue, with the yard's own build stub
 * appending a hull nothing asked for. That hull is what an incomplete postcondition would accept, so
 * reaching it is the failure this guards.
 */
function passWithoutProvenCatalog(settings, prepare, options = {}) {
  const { source = unavailableCatalog, live = yard } = options;
  const { seen, registry } = countingRegistry(live);
  const prices = [];
  const sends = [];
  const liveBefore = { ...live.blueprint };
  const blueprintBefore = { ...yard.blueprint };
  yard.ships.length = 0;
  for (const key of Object.keys(settings))
    capturedSettings[key] = settings[key];
  prepare();
  const result = createOuterControl(
    registry,
    {
      blockedByPlayerModal: () => false,
      dispatchShipyardShip(request) {
        sends.push(request);
        return dispatch.dispatchShipyardShip(request);
      },
    },
    {
      requests: costs.requests,
      current: () => costs.current(),
      quote: (blueprint) => {
        prices.push(blueprint);
        return costs.quote(blueprint);
      },
    },
    source,
  ).autoFleetOuter();
  assert.equal(
    [seen.avail, seen.setVal, seen.build, prices.length, sends.length].join(
      "/",
    ),
    "0/0/0/0/0",
    `the yard was reached without a whole catalogue (${settings.fleetOuterShips}/${settings.fleetExploreTau})`,
  );
  assert.deepEqual(
    live.blueprint,
    liveBefore,
    "the captured design was written",
  );
  assert.deepEqual(
    yard.blueprint,
    blueprintBefore,
    "the blueprint was written",
  );
  assert.equal(yard.ships.length, 0, "a ship was appended");
  assert.equal(result.outcome.status, "succeeded");
  yard.ships.length = 0;
}

// Current Design. Its fields need no `avail()` call — the yard already holds them — but the design
// still has to be described over the game's part dimensions before it can be judged built, and over no
// dimensions it cannot be. `avail` would answer true here for any design with a hull.
passWithoutProvenCatalog(
  { fleetOuterShips: "user", fleetExploreTau: false },
  () => {},
);

// The automatic route's own presets, which are constructed out of the catalogue's dimensions: with no
// catalogue there is nothing to construct them from, and nothing to construct.
passWithoutProvenCatalog(
  { fleetOuterShips: "custom", fleetExploreTau: false },
  () => {},
);

// The forced Explorer, the one blueprint this script writes itself. `setVal` has no availability gate
// upstream, so a design written from no catalogue is a hull the player may never have unlocked.
passWithoutProvenCatalog(
  { fleetOuterShips: "custom", fleetExploreTau: true },
  () => {
    root.tech.tauceti = 1;
  },
);
root.tech.tauceti = 0;

// The same three routes against a catalogue that exists, reads cleanly and is still short a dimension.
// Nothing about the source is faulted here — no capture error, no unreadable markup — so the only
// thing that can refuse these is the yard's own live design against the catalogue's dimensions.
passWithoutProvenCatalog(
  { fleetOuterShips: "user", fleetExploreTau: false },
  () => {},
  { source: specialLessCatalog },
);
passWithoutProvenCatalog(
  { fleetOuterShips: "custom", fleetExploreTau: false },
  () => {},
  { source: specialLessCatalog },
);
passWithoutProvenCatalog(
  { fleetOuterShips: "custom", fleetExploreTau: true },
  () => {
    root.tech.tauceti = 1;
  },
  { source: specialLessCatalog },
);
root.tech.tauceti = 0;

// A field the requested design names and the catalogue does not.
//
// This is the other direction from the proof above: the catalogue accounts for everything the yard's
// live design holds, and the request still reaches past it. Only a requested design can do that — the
// presets are built out of the catalogue's own dimensions, and Current Design's design is the root
// clone's blueprint, which the yard normalizes into its live one and may therefore outgrow. The yard's
// own `setVal(type, value)` would write such a field whatever the catalogue says, so availability has
// to refuse the design rather than skip the field. A fictional field is used deliberately: nothing
// here may decide which dimensions exist, so the invariant has to hold for a name neither this script
// nor the game has ever had.
{
  const invented = "warp_core";
  yard.blueprint[invented] = "flux_drive";
  // The captured control holds the yard's own design without the invented field, which is what the
  // root clone looks like for a blueprint the yard has not normalized yet. The catalogue is whole.
  const capturedYard = { ...yard, blueprint: { ...yard.blueprint } };
  delete capturedYard.blueprint[invented];
  passWithoutProvenCatalog(
    { fleetOuterShips: "user", fleetExploreTau: false },
    () => {},
    { live: capturedYard, source: { catalog: () => partCatalog } },
  );
  delete yard.blueprint[invented];
}

capturedSettings.fleetExploreTau = false;

// ---------------------------------------------------------------------------
// The game's own Syndicate result, and the pass standing down without it.
// ---------------------------------------------------------------------------

capturedSettings.fleetOuterShips = "custom";
capturedSettings.fleet_outer_pr_spc_red = 1;
capturedSettings.fleet_outer_def_spc_red = 0.9;
root.tech.eris = 2;

/** Restores the pass's shared state so each case below starts where the one above left off. */
function resetOuterPass() {
  yard.ships.length = 0;
  dispatch.requests.length = 0;
  costs.requests.length = 0;
  capturedBuilds = 0;
}

// The native ratio is the target's answer, exactly. Nothing in this composition can turn `0.7319`
// into that region, so a ship sent there is following the game rather than a table.
{
  resetOuterPass();
  syndicate = createSyndicateStub({ spc_red: { p: 0.7319, s: 47 } });
  const pass = createOuterControl().autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  assert.equal(yard.ships.length, 1);
  assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_red" }]);
  assert.deepEqual(syndicate.requests, ["spc_red"]);
}

// The same native ratio, with every field the deleted replica read on the way to its own answer
// moved: the region's piracy, the rival government's hostility, and the technology the regional caps
// branch on. The answer does not move, because it is not computed from any of them here.
{
  resetOuterPass();
  root.space.syndicate.spc_red = 6;
  root.civic.foreign.gov3.hstl = 61;
  root.tech.outer = 4;
  const seen = syndicate.requests.length;
  createOuterControl().autoFleetOuter();
  assert.equal(syndicate.requests.length, seen + 1);
  assert.deepEqual(syndicate.requests.at(-1), "spc_red");
  root.space.syndicate.spc_red = 600;
  root.civic.foreign.gov3.hstl = 50;
  root.tech.outer = 0;
}

// A ratio above the region's own maximum defense is a defended region, not a target: the same
// comparison the replica made, now over the game's own number.
{
  resetOuterPass();
  syndicate = createSyndicateStub({ spc_red: { p: 0.9512, s: 47 } });
  const pass = createOuterControl().autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  assert.equal(yard.ships.length, 0);
  assert.deepEqual(dispatch.requests, []);
  assert.deepEqual(
    costs.requests.filter(([method]) => method === "quote"),
    [],
  );
}

// The native inactive result is a real answer, not a missing one. `syndicate()` answers
// `{p: 1, r: 0, s: 0, o: 0}` when the Syndicate is not operating, and `p: 1` is a fully defended
// region: the pass reports that no ship is needed rather than standing down over missing data.
{
  resetOuterPass();
  syndicate = createSyndicateStub({ spc_red: { p: 1, s: 0 } });
  const pass = createOuterControl().autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  assert.equal(yard.ships.length, 0);
  assert.equal(syndicate.requests.length, 1);
}

// The Eris exploration gate is the game's own sensor reading, exactly. A distinctive value decides
// it, and one on the far side of the game's own 50-point threshold does not.
{
  resetOuterPass();
  capturedSettings.fleet_outer_pr_spc_eris = 1;
  root.tech.eris = 1;
  root.space.syndicate.spc_eris = 600;
  syndicate = createSyndicateStub({
    spc_red: { p: 0.7319, s: 47 },
    spc_eris: { p: 0.5, s: 12 },
  });
  const gated = createOuterControl().autoFleetOuter();
  assert.equal(gated.outcome.status, "succeeded");
  assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_eris" }]);

  resetOuterPass();
  syndicate = createSyndicateStub({
    spc_red: { p: 0.7319, s: 47 },
    spc_eris: { p: 0.9512, s: 50 },
  });
  const ungated = createOuterControl().autoFleetOuter();
  assert.equal(ungated.outcome.status, "succeeded");
  assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_red" }]);
  delete capturedSettings.fleet_outer_pr_spc_eris;
  delete root.space.syndicate.spc_eris;
  root.tech.eris = 2;
}

// Mechanics unavailable where the pass needs them: nothing is priced, nothing is written, nothing is
// built, nothing is sent, and the pass says why instead of guessing a ratio.
// The policy boundary follows native eligibility and fails closed before any effects.
{
  const savedTech = { ...root.tech };
  const savedWeights = { ...capturedSettings };
  const savedSetVal = capturedMethods.setVal;
  let regionWrites = 0;
  capturedMethods.setVal = (...args) => {
    regionWrites++;
    return savedSetVal(...args);
  };
  function noRegionEffects() {
    assert.equal(capturedBuilds, 0);
    assert.equal(yard.ships.length, 0);
    assert.equal(regionWrites, 0);
    assert.deepEqual(dispatch.requests, []);
    assert.deepEqual(costs.requests, [], "no pricing or cost probes");
  }
  function resetRegionPass() {
    resetOuterPass();
    regionWrites = 0;
    syndicate = createSyndicateStub({
      spc_red: { p: 0.5, s: 47 },
      spc_moon: { p: 0.5, s: 47 },
      spc_eris: { p: 0.5, s: 12 },
    });
  }
  try {
    capturedSettings.fleet_outer_pr_spc_red = 0;
    capturedSettings.fleet_outer_pr_spc_moon = 1;
    for (const eligibility of [
      { reachable: true, syndicateEnabled: true },
      { reachable: false, syndicateEnabled: true },
      { reachable: true, syndicateEnabled: false },
    ]) {
      regionMechanics = createOuterRegionMechanicsStub({
        spc_moon: { kind: "value", value: eligibility },
      });
      resetRegionPass();
      createOuterControl().autoFleetOuter();
      assert.deepEqual(regionMechanics.requests, ["spc_moon"]);
      if (eligibility.reachable && eligibility.syndicateEnabled) {
        assert.deepEqual(syndicate.requests, ["spc_moon"]);
        assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_moon" }]);
        assert.equal(capturedBuilds, 1);
        assert.equal(Object.hasOwn(root.space.syndicate, "spc_moon"), false);
      } else {
        assert.deepEqual(syndicate.requests, []);
        noRegionEffects();
      }
    }

    capturedSettings.fleet_outer_pr_spc_red = 1;
    for (const kind of ["absent", "invalid"]) {
      regionMechanics = createOuterRegionMechanicsStub({ spc_moon: { kind } });
      resetRegionPass();
      createOuterControl().autoFleetOuter();
      assert.deepEqual(syndicate.requests, []);
      noRegionEffects();

      capturedSettings.fleet_outer_pr_spc_moon = 0;
      regionMechanics.requests.length = 0;
      resetRegionPass();
      createOuterControl().autoFleetOuter();
      assert.deepEqual(regionMechanics.requests, ["spc_red"]);
      assert.deepEqual(syndicate.requests, ["spc_red"]);
      assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_red" }]);
      capturedSettings.fleet_outer_pr_spc_moon = 1;
    }

    // Stage-1 Eris's sensor gate runs only for a weighted, natively eligible Eris.
    root.tech.eris = 1;
    capturedSettings.fleet_outer_pr_spc_moon = 0;
    for (const [weighting, eligibility] of [
      [0, { reachable: true, syndicateEnabled: true }],
      [1, { reachable: false, syndicateEnabled: true }],
      [1, { reachable: true, syndicateEnabled: false }],
      [1, { reachable: true, syndicateEnabled: true }],
    ]) {
      capturedSettings.fleet_outer_pr_spc_eris = weighting;
      regionMechanics = createOuterRegionMechanicsStub({
        spc_eris: { kind: "value", value: eligibility },
      });
      resetRegionPass();
      createOuterControl().autoFleetOuter();
      if (weighting && eligibility.reachable && eligibility.syndicateEnabled) {
        assert.deepEqual(syndicate.requests, ["spc_eris"]);
        // The low sensor answer selects Eris ahead of the ordinary defense targets.
        assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_eris" }]);
      } else {
        assert.deepEqual(syndicate.requests, ["spc_red"]);
        assert.deepEqual(dispatch.requests, [{ index: 0, region: "spc_red" }]);
      }
    }

    // Unavailable weighted authority also precedes the otherwise-live Eris gate.
    for (const kind of ["absent", "invalid"]) {
      regionMechanics = createOuterRegionMechanicsStub({ spc_red: { kind } });
      resetRegionPass();
      createOuterControl().autoFleetOuter();
      assert.deepEqual(syndicate.requests, []);
      noRegionEffects();
    }
  } finally {
    capturedMethods.setVal = savedSetVal;
    regionMechanics = defaultRegionMechanics;
    Object.assign(root.tech, savedTech);
    for (const key of Object.keys(capturedSettings))
      delete capturedSettings[key];
    Object.assign(capturedSettings, savedWeights);
  }
}

{
  resetOuterPass();
  syndicate = createSyndicateStub({ spc_red: "unavailable" });
  const pass = createOuterControl().autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  assert.equal(yard.ships.length, 0);
  assert.equal(capturedBuilds, 0);
  assert.deepEqual(dispatch.requests, []);
  assert.deepEqual(
    costs.requests.filter(([method]) => method === "quote"),
    [],
  );
  assert.deepEqual(yard.blueprint, {
    class: "corvette",
    armor: "steel",
    weapon: "railgun",
    engine: "ion",
    power: "diesel",
    sensor: "radar",
    special: "none",
  });
}

// Mechanics unavailable where the pass needs none: neither a zero-weight region nor a disabled
// feature is a question, and neither may reject the cycle.
{
  resetOuterPass();
  syndicate = createSyndicateStub({});
  capturedSettings.fleetOuterShips = "none";
  const disabled = createOuterControl().autoFleetOuter();
  assert.equal(disabled.outcome.status, "succeeded");
  assert.deepEqual(syndicate.requests, []);

  resetOuterPass();
  capturedSettings.fleetOuterShips = "custom";
  syndicate = createSyndicateStub({ spc_red: { p: 0.7319, s: 47 } });
  const oneTarget = createOuterControl().autoFleetOuter();
  assert.equal(oneTarget.outcome.status, "succeeded");
  assert.deepEqual(
    syndicate.requests,
    ["spc_red"],
    "a zero-weight region was asked about",
  );
  assert.equal(yard.ships.length, 1);
}

// Mechanics unavailable and the Explorer branch resolving first: the Explorer needs no Syndicate
// answer, so a missing one is not a reason to refuse it.
{
  resetOuterPass();
  capturedSettings.fleetExploreTau = true;
  root.tech.tauceti = 1;
  syndicate = createSyndicateStub({});
  regionMechanics = {
    read() {
      assert.fail("Explorer must not ask region mechanics");
    },
  };
  const explored = createOuterControl().autoFleetOuter();
  assert.equal(explored.outcome.status, "succeeded");
  assert.deepEqual(dispatch.requests, [{ index: 0, region: "tauceti" }]);
  capturedSettings.fleetExploreTau = false;
  root.tech.tauceti = 0;
  regionMechanics = defaultRegionMechanics;
}

// Assigned ships reserve their slots while moving; the last departed port is not their assignment.
function outerAssignmentPoint(id) {
  return { id, x: 0, y: 0, z: 0 };
}
function outerAssignmentShip(blueprint, port, destination) {
  const location = outerAssignmentPoint(port);
  return {
    ...blueprint,
    location,
    ...(destination === undefined
      ? {}
      : {
          movement: {
            from: location,
            left: 10,
            legs: [{ to: outerAssignmentPoint(destination), days: 10 }],
          },
        }),
  };
}
function readOuterAssignmentPlan(registry = capturedRegistry) {
  const parts = { catalog: () => partCatalog };
  const adapter = createCapturedOuterFleetAdapter({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: createCapturedFleetControls({ controls: registry, parts }),
    costs,
    parts,
    dispatch,
    syndicate,
    regionMechanics,
    readSettings: () => effectiveSettings,
  });
  const cycle = planOuterFleetCycle(adapter.reader.readCycle());
  assert.equal(cycle.kind, "select-target");
  const target = planOuterFleetTarget(
    cycle,
    adapter.reader.readTargeting(cycle),
  );
  return target.kind === "outer-fleet-status"
    ? target
    : planOuterFleetBlueprint(adapter.reader.readBlueprint(target));
}
const assignmentUnavailableMessage =
  "Ship assignment data unavailable; ship construction paused";
const assignmentExplorer = {
  class: "explorer",
  armor: "neutronium",
  weapon: "railgun",
  engine: "emdrive",
  power: "elerium",
  sensor: "quantum",
};
{
  syndicate = createSyndicateStub({ spc_red: { p: 0.7319, s: 47 } });
  capturedSettings.fleetExploreTau = true;
  root.tech.tauceti = 1;
  capturedSettings.fleet_outer_pr_spc_red = 0;
  for (const ship of [
    outerAssignmentShip(assignmentExplorer, "spc_dwarf", "tauceti"),
    outerAssignmentShip(assignmentExplorer, "tauceti"),
  ]) {
    resetOuterPass();
    yard.ships.push(ship);
    assert.equal(
      readOuterAssignmentPlan().messageAfterUpdate,
      "No more ships currently needed",
    );
    const pass = createOuterControl().autoFleetOuter();
    assert.equal(pass.outcome.status, "succeeded");
    assert.equal(capturedBuilds, 0);
    assert.deepEqual(dispatch.requests, []);
  }
  resetOuterPass();
  yard.ships.push(
    outerAssignmentShip(assignmentExplorer, "tauceti", "spc_red"),
  );
  assert.equal(readOuterAssignmentPlan().blueprint, "explorer");
  resetOuterPass();
  yard.ships.push({ ...assignmentExplorer, movement: { legs: [{ to: {} }] } });
  assert.equal(
    readOuterAssignmentPlan().messageAfterUpdate,
    assignmentUnavailableMessage,
  );
  assert.equal(
    createOuterControl().autoFleetOuter().outcome.status,
    "succeeded",
  );
  assert.equal(capturedBuilds, 0);
  assert.deepEqual(dispatch.requests, []);
  capturedSettings.fleetExploreTau = false;
  root.tech.tauceti = 0;
  capturedSettings.fleet_outer_pr_spc_red = 1;
  resetOuterPass();
  yard.ships.push({
    ...assignmentExplorer,
    get movement() {
      throw new Error("disabled Explorer route was inspected");
    },
  });
  assert.equal(readOuterAssignmentPlan().blueprint, "fighter");
}
{
  capturedSettings.fleet_outer_sc_spc_red = 1;
  capturedSettings.fleet_outer_weapon = "laser";
  const scout = {
    class: "corvette",
    armor: "steel",
    weapon: "railgun",
    engine: "ion",
    power: "diesel",
    sensor: "radar",
  };
  for (const [ship, expected] of [
    [outerAssignmentShip(scout, "spc_red"), "fighter"],
    [outerAssignmentShip(scout, "spc_dwarf", "spc_red"), "fighter"],
    [outerAssignmentShip(scout, "spc_belt"), "scout"],
    [outerAssignmentShip(scout, "spc_red", "spc_belt"), "scout"],
    [
      outerAssignmentShip(
        { ...scout, weapon: "laser" },
        "spc_dwarf",
        "spc_red",
      ),
      "scout",
    ],
  ]) {
    resetOuterPass();
    yard.ships.push(ship);
    assert.equal(readOuterAssignmentPlan().blueprint, expected);
    assert.equal(
      createOuterControl().autoFleetOuter().outcome.status,
      "succeeded",
    );
    assert.equal(capturedBuilds, 1);
    assert.equal(
      yard.ships[1].weapon,
      expected === "fighter" ? "laser" : "railgun",
    );
    assert.deepEqual(dispatch.requests, [{ index: 1, region: "spc_red" }]);
  }
  resetOuterPass();
  yard.ships.push({
    ...scout,
    location: outerAssignmentPoint("spc_red"),
    movement: { legs: [{ to: {} }] },
  });
  const unavailable = readOuterAssignmentPlan();
  assert.equal(unavailable.kind, "outer-fleet-status");
  assert.equal(unavailable.messageAfterUpdate, assignmentUnavailableMessage);
  assert.equal(
    createOuterControl().autoFleetOuter().outcome.status,
    "succeeded",
  );
  assert.equal(capturedBuilds, 0);
  assert.deepEqual(dispatch.requests, []);
  assert.deepEqual(
    costs.requests.filter(([method]) => method === "quote"),
    [],
  );

  // Irrelevant routes must not be inspected, including disabled caps and unavailable scout designs.
  const unreadableRoute = {
    ...scout,
    get movement() {
      throw new Error("irrelevant route was inspected");
    },
  };
  resetOuterPass();
  yard.ships.push(unreadableRoute);
  capturedSettings.fleet_outer_sc_spc_red = 0;
  assert.equal(readOuterAssignmentPlan().blueprint, "fighter");
  capturedSettings.fleet_outer_sc_spc_red = 1;
  capturedSettings.fleetOuterShips = "user";
  assert.equal(readOuterAssignmentPlan().blueprint, "yard");
  capturedSettings.fleetOuterShips = "custom";
  yard.blueprint.weapon = "laser";
  const scoutUnavailableRegistry = createRegistryWith({
    avail: (type, index, part) => part !== "railgun",
  });
  assert.equal(
    readOuterAssignmentPlan(scoutUnavailableRegistry).blueprint,
    "fighter",
  );
  resetOuterPass();
  yard.ships.push({
    ...scout,
    class: "frigate",
    get movement() {
      throw new Error("unrelated route was inspected");
    },
  });
  assert.equal(readOuterAssignmentPlan().blueprint, "scout");
  capturedSettings.fleet_outer_sc_spc_red = 0;
  capturedSettings.fleet_outer_weapon = "railgun";
  yard.blueprint.weapon = "railgun";
  resetOuterPass();
}

// An unavailable native quote stands the pass down rather than throwing
// out of ordinary planning: a hull upstream has since added is an ordinary state, not a fault.
//
// A future hull offered by the yard still requires a native crew answer.
{
  resetOuterPass();
  syndicate = createSyndicateStub({ spc_red: { p: 0.7319, s: 47 } });
  capturedSettings.fleet_outer_class = "future_cruiser";
  costs.nativeCrew = undefined;
  // `setVal` writes the live blueprint, so an unwritten class is the proof nothing was written at all.
  // Earlier cases have left the yard wearing a design of their own making, which is why this is the
  // class the yard holds now rather than a literal.
  const classBefore = yard.blueprint.class;
  const futureCatalog = shipyardCatalog({
    ...SHIP_PARTS,
    class: [...SHIP_PARTS.class, "future_cruiser"],
  });
  const catalogSource = { catalog: () => futureCatalog };
  const dependencies = {
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: capturedRegistry,
    costs,
    parts: catalogSource,
    dispatch: {
      blockedByPlayerModal: () => playerModalOpen,
      dispatchShipyardShip: (request) => dispatch.dispatchShipyardShip(request),
    },
    syndicate,
    regionMechanics,
    readSettings: () => effectiveSettings,
  };

  // Walked by hand because the status a crew-unavailable pass returns is not otherwise observable:
  // the control reports it as an ordinary success, which is indistinguishable from a build unless the
  // side effects are checked. What each phase produced is the point.
  const adapter = createCapturedOuterFleetAdapter({
    ...dependencies,
    controls: createCapturedFleetControls({
      controls: capturedRegistry,
      parts: catalogSource,
    }),
  });
  const cycle = planOuterFleetCycle(adapter.reader.readCycle());
  assert.equal(cycle.kind, "select-target");
  const target = planOuterFleetTarget(
    cycle,
    adapter.reader.readTargeting(cycle),
  );
  assert.equal(target.kind, "select-blueprint");
  const candidate = planOuterFleetBlueprint(
    adapter.reader.readBlueprint(target),
  );
  assert.equal(candidate.kind, "check-candidate");
  const candidateInput = adapter.reader.readCandidate(candidate);
  // The native quote was unavailable, so crew cannot be inferred from the hull.
  assert.equal(candidateInput.shipCrew, null);
  const readiness = planOuterFleetCandidate(candidateInput);
  assert.equal(readiness.kind, "outer-fleet-status");
  assert.equal(
    readiness.messageAfterUpdate,
    "Ship crew requirement unavailable; ship construction paused",
  );
  // Nothing was written, so there is no earlier message to show and no blueprint it was written from.
  assert.equal(readiness.messageBeforeUpdate, null);
  assert.equal(readiness.blueprint, "fighter");

  // And the decision that status stands for is executed, not merely planned: one quote was attempted,
  // nothing is written, nothing is built and nothing is sent.
  assert.equal(adapter.executor.execute(readiness).status, "succeeded");
  assert.equal(
    costs.requests.filter(([method]) => method === "quote").length,
    1,
  );
  assert.deepEqual(dispatch.requests, []);
  assert.equal(capturedBuilds, 0);
  assert.equal(yard.ships.length, 0);
  assert.equal(yard.blueprint.class, classBefore);

  // The same hull through the production composition, which must stand down the same way rather than
  // throw out of ordinary planning.
  resetOuterPass();
  const unknownHull = createOuterControl(
    capturedRegistry,
    dispatch,
    costs,
    catalogSource,
  ).autoFleetOuter();
  assert.equal(unknownHull.outcome.status, "succeeded");
  assert.equal(unknownHull.shipTargetChanged, false);
  assert.equal(
    costs.requests.filter(([method]) => method === "quote").length,
    1,
  );
  assert.deepEqual(dispatch.requests, []);
  assert.equal(capturedBuilds, 0);
  assert.equal(yard.ships.length, 0);
  assert.equal(yard.blueprint.class, classBefore);
  capturedSettings.fleet_outer_class = "corvette";
  costs.nativeCrew = 2;
}

// ---------------------------------------------------------------------------
// What production no longer contains.
// ---------------------------------------------------------------------------

const productionFleetOuter = readFileSync(
  new URL(
    "../src/adapters/evolve/combat/captured-fleet-outer.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.doesNotMatch(
  productionFleetOuter,
  /ship\s*\[\s*["']location["']\s*\]\s*!?===?\s*region/,
);
assert.doesNotMatch(productionFleetOuter, /\btransit\b/);
for (const gone of [
  "CAPTURED_OUTER_FLEET_CLASS_CREW",
  "CAPTURED_OUTER_FLEET_GRENADIER_CREW",
  "capturedShipCrewSize",
  "readCapturedJobStackMultiplier",
  "CAPTURED_OUTER_FLEET_WEAPON_POWER",
  "CAPTURED_OUTER_FLEET_CLASS_POWER",
  "CAPTURED_OUTER_FLEET_SENSOR_RANGE",
  "capturedOuterFleetRegionCap",
  "capturedOuterFleetSyndicate",
  "capturedOuterFleetRegionEnabled",
]) {
  assert.equal(
    productionFleetOuter.includes(gone),
    false,
    `${gone} is back in the outer-fleet adapter`,
  );
}

assert.doesNotMatch(productionFleetOuter, /case\s+["']spc_/);
assert.doesNotMatch(
  productionFleetOuter,
  /["'](?:resettle|tidal_decay|orbit_decayed|titan|enceladus|triton|makemake)["']/,
);
assert.doesNotMatch(
  productionFleetOuter,
  /(?:hasOwn|hasOwnProperty)\([^\n]*region/,
);

console.log("Captured outer-fleet control postcondition tests passed");
