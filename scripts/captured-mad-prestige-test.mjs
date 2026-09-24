import assert from "node:assert/strict";

import {
  CAPTURED_MAD_CONTROL,
  CAPTURED_CATACLYSM_TECH,
  CAPTURED_APOCALYPSE_TECHS,
  CAPTURED_DEMONIC_TECHS,
  CAPTURED_WITCH_ASCENSION_ACTION,
  CAPTURED_BIOSEED_ACTIONS,
  CAPTURED_WHITEHOLE_TECHS,
  CAPTURED_WHITEHOLE_REPAIR_TECH,
  CAPTURED_CELESTIAL_LAB,
  createCapturedMadPrestige,
  readCapturedMadBranch,
} from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import {
  CAPTURED_MECH_ASSEMBLY_CONTROL,
  CAPTURED_MECH_LIST_CONTROL,
} from "../src/adapters/evolve/combat/captured-mech-control-ids.ts";
import { runPrestige } from "../src/application/prestige.ts";

function buildRoot(overrides = {}) {
  return {
    settings: { qKey: false, touch: false },
    civic: {
      mad: { display: true, armed: true },
      garrison: { workers: 12, max: 20, crew: 2 },
    },
    tech: { mad: 1 },
    stats: {
      terraform: 0,
      ascend: 0,
      matrix: 0,
      retired: 0,
      eden: 0,
      apotheosis: 0,
      descend: 0,
    },
    resource: { Population: { amount: 30, max: 30 } },
    ...overrides,
  };
}

const settings = {
  prestigeMADWait: true,
  prestigeMADPopulation: 28,
};

function reusableCustomRaceLab(root, trace) {
  const session = { identity: {} };
  const methods = (mode) => (mode === "terraform" ? "setPlanet" : "setRace");
  return {
    read: () => ({
      session,
      draft: {
        text: {
          name: "Saved",
          desc: "A saved custom race",
          entity: "bipeds",
          home: "Home",
          red: "Red",
          hell: "Hell",
          gas: "Gas",
          gas_moon: "Moon",
          dwarf: "Dwarf",
        },
        genus: "humanoid",
        traits: [],
        ranks: {},
        fanaticism: false,
      },
      availableTraits: [],
      availableGenera: ["humanoid"],
      hybridLab: false,
      savedCustomRaceExists: true,
      canSubmit: true,
      genes: 10,
      recalculation: "idle",
    }),
    applyDesign: () => ({ status: "applied" }),
    submit: (_session, mode) => {
      trace.push([CAPTURED_CELESTIAL_LAB, methods(mode)]);
      root.stats[mode === "ascension" ? "ascend" : mode] += 1;
      return { status: "applied" };
    },
    readSavedRaceJson: () => undefined,
  };
}

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

