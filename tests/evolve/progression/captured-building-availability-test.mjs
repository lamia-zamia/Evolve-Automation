import assert from "node:assert/strict";
import {
  readCapturedActionControlAvailabilityForTab,
  readCapturedActionAvailability,
  readCapturedSemanticBuildingStates,
} from "../../../src/adapters/evolve/progression/build/captured-building-availability.ts";
import { readCapturedBuildControlCoverage } from "../../../src/adapters/evolve/progression/build/captured-build-control-coverage.ts";
import { SPACE_TAB_INDEX } from "../../../src/adapters/evolve/captured-tab-discovery.ts";

const availabilityRoot = {
  race: {},
  genes: {},
  tech: { high_tech: 2, electricity: 1 },
  settings: {
    showCity: true,
    showSpace: true,
    showOuter: true,
    showDeep: true,
    showGalactic: true,
    showPortal: true,
    showTau: true,
    showEden: true,
  },
};
const availabilityAction = { reqs: { electricity: 1 } };
function qualifyAvailability(
  action = availabilityAction,
  root = availabilityRoot,
  region = "city",
  struct = "coal_power",
  info = false,
) {
  return readCapturedActionAvailability(
    root,
    action,
    region,
    region,
    struct,
    info,
  );
}
assert.deepEqual(qualifyAvailability(), { kind: "value", value: true });
for (const [field, value, root] of [
  ["path", ["truepath"], availabilityRoot],
  ["reqs", { electricity: 2 }, availabilityRoot],
  ["condition", () => false, availabilityRoot],
  ["not_trait", ["flier"], { ...availabilityRoot, race: { flier: 1 } }],
  ["trait", ["flier"], availabilityRoot],
  ["not_gene", ["queue"], { ...availabilityRoot, genes: { queue: 1 } }],
  ["gene", ["queue"], availabilityRoot],
  ["not_tech", ["electricity"], availabilityRoot],
  ["grant", ["electricity", 1], availabilityRoot],
]) {
  assert.deepEqual(
    qualifyAvailability({ ...availabilityAction, [field]: value }, root),
    { kind: "value", value: false },
    field,
  );
}
assert.deepEqual(
  qualifyAvailability({
    ...availabilityAction,
    condition() {
      return this.reqs.electricity === 1;
    },
  }),
  { kind: "value", value: true },
  "condition keeps its game action receiver",
);
for (const malformedAction of [
  { reqs: null },
  { reqs: { electricity: NaN } },
  { ...availabilityAction, trait: "flier" },
  {
    ...availabilityAction,
    condition() {
      throw new Error("missing game fact");
    },
  },
  { ...availabilityAction, condition: () => undefined },
])
  assert.deepEqual(qualifyAvailability(malformedAction), { kind: "invalid" });
