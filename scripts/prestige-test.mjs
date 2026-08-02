import assert from "node:assert/strict";

import {
  createPrestigeCommandExecutor,
  createPrestigeReader,
} from "../src/adapters/evolve/progression/prestige/prestige.ts";
import { runPrestige } from "../src/application/prestige.ts";
import { planPrestige } from "../src/domain/progression/prestige/prestige.ts";

// --- Shared fixtures ---------------------------------------------------------

function buildFixture(scenario) {
  const trace = [];
  const state = {};
  let goalValue = scenario.goal ?? "Normal";
  Object.defineProperty(state, "goal", {
    get: () => goalValue,
    set: (value) => {
      goalValue = value;
      trace.push(["goal", value]);
    },
    configurable: true,
    enumerable: true,
  });

  const settings = {
    prestigeType: scenario.prestigeType,
    prestigeMADWait: scenario.madWait ?? false,
    prestigeMADPopulation: scenario.madPopulation ?? 0,
    autoEvolution: scenario.autoEvolution ?? false,
  };

  const game = {
    global: {
      race: {
        witch_hunter: scenario.witchHunter ?? false,
        fasting: scenario.fasting ?? false,
      },
    },
  };

  const resources = {
    Population: {
      currentQuantity: scenario.popCurrent ?? 0,
      maxQuantity: scenario.popMax ?? 0,
    },
  };

  const WarManager = {
    currentSoldiers: scenario.currentSoldiers ?? 0,
    maxSoldiers: scenario.maxSoldiers ?? 0,
  };

  const haveTech = (id) =>
    id === "mad" ? Boolean(scenario.haveMadTech) : false;

  const madVue = {
    display: scenario.madDisplay ?? false,
    armed: scenario.madArmed ?? false,
    arm: () => trace.push(["arm"]),
    launch: () => trace.push(["launch"]),
  };
  const getVueById = (id) => (id === "mad" ? madVue : undefined);

  const clickBuilding = (id) => ({
    isUnlocked: () => Boolean(scenario.unlocked),
    click: () => trace.push(["click", id]),
  });
  const buildings = {
    GasSpaceDockLaunch: {
      isUnlocked: () => Boolean(scenario.launchUnlocked),
      click: () => trace.push(["click", "GasSpaceDockLaunch"]),
    },
    GasSpaceDockPrepForLaunch: {
      isUnlocked: () => Boolean(scenario.prepUnlocked),
      click: () => trace.push(["click", "GasSpaceDockPrepForLaunch"]),
    },
    GasSpaceDock: {
      cacheOptions: () => trace.push(["cacheOptions", "GasSpaceDock"]),
    },
    SiriusAscend: { click: () => trace.push(["click", "SiriusAscend"]) },
    PitAbsorptionChamber: { vue: { action: () => trace.push(["absorption"]) } },
    RedTerraform: clickBuilding("RedTerraform"),
    TauStarBluePill: clickBuilding("TauStarBluePill"),
    PalaceApotheosis: clickBuilding("PalaceApotheosis"),
  };

  const clickTech = (id) => ({ click: () => trace.push(["clickTech", id]) });
  const techIds = {
    "tech-dial_it_to_11": {
      isClickable: () => Boolean(scenario.dialClickable),
      click: () => trace.push(["clickTech", "tech-dial_it_to_11"]),
    },
    "tech-exotic_infusion": {
      isUnlocked: () => Boolean(scenario.exoticUnlocked),
      isAffordable: () => Boolean(scenario.exoticAffordable),
      click: () => trace.push(["clickTech", "tech-exotic_infusion"]),
    },
    "tech-infusion_confirm": clickTech("tech-infusion_confirm"),
    "tech-infusion_check": clickTech("tech-infusion_check"),
    "tech-protocol66": clickTech("tech-protocol66"),
    "tech-protocol66a": clickTech("tech-protocol66a"),
    "tech-final_ingredient": clickTech("tech-final_ingredient"),
    "tech-demonic_infusion": clickTech("tech-demonic_infusion"),
  };

  const KeyManager = {
    set: (a, b, c) => trace.push(["keySet", a, b, c]),
  };
  const logPrestige = () => trace.push(["logPrestige"]);
  const loadQueuedSettings = () => trace.push(["loadQueued"]);

  const eligible = () => Boolean(scenario.eligible);

  return {
    trace,
    state,
    settings,
    game,
    resources,
    WarManager,
    haveTech,
    getVueById,
    buildings,
    techIds,
    KeyManager,
    logPrestige,
    loadQueuedSettings,
    eligible,
  };
}