// DeadSpace's reset action rows are the captured unlock answer for the building-shaped prestige
// branches. The action-row Vue wrapper returns undefined, so the adapter uses each reset's own
// counter or delayed-transaction contract instead of the wrapper's return value.
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
      prestigeType: "eden",
      region: "tauceti",
      elementId: "tauceti-goe_facility",
    },
    {
      prestigeType: "apotheosis",
      region: "eden",
      elementId: "eden-apotheosis",
    },
  ]) {
    const trace = [];
    let goal = "Normal";
    let modalOpen = false;
    const root = buildRoot();
    if (expected.prestigeType === "matrix") {
      root.settings.qKey = true;
      root.settings.touch = true;
    }
    const controls = {
      resolve(id) {
        if (id === expected.elementId) {
          return { elementId: id, generation: 1, methods: ["action"] };
        }
        if (
          modalOpen &&
          id === CAPTURED_CELESTIAL_LAB &&
          ["terraform", "ascension", "apotheosis"].includes(
            expected.prestigeType,
          )
        ) {
          return {
            elementId: id,
            generation: 2,
            methods: [
              expected.prestigeType === "terraform" ? "setPlanet" : "setRace",
            ],
          };
        }
        return undefined;
      },
      invoke(handle, method) {
        if (method === "action") {
          assert.equal(handle.elementId, expected.elementId);
          assert.equal(root.settings.qKey, false);
          assert.equal(root.settings.touch, false);
          trace.push(method);
          if (expected.prestigeType === "eden") {
            root.stats.eden += 1;
          } else if (expected.prestigeType === "retire") {
            root.stats.retired += 1;
          } else if (
            ["terraform", "ascension", "apotheosis"].includes(
              expected.prestigeType,
            )
          ) {
            modalOpen = true;
          }
        } else {
          assert.equal(handle.elementId, CAPTURED_CELESTIAL_LAB);
          trace.push([handle.elementId, method]);
          root.stats[
            expected.prestigeType === "ascension"
              ? "ascend"
              : expected.prestigeType
          ] += 1;
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds() {
        return [expected.elementId];
      },
    };
    const prestige = createCapturedMadPrestige({
      rootState: { readRoot: () => root },
      controls,
      readSettings: () => ({ prestigeType: expected.prestigeType }),
      customRaceLab: reusableCustomRaceLab(root, trace),
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
    runPrestige(prestige);
    assert.deepEqual(
      trace,
      ["action"].concat(
        ["terraform", "ascension", "apotheosis"].includes(expected.prestigeType)
          ? [
              [
                CAPTURED_CELESTIAL_LAB,
                expected.prestigeType === "terraform" ? "setPlanet" : "setRace",
              ],
            ]
          : [],
      ),
    );
    assert.equal(root.settings.qKey, expected.prestigeType === "matrix");
    assert.equal(root.settings.touch, expected.prestigeType === "matrix");
  }
}

// A failed Eden action still has no counter transition and must remain retryable.
{
  let goal = "Normal";
  let invocations = 0;
  const root = buildRoot();
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: "tauceti-goe_facility",
        generation: 1,
        methods: ["action"],
      }),
      invoke: () => {
        invocations += 1;
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => ["tauceti-goe_facility"],
    },
    readSettings: () => ({ prestigeType: "eden" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readBuildingResetActions: () => new Set(["tauceti-goe_facility"]),
  });

  runPrestige(prestige);
  runPrestige(prestige);
  assert.equal(invocations, 1);
  runPrestige(prestige);
  assert.equal(invocations, 2);
}

// Eden must not be invoked when its post-action counter is unavailable: the action returns false
// on both the unpaid and successful paths, so there would be no safe way to suppress a retry.
{
  let goal = "Reset";
  let invocations = 0;
  const root = buildRoot({ stats: {} });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: "tauceti-goe_facility",
        generation: 1,
        methods: ["action"],
      }),
      invoke: () => {
        invocations += 1;
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => ["tauceti-goe_facility"],
    },
    readSettings: () => ({ prestigeType: "eden" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readBuildingResetActions: () => new Set(["tauceti-goe_facility"]),
  });

  runPrestige(prestige);
  runPrestige(prestige);
  assert.equal(invocations, 0);
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
// control is unavailable.
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

// Demonic Prestige uses the captured current team potential when Mech automation is enabled.
// Readiness follows current Mech work, not the persistent controls left mounted in the lab.
for (const scenario of [
  { maximumPotential: 1, omitSoulGem: false, expectedEligible: true },
  {
    maximumPotential: 0.6,
    omitSoulGem: false,
    mechCycleActive: false,
    expectedEligible: true,
  },
  {
    maximumPotential: 0.6,
    omitSoulGem: false,
    mechCycleActive: true,
    expectedEligible: false,
  },
  { maximumPotential: 1, omitSoulGem: true, expectedEligible: false },
]) {
  const trace = [];
  let goal = "Normal";
  const root = buildRoot({
    race: { fasting: false, witch_hunter: false },
    portal: {
      spire: {
        count: 75,
        type: "rocky",
        progress: 0,
        status: { dark: true },
        boss: "water_elm",
      },
      mechbay: {
        max: 25,
        bay: 0,
        active: 0,
        scouts: 0,
        mechs: [],
        blueprint: {
          size: "small",
          chassis: "tread",
          hardpoint: ["laser"],
          equip: ["special", "shields"],
          infernal: false,
        },
      },
      purifier: {
        supply: 1_000_000,
        sup_max: 2_000_000,
        count: 1,
        on: 1,
        diff: 5_000,
      },
    },
    resource: {
      Population: { amount: 30, max: 30 },
      ...(scenario.omitSoulGem ? {} : { Soul_Gem: { amount: 100, diff: 0 } }),
    },
  });
  const controls = {
    resolve(id) {
      if (id === CAPTURED_MECH_ASSEMBLY_CONTROL) {
        return { elementId: id, generation: 1, methods: ["build"] };
      }
      if (id === CAPTURED_MECH_LIST_CONTROL) {
        return { elementId: id, generation: 1, methods: ["scrap"] };
      }
      return id === CAPTURED_DEMONIC_TECHS.demonic
        ? { elementId: id, generation: 1, methods: ["action"] }
        : undefined;
    },
    invoke: () => ({ ok: true, value: undefined }),
    capturedElementIds: () => [
      CAPTURED_MECH_ASSEMBLY_CONTROL,
      CAPTURED_MECH_LIST_CONTROL,
      CAPTURED_DEMONIC_TECHS.demonic,
    ],
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      prestigeType: "demonic",
      prestigeDemonicFloor: 75,
      prestigeDemonicPotential: scenario.maximumPotential,
      autoMech: true,
    }),
    readMechCycleActivity: () => scenario.mechCycleActive === true,
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
  assert.deepEqual(trace, scenario.expectedEligible ? [["goal", "Reset"]] : []);
}

