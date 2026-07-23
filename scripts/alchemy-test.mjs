import assert from "node:assert/strict";

import {
  createAlchemyCommandExecutor,
  readAlchemyInput,
} from "../src/adapters/evolve/economy/production/alchemy.ts";
import { planAlchemy } from "../src/domain/economy/production/alchemy.ts";

// Exact copy of the deleted legacy `autoAlchemy` algorithm, run against
// identical live fixtures to prove the reader + planner + apply path produces a
// byte-identical transmute call trace.
function legacyAlchemy({
  AlchemyManager,
  getResources,
  getSettings,
  getGame,
  getAchievementStar,
}) {
  const resources = getResources();
  const settings = getSettings();
  const game = getGame();
  let m = AlchemyManager;
  if (!m.isUnlocked()) return;

  let fullList = m.managedPriorityList();
  let adjustAlchemy = Object.fromEntries(
    fullList.map((res) => [res.id, m.currentCount(res.id) * -1]),
  );

  if (!resources.Crystal.isDemanded()) {
    let activeList = fullList.filter(
      (res) => m.resWeighting(res.id) > 0 && res.isUseful(),
    );
    let totalWeigthing = 0,
      currentTransmute = 0;
    for (let res of activeList) {
      totalWeigthing += m.resWeighting(res.id);
      currentTransmute += m.currentCount(res.id);
    }
    let manaAvailable =
      (currentTransmute + resources.Mana.rateOfChange) *
      (!settings.autoPylon && resources.Mana.storageRatio > 0.99
        ? 1
        : settings.magicAlchemyManaUse);
    let crystalAvailable =
      currentTransmute * 0.15 +
      resources.Crystal.currentQuantity +
      resources.Crystal.rateOfChange;
    let maxTransmute = Math.floor(
      Math.min(manaAvailable, crystalAvailable * (1 / 0.15)),
    );
    activeList.forEach(
      (res) =>
        (adjustAlchemy[res.id] += Math.floor(
          maxTransmute * (m.resWeighting(res.id) / totalWeigthing),
        )),
    );
  }

  if (
    settings.magicFullmetalHelper &&
    game.global.race.universe === "magic" &&
    game.global.tech.alchemy >= 2 &&
    getAchievementStar("fullmetal") < game.alevel() &&
    resources.Mana.currentQuantity >= 1 &&
    resources.Crystal.currentQuantity >= 0.15
  ) {
    let fullmetalResource = fullList.find(
      (res) => m.transmuteTier(res) > 1 && !res.instance?.basic,
    );
    if (fullmetalResource) {
      adjustAlchemy[fullmetalResource.id] = Math.max(
        adjustAlchemy[fullmetalResource.id],
        1 - m.currentCount(fullmetalResource.id),
      );
    }
  }

  Object.entries(adjustAlchemy).forEach(
    ([id, delta]) => delta < 0 && m.transmuteLess(id, delta * -1),
  );
  Object.entries(adjustAlchemy).forEach(
    ([id, delta]) => delta > 0 && m.transmuteMore(id, delta),
  );
}

function buildFixture(scenario, actions) {
  const products = scenario.products.map((p) => ({
    id: p.id,
    isUseful: () => p.useful,
    instance: p.instance,
  }));
  const counts = Object.fromEntries(
    scenario.products.map((p) => [p.id, p.count]),
  );
  const weights = Object.fromEntries(
    scenario.products.map((p) => [p.id, p.weight]),
  );
  const tiers = Object.fromEntries(
    scenario.products.map((p) => [p.id, p.tier ?? 1]),
  );
  const AlchemyManager = {
    isUnlocked: () => scenario.unlocked ?? true,
    managedPriorityList: () => products,
    currentCount: (id) => counts[id],
    resWeighting: (id) => weights[id],
    transmuteTier: (res) => tiers[res.id],
    transmuteLess: (id, count) => actions.push(["less", id, count]),
    transmuteMore: (id, count) => actions.push(["more", id, count]),
  };
  const resources = {
    Mana: {
      currentQuantity: scenario.mana ?? 10,
      rateOfChange: scenario.manaRate ?? 8,
      storageRatio: scenario.manaStorage ?? 0.5,
    },
    Crystal: {
      currentQuantity: scenario.crystal ?? 100,
      rateOfChange: scenario.crystalRate ?? 0,
      isDemanded: () => scenario.crystalDemanded ?? false,
    },
  };
  const settings = {
    autoPylon: scenario.autoPylon ?? true,
    magicAlchemyManaUse: scenario.manaUse ?? 0.5,
    magicFullmetalHelper: scenario.fullmetal ?? false,
  };
  const game = {
    global: {
      race: { universe: scenario.universe ?? "standard" },
      tech: { alchemy: scenario.alchemyTech ?? 1 },
    },
    alevel: () => scenario.alevel ?? 0,
  };
  return {
    AlchemyManager,
    resources,
    settings,
    game,
    star: scenario.star ?? 0,
  };
}

function runLegacy(scenario) {
  const actions = [];
  const f = buildFixture(scenario, actions);
  legacyAlchemy({
    AlchemyManager: f.AlchemyManager,
    getResources: () => f.resources,
    getSettings: () => f.settings,
    getGame: () => f.game,
    getAchievementStar: () => f.star,
  });
  return actions;
}