function runModern(scenario) {
  const f = buildFixture(scenario);
  runPrestige({
    reader: createPrestigeReader({
      getState: () => f.state,
      getSettings: () => f.settings,
      getGame: () => f.game,
      getResources: () => f.resources,
      getBuildings: () => f.buildings,
      getTechIds: () => f.techIds,
      getWarManager: () => f.WarManager,
      getHaveTech: () => f.haveTech,
      getVueById: f.getVueById,
      eligibility: {
        isBioseederPrestigeAvailable: f.eligible,
        isCataclysmPrestigeAvailable: f.eligible,
        isWhiteholePrestigeAvailable: f.eligible,
        isApocalypsePrestigeAvailable: f.eligible,
        isAscensionPrestigeAvailable: f.eligible,
        isWitchAscensionPrestigeAvailable: () => f.eligible(),
        isDemonicPrestigeAvailable: f.eligible,
      },
    }),
    executor: createPrestigeCommandExecutor({
      getState: () => f.state,
      getBuildings: () => f.buildings,
      getTechIds: () => f.techIds,
      getVueById: f.getVueById,
      getKeyManager: () => f.KeyManager,
      logPrestige: f.logPrestige,
      loadQueuedSettings: f.loadQueuedSettings,
    }),
  });
  return f.trace;
}

function dualRun(name, scenario, expected) {
  const modern = runModern(scenario);
  if (expected !== undefined) {
    assert.deepEqual(modern, expected, `${name}: unexpected trace`);
  }
}

// --- Dual-run scenarios ------------------------------------------------------

dualRun("none does nothing", { prestigeType: "none" }, []);
dualRun("unknown type does nothing", { prestigeType: "wat" }, []);
dualRun("vacuum handled externally", { prestigeType: "vacuum" }, []);
dualRun("retire handled externally", { prestigeType: "retire" }, []);
dualRun("eden handled externally", { prestigeType: "eden" }, []);

// MAD
dualRun("mad ineligible without tech", {
  prestigeType: "mad",
  madDisplay: true,
  haveMadTech: false,
});
dualRun(
  "mad eligible arms the reset delay",
  { prestigeType: "mad", madDisplay: true, haveMadTech: true, goal: "Normal" },
  [["goal", "Reset"]],
);
dualRun(
  "mad launches immediately when not waiting",
  {
    prestigeType: "mad",
    madDisplay: true,
    haveMadTech: true,
    goal: "Reset",
    madArmed: true,
    madWait: false,
  },
  [["arm"], ["goal", "GameOverMan"], ["logPrestige"], ["launch"]],
);
dualRun(
  "mad waits when population target unmet",
  {
    prestigeType: "mad",
    madDisplay: true,
    haveMadTech: true,
    goal: "Reset",
    madArmed: false,
    madWait: true,
    currentSoldiers: 1,
    maxSoldiers: 5,
  },
  [],
);
dualRun(
  "mad launches once population target met",
  {
    prestigeType: "mad",
    madDisplay: true,
    haveMadTech: true,
    goal: "Reset",
    madArmed: true,
    madWait: true,
    currentSoldiers: 5,
    maxSoldiers: 5,
    popCurrent: 10,
    popMax: 10,
    madPopulation: 12,
  },
  [["arm"], ["goal", "GameOverMan"], ["logPrestige"], ["launch"]],
);