// Witch-Hunter Ascension and Demonic share the captured absorption-chamber action. The pure
// eligibility gate still requires a completed chamber, full soul energy, and the configured pillar
// state; Demonic additionally requires the forbidden grant (and fasting's final ingredient grant).
for (const scenario of [
  { prestigeType: "ascension", fasting: false, forbidden: 5 },
  { prestigeType: "ascension", fasting: false, forbidden: 4 },
  { prestigeType: "demonic", fasting: false, forbidden: 5 },
  { prestigeType: "demonic", fasting: true, forbidden: 5 },
]) {
  const trace = [];
  let goal = "Normal";
  let modalOpen = false;
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
    tech: { forbidden: scenario.forbidden, dish_reset: 2 },
  });
  const controls = {
    resolve(id) {
      if (id === CAPTURED_WITCH_ASCENSION_ACTION) {
        return {
          elementId: id,
          generation: 1,
          methods: ["action"],
        };
      }
      return modalOpen && id === CAPTURED_CELESTIAL_LAB
        ? { elementId: id, generation: 2, methods: ["setRace"] }
        : undefined;
    },
    invoke(handle, method) {
      if (method === "action") {
        assert.equal(handle.elementId, CAPTURED_WITCH_ASCENSION_ACTION);
        trace.push(handle.elementId);
        if (root.tech.forbidden === 5) {
          root.stats.descend += 1;
        } else {
          modalOpen = true;
        }
      } else {
        assert.equal(handle.elementId, CAPTURED_CELESTIAL_LAB);
        assert.equal(method, "setRace");
        root.stats.ascend += 1;
        trace.push([handle.elementId, method]);
      }
      return { ok: true, value: undefined };
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
    customRaceLab: reusableCustomRaceLab(root, trace),
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
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    CAPTURED_WITCH_ASCENSION_ACTION,
    ...(scenario.forbidden === 5
      ? ["Prestiged", ["goal", "GameOverMan"]]
      : [
          [CAPTURED_CELESTIAL_LAB, "setRace"],
          "Prestiged",
          ["goal", "GameOverMan"],
        ]),
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

// A fresh page with whitehole 4 has an interrupted reset. The captured repair row takes priority
// over the normal infusion sequence, and success is committed only after the game-owned grant and
// exotic mass postconditions are visible.
{
  const trace = [];
  let goal = "Normal";
  let invocations = 0;
  const root = buildRoot({
    interstellar: { stellar_engine: { mass: 10, exotic: 2 } },
    tech: { mad: 1, whitehole: 4 },
  });
  const repairOffer = {
    elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
    cost: { Knowledge: 1500000, Neutronium: 20000 },
    generation: 1,
  };
  const controls = {
    resolve(id) {
      return id === CAPTURED_WHITEHOLE_REPAIR_TECH
        ? {
            elementId: id,
            generation: repairOffer.generation,
            methods: ["action"],
            data: { title: "Stabilize Blackhole" },
          }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_WHITEHOLE_REPAIR_TECH);
      assert.equal(method, "action");
      invocations += 1;
      delete root.tech.whitehole;
      root.interstellar.stellar_engine.exotic = 0;
      return { ok: true, value: true };
    },
    capturedElementIds() {
      return [CAPTURED_WHITEHOLE_REPAIR_TECH];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ prestigeType: "whitehole" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readOfferedTechs: () => [repairOffer],
    resources: {
      readResources: () => ({
        resources: new Map([
          ["Knowledge", { amount: 1500000 }],
          ["Neutronium", { amount: 20000 }],
        ]),
      }),
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.equal(goal, "Reset");
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    "Researched Stabilize Blackhole",
  ]);
  assert.equal(invocations, 1);
  assert.equal(root.tech.whitehole, undefined);
  assert.equal(root.interstellar.stellar_engine.exotic, 0);
  runPrestige(prestige);
  assert.equal(invocations, 1);
}

// The repair row is a real eligibility answer, but an unaffordable captured price must not click.
{
  let goal = "Normal";
  let invocations = 0;
  const root = buildRoot({ tech: { mad: 1, whitehole: 4 } });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
        generation: 1,
        methods: ["action"],
      }),
      invoke: () => {
        invocations += 1;
        return { ok: true, value: true };
      },
      capturedElementIds: () => [CAPTURED_WHITEHOLE_REPAIR_TECH],
    },
    readSettings: () => ({ prestigeType: "whitehole" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
        cost: { Knowledge: 1500000 },
        generation: 1,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 1499999 }]]),
      }),
    },
  });

  runPrestige(prestige);
  assert.equal(goal, "Reset");
  runPrestige(prestige);
  assert.equal(invocations, 0);
}

