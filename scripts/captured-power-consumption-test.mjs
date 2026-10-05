import assert from "node:assert/strict";
import { readCapturedPowerConsumptions } from "../src/adapters/evolve/economy/production/captured-power-reader.ts";
import { readPowerNativeConsumption } from "../src/adapters/evolve/economy/production/captured-power-consumption.ts";

const labels = {
  space_belt_station_title: "Estación orbital",
  space_red_spaceport_title: "Puerto espacial",
  galaxy_starbase: "Base estelar",
  galaxy_embassy: "Embajada",
  tech_tourism: "Turismo",
  tech_space_marines_bd: "Marines",
  interstellar_int_factory_title: "Fábrica interestelar",
  galaxy_vitreloy_plant_bd: "Vitreloy",
};
const mechanics = {
  readLocalizedText: (key) =>
    Object.hasOwn(labels, key)
      ? { kind: "value", value: labels[key] }
      : { kind: "absent" },
  readAdjustedFuelFactor: (mode) => ({
    kind: "value",
    value: mode === "space" ? 0.5 : 0.75,
  }),
};
function action(binding, fuel, options = {}) {
  return {
    actionId: binding,
    region: options.region ?? binding.split("-")[0],
    sector: options.sector ?? binding.split("-")[0],
    readTitle: () => ({ kind: "value", value: options.title ?? binding }),
    readFuel: () =>
      fuel === undefined ? { kind: "absent" } : { kind: "value", value: fuel },
    readSupportFuel: () =>
      options.supportFuel === undefined
        ? { kind: "absent" }
        : { kind: "value", value: options.supportFuel },
    readSupportFuelAdjustmentDisabled: () =>
      options.supportAdjustment === undefined
        ? { kind: "absent" }
        : { kind: "value", value: options.supportAdjustment },
    readFuelAdjustmentRequested: () =>
      options.adjustment === "invalid"
        ? { kind: "invalid" }
        : options.adjustment === undefined
          ? { kind: "absent" }
          : { kind: "value", value: options.adjustment },
  };
}
function sample(
  binding,
  on,
  rows = {},
  state = {},
  stale = new Set(),
  fuel,
  options = {},
) {
  const root = {
    race: {},
    tech: {},
    galaxy: { s_gate: { on: 1 } },
    ...state,
  };
  return readCapturedPowerConsumptions(
    root,
    mechanics,
    action(binding, fuel, options),
    { production: {}, consumption: rows },
    on,
    options.role ?? "none",
    stale,
  );
}
const one = (rows, id) => rows?.find((row) => row.resourceId === id);

