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
  space_gas_moon_outpost_bd: "Outpost",
  interstellar_cruiser_title: "Cruiser",
  interstellar_neutron_miner_title: "Neutron Miner",
  tech_fob: "FOB",
  space_lander_title: "Lander",
  galaxy_foothold: "Foothold",
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
    options.nativeSupportParticipant ?? false,
    stale,
  );
}
const one = (rows, id) => rows?.find((row) => row.resourceId === id);

const oilGenerator = one(
  sample(
    "city-oil_power",
    10,
    { Oil: { "Oil Power": -10 } },
    {},
    new Set(),
    [{ resourceId: "Oil", amount: 1 }],
    { role: "generator", region: "city", sector: "city", title: "Oil Power" },
  ),
  "Oil",
);
assert.deepEqual(oilGenerator, {
  resourceId: "Oil",
  currentTotal: 10,
  unwindCredit: 0,
  enableRate: 1,
});
const starvedSupport = one(
  sample(
    "space-support",
    10,
    { Oil: { "Support+space-support": -10 } },
    {},
    new Set(),
    undefined,
    {
      role: "none",
      title: "Support",
      supportFuel: [{ resourceId: "Oil", amount: 1 }],
      supportAdjustment: true,
      nativeSupportParticipant: true,
    },
  ),
  "Oil",
);
assert.deepEqual(starvedSupport, {
  resourceId: "Oil",
  currentTotal: 10,
  unwindCredit: 0,
  enableRate: 1,
});
const specialFuel = (resourceId, amount) => [{ resourceId, amount }];
assert.deepEqual(
  one(
    sample(
      "underground-mineshaft_vator",
      1,
      {
        Oil: {
          "Mineshaft Elevator": -100,
          "Mineshaft Elevator+underground-mineshaft_vator": -999,
        },
      },
      {},
      new Set(),
      undefined,
      {
        role: "consumer",
        title: "Mineshaft Elevator",
        supportFuel: specialFuel("Oil", 100),
        nativeSupportParticipant: false,
      },
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 100, unwindCredit: 0, enableRate: 100 },
  "Mineshaft Elevator uses only the raw title-only Ice Age path",
);
assert.deepEqual(
  one(
    readCapturedPowerConsumptions(
      {},
      mechanics,
      {
        ...action("underground-mineshaft_vator", undefined, {
          title: "Mineshaft Elevator",
          supportFuel: specialFuel("Oil", 100),
        }),
        readSupportFuelAdjustmentDisabled: () =>
          assert.fail("Ice Age fuel must not consult support_fuel_adjust"),
      },
      { production: {}, consumption: { Oil: { "Mineshaft Elevator": -100 } } },
      1,
      "consumer",
      false,
      new Set(),
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 100, unwindCredit: 0, enableRate: 100 },
);
assert.deepEqual(
  one(
    sample(
      "surface-surface_zoo",
      1,
      { Food: { "Surface Zoo": -150 } },
      {},
      new Set(),
      undefined,
      {
        role: "consumer",
        title: "Surface Zoo",
        supportFuel: specialFuel("Food", 150),
        nativeSupportParticipant: false,
      },
    ),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 150, unwindCredit: 0, enableRate: 150 },
  "Surface Zoo needs no generic support-grid row",
);
const watchTowerOptions = {
  role: "consumer",
  title: "Watch Tower",
  supportFuel: specialFuel("Food", 25),
  nativeSupportParticipant: true,
};
for (const [ledger, currentTotal] of [
  [{ "Watch Tower+surface-watch_tower": -25, "Watch Tower": -25 }, 50],
  [{ "Watch Tower+surface-watch_tower": -25 }, 25],
  [{ "Watch Tower": -25 }, 25],
]) {
  assert.deepEqual(
    one(
      sample(
        "surface-watch_tower",
        1,
        { Food: ledger },
        {},
        new Set(),
        undefined,
        watchTowerOptions,
      ),
      "Food",
    ),
    { resourceId: "Food", currentTotal, unwindCredit: 0, enableRate: 50 },
    "each Watch Tower source is observed independently while both native marginals remain",
  );
}
assert.deepEqual(
  one(
    sample(
      "surface-water_pipe",
      1,
      { Water: { "Water Pipe+surface-water_pipe": -25, "Water Pipe": -25 } },
      {},
      new Set(),
      undefined,
      {
        role: "consumer",
        title: "Water Pipe",
        supportFuel: specialFuel("Water", 25),
        nativeSupportParticipant: true,
      },
    ),
    "Water",
  ),
  { resourceId: "Water", currentTotal: 50, unwindCredit: 0, enableRate: 50 },
  "Water Pipe is both a native support provider and an Ice Age fuel consumer",
);
for (const [nativeSupportParticipant, currentTotal, enableRate] of [
  [true, 60, 60],
  [false, 30, 30],
]) {
  assert.deepEqual(
    one(
      sample(
        "surface-surface_farm",
        1,
        {
          Water: {
            "Surface Farm+surface-surface_farm": -30,
            "Surface Farm": -30,
          },
        },
        {},
        new Set(),
        undefined,
        {
          role: "consumer",
          title: "Surface Farm",
          supportFuel: specialFuel("Water", 30),
          nativeSupportParticipant,
        },
      ),
      "Water",
    ),
    { resourceId: "Water", currentTotal, unwindCredit: 0, enableRate },
    "Surface Farm's native support participation controls its generic path",
  );
}
assert.deepEqual(
  one(
    sample(
      "underground-bonfire",
      2,
      { Lumber: { Bonfire: -12 } },
      {},
      new Set(),
      undefined,
      {
        role: "consumer",
        title: "Bonfire",
        supportFuel: specialFuel("Lumber", 6),
      },
    ),
    "Lumber",
  ),
  { resourceId: "Lumber", currentTotal: 12, unwindCredit: 0, enableRate: null },
  "Bonfire's active-dependent native closure cannot supply a marginal",
);
assert.equal(
  one(
    sample(
      "surface-watch_tower",
      1,
      {
        Food: {
          "Watch Tower+surface-watch_tower": Number.NaN,
          "Watch Tower": -25,
        },
      },
      {},
      new Set(),
      undefined,
      watchTowerOptions,
    ),
    "Food",
  )?.enableRate,
  null,
  "one malformed native mechanism blocks the combined marginal",
);
assert.deepEqual(
  one(
    sample(
      "space-ordinary_support",
      1,
      { Oil: { "Ordinary+space-ordinary_support": -12, Ordinary: -99 } },
      {},
      new Set(),
      undefined,
      {
        title: "Ordinary",
        supportFuel: specialFuel("Oil", 12),
        nativeSupportParticipant: true,
      },
    ),
    "Oil",
  ),
  { resourceId: "Oil", currentTotal: 12, unwindCredit: 0, enableRate: 6 },
  "ordinary support fuel keeps adjusted title-plus-ID semantics",
);
for (const [binding, resourceId, source] of [
  ["space-space_barracks", "Oil", "Marines"],
  ["space-outpost", "Oil", "Outpost"],
  ["interstellar-cruiser", "Helium_3", "Cruiser"],
  ["interstellar-neutron_miner", "Helium_3", "Neutron Miner"],
  ["space-fob", "Helium_3", "FOB"],
  ["space-lander", "Oil", "Lander"],
]) {
  const row = one(
    sample(binding, 1, { [resourceId]: { [source]: -10 } }),
    resourceId,
  );
  assert.equal(row?.currentTotal, 10, `${binding} retains native demand`);
  assert.equal(
    row?.unwindCredit,
    0,
    `${binding} cannot credit pre-clamp demand`,
  );
}
for (const [binding, resourceId, source] of [
  ["space-space_barracks", "Food", "Marines"],
  ["space-spaceport", "Food", "Puerto espacial"],
  ["space-red_factory", "Helium_3", "space-red_factory"],
  ["galaxy-foothold", "Elerium", "Foothold"],
]) {
  const row = one(
    sample(binding, 1, { [resourceId]: { [source]: -10 } }),
    resourceId,
  );
  assert.equal(row?.currentTotal, 10);
  assert.equal(row?.unwindCredit, 10, `${binding} credits its applied rate`);
}

assert.deepEqual(
  one(
    sample("space-space_station", 0, {}, { race: { orbit_decayed: true } }),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 0, unwindCredit: 0, enableRate: 10 },
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
    { resourceId: "Food", currentTotal: 0, unwindCredit: 0, enableRate: null },
    `${binding} does not fabricate consumption or enable behind an inactive Stargate`,
  );
}
assert.deepEqual(
  one(sample("galaxy-starbase", 2, { Food: { "Base estelar": -500 } }), "Food"),
  { resourceId: "Food", currentTotal: 500, unwindCredit: 500, enableRate: 250 },
  "a matching active native row validates the starbase marginal",
);
assert.deepEqual(
  one(sample("galaxy-embassy", 2, { Food: { Embajada: -15000 } }), "Food"),
  {
    resourceId: "Food",
    currentTotal: 15000,
    unwindCredit: 15000,
    enableRate: 7500,
  },
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
  {
    resourceId: "Food",
    currentTotal: 300,
    unwindCredit: 300,
    enableRate: null,
  },
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
assert.equal(one(barracks, "Oil")?.unwindCredit, 0);
assert.equal(one(barracks, "Food")?.unwindCredit, 20);
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
  { resourceId: "Oil", currentTotal: 150, unwindCredit: 150, enableRate: 100 },
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
  { resourceId: "Oil", currentTotal: 0, unwindCredit: 0, enableRate: 100 },
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
  { resourceId: "Oil", currentTotal: 0, unwindCredit: 0, enableRate: null },
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
    {
      resourceId: "Oil",
      currentTotal: 150,
      unwindCredit: 150,
      enableRate: 100,
    },
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
  { resourceId: "Helium_3", currentTotal: 12, unwindCredit: 0, enableRate: 12 },
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
  { resourceId: "Helium_3", currentTotal: 0, unwindCredit: 0, enableRate: 12 },
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
  {
    resourceId: "Helium_3",
    currentTotal: 12,
    unwindCredit: 12,
    enableRate: 12,
  },
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
          nativeSupportParticipant: true,
        },
      ),
      "Helium_3",
    ),
    {
      resourceId: "Helium_3",
      currentTotal: 12,
      unwindCredit: 0,
      enableRate: expected,
    },
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
    false,
    new Set(),
  ),
  [{ resourceId: "Oil", currentTotal: 0, unwindCredit: 0, enableRate: null }],
  "an unavailable action source freezes only its consumption capability",
);