// An offered repair without a captured control is a capture gap, not permission to invoke an
// unverified method; the branch stands down until a later draw binds the row.
{
  let goal = "Normal";
  const root = buildRoot({ tech: { mad: 1, whitehole: 4 } });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: true }),
      capturedElementIds: () => [],
    },
    readSettings: () => ({ prestigeType: "whitehole" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
        cost: { Knowledge: 1 },
        generation: 1,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 1 }]]),
      }),
    },
  });

  runPrestige(prestige);
  assert.equal(goal, "Reset");
  assert.doesNotThrow(() => runPrestige(prestige));
}

// A redrawn repair control is rejected by the same generation guard as every other captured
// prestige action, but the recovery branch stands down until the next draw instead of throwing.
{
  let goal = "Normal";
  let generation = 1;
  const root = buildRoot({ tech: { mad: 1, whitehole: 4 } });
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
        generation,
        methods: ["action"],
      }),
      invoke: () => ({ ok: true, value: true }),
      capturedElementIds: () => [CAPTURED_WHITEHOLE_REPAIR_TECH],
    },
    readSettings: () => ({ prestigeType: "whitehole" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readOfferedTechs: () => [
      {
        elementId: CAPTURED_WHITEHOLE_REPAIR_TECH,
        cost: { Knowledge: 1 },
        generation: 1,
      },
    ],
    resources: {
      readResources: () => ({
        resources: new Map([["Knowledge", { amount: 1 }]]),
      }),
    },
  });

  runPrestige(prestige);
  generation = 2;
  assert.doesNotThrow(() => runPrestige(prestige));
}

// Cataclysm is committed by a research action rather than a building or Vue panel method. The
// drawn row is the game's eligibility answer, its captured price is checked against live holdings,
// and the successful wrapper call is treated as committed because the upstream action schedules
// its reset asynchronously and the Vue wrapper does not return the lexical boolean.
{
  const trace = [];
  let goal = "Normal";
  let queueLoads = 0;
  const root = buildRoot({ settings: { qKey: true, touch: true } });
  const controls = {
    resolve(id) {
      return id === CAPTURED_CATACLYSM_TECH
        ? { elementId: id, generation: 3, methods: ["action"] }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_CATACLYSM_TECH);
      assert.equal(method, "action");
      assert.equal(root.settings.qKey, false);
      assert.equal(root.settings.touch, false);
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
    loadQueuedSettings: () => {
      queueLoads += 1;
      trace.push("load queued settings");
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
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    "load queued settings",
    "action",
    "Prestiged",
  ]);
  assert.equal(queueLoads, 1);
  assert.equal(root.settings.qKey, true);
  assert.equal(root.settings.touch, true);
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