assert.deepEqual(
  one(
    sample("space-space_station", 0, {}, { race: { orbit_decayed: true } }),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 0, enableRate: 10 },
  "orbit decay does not change pinned Space Station Food",
);
assert.equal(
  one(
    sample("space-space_station", 0, {}, { race: { cataclysm: true } }),
    "Food",
  )?.enableRate,
  1,
);
assert.equal(
  one(
    sample("space-space_station", 2, { Food: { "Estación orbital": -20 } }),
    "Food",
  )?.currentTotal,
  20,
  "the localized source key resolves the native ledger, not parsed prose",
);
assert.equal(
  one(
    sample(
      "space-spaceport",
      0,
      {},
      { race: { orbit_decayed: true }, tech: { isolation: 1 } },
    ),
    "Food",
  )?.enableRate,
  25,
  "decayPerks is disabled by native Isolation tech",
);
assert.equal(
  one(
    sample("space-spaceport", 0, {}, { race: { orbit_decayed: true } }),
    "Food",
  )?.enableRate,
  2,
);
for (const [binding, source] of [
  ["galaxy-starbase", "Base estelar"],
  ["galaxy-embassy", "Embajada"],
]) {
  assert.deepEqual(
    one(
      sample(
        binding,
        4,
        { Food: { [source]: 0 } },
        { galaxy: { s_gate: { on: 0 } } },
      ),
      "Food",
    ),
    { resourceId: "Food", currentTotal: 0, enableRate: null },
    `${binding} does not fabricate consumption or enable behind an inactive Stargate`,
  );
}
assert.deepEqual(
  one(sample("galaxy-starbase", 2, { Food: { "Base estelar": -500 } }), "Food"),
  { resourceId: "Food", currentTotal: 500, enableRate: 250 },
  "a matching active native row validates the starbase marginal",
);
assert.deepEqual(
  one(sample("galaxy-embassy", 2, { Food: { Embajada: -15000 } }), "Food"),
  { resourceId: "Food", currentTotal: 15000, enableRate: 7500 },
);
assert.deepEqual(
  one(
    sample(
      "city-tourist_center",
      2,
      { Food: { Turismo: -300 } },
      { race: { humongous: true } },
    ),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 300, enableRate: null },
  "Humongous current consumption comes from the game and idle scaling fails closed",
);
const barracks = sample(
  "space-space_barracks",
  2,
  {
    Oil: { Marines: -6 },
    Food: { Marines: -20 },
  },
  { race: { humongous: true } },
);
assert.equal(one(barracks, "Oil")?.currentTotal, 6);
assert.equal(one(barracks, "Food")?.currentTotal, 20);
assert.equal(one(barracks, "Oil")?.enableRate, null);
const mine = {
  role: "consumer",
  region: "space",
  sector: "spc_makemake",
  title: "Orichalcum Mine",
};
const mineFuel = [{ resourceId: "Oil", amount: 200 }];
assert.deepEqual(
  one(
    sample(
      "space-orichalcum_mine",
      1,
      {
        Oil: {
          "Orichalcum Mine+space-orichalcum_mine": -150,
          "Orichalcum Mine": -999,
        },
      },
      {},
      new Set(),
      mineFuel,
      mine,
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 150, enableRate: 100 },
  "MakeMake powered mine reads only its native consumer source and space fuel adjustment",
);
assert.deepEqual(
  one(
    sample(
      "space-orichalcum_mine",
      1,
      {
        Oil: { "Orichalcum Mine": -999 },
      },
      {},
      new Set(),
      mineFuel,
      mine,
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 0, enableRate: 100 },
  "a title-only source is not attributed to a consumer",
);
assert.deepEqual(
  one(
    sample(
      "space-orichalcum_mine",
      1,
      {
        Oil: { "Orichalcum Mine+space-orichalcum_mine": Number.NaN },
      },
      {},
      new Set(),
      mineFuel,
      mine,
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 0, enableRate: null },
  "a malformed native consumer row freezes only its Oil capability",
);
for (const adjustment of [false, true, "invalid"]) {
  assert.deepEqual(
    one(
      sample(
        "space-orichalcum_mine",
        1,
        {
          Oil: { "Orichalcum Mine+space-orichalcum_mine": -150 },
        },
        {},
        new Set(),
        mineFuel,
        { ...mine, adjustment },
      ),
      "Oil",
    ),
    { resourceId: "Oil", currentTotal: 150, enableRate: 100 },
    "consumer p_fuel ignores even malformed p_fuel_adjust",
  );
}
assert.deepEqual(
  one(
    sample(
      "space-geothermal",
      1,
      {
        Helium_3: {
          "Space Geothermal": -12,
          "Space Geothermal+space-geothermal": -99,
        },
      },
      {},
      new Set(),
      [{ resourceId: "Helium_3", amount: 12 }],
      {
        role: "generator",
        title: "Space Geothermal",
        sector: "spc_hell",
      },
    ),
    "Helium_3",
  ),
  { resourceId: "Helium_3", currentTotal: 12, enableRate: 12 },
  "generator fuel remains raw without p_fuel_adjust",
);
assert.deepEqual(
  one(
    sample(
      "space-geothermal",
      1,
      {
        Helium_3: { "Space Geothermal+space-geothermal": -99 },
      },
      {},
      new Set(),
      [{ resourceId: "Helium_3", amount: 12 }],
      {
        role: "generator",
        title: "Space Geothermal",
        sector: "spc_hell",
      },
    ),
    "Helium_3",
  ),
  { resourceId: "Helium_3", currentTotal: 0, enableRate: 12 },
  "generator does not accept a consumer-shaped source",
);
for (const [region, sector, resourceId, expected] of [
  ["space", "spc_hell", "Helium_3", 6],
  ["interstellar", "int_alpha", "Helium_3", 9],
  ["space", "city", "Helium_3", 12],
  ["space", "spc_hell", "Deuterium", 12],
]) {
  assert.equal(
    one(
      sample(
        "space-synthetic_generator",
        1,
        {
          [resourceId]: { Generator: -12 },
        },
        {},
        new Set(),
        [{ resourceId, amount: 12 }],
        {
          role: "generator",
          region,
          sector,
          title: "Generator",
          adjustment: true,
        },
      ),
      resourceId,
    )?.enableRate,
    expected,
  );
}
assert.deepEqual(
  one(
    sample(
      "interstellar-synthetic_mine",
      1,
      {
        Helium_3: { "Mine+interstellar-synthetic_mine": -12 },
      },
      {},
      new Set(),
      [{ resourceId: "Helium_3", amount: 12 }],
      {
        role: "consumer",
        region: "interstellar",
        title: "Mine",
        adjustment: true,
      },
    ),
    "Helium_3",
  ),
  { resourceId: "Helium_3", currentTotal: 12, enableRate: 12 },
);
assert.equal(
  one(
    sample(
      "space-unowned",
      1,
      {
        Oil: { Unowned: -12, "Unowned+space-unowned": -12 },
      },
      {},
      new Set(),
      mineFuel,
      { role: "none", title: "Unowned" },
    ),
    "Oil",
  ),
  undefined,
);
for (const [region, adjustment, expected] of [
  ["space", false, 12],
  ["space", true, 6],
  ["interstellar", true, 9],
]) {
  assert.deepEqual(
    one(
      sample(
        "space-support",
        1,
        {
          Helium_3: { "Support+space-support": -12, Support: -99 },
        },
        {},
        new Set(),
        undefined,
        {
          role: "none",
          region,
          title: "Support",
          supportFuel: [{ resourceId: "Helium_3", amount: 12 }],
          supportAdjustment: !adjustment,
        },
      ),
      "Helium_3",
    ),
    { resourceId: "Helium_3", currentTotal: 12, enableRate: expected },
  );
}
assert.deepEqual(
  readCapturedPowerConsumptions(
    {},
    mechanics,
    {
      ...action("space-propellant_depot", [{ resourceId: "Oil", amount: 2 }]),
      readTitle: () => ({ kind: "invalid" }),
    },
    { production: {}, consumption: {} },
    0,
    "consumer",
    new Set(),
  ),
  [{ resourceId: "Oil", currentTotal: 0, enableRate: null }],
  "an unavailable action source freezes only its consumption capability",
);

assert.deepEqual(
  one(
    sample("space-red_factory", 2, { Helium_3: { "space-red_factory": -1 } }),
    "Helium_3",
  ),
  { resourceId: "Helium_3", currentTotal: 1, enableRate: 0.5 },
);
assert.deepEqual(
  one(
    sample("interstellar-int_factory", 2, {
      Deuterium: { "Fábrica interestelar": -7.5 },
    }),
    "Deuterium",
  ),
  { resourceId: "Deuterium", currentTotal: 7.5, enableRate: 3.75 },
);
const vitreloy = sample("galaxy-vitreloy_plant", 5, {
  Money: { Vitreloy: -100000 },
  Bolognium: { Vitreloy: -5 },
  Stanene: { Vitreloy: -200 },
});
assert.deepEqual(
  vitreloy?.map(({ resourceId, currentTotal, enableRate }) => [
    resourceId,
    currentTotal,
    enableRate,
  ]),
  [
    ["Money", 100000, null],
    ["Bolognium", 5, null],
    ["Stanene", 200, null],
  ],
);
assert.equal(one(sample("galaxy-vitreloy_plant", 0), "Money")?.currentTotal, 0);
assert.equal(
  one(sample("galaxy-vitreloy_plant", 0), "Money")?.enableRate,
  null,
);

const stale = new Set();
assert.equal(
  one(
    sample("city-tourist_center", 2, { Food: { Turismo: -150 } }, {}, stale),
    "Food",
  )?.enableRate,
  null,
);
assert.equal(
  one(
    sample("city-tourist_center", 2, { Food: { Turismo: -100 } }, {}, stale),
    "Food",
  )?.enableRate,
  null,
  "drift disables only that fallback for the root/session",
);
assert.equal(
  one(sample("space-space_station", 0), "Food")?.enableRate,
  10,
  "other structures remain available after drift",
);
assert.equal(
  readPowerNativeConsumption(
    { production: {}, consumption: {} },
    "Food",
    "Turismo",
  ),
  0,
);
assert.equal(
  readPowerNativeConsumption(
    { production: {}, consumption: { Food: { Turismo: 2 } } },
    "Food",
    "Turismo",
  ),
  undefined,
);
assert.deepEqual(
  one(sample("city-tourist_center", 1, { Food: { Turismo: 2 } }), "Food"),
  { resourceId: "Food", currentTotal: 0, enableRate: null },
  "positive source rows fail only the affected consumption closed",
);
assert.deepEqual(
  one(
    sample("city-tourist_center", 1, { Food: { Turismo: Number.NaN } }),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 0, enableRate: null },
  "nonfinite source rows fail only the affected consumption closed",
);
console.log(
  "captured Power consumption uses native current rows and guarded idle capability",
);