// Bioseed
dualRun("bioseed ineligible", { prestigeType: "bioseed", eligible: false }, []);
dualRun(
  "bioseed reset delay",
  { prestigeType: "bioseed", eligible: true, goal: "Normal" },
  [["goal", "Reset"]],
);
dualRun(
  "bioseed launches when ship ready",
  {
    prestigeType: "bioseed",
    eligible: true,
    goal: "Reset",
    launchUnlocked: true,
  },
  [["click", "GasSpaceDockLaunch"]],
);
dualRun(
  "bioseed prepares when launch not ready",
  {
    prestigeType: "bioseed",
    eligible: true,
    goal: "Reset",
    launchUnlocked: false,
    prepUnlocked: true,
  },
  [["click", "GasSpaceDockPrepForLaunch"]],
);
dualRun(
  "bioseed caches options otherwise",
  { prestigeType: "bioseed", eligible: true, goal: "Reset" },
  [["cacheOptions", "GasSpaceDock"]],
);

// Cataclysm
dualRun(
  "cataclysm loads queued settings and dials",
  {
    prestigeType: "cataclysm",
    eligible: true,
    goal: "Reset",
    autoEvolution: true,
    dialClickable: true,
  },
  [["loadQueued"], ["logPrestige"], ["clickTech", "tech-dial_it_to_11"]],
);
dualRun(
  "cataclysm without auto-evolution and unclickable dial",
  { prestigeType: "cataclysm", eligible: true, goal: "Reset" },
  [],
);

// Whitehole
dualRun(
  "whitehole logs and clicks the infusion chain",
  {
    prestigeType: "whitehole",
    eligible: true,
    goal: "Reset",
    exoticUnlocked: true,
    exoticAffordable: true,
  },
  [
    ["logPrestige"],
    ["clickTech", "tech-infusion_confirm"],
    ["clickTech", "tech-infusion_check"],
    ["clickTech", "tech-exotic_infusion"],
  ],
);
dualRun(
  "whitehole clicks the chain without the log when not affordable",
  {
    prestigeType: "whitehole",
    eligible: true,
    goal: "Reset",
    exoticUnlocked: true,
    exoticAffordable: false,
  },
  [
    ["clickTech", "tech-infusion_confirm"],
    ["clickTech", "tech-infusion_check"],
    ["clickTech", "tech-exotic_infusion"],
  ],
);

// Apocalypse
dualRun(
  "apocalypse fires both protocols",
  { prestigeType: "apocalypse", eligible: true, goal: "Reset" },
  [
    ["logPrestige"],
    ["clickTech", "tech-protocol66"],
    ["clickTech", "tech-protocol66a"],
  ],
);

// Ascension
dualRun(
  "ascension non-witch clicks sirius",
  { prestigeType: "ascension", eligible: true, goal: "Reset" },
  [
    ["keySet", false, false, false],
    ["click", "SiriusAscend"],
  ],
);
dualRun(
  "ascension witch uses the absorption chamber hack",
  {
    prestigeType: "ascension",
    eligible: true,
    goal: "Reset",
    witchHunter: true,
  },
  [
    ["keySet", false, false, false],
    ["logPrestige"],
    ["absorption"],
    ["goal", "GameOverMan"],
  ],
);

// Demonic
dualRun(
  "demonic non-witch infuses",
  { prestigeType: "demonic", eligible: true, goal: "Reset" },
  [["logPrestige"], ["clickTech", "tech-demonic_infusion"]],
);
dualRun(
  "demonic fasting uses the final ingredient",
  { prestigeType: "demonic", eligible: true, goal: "Reset", fasting: true },
  [["logPrestige"], ["clickTech", "tech-final_ingredient"]],
);
dualRun(
  "demonic witch uses the absorption chamber hack",
  { prestigeType: "demonic", eligible: true, goal: "Reset", witchHunter: true },
  [
    ["keySet", false, false, false],
    ["logPrestige"],
    ["absorption"],
    ["goal", "GameOverMan"],
  ],
);

