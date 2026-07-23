import assert from "node:assert/strict";

import {
  createPylonCommandExecutor,
  readPylonInput,
} from "../src/adapters/evolve/pylon.ts";
import { planPylon } from "../src/domain/economy/production/pylon.ts";

// Independent transcription of RitualManager.costStep / manaCost from
// src/game/magic-managers.ts, used by the legacy reference below. If the domain
// copy of this formula drifts, the dual-run fails.
function manaCost(level) {
  return level * (1.0025 ** level - 1);
}
function costStep(level) {
  if (level === 0) return 0.0025;
  const cost = manaCost(level);
  return ((cost / level) * 1.0025 + 0.0025) * (level + 1) - cost;
}

// Exact copy of the deleted legacy `autoPylon` (including the discarded
// `resources.Mana.rateOfChange - (...)` no-op), run against identical live
// fixtures to prove the reader + planner + apply path is byte-identical.
function legacyPylon({
  RitualManager,
  getResources,
  getSettings,
  getGame,
  getJobs,
  haveTech,
}) {
  const resources = getResources();
  const settings = getSettings();
  const game = getGame();
  const jobs = getJobs();
  let m = RitualManager;
  if (!m.initIndustry()) return;

  let spells = Object.values(m.Productions).filter((spell) =>
    spell.isUnlocked(),
  );
  let pylonAdjustments = Object.fromEntries(spells.map((s) => [s.id, 0]));
  let manaToUse =
    resources.Mana.rateOfChange *
    (resources.Mana.storageRatio > 0.99 ? 1 : settings.productionRitualManaUse);
  let usableMana = manaToUse;
  let maxRituals =
    settings.productionRitualSafe && game.global.race["witch_hunter"]
      ? jobs.Priest.count * (haveTech("roguemagic", 4) ? 4 : 1)
      : Number.MAX_SAFE_INTEGER;

  let spellSorter = (a, b) =>
    pylonAdjustments[a.id] / a.weighting -
      pylonAdjustments[b.id] / b.weighting || b.weighting - a.weighting;
  let remainingSpells = spells
    .filter(
      (spell) =>
        spell.weighting > 0 &&
        (spell !== m.Productions.Factory || jobs.CementWorker.count > 0),
    )
    .sort(spellSorter);
  spellsLoop: while (remainingSpells.length > 0 && maxRituals > 0) {
    let spell = remainingSpells.shift();
    let amount = pylonAdjustments[spell.id];
    let cost = m.costStep(amount);
    if (cost <= manaToUse) {
      pylonAdjustments[spell.id] = amount + 1;
      manaToUse -= cost;
      maxRituals--;
      for (let i = remainingSpells.length - 1; i >= 0; i--) {
        if (spellSorter(spell, remainingSpells[i]) > 0) {
          remainingSpells.splice(i + 1, 0, spell);
          continue spellsLoop;
        }
      }
      remainingSpells.unshift(spell);
    }
  }
  resources.Mana.rateOfChange - (usableMana - manaToUse);

  let pylonDeltas = spells.map(
    (s) => pylonAdjustments[s.id] - m.currentSpells(s),
  );
  spells.forEach(
    (s, i) => pylonDeltas[i] < 0 && m.decreaseRitual(s, pylonDeltas[i] * -1),
  );
  spells.forEach(
    (s, i) => pylonDeltas[i] > 0 && m.increaseRitual(s, pylonDeltas[i]),
  );
}

function buildFixture(scenario, calls) {
  const productions = {};
  const current = {};
  for (const [key, spec] of Object.entries(scenario.spells)) {
    productions[key] = {
      id: spec.id,
      weighting: spec.weighting,
      isUnlocked: () => spec.unlocked !== false,
    };
    current[spec.id] = spec.current ?? 0;
  }
  const RitualManager = {
    Productions: productions,
    initIndustry: () => scenario.init ?? true,
    costStep,
    currentSpells: (spell) => current[spell.id],
    decreaseRitual: (spell, count) => calls.push(["decrease", spell.id, count]),
    increaseRitual: (spell, count) => calls.push(["increase", spell.id, count]),
  };
  return {
    RitualManager,
    resources: {
      Mana: {
        rateOfChange: scenario.manaRate,
        storageRatio: scenario.manaStorage ?? 1,
      },
    },
    settings: {
      productionRitualManaUse: scenario.manaUse ?? 0.5,
      productionRitualSafe: scenario.safe ?? false,
    },
    game: { global: { race: { witch_hunter: scenario.witchHunter ?? false } } },
    jobs: {
      Priest: { count: scenario.priests ?? 0 },
      CementWorker: { count: scenario.cementWorkers ?? 1 },
    },
    haveTech: (tech, level) =>
      tech === "roguemagic" && level === 4 && (scenario.roguemagic4 ?? false),
  };
}

