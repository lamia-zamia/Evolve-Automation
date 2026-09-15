import assert from "node:assert/strict";

import {
  CAPTURED_MAD_CONTROL,
  CAPTURED_CATACLYSM_TECH,
  CAPTURED_APOCALYPSE_TECHS,
  CAPTURED_DEMONIC_TECHS,
  CAPTURED_WITCH_ASCENSION_ACTION,
  CAPTURED_BIOSEED_ACTIONS,
  CAPTURED_WHITEHOLE_TECHS,
  createCapturedMadPrestige,
  readCapturedMadBranch,
} from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import { runPrestige } from "../src/application/prestige.ts";

function buildRoot(overrides = {}) {
  return {
    civic: {
      mad: { display: true, armed: true },
      garrison: { workers: 12, max: 20, crew: 2 },
    },
    tech: { mad: 1 },
    resource: { Population: { amount: 30, max: 30 } },
    ...overrides,
  };
}

const settings = {
  prestigeMADWait: true,
  prestigeMADPopulation: 28,
};

// The captured values are the exact root fields DeadSpace's MAD gate reads through the
// compatibility WarManager/resource wrappers: garrison workers minus crew, and Population amount
// and max. No numeric cap or private reset calculation is reconstructed here.
{
  const root = buildRoot();
  const branch = readCapturedMadBranch(root, settings);
  assert.deepEqual(branch, {
    type: "mad",
    eligible: true,
    armed: true,
    waitForPopulation: true,
    currentSoldiers: 10,
    maxSoldiers: 18,
    currentPopulation: 30,
    maxPopulation: 30,
    requiredPopulation: 28,
  });
  assert.equal(Object.isFrozen(branch), true);
}

// MAD stays unavailable until both the display flag and the captured grant exist.
{
  const root = buildRoot({
    civic: { mad: { display: true, armed: true } },
    tech: {},
  });
  assert.equal(readCapturedMadBranch(root, settings).eligible, false);
}

// Missing count bags preserve the game's arithmetic NaN, which keeps the wait gate closed rather
// than inventing a population-ready reset from an old or partially initialized save.
{
  const branch = readCapturedMadBranch(
    buildRoot({ civic: { mad: { display: true, armed: true } } }),
    {},
  );
  assert.equal(Number.isNaN(branch.currentSoldiers), true);
  assert.equal(Number.isNaN(branch.maxSoldiers), true);
  assert.equal(branch.waitForPopulation, true);
  assert.equal(branch.requiredPopulation, 1);
}

// The reader sees live root changes on the next sample; it does not retain a numeric snapshot.
{
  const root = buildRoot();
  assert.equal(readCapturedMadBranch(root, settings).currentPopulation, 30);
  root.resource.Population.amount = 12;
  assert.equal(readCapturedMadBranch(root, settings).currentPopulation, 12);
}

// The captured MAD branch still follows the one-tick planner delay and logs its goal transition.
{
  const trace = [];
  let goal = "Normal";
  let root = buildRoot({
    civic: {
      mad: { display: true, armed: true },
      garrison: { workers: 20, max: 20, crew: 2 },
    },
  });
  const controls = {
    resolve(id) {
      return id === CAPTURED_MAD_CONTROL
        ? { elementId: id, generation: 1, methods: ["arm", "launch"] }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_MAD_CONTROL);
      trace.push(method);
      if (method === "arm") root.civic.mad.armed = false;
      if (method === "launch") root = buildRoot();
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [CAPTURED_MAD_CONTROL];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ ...settings, prestigeType: "mad" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);

  goal = "Reset";
  root.civic.mad.armed = true;
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    "arm",
    ["goal", "GameOverMan"],
    "launch",
    "Prestiged",
  ]);
}

// DeadSpace's reset action rows are the captured unlock answer for the three ordinary
// building-shaped prestige branches. The planner's old command shape is retained; the captured
// adapter maps the command to the game's `action()` method and suppresses a duplicate while the
// browser reload is pending.
{
  for (const expected of [
    {
      prestigeType: "terraform",
      region: "space",
      elementId: "space-terraform",
    },
    {
      prestigeType: "ascension",
      region: "interstellar",
      elementId: "interstellar-ascend",
    },
    {
      prestigeType: "matrix",
      region: "tauceti",
      elementId: "tauceti-blue_pill",
    },
    {
      prestigeType: "retire",
      region: "tauceti",
      elementId: "tauceti-alien_space_station",
    },
    {
      prestigeType: "apotheosis",
      region: "eden",
      elementId: "eden-apotheosis",
    },
  ]) {
    const trace = [];
    let goal = "Normal";
    const root = buildRoot();
    const controls = {
      resolve(id) {
        return id === expected.elementId
          ? { elementId: id, generation: 1, methods: ["action"] }
          : undefined;
      },
      invoke(handle, method) {
        assert.equal(handle.elementId, expected.elementId);
        assert.equal(method, "action");
        trace.push(method);
        return { ok: true, value: true };
      },
      capturedElementIds() {
        return [expected.elementId];
      },
    };
    const prestige = createCapturedMadPrestige({
      rootState: { readRoot: () => root },
      controls,
      readSettings: () => ({ prestigeType: expected.prestigeType }),
      readGoal: () => goal,
      setGoal: (next) => {
        goal = next;
      },
      readBuildingResetActions: (regions) => {
        assert.deepEqual(regions, [expected.region]);
        return new Set([expected.elementId]);
      },
    });

    runPrestige(prestige);
    assert.equal(goal, "Reset");
    runPrestige(prestige);
    runPrestige(prestige);
    assert.deepEqual(trace, ["action"]);
  }
}