// Building-reset prestiges
dualRun(
  "terraform resets when unlocked",
  { prestigeType: "terraform", unlocked: true, goal: "Reset" },
  [
    ["keySet", false, false, false],
    ["click", "RedTerraform"],
  ],
);
dualRun("terraform waits while locked", {
  prestigeType: "terraform",
  unlocked: false,
});
dualRun(
  "matrix resets when unlocked",
  { prestigeType: "matrix", unlocked: true, goal: "Reset" },
  [
    ["keySet", false, false, false],
    ["click", "TauStarBluePill"],
  ],
);
dualRun(
  "apotheosis resets when unlocked",
  { prestigeType: "apotheosis", unlocked: true, goal: "Reset" },
  [
    ["keySet", false, false, false],
    ["click", "PalaceApotheosis"],
  ],
);
dualRun(
  "building reset waits for the reset delay",
  { prestigeType: "terraform", unlocked: true, goal: "Normal" },
  [["goal", "Reset"]],
);

console.log("Prestige scenario and adapter tests passed");

// --- Planner unit tests ------------------------------------------------------

assert.deepEqual(
  planPrestige({ goal: "Normal", branch: { type: "noop" } }),
  [],
);

// Eligible branch commits the reset goal first, acts only once already Reset.
assert.deepEqual(
  planPrestige({
    goal: "Normal",
    branch: { type: "apocalypse", eligible: true },
  }),
  [{ kind: "set-goal", goal: "Reset" }],
);
assert.deepEqual(
  planPrestige({
    goal: "Reset",
    branch: { type: "apocalypse", eligible: false },
  }),
  [],
);

// MAD without waiting still arms before launching.
assert.deepEqual(
  planPrestige({
    goal: "Reset",
    branch: {
      type: "mad",
      eligible: true,
      armed: false,
      waitForPopulation: false,
      currentSoldiers: 0,
      maxSoldiers: 0,
      currentPopulation: 0,
      maxPopulation: 0,
      requiredPopulation: 0,
    },
  }),
  [
    { kind: "set-goal", goal: "GameOverMan" },
    { kind: "log-prestige" },
    { kind: "launch-mad" },
  ],
);

console.log("Prestige planner unit tests passed");

// --- Adapter contract tests --------------------------------------------------

const gateAll = (value) => ({
  isBioseederPrestigeAvailable: () => value,
  isCataclysmPrestigeAvailable: () => value,
  isWhiteholePrestigeAvailable: () => value,
  isApocalypsePrestigeAvailable: () => value,
  isAscensionPrestigeAvailable: () => value,
  isWitchAscensionPrestigeAvailable: () => value,
  isDemonicPrestigeAvailable: () => value,
});

const contractReader = (overrides = {}) =>
  createPrestigeReader({
    getState: () => ({ goal: "Reset" }),
    getSettings: () => ({ prestigeType: "apocalypse" }),
    getGame: () => ({ global: { race: {} } }),
    getResources: () => ({ Population: {} }),
    getBuildings: () => ({}),
    getTechIds: () => ({}),
    getWarManager: () => ({}),
    getHaveTech: () => () => false,
    getVueById: () => undefined,
    eligibility: gateAll(true),
    ...overrides,
  });

assert.deepEqual(
  contractReader({
    getSettings: () => ({ prestigeType: "eden" }),
  }).samplePrestige().branch,
  { type: "noop" },
  "handled-externally types collapse to noop",
);
assert.deepEqual(
  contractReader({ getSettings: () => ({ prestigeType: 7 }) }).samplePrestige()
    .branch.type,
  "noop",
  "non-string prestige type collapses to noop",
);
assert.equal(
  contractReader().samplePrestige().goal,
  "Reset",
  "goal is sampled from state",
);
assert.equal(
  contractReader({ getState: () => ({}) }).samplePrestige().goal,
  "",
  "absent goal normalizes to a non-Reset empty string",
);
assert.throws(
  () => contractReader({ getSettings: () => 5 }).samplePrestige(),
  TypeError,
  "malformed settings are rejected",
);