function runLegacy(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  legacyPylon({
    RitualManager: f.RitualManager,
    getResources: () => f.resources,
    getSettings: () => f.settings,
    getGame: () => f.game,
    getJobs: () => f.jobs,
    haveTech: f.haveTech,
  });
  return calls;
}

function runNew(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  const decision = planPylon(
    readPylonInput({
      getRitualManager: () => f.RitualManager,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getGame: () => f.game,
      getJobs: () => f.jobs,
      haveTech: f.haveTech,
    }),
  );
  assert.equal(
    createPylonCommandExecutor(() => f.RitualManager).execute(decision).status,
    "succeeded",
  );
  return calls;
}

const scenarios = [
  // 1. Two unlocked spells, factory locked; weighted mana split, farmer drains.
  {
    manaRate: 0.05,
    spells: {
      Farmer: { id: "farmer", weighting: 1, current: 2 },
      Science: { id: "science", weighting: 2 },
      Factory: { id: "factory", weighting: 1, unlocked: false },
    },
  },
  // 2. Factory unlocked but no cement workers -> excluded; its stale casting drains.
  {
    manaRate: 0.05,
    cementWorkers: 0,
    spells: {
      Science: { id: "science", weighting: 2 },
      Factory: { id: "factory", weighting: 1, current: 3 },
    },
  },
  // 3. Factory included when cement workers present.
  {
    manaRate: 0.03,
    cementWorkers: 5,
    spells: {
      Science: { id: "science", weighting: 1 },
      Factory: { id: "factory", weighting: 2 },
    },
  },
  // 4. Ritual-safe witch hunter caps total rituals by priest count.
  {
    manaRate: 1,
    safe: true,
    witchHunter: true,
    priests: 2,
    spells: {
      Science: { id: "science", weighting: 1 },
      Army: { id: "army", weighting: 1 },
    },
  },
  // 5. Ritual-safe with roguemagic 4 raises the cap to priests * 4.
  {
    manaRate: 1,
    safe: true,
    witchHunter: true,
    priests: 2,
    roguemagic4: true,
    spells: {
      Science: { id: "science", weighting: 3 },
      Army: { id: "army", weighting: 1 },
    },
  },
  // 6. Zero-weight spell with stale casting is drained; low storage scales mana.
  {
    manaRate: 0.06,
    manaStorage: 0.5,
    manaUse: 0.5,
    spells: {
      Science: { id: "science", weighting: 2 },
      Hunting: { id: "hunting", weighting: 0, current: 4 },
    },
  },
  // 7. Not initialised: no actions.
  {
    init: false,
    manaRate: 1,
    spells: { Science: { id: "science", weighting: 1, current: 5 } },
  },
];

let index = 0;
for (const scenario of scenarios) {
  index += 1;
  assert.deepEqual(
    runNew(scenario),
    runLegacy(scenario),
    `scenario ${index} ritual trace mismatch`,
  );
}

// Adapter: legacy refreshes getters before initIndustry, but does not inspect
// the returned values when the industry is unavailable.
{
  const getterCalls = [];
  const input = readPylonInput({
    getRitualManager: () => ({ initIndustry: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
    getGame: () => (getterCalls.push("game"), null),
    getJobs: () => (getterCalls.push("jobs"), null),
    haveTech: () => false,
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(input.spells, []);
  assert.deepEqual(getterCalls, ["resources", "settings", "game", "jobs"]);
}

// Unsafe ritual mode and a locked Factory do not require either job entry or
// the roguemagic tech probe.
{
  let techCalls = 0;
  const input = readPylonInput({
    getRitualManager: () => ({
      Productions: {
        Factory: {
          id: "factory",
          weighting: 1,
          isUnlocked: () => false,
        },
        Farmer: {
          id: "farmer",
          weighting: 1,
          isUnlocked: () => true,
        },
      },
      initIndustry: () => true,
      currentSpells: () => 0,
    }),
    getResources: () => ({ Mana: { rateOfChange: 1, storageRatio: 1 } }),
    getSettings: () => ({
      productionRitualManaUse: 0.5,
      productionRitualSafe: false,
    }),
    getGame: () => null,
    getJobs: () => null,
    haveTech: () => (techCalls++, false),
  });
  assert.equal(input.priestCount, 0);
  assert.equal(input.cementWorkerCount, 0);
  assert.equal(techCalls, 0);
}

{
  const mutations = [];
  const result = createPylonCommandExecutor(() => ({
    Productions: { Science: { id: "science" } },
    currentSpells: () => 2,
    decreaseRitual: (...args) => mutations.push(["decrease", ...args]),
    increaseRitual: (...args) => mutations.push(["increase", ...args]),
  })).execute({
    decrease: [],
    increase: [{ id: "science", expectedCurrentSpells: 1, count: 1 }],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log(
  `Pylon automation regression tests passed (${scenarios.length} dual-run scenarios)`,
);