// Bioseed's options are rendered only inside the Space Dock modal. The captured adapter opens the
// game's own modal opener, keeps its controls after the modal is closed, and then follows the
// prep -> launch state transition without using the compatibility ModalAction wrappers.
{
  const trace = [];
  let goal = "Normal";
  let modalOpen = false;
  let prepCaptured = false;
  let launchCaptured = false;
  const root = buildRoot({
    space: { star_dock: { count: 1 } },
    starDock: { seeder: { count: 100 }, probes: { count: 3 } },
    stats: { achieve: { lamentis: { l: 0 } } },
    tech: { mad: 1, genesis: 6 },
  });
  const controls = {
    resolve(id) {
      if (id === CAPTURED_BIOSEED_ACTIONS.opener) {
        return {
          elementId: id,
          generation: 1,
          methods: ["trigModal"],
        };
      }
      if (id === CAPTURED_BIOSEED_ACTIONS.probe && modalOpen) {
        return { elementId: id, generation: 2, methods: ["action"] };
      }
      if (id === CAPTURED_BIOSEED_ACTIONS.prep && (modalOpen || prepCaptured)) {
        prepCaptured = true;
        return { elementId: id, generation: 2, methods: ["action"] };
      }
      if (
        id === CAPTURED_BIOSEED_ACTIONS.launch &&
        (modalOpen || launchCaptured)
      ) {
        return { elementId: id, generation: 3, methods: ["action"] };
      }
      return undefined;
    },
    invoke(handle, method) {
      assert.equal(
        method,
        handle.elementId === CAPTURED_BIOSEED_ACTIONS.opener
          ? "trigModal"
          : "action",
      );
      trace.push(handle.elementId);
      if (handle.elementId === CAPTURED_BIOSEED_ACTIONS.opener) {
        modalOpen = true;
      } else if (handle.elementId === CAPTURED_BIOSEED_ACTIONS.prep) {
        root.tech.genesis = 7;
        launchCaptured = true;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [
        CAPTURED_BIOSEED_ACTIONS.opener,
        CAPTURED_BIOSEED_ACTIONS.probe,
        CAPTURED_BIOSEED_ACTIONS.prep,
        CAPTURED_BIOSEED_ACTIONS.launch,
      ];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      prestigeType: "bioseed",
      prestigeBioseedProbes: 3,
      prestigeGECK: 0,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readBuildingResetActions: (regions) => {
      assert.deepEqual(regions, ["space"]);
      return new Set([CAPTURED_BIOSEED_ACTIONS.opener]);
    },
    closeBioseedModal: () => {
      modalOpen = false;
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  runPrestige(prestige);
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    CAPTURED_BIOSEED_ACTIONS.opener,
    CAPTURED_BIOSEED_ACTIONS.prep,
    CAPTURED_BIOSEED_ACTIONS.launch,
    "Prestiged",
  ]);
}

// Demonic's ordinary path uses the game's drawn research row. Fasting selects the final
// ingredient row, while Witch-Hunter and autoMech remain inert until their manager-owned acts are
// captured separately.
for (const scenario of [
  { fasting: false, expected: CAPTURED_DEMONIC_TECHS.demonic },
  { fasting: true, expected: CAPTURED_DEMONIC_TECHS.final },
]) {
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    race: { fasting: scenario.fasting, witch_hunter: false },
    portal: { spire: { count: 75 } },
  });
  const controls = {
    resolve(id) {
      return id === scenario.expected
        ? { elementId: id, generation: 1, methods: ["action"] }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(method, "action");
      trace.push(handle.elementId);
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [scenario.expected];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      prestigeType: "demonic",
      prestigeDemonicFloor: 75,
      autoMech: false,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => [
      { elementId: scenario.expected, cost: { Knowledge: 5 }, generation: 1 },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 5 }]]),
      }),
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"], scenario.expected, "Prestiged"]);
}

