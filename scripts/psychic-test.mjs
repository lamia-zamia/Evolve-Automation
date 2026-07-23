import assert from "node:assert/strict";

import { createPsychicControls } from "../src/adapters/browser/psychic-controls.ts";
import { createPsychicAdapter } from "../src/adapters/evolve/psychic.ts";
import { runPsychicAutomation } from "../src/application/psychic.ts";
import { planPsychic } from "../src/domain/traits/psychic.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createResource(id, definition = {}) {
  return {
    id,
    currentQuantity: definition.current ?? 0,
    income: definition.income ?? 0,
    maxQuantity: definition.maximum ?? 0,
    rateOfChange: definition.rate ?? 0,
    storageRatio: definition.storageRatio ?? 0,
    atomicMass: definition.atomicMass ?? 0,
    isUnlocked: () => definition.unlocked ?? true,
  };
}

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const powers = {
    cash: scenario.cashActive ? 1 : 0,
    boostTime: scenario.boostActive ? 1 : 0,
    assaultTime: scenario.assaultActive ? 1 : 0,
  };
  const game = {
    global: {
      race: {
        psychic: scenario.psychicTrait ?? true,
        unfathomable: scenario.unfathomableTrait ?? false,
        psychicPowers: powers,
      },
      tech: {
        psychic: scenario.level ?? 3,
        psychicthrall: scenario.thrallLevel ?? 0,
        unfathomable: scenario.unfathomableTechnology ?? 0,
      },
      stats: { psykill: scenario.killCount ?? 10 },
    },
  };
  const settings = {
    psychicPower: scenario.mode ?? "auto",
    psychicBoostRes: scenario.boostResource ?? "auto",
  };
  const resources = {
    Energy: createResource("Energy", {
      current: scenario.energy ?? 100,
      storageRatio: scenario.energyStorageRatio ?? 1,
    }),
    Population: createResource("Population", {
      current: scenario.population ?? 1,
    }),
    Thrall: createResource("Thrall", {
      rate: scenario.thrallRate ?? 0,
      storageRatio: scenario.thrallStorageRatio ?? 0,
    }),
    Money: createResource("Money", {
      current: scenario.moneyCurrent ?? 100,
      income: scenario.moneyIncome ?? 0,
      maximum: scenario.moneyMaximum ?? 100,
    }),
    Food: createResource("Food", {
      current: scenario.foodCurrent ?? 0,
      income: scenario.foodIncome ?? 10,
      maximum: scenario.foodMaximum ?? 10_000,
      atomicMass: 1,
      unlocked: scenario.foodUnlocked ?? true,
    }),
    Lumber: createResource("Lumber", {
      current: scenario.lumberCurrent ?? 0,
      income: scenario.lumberIncome ?? 20,
      maximum: scenario.lumberMaximum ?? 10_000,
      atomicMass: 1,
      unlocked: scenario.lumberUnlocked ?? true,
    }),
  };
  const recordPower = (power, mutation) => {
    trace.managerCall("psychic-view", { power });
    trace.command("use-psychic-power", { power });
    mutation?.();
  };
  const views = {
    psychicKill: {
      murder: () =>
        recordPower("murder", () => {
          game.global.stats.psykill++;
          trace.stateChange("psychic-kills", {
            count: game.global.stats.psykill,
          });
        }),
    },
    psychicMindBreak: {
      breakMind: () => recordPower("mind_break"),
    },
    psychicCapture: { stun: () => recordPower("stun") },
    psychicFinance: {
      boostVal: () =>
        recordPower("profit", () => {
          powers.cash = 1;
          trace.stateChange("psychic-power", { power: "profit", active: true });
        }),
    },
    psychicBoost: {
      boostVal: () =>
        recordPower("boost", () => {
          powers.boostTime = 1;
          trace.stateChange("psychic-power", { power: "boost", active: true });
        }),
    },
    psychicAssault: {
      boostVal: () =>
        recordPower("assault", () => {
          powers.assaultTime = 1;
          trace.stateChange("psychic-power", {
            power: "assault",
            active: true,
          });
        }),
    },
  };
  const getVueById = (id) => {
    trace.managerCall("getVueById", { id });
    if (scenario.missingPanels?.includes(id)) return undefined;
    return views[id];
  };
  const clickSelector = (selector) => {
    trace.managerCall("clickSelector", { selector });
    trace.command("select-psychic-boost", { selector });
  };
  return {
    trace,
    game,
    settings,
    resources,
    getVueById,
    clickSelector,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { game, settings, resources, getVueById, clickSelector } = fixture;
  const psychicPowerCost = {
    murder: [10, 8],
    boost: [75, 60],
    assault: [45, 36],
    profit: [65, 52],
    mind_break: [80, 64],
    stun: [100, 80],
  };
  if (
    settings.psychicPower === "none" ||
    !game.global.race["psychic"] ||
    !game.global.tech["psychic"] ||
    resources.Energy.storageRatio < 1
  ) {
    return fixture.trace.snapshot();
  }
  let vue = null;
  const canAfford = (power) =>
    resources.Energy.currentQuantity >=
    psychicPowerCost[power][game.global.tech.psychic >= 5 ? 1 : 0];

  if (
    settings.psychicPower === "murder" ||
    (settings.psychicPower !== "boost" && game.global.stats.psykill < 10)
  ) {
    if (
      resources.Population.currentQuantity > 0 &&
      canAfford("murder") &&
      (vue = getVueById("psychicKill"))
    ) {
      vue.murder();
      return fixture.trace.snapshot();
    }
  }

  if (
    game.global.tech["psychicthrall"] &&
    game.global.tech["unfathomable"] &&
    game.global.race["unfathomable"]
  ) {
    const jailed = resources.Thrall.rateOfChange;
    const cells = resources.Thrall.storageRatio;
    if (
      settings.psychicPower === "auto" ||
      settings.psychicPower === "mind_break"
    ) {
      if (
        (jailed > 1 || (jailed === 1 && cells === 1)) &&
        canAfford("mind_break") &&
        (vue = getVueById("psychicMindBreak"))
      ) {
        vue.breakMind();
        return fixture.trace.snapshot();
      }
    }
    if (settings.psychicPower === "auto" || settings.psychicPower === "stun") {
      if (
        game.global.tech.psychicthrall >= 2 &&
        cells < 1 &&
        canAfford("stun") &&
        (vue = getVueById("psychicCapture"))
      ) {
        vue.stun();
        return fixture.trace.snapshot();
      }
    }
  }

  const haveRoom = (resource) =>
    resource.currentQuantity + resource.income * 1.5 * 300 <
    resource.maxQuantity;
  const powers = game.global.race.psychicPowers;
  if (settings.psychicPower === "auto" || settings.psychicPower === "profit") {
    if (
      game.global.tech.psychic >= 3 &&
      haveRoom(resources.Money) &&
      !powers.cash &&
      canAfford("profit") &&
      (vue = getVueById("psychicFinance"))
    ) {
      vue.boostVal();
      return fixture.trace.snapshot();
    }
  }

  if (settings.psychicPower === "auto" || settings.psychicPower === "boost") {
    if (!powers.boostTime && canAfford("boost")) {
      let boosted = null;
      if (settings.psychicBoostRes === "auto") {
        const boostable = Object.values(resources)
          .filter(
            (resource) =>
              resource.isUnlocked() &&
              resource.atomicMass > 0 &&
              haveRoom(resource),
          )
          .sort((left, right) => right.income - left.income);
        if (boostable.length > 0) boosted = boostable[0].id;
      } else {
        boosted = settings.psychicBoostRes;
      }
      if (boosted && (vue = getVueById("psychicBoost"))) {
        clickSelector(
          `#psychicBoost #psyhscrolltarget input[value="${boosted}"]`,
        );
        vue.boostVal();
        return fixture.trace.snapshot();
      }
    }
  }

  if (settings.psychicPower === "auto" || settings.psychicPower === "assault") {
    if (
      game.global.tech.psychic >= 2 &&
      !powers.assaultTime &&
      canAfford("assault") &&
      (vue = getVueById("psychicAssault"))
    ) {
      vue.boostVal();
    }
  }
  void vue;
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  const controls = createPsychicControls({
    getVueById: fixture.getVueById,
    clickSelector: fixture.clickSelector,
  });
  const adapter = createPsychicAdapter({
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    controls,
  });
  return { reader: adapter.reader, executor: adapter.executor };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runPsychicAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "setting disabled", mode: "none" },
  { name: "trait locked", psychicTrait: false },
  { name: "technology locked", level: 0 },
  { name: "Energy storage not full", energyStorageRatio: 0.99 },
  { name: "mandatory murder before advanced powers", killCount: 0 },
  { name: "boost mode skips mandatory murders", mode: "boost", killCount: 0 },
  { name: "selected murder continues after unlock", mode: "murder" },
  {
    name: "missing murder panel falls through to profit",
    killCount: 0,
    moneyCurrent: 0,
    moneyMaximum: 100_000,
    missingPanels: ["psychicKill"],
  },
  {
    name: "mind break precedes other automatic powers",
    thrallLevel: 2,
    unfathomableTechnology: 1,
    unfathomableTrait: true,
    thrallRate: 2,
    thrallStorageRatio: 1,
  },
  {
    name: "stun captures when cells have room",
    mode: "stun",
    thrallLevel: 2,
    unfathomableTechnology: 1,
    unfathomableTrait: true,
    thrallStorageRatio: 0,
  },
  {
    name: "missing mind-break panel falls through to stun",
    thrallLevel: 2,
    unfathomableTechnology: 1,
    unfathomableTrait: true,
    thrallRate: 2,
    thrallStorageRatio: 0,
    missingPanels: ["psychicMindBreak"],
  },
  {
    name: "profit power with money room",
    mode: "profit",
    moneyCurrent: 0,
    moneyMaximum: 100_000,
  },
  { name: "profit waits without money room", mode: "profit" },
  { name: "auto boost selects highest income resource" },
  {
    name: "auto boost keeps stable order for equal income",
    foodIncome: 20,
    lumberIncome: 20,
  },
  {
    name: "explicit unknown boost resource remains a selector",
    mode: "boost",
    boostResource: "MissingResource",
  },
  {
    name: "active boost falls through to assault",
    level: 2,
    boostActive: true,
  },
  {
    name: "missing boost panel falls through to assault",
    level: 2,
    missingPanels: ["psychicBoost"],
  },
  { name: "selected assault", mode: "assault", level: 2, energy: 45 },
  {
    name: "level-five efficiency uses reduced cost",
    mode: "profit",
    level: 5,
    energy: 52,
    moneyCurrent: 0,
    moneyMaximum: 100_000,
  },
  {
    name: "unknown mode still unlocks through murder",
    mode: "future",
    killCount: 0,
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `psychic ${scenario.name}`,
  });
}