assert.deepEqual(
  one(
    sample("space-red_factory", 2, { Helium_3: { "space-red_factory": -1 } }),
    "Helium_3",
  ),
  { resourceId: "Helium_3", currentTotal: 1, unwindCredit: 1, enableRate: 0.5 },
);
assert.deepEqual(
  one(
    sample("interstellar-int_factory", 2, {
      Deuterium: { "Fábrica interestelar": -7.5 },
    }),
    "Deuterium",
  ),
  {
    resourceId: "Deuterium",
    currentTotal: 7.5,
    unwindCredit: 7.5,
    enableRate: 3.75,
  },
);
const vitreloy = sample("galaxy-vitreloy_plant", 5, {
  Money: { Vitreloy: -100000 },
  Bolognium: { Vitreloy: -5 },
  Stanene: { Vitreloy: -200 },
});
assert.deepEqual(
  vitreloy?.map(({ resourceId, currentTotal, unwindCredit, enableRate }) => [
    resourceId,
    currentTotal,
    unwindCredit,
    enableRate,
  ]),
  [
    ["Money", 100000, 100000, null],
    ["Bolognium", 5, 5, null],
    ["Stanene", 200, 200, null],
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
  { resourceId: "Food", currentTotal: 0, unwindCredit: 0, enableRate: null },
  "positive source rows fail only the affected consumption closed",
);
assert.deepEqual(
  one(
    sample("city-tourist_center", 1, { Food: { Turismo: Number.NaN } }),
    "Food",
  ),
  { resourceId: "Food", currentTotal: 0, unwindCredit: 0, enableRate: null },
  "nonfinite source rows fail only the affected consumption closed",
);
console.log(
  "captured Power consumption uses native current rows and guarded idle capability",
);