for (const [region, key] of [
  ["city", "showCity"],
  ["space", "showSpace"],
  ["interstellar", "showDeep"],
  ["galaxy", "showGalactic"],
  ["portal", "showPortal"],
  ["tauceti", "showTau"],
  ["eden", "showEden"],
]) {
  assert.deepEqual(
    qualifyAvailability(
      availabilityAction,
      {
        ...availabilityRoot,
        settings: { ...availabilityRoot.settings, [key]: false },
      },
      region,
    ),
    { kind: "value", value: false },
  );
}
assert.deepEqual(
  qualifyAvailability(
    availabilityAction,
    {
      ...availabilityRoot,
      settings: { ...availabilityRoot.settings, showOuter: false },
    },
    "space",
    "probe",
    { zone: "outer" },
  ),
  { kind: "value", value: false },
);
const spaceAction = { reqs: { electricity: 1 } };
const standardSpaceRoot = {
  ...availabilityRoot,
  settings: {
    ...availabilityRoot.settings,
    showOuter: false,
    space: { gas: true },
  },
};
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    standardSpaceRoot,
    spaceAction,
    "space",
    "spc_gas",
    "gas_mission",
    { zone: "outer" },
    SPACE_TAB_INDEX.space,
  ),
  { kind: "value", value: true },
  "standard-route inner rendering can include an enabled outer-zone row",
);
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    standardSpaceRoot,
    spaceAction,
    "space",
    "spc_gas",
    "gas_mission",
    { zone: "outer" },
    SPACE_TAB_INDEX.outerSol,
  ),
  { kind: "value", value: false },
  "the outer sub-tab is not rendered by a standard route",
);
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    {
      ...standardSpaceRoot,
      race: { truepath: true },
      settings: { ...standardSpaceRoot.settings, showOuter: true },
    },
    spaceAction,
    "space",
    "spc_gas",
    "gas_mission",
    { zone: "outer" },
    SPACE_TAB_INDEX.space,
  ),
  { kind: "value", value: false },
  "truepath separates outer-zone controls from the inner sub-tab",
);
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    {
      ...standardSpaceRoot,
      race: { truepath: true },
      settings: { ...standardSpaceRoot.settings, showOuter: true },
    },
    spaceAction,
    "space",
    "spc_gas",
    "gas_mission",
    { zone: "outer" },
    SPACE_TAB_INDEX.outerSol,
  ),
  { kind: "value", value: true },
  "truepath renders the matching outer-zone control in its outer sub-tab",
);
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    {
      ...standardSpaceRoot,
      settings: { ...standardSpaceRoot.settings, space: {} },
    },
    spaceAction,
    "space",
    "spc_gas",
    "gas_mission",
    { zone: "outer" },
    SPACE_TAB_INDEX.space,
  ),
  { kind: "value", value: false },
  "an absent settings.space sector flag follows renderSpace's lenient false gate",
);
for (const race of [{ cataclysm: true }, { orbit_decayed: true }]) {
  assert.deepEqual(
    readCapturedActionControlAvailabilityForTab(
      {
        ...standardSpaceRoot,
        race,
        settings: {
          ...standardSpaceRoot.settings,
          space: { home: true },
        },
      },
      spaceAction,
      "space",
      "spc_home",
      "home_structure",
      { zone: "inner" },
      SPACE_TAB_INDEX.space,
    ),
    { kind: "value", value: false },
    "renderSpace suppresses home action rows on cataclysm and before orbit-decayed Resettle",
  );
}
assert.deepEqual(
  readCapturedActionControlAvailabilityForTab(
    {
      ...standardSpaceRoot,
      race: { orbit_decayed: true },
      tech: { ...standardSpaceRoot.tech, resettle: 1 },
      settings: {
        ...standardSpaceRoot.settings,
        space: { home: true },
      },
    },
    spaceAction,
    "space",
    "spc_home",
    "home_structure",
    { zone: "inner" },
    SPACE_TAB_INDEX.space,
  ),
  { kind: "value", value: true },
  "Resettle restores the home action row on orbit-decayed runs",
);
assert.deepEqual(
  qualifyAvailability(
    availabilityAction,
    { ...availabilityRoot, tech: { electricity: 1, isolation: 1 } },
    "space",
  ),
  { kind: "value", value: false },
);
const kindlingRoot = {
  ...availabilityRoot,
  race: { kindling_kindred: 1 },
  tech: {},
};
assert.deepEqual(
  qualifyAvailability(availabilityAction, kindlingRoot, "city", "lumber"),
  { kind: "value", value: false },
);
assert.deepEqual(
  qualifyAvailability(availabilityAction, kindlingRoot, "city", "stone"),
  { kind: "value", value: true },
);
assert.deepEqual(
  qualifyAvailability(
    { ...availabilityAction, not_trait: ["kindling_kindred"] },
    kindlingRoot,
    "city",
    "stone",
  ),
  { kind: "value", value: false },
  "city special handling still applies setAction qualifications",
);
for (const actionId of ["undefined-food", "undefined-stone"]) {
  let availabilityReads = 0;
  const structure = {
    actionId,
    region: "city",
    sector: "city",
    struct: actionId.slice("undefined-".length),
    matchesCurrentIdentity: () => true,
    readControlAvailabilityForTab: () => {
      availabilityReads += 1;
      return { kind: "value", value: true };
    },
    readSwitchable: () => ({ kind: "value", value: false }),
  };
  const resolvedIds = [];
  const coverage = readCapturedBuildControlCoverage(
    availabilityRoot,
    SPACE_TAB_INDEX.city,
    {
      resolve: (id) => {
        resolvedIds.push(id);
        return id === actionId ? { methods: ["action"] } : undefined;
      },
    },
    { readStructures: () => [structure] },
  );
  assert.deepEqual(
    coverage,
    { kind: "complete" },
    `${actionId} is already captured`,
  );
  assert.deepEqual(
    resolvedIds,
    [actionId],
    "resolve uses the native element id",
  );
  assert.equal(
    availabilityReads,
    0,
    "complete captured controls skip native offer polling",
  );
}
{
  const switchableStructure = {
    actionId: "city-coal_power",
    region: "city",
    sector: "city",
    struct: "coal_power",
    matchesCurrentIdentity: () => true,
    readControlAvailabilityForTab: () => ({ kind: "value", value: true }),
    readSwitchable: () => ({ kind: "value", value: true }),
  };
  const missingOnCap = readCapturedBuildControlCoverage(
    availabilityRoot,
    SPACE_TAB_INDEX.city,
    { resolve: () => ({ methods: ["action"] }) },
    { readStructures: () => [switchableStructure] },
  );
  assert.deepEqual(missingOnCap, {
    kind: "missing",
    bindings: ["city-coal_power"],
  });
}
console.log("captured Building semantic availability passed");
for (const cityPath of ["cataclysm", "orbit_decayed", "warlord", "iceage"]) {
  const cityPathRoot = {
    ...availabilityRoot,
    race: { [cityPath]: 1, replicator: 1 },
  };
  assert.deepEqual(qualifyAvailability(availabilityAction, cityPathRoot), {
    kind: "value",
    value: false,
  });
  assert.deepEqual(
    qualifyAvailability(availabilityAction, cityPathRoot, "city", "replicator"),
    { kind: "value", value: true },
  );
}
assert.deepEqual(
  qualifyAvailability(availabilityAction, {
    ...availabilityRoot,
    tech: { electricity: 1, isolation: 1 },
  }),
  { kind: "value", value: false },
);