const planInput = {
  available: true,
  mode: "auto",
  technologyLevel: 3,
  killCount: 0,
  energyCurrent: 100,
  energyStorageRatio: 1,
  populationCurrent: 1,
  thrallAvailable: true,
  thrallTechnologyLevel: 2,
  thrallRate: 2,
  thrallStorageRatio: 0,
  cashActive: false,
  boostActive: false,
  assaultActive: false,
  money: { current: 0, income: 0, maximum: 100_000 },
  boostResourceMode: "auto",
  boostCandidates: [{ id: "Food", current: 0, income: 10, maximum: 100_000 }],
};
assert.deepEqual(
  planPsychic(planInput).map((decision) => decision.power),
  ["murder", "mind_break", "stun", "profit", "boost", "assault"],
);
assert.equal(Object.isFrozen(planPsychic(planInput)), true);

const disabledFixture = createFixture({ mode: "none" });
let gameRead = false;
let resourcesRead = false;
assert.equal(
  runPsychicAutomation(
    createAutomation(disabledFixture, {
      getGame: () => {
        gameRead = true;
        return {};
      },
      getResources: () => {
        resourcesRead = true;
        return {};
      },
    }),
  ).status,
  "succeeded",
);
assert.equal(gameRead, false);
assert.equal(resourcesRead, false);

