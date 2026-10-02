import assert from "node:assert/strict";

import { createCapturedFleetControls } from "../src/adapters/evolve/combat/captured-fleet-controls.ts";
import { createCapturedOuterFleetControl } from "../src/bootstrap/captured-fleet-outer-control.ts";

function createFixture({ append = true } = {}) {
  const ships = [];
  const calls = [];
  const data = { s: { ships, sort: false } };
  const methods = {
    avail: (_type, _index, part) => part === "railgun",
    setVal: (type, part) => calls.push(["setVal", type, part]),
    powerText: () => "100kW",
    build: () => {
      calls.push(["build"]);
      if (append) ships.push({ location: "spc_dwarf" });
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
    controls: createCapturedFleetControls({ controls }),
    calls,
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
    index: 0,
  }),
  true,
);
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "laser",
    index: 1,
  }),
  false,
);
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
  },
  ships: [],
};
const root = {
  race: { truepath: true, universe: "evil", grenadier: false },
  tech: { syndicate: 1, tauceti: 0, eris: 2, triton: 0, outer: 0 },
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
      location: "spc_dwarf",
      transit: 0,
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
      ship.movement = { to: request.region };
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
    price(blueprint) {
      this.requests.push(["price", blueprint]);
      return {
        pool: "spc_dwarf",
        amounts: pricedAmounts.call(this, blueprint, yard.ships),
      };
    },
  };
}

let costs = createCostStub();
function createOuterControl(
  registry = capturedRegistry,
  stub = dispatch,
  costAuthority = costs,
) {
  return createCapturedOuterFleetControl({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: registry,
    costs: costAuthority,
    dispatch: {
      blockedByPlayerModal: () => playerModalOpen,
      dispatchShipyardShip: (request) => stub.dispatchShipyardShip(request),
    },
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
assert.equal(yard.ships[0].movement.to, "spc_red");
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
  dispatch,
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

// Normal corvettes reserve two soldiers; Grenadier corvettes reserve one.
capturedSettings.fleetOuterCrew = 99;
delete root.race.high_pop;
root.race.grenadier = false;
yard.ships.length = 0;
let buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate);
assert.equal(yard.ships.length, 0);

root.race.grenadier = true;
buildsBeforeCrewGate = capturedBuilds;
createOuterControl().autoFleetOuter();
assert.equal(capturedBuilds, buildsBeforeCrewGate + 1);
assert.equal(yard.ships.length, 1);

// Rank-one high_pop makes jobStack(2) equal eight, so the minimum-garrison gate
// must include the upstream citizen-cap multiplier.
yard.ships.length = 0;
root.race.grenadier = false;
root.race.high_pop = 1;
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
  yard.ships.push({ ...yard.blueprint, location: "spc_dwarf" });
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
    location: "spc_dwarf",
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
function createRegistryWith(overrides) {
  const methods = { ...capturedMethods, ...overrides };
  const handle = {
    elementId: "shipPlans",
    generation: 1,
    methods: Object.keys(methods),
    data: { s: yard },
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
        location: "spc_dwarf",
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
  .filter(([question]) => question === "price")
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
        location: "spc_dwarf",
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
  price: () => undefined,
}).autoFleetOuter();
assert.equal(costless.outcome.status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeCostless);
yard.ships.length = 0;

console.log("Captured outer-fleet control postcondition tests passed");