// The Witch-Hunter variant must not enter the ordinary research path while its absorption-chamber
// controls remain unported.
{
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    race: { fasting: false, witch_hunter: true },
    portal: { spire: { count: 75 } },
  });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [],
    },
    readSettings: () => ({
      prestigeType: "demonic",
      prestigeDemonicFloor: 75,
      autoMech: false,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_DEMONIC_TECHS.demonic,
        cost: { Knowledge: 5 },
        generation: 1,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 5 }]]),
      }),
    },
  });

  runPrestige(prestige);
  assert.deepEqual(trace, []);
}

// The independent runtime cannot answer manager-owned mech potential, so autoMech conservatively
// blocks the reset even when the research row and all other gates are ready.
{
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    race: { fasting: false, witch_hunter: false },
    portal: { spire: { count: 75 } },
  });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: CAPTURED_DEMONIC_TECHS.demonic,
        generation: 1,
        methods: ["action"],
      }),
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [CAPTURED_DEMONIC_TECHS.demonic],
    },
    readSettings: () => ({
      prestigeType: "demonic",
      prestigeDemonicFloor: 75,
      autoMech: true,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_DEMONIC_TECHS.demonic,
        cost: { Knowledge: 5 },
        generation: 1,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 5 }]]),
      }),
    },
  });

  runPrestige(prestige);
  assert.deepEqual(trace, []);
}

// Witch-Hunter Ascension and Demonic share the captured absorption-chamber action. The pure
// eligibility gate still requires a completed chamber, full soul energy, and the configured pillar
// state; Demonic additionally requires the forbidden grant (and fasting's final ingredient grant).
for (const scenario of [
  { prestigeType: "ascension", fasting: false },
  { prestigeType: "demonic", fasting: false },
  { prestigeType: "demonic", fasting: true },
]) {
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    race: {
      species: "human",
      universe: "magic",
      witch_hunter: true,
      fasting: scenario.fasting,
    },
    pillars: { human: 1 },
    portal: {
      absorption_chamber: { count: 100 },
      soul_capacitor: { energy: 100000000 },
    },
    tech: { forbidden: 5, dish_reset: 2 },
  });
  const controls = {
    resolve(id) {
      return id === CAPTURED_WITCH_ASCENSION_ACTION
        ? {
            elementId: id,
            generation: 1,
            methods: ["action"],
          }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_WITCH_ASCENSION_ACTION);
      assert.equal(method, "action");
      trace.push(handle.elementId);
      return { ok: true, value: true };
    },
    capturedElementIds() {
      return [CAPTURED_WITCH_ASCENSION_ACTION];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      prestigeType: scenario.prestigeType,
      prestigeAscensionPillar: true,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readBuildingResetActions: (regions) => {
      assert.deepEqual(regions, ["portal"]);
      return new Set([CAPTURED_WITCH_ASCENSION_ACTION]);
    },
    resources: {
      readResources: () => ({
        resources: new Map([["Harmony", { amount: 1 }]]),
      }),
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    CAPTURED_WITCH_ASCENSION_ACTION,
    "Prestiged",
    ["goal", "GameOverMan"],
  ]);
}

// Apocalypse may expose protocol 66 first and protocol 66a only after the first action grants its
// prerequisite. The executor refreshes the game's own research draw between those two planner
// commands, then suppresses further commands while the delayed reset is pending.
{
  const trace = [];
  let goal = "Normal";
  let readCount = 0;
  const root = buildRoot();
  const controls = {
    resolve(id) {
      return id === CAPTURED_APOCALYPSE_TECHS.first ||
        id === CAPTURED_APOCALYPSE_TECHS.final
        ? {
            elementId: id,
            generation: id === CAPTURED_APOCALYPSE_TECHS.first ? 1 : 2,
            methods: ["action"],
          }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(method, "action");
      trace.push(handle.elementId);
      if (handle.elementId === CAPTURED_APOCALYPSE_TECHS.first) {
        root.tech.corrupted_ai = 1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [CAPTURED_APOCALYPSE_TECHS.first, CAPTURED_APOCALYPSE_TECHS.final];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ prestigeType: "apocalypse" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => {
      readCount += 1;
      return readCount <= 2
        ? [
            {
              elementId: CAPTURED_APOCALYPSE_TECHS.first,
              cost: { Knowledge: 5000000 },
              generation: 1,
            },
          ]
        : [
            {
              elementId: CAPTURED_APOCALYPSE_TECHS.final,
              cost: { Knowledge: 5000000 },
              generation: 2,
            },
          ];
    },
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 5000000 }]]),
      }),
    },
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    CAPTURED_APOCALYPSE_TECHS.first,
    CAPTURED_APOCALYPSE_TECHS.final,
  ]);
}