function runNew(scenario) {
  const actions = [];
  const f = buildFixture(scenario, actions);
  const decision = planAlchemy(
    readAlchemyInput({
      getAlchemyManager: () => f.AlchemyManager,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getGame: () => f.game,
      getAchievementStar: () => f.star,
    }),
  );
  assert.equal(
    createAlchemyCommandExecutor(() => f.AlchemyManager).execute(decision)
      .status,
    "succeeded",
  );
  return actions;
}

const scenarios = [
  // 1. Weighted split between two useful products.
  {
    products: [
      { id: "Iron", useful: true, count: 2, weight: 1 },
      { id: "Steel", useful: true, count: 0, weight: 3 },
    ],
  },
  // 2. Locked: no actions.
  {
    unlocked: false,
    products: [{ id: "Iron", useful: true, count: 2, weight: 1 }],
  },
  // 3. Crystal demanded: only the base -currentCount decreases apply.
  {
    crystalDemanded: true,
    products: [
      { id: "Iron", useful: true, count: 3, weight: 1 },
      { id: "Steel", useful: true, count: 0, weight: 2 },
    ],
  },
  // 4. Non-useful and zero-weight products excluded from the active split.
  {
    products: [
      { id: "Iron", useful: true, count: 1, weight: 2 },
      { id: "Steel", useful: false, count: 4, weight: 2 },
      { id: "Gold", useful: true, count: 0, weight: 0 },
    ],
  },
  // 5. Mana-storage-full path (autoPylon off) uses full mana rate.
  {
    autoPylon: false,
    manaStorage: 1,
    products: [{ id: "Iron", useful: true, count: 0, weight: 1 }],
  },
  // 6. Fullmetal helper bumps a tier-2 non-basic resource to at least 1.
  {
    fullmetal: true,
    universe: "magic",
    alchemyTech: 2,
    alevel: 2,
    star: 0,
    mana: 5,
    crystal: 100,
    products: [
      { id: "Iron", useful: true, count: 0, weight: 1, tier: 1 },
      {
        id: "Adamantite",
        useful: true,
        count: 0,
        weight: 1,
        tier: 2,
        instance: { basic: false },
      },
    ],
  },
  // 7. Fullmetal gated off by achievement star already earned.
  {
    fullmetal: true,
    universe: "magic",
    alchemyTech: 2,
    alevel: 2,
    star: 2,
    products: [
      {
        id: "Adamantite",
        useful: true,
        count: 0,
        weight: 1,
        tier: 2,
        instance: { basic: false },
      },
    ],
  },
];

let index = 0;
for (const scenario of scenarios) {
  index += 1;
  assert.deepEqual(
    runNew(scenario),
    runLegacy(scenario),
    `scenario ${index} transmute trace mismatch`,
  );
}

// Adapter: legacy refreshes getter bindings before the locked gate, but the
// returned state must remain completely uninspected.
{
  const getterCalls = [];
  const input = readAlchemyInput({
    getAlchemyManager: () => ({ isUnlocked: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
    getGame: () => (getterCalls.push("game"), null),
    getAchievementStar: () => {
      throw new Error("stars must not be read when locked");
    },
  });
  assert.equal(input.unlocked, false);
  assert.deepEqual(input.resources, []);
  assert.deepEqual(getterCalls, ["resources", "settings", "game"]);
  assert.ok(Object.isFrozen(input));
}

// Fullmetal-disabled state must not inspect fullmetal-only game/resource data.
{
  const input = readAlchemyInput({
    getAlchemyManager: () => ({
      isUnlocked: () => true,
      managedPriorityList: () => [
        {
          id: "Iron",
          isUseful: () => true,
          get instance() {
            throw new Error(
              "instance must not be read when helper is disabled",
            );
          },
        },
      ],
      currentCount: () => 0,
      resWeighting: () => 1,
      transmuteTier: () => {
        throw new Error("tier must not be read when helper is disabled");
      },
    }),
    getResources: () => ({
      Mana: { rateOfChange: 1, storageRatio: 0.5 },
      Crystal: {
        currentQuantity: 1,
        rateOfChange: 0,
        isDemanded: () => false,
      },
    }),
    getSettings: () => ({
      autoPylon: false,
      magicAlchemyManaUse: 0.5,
      magicFullmetalHelper: false,
    }),
    getGame: () => ({
      get global() {
        throw new Error(
          "game internals must not be read when helper is disabled",
        );
      },
    }),
    getAchievementStar: () => {
      throw new Error("achievement must not be read when helper is disabled");
    },
  });
  assert.equal(input.magicFullmetalHelper, false);
}

{
  const mutations = [];
  const result = createAlchemyCommandExecutor(() => ({
    currentCount: () => 2,
    transmuteLess: (...args) => mutations.push(["less", ...args]),
    transmuteMore: (...args) => mutations.push(["more", ...args]),
  })).execute({
    decrease: [],
    increase: [{ id: "Iron", expectedCurrentCount: 1, count: 1 }],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log(
  `Alchemy automation regression tests passed (${scenarios.length} dual-run scenarios)`,
);