// Ascension picks the witch predicate only when the race is a witch hunter.
{
  const branch = contractReader({
    getSettings: () => ({ prestigeType: "ascension" }),
    getGame: () => ({ global: { race: { witch_hunter: true } } }),
    eligibility: {
      ...gateAll(false),
      isWitchAscensionPrestigeAvailable: () => true,
    },
  }).samplePrestige().branch;
  assert.deepEqual(branch, {
    type: "ascension",
    witchHunter: true,
    eligible: true,
  });
}

// Bioseed reads the launch/prep building state through the adapter.
{
  const branch = contractReader({
    getSettings: () => ({ prestigeType: "bioseed" }),
    getBuildings: () => ({
      GasSpaceDockLaunch: { isUnlocked: () => false },
      GasSpaceDockPrepForLaunch: { isUnlocked: () => true },
    }),
  }).samplePrestige().branch;
  assert.deepEqual(branch, {
    type: "bioseed",
    eligible: true,
    launchUnlocked: false,
    prepUnlocked: true,
  });
}

const contractExecutor = (overrides = {}) => {
  const calls = [];
  const executor = createPrestigeCommandExecutor({
    getState: () => overrides.state ?? { goal: "Reset" },
    getBuildings: () =>
      overrides.buildings ?? {
        SiriusAscend: { click: () => calls.push("sirius") },
      },
    getTechIds: () =>
      overrides.techIds ?? {
        "tech-protocol66": { click: () => calls.push("protocol66") },
      },
    getVueById: () => overrides.madVue ?? { arm: () => calls.push("arm") },
    getKeyManager: () =>
      overrides.keyManager ?? { set: (...a) => calls.push(["set", ...a]) },
    logPrestige: () => calls.push("log"),
    loadQueuedSettings: () => calls.push("loadQueued"),
  });
  return { executor, calls };
};

{
  const state = { goal: "Reset" };
  const { executor } = contractExecutor({ state });
  executor.execute({ kind: "set-goal", goal: "GameOverMan" });
  assert.equal(state.goal, "GameOverMan", "set-goal mutates state.goal");
}
{
  const { executor, calls } = contractExecutor();
  executor.execute({ kind: "reset-modifier-keys" });
  assert.deepEqual(calls, [["set", false, false, false]]);
}
{
  const { executor, calls } = contractExecutor();
  executor.execute({ kind: "click-building", id: "SiriusAscend" });
  executor.execute({ kind: "click-tech", id: "tech-protocol66" });
  assert.deepEqual(calls, ["sirius", "protocol66"]);
}
assert.throws(
  () =>
    contractExecutor({ buildings: {} }).executor.execute({
      kind: "click-building",
      id: "SiriusAscend",
    }),
  TypeError,
  "missing building is rejected",
);

// An uninitialized WarManager, Population wrapper, and MAD population setting all read leniently:
// the sample answers NaN instead of throwing, and every `>=` in the wait check then fails.
{
  const branch = contractReader({
    getSettings: () => ({ prestigeType: "mad", prestigeMADWait: true }),
    getHaveTech: () => (id) => id === "mad",
    getVueById: (id) => (id === "mad" ? { display: true, armed: false } : null),
  }).samplePrestige().branch;
  assert.equal(branch.type, "mad");
  assert.equal(branch.eligible, true);
  for (const field of [
    "currentSoldiers",
    "maxSoldiers",
    "currentPopulation",
    "maxPopulation",
    "requiredPopulation",
  ]) {
    assert.ok(Number.isNaN(branch[field]), `${field} coerces to NaN`);
  }
  assert.deepEqual(planPrestige({ goal: "Reset", branch }), []);
  assert.deepEqual(
    planPrestige({
      goal: "Reset",
      branch: { ...branch, waitForPopulation: false },
    }),
    [
      { kind: "set-goal", goal: "GameOverMan" },
      { kind: "log-prestige" },
      { kind: "launch-mad" },
    ],
    "only the wait check holds the eligible MAD branch back",
  );
}

console.log("Prestige adapter contract tests passed");