const boostFixture = createFixture({ mode: "boost" });
delete boostFixture.game.global.stats;
delete boostFixture.resources.Population;
assert.equal(
  runPsychicAutomation(createAutomation(boostFixture)).status,
  "succeeded",
);

const lowEnergyFixture = createFixture({ mode: "boost", energy: 1 });
Object.defineProperty(lowEnergyFixture.settings, "psychicBoostRes", {
  get() {
    throw new Error("boost resource should not be read");
  },
});
assert.equal(
  runPsychicAutomation(createAutomation(lowEnergyFixture)).status,
  "succeeded",
);

const malformedFixture = createFixture({});
malformedFixture.resources.Energy.currentQuantity = Number.NaN;
assert.throws(
  () => runPsychicAutomation(createAutomation(malformedFixture)),
  /resources\.Energy\.currentQuantity must be a finite number/,
);

const staleFixture = createFixture({ mode: "assault", level: 2 });
const staleAutomation = createAutomation(staleFixture);
staleAutomation.reader.readGate();
const [staleDecision] = planPsychic(staleAutomation.reader.readPlan());
staleFixture.resources.Energy.currentQuantity--;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const fallbackFixture = createFixture({
  level: 2,
  missingPanels: ["psychicBoost"],
});
const fallbackAutomation = createAutomation(fallbackFixture);
assert.equal(runPsychicAutomation(fallbackAutomation).status, "succeeded");
assert.deepEqual(
  fallbackFixture.trace
    .snapshot()
    .filter(
      (event) =>
        event.category === "manager-call" && event.name === "getVueById",
    )
    .map((event) => event.details.id),
  ["psychicBoost", "psychicAssault"],
);

console.log(
  `Psychic domain, Evolve/browser adapters, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