const orderingRoot = {
  ...availabilityRoot,
  city: {
    coal_power: { count: 2, on: 1 },
    oil_power: { count: 3, on: 2 },
    registry_only: { count: 5, on: 4 },
  },
};
const orderingDefinitions = ["coal_power", "oil_power", "registry_only"].map(
  (struct) => ({
    entryKey: `city:${struct}`,
    region: "city",
    sector: "city",
    struct,
    actionId: `city-${struct}`,
    readTitle: () => ({ kind: "value", value: struct }),
    readAvailability: () => ({ kind: "value", value: true }),
    ownsPowered: true,
    readPowered: () => ({ kind: "value", value: 1 }),
    readPowerRequirements: () => ({ kind: "absent" }),
  }),
);
const orderingMechanics = { readStructures: () => orderingDefinitions };
let drawnOrderingIds = [];
const orderingControls = {
  capturedElementIds: () => drawnOrderingIds,
  resolve() {
    throw new Error("Power must not resolve Building panels");
  },
};
const freshOrdering = readCapturedSemanticBuildingStates(
  orderingRoot,
  orderingControls,
  orderingMechanics,
);
drawnOrderingIds = ["city-oil_power", "city-registry_only", "city-coal_power"];
assert.deepEqual(
  readCapturedSemanticBuildingStates(
    orderingRoot,
    orderingControls,
    orderingMechanics,
  ),
  freshOrdering,
  "arbitrary panel draw order and unmanaged controls cannot alter Power snapshots",
);
assert.deepEqual(
  freshOrdering.map((state) => state.catalog.binding),
  ["city-coal_power", "city-oil_power"],
);
orderingDefinitions[1].readAvailability = () => ({ kind: "invalid" });
assert.equal(
  readCapturedSemanticBuildingStates(
    orderingRoot,
    orderingControls,
    orderingMechanics,
  ),
  undefined,
  "one unknown qualification fails the complete semantic sample",
);