// Whitehole research is a sequential reset action. Each successful infusion grants the next
// action, and the final confirm raises the captured whitehole level before its delayed reset.
{
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    interstellar: { stellar_engine: { mass: 10, exotic: 0 } },
    tech: { mad: 1, whitehole: 1 },
  });
  const offers = [
    {
      id: CAPTURED_WHITEHOLE_TECHS.exotic,
      cost: { Knowledge: 1500000, Soul_Gem: 10 },
      generation: 1,
    },
    {
      id: CAPTURED_WHITEHOLE_TECHS.check,
      cost: { Knowledge: 1500000, Soul_Gem: 10 },
      generation: 2,
    },
    {
      id: CAPTURED_WHITEHOLE_TECHS.confirm,
      cost: { Knowledge: 1500000, Soul_Gem: 10 },
      generation: 3,
    },
  ];
  const controls = {
    resolve(id) {
      const offer = offers.find((entry) => entry.id === id);
      return offer === undefined
        ? undefined
        : {
            elementId: id,
            generation: offer.generation,
            methods: ["action"],
          };
    },
    invoke(handle, method) {
      assert.equal(method, "action");
      trace.push(handle.elementId);
      if (handle.elementId === CAPTURED_WHITEHOLE_TECHS.exotic) {
        root.tech.whitehole = 2;
      } else if (handle.elementId === CAPTURED_WHITEHOLE_TECHS.check) {
        root.tech.whitehole = 3;
      } else if (handle.elementId === CAPTURED_WHITEHOLE_TECHS.confirm) {
        root.tech.whitehole = 4;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return offers.map((entry) => entry.id);
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      prestigeType: "whitehole",
      prestigeWhiteholeMinMass: 1,
    }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => {
      const offer = offers[root.tech.whitehole - 1];
      return offer === undefined
        ? []
        : [
            {
              elementId: offer.id,
              cost: offer.cost,
              generation: offer.generation,
            },
          ];
    },
    resources: {
      readResources: () => ({
        resources: new Map([
          ["Knowledge", { amount: 1500000 }],
          ["Soul_Gem", { amount: 10 }],
        ]),
      }),
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  runPrestige(prestige);
  runPrestige(prestige);
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    CAPTURED_WHITEHOLE_TECHS.exotic,
    CAPTURED_WHITEHOLE_TECHS.check,
    CAPTURED_WHITEHOLE_TECHS.confirm,
    "Prestiged",
  ]);
}

// Cataclysm is committed by a research action rather than a building or Vue panel method. The
// drawn row is the game's eligibility answer, its captured price is checked against live holdings,
// and the successful wrapper call is treated as committed because the upstream action schedules
// its reset asynchronously and the Vue wrapper does not return the lexical boolean.
{
  const trace = [];
  let goal = "Normal";
  const root = buildRoot();
  const controls = {
    resolve(id) {
      return id === CAPTURED_CATACLYSM_TECH
        ? { elementId: id, generation: 3, methods: ["action"] }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_CATACLYSM_TECH);
      assert.equal(method, "action");
      trace.push(method);
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [CAPTURED_CATACLYSM_TECH];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ prestigeType: "cataclysm", autoEvolution: true }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_CATACLYSM_TECH,
        cost: { Knowledge: 500000 },
        generation: 3,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 500000 }]]),
      }),
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);
  goal = "Reset";
  runPrestige(prestige);
  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"], "action", "Prestiged"]);
}

// A missing research draw is unknown, not a locked cataclysm. The captured branch must not set
// the reset goal when it cannot establish that the upstream action is offered.
{
  let goal = "Normal";
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: buildRoot },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [],
    },
    readSettings: () => ({ prestigeType: "cataclysm" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readOfferedTechs: () => undefined,
  });
  runPrestige(prestige);
  assert.equal(goal, "Normal");
}

// A panel that could not be sampled is unknown, so it must not be treated as a locked reset.
{
  let goal = "Normal";
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: buildRoot },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: true }),
      capturedElementIds: () => [],
    },
    readSettings: () => ({ prestigeType: "terraform" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readBuildingResetActions: () => undefined,
  });

  runPrestige(prestige);
  assert.equal(goal, "Normal");
}

{
  const root = buildRoot();
  let currentRoot = root;
  const controls = {
    resolve: () => ({
      elementId: CAPTURED_MAD_CONTROL,
      generation: 1,
      methods: ["arm", "launch"],
    }),
    invoke: () => ({ ok: true, value: undefined }),
    capturedElementIds: () => [CAPTURED_MAD_CONTROL],
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => currentRoot },
    controls,
    readSettings: () => ({ ...settings, prestigeType: "mad" }),
    readGoal: () => "Reset",
    setGoal: () => {},
  });
  prestige.reader.samplePrestige();
  currentRoot = buildRoot();
  assert.throws(
    () => prestige.executor.execute({ kind: "launch-mad" }),
    /root changed/,
  );
}

console.log("Captured MAD prestige tests passed");
