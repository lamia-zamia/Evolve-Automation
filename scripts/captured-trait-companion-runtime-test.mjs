import assert from "node:assert/strict";
import { installVueCapture } from "../src/adapters/evolve/vue-capture.ts";
import { CAPTURED_TRAIT_OCULAR } from "../src/adapters/evolve/traits/captured-trait-settings-catalog.ts";
import {
  createCapturedOcularPowerAutomation,
  readCapturedOcularEffectiveRank,
} from "../src/adapters/evolve/traits/captured-ocular-power.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

function createFixture({
  root,
  settings = {},
  controls = {},
  documentSetup = () => {},
}) {
  const invocations = [];
  const lookups = new Map();
  const handles = new Map(
    Object.entries(controls).map(([elementId, methods]) => [
      elementId,
      {
        elementId,
        generation: 1,
        methods: Object.keys(methods),
        implementations: methods,
      },
    ]),
  );
  let periodListener;
  const document = createTestDocument(element("div", { id: "runtime-root" }));
  const documentState = {
    document,
    handles,
    invocations,
    root,
    rebindControl(elementId) {
      const current = handles.get(elementId);
      if (current !== undefined) {
        handles.set(elementId, {
          ...current,
          generation: current.generation + 1,
        });
      }
    },
  };
  documentSetup(documentState);
  const storage = {
    getItem: () =>
      JSON.stringify({
        masterScriptToggle: true,
        tickRate: 1,
        autoMinorTrait: true,
        autoMutateTraits: false,
        autoGenetics: false,
        autoPrestige: false,
        ...settings,
      }),
    setItem: () => {},
  };
  const pageCapture = {
    isComplete: () => true,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve(elementId) {
        lookups.set(elementId, (lookups.get(elementId) ?? 0) + 1);
        return handles.get(elementId);
      },
      invoke(handle, method, args = []) {
        const current = handles.get(handle.elementId);
        if (current === undefined || current.generation !== handle.generation) {
          return { ok: false, reason: "stale-control" };
        }
        invocations.push({ elementId: handle.elementId, method, args });
        const implementation = current.implementations[method];
        return {
          ok: true,
          value:
            typeof implementation === "function"
              ? implementation(...args)
              : undefined,
        };
      },
      capturedElementIds: () => [...handles.keys()],
    },
    keyState: { readPressed: () => false },
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        periodListener = next;
        return () => {};
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  };
  const errors = [];
  const stop = startCapturedRuntime({
    pageCapture,
    document,
    keyboardEvent: class {},
    mouseEvent: class {},
    settingsHostWindow: { document },
    storage,
    logError: (message) => errors.push(message),
  });
  periodListener({ periods: 1 });
  stop();
  return { root, handles, invocations, lookups, errors };
}

function resource(amount, max, diff = 0, display = true) {
  return { amount, max, diff, display };
}

function count(fixture, elementId, method) {
  return fixture.invocations.filter(
    (invocation) =>
      invocation.elementId === elementId && invocation.method === method,
  ).length;
}

function lookupCount(fixture, elementId) {
  return fixture.lookups.get(elementId) ?? 0;
}

function coreRoot(race = {}, tech = {}, resources = {}) {
  return {
    race,
    tech,
    settings: { civTabs: 2, govTabs: 7, arpa: { genetics: false } },
    resource: resources,
    genes: {},
    prestige: {},
    stats: { psykill: 0 },
  };
}

function capturedOcularCapacity(race, rootState = {}) {
  const root = Object.assign(
    coreRoot({ ocularPowerConfig: {}, ...race }),
    rootState,
  );
  root.city = {};
  root.civic = {};
  const automation = createCapturedOcularPowerAutomation({
    rootState: { readRoot: () => root },
    controls: {
      resolve: () => ({
        elementId: "ocularPower",
        generation: 1,
        methods: ["pow"],
      }),
      invoke: () => ({ ok: false, reason: "unknown-method" }),
    },
    getDocument: () => undefined,
    readSettings: () => ({}),
    ensureControls: () => true,
  });
  return automation.reader.readPlan().capacity;
}

function capturedOcularEffectiveRank(race, rootState = {}) {
  const root = Object.assign(
    coreRoot({ ocularPowerConfig: {}, ...race }),
    rootState,
  );
  return readCapturedOcularEffectiveRank(root);
}

function makeRecessiveOcularRace({ traitSlots = {}, ...raceOverrides } = {}) {
  const geneSlots = Array.from({ length: 96 }, () => false);
  for (const [slot, trait] of Object.entries(traitSlots)) {
    geneSlots[Number(slot)] = { g: trait, r: 1.33 };
  }
  return {
    species: "human",
    strandGenus: ["humanoid"],
    strandSpan: 48,
    geneRecess: 1,
    geneSlots,
    ocular_power: 1.33,
    empowered: 2,
    ocularPowerConfig: Object.fromEntries(
      CAPTURED_TRAIT_OCULAR.map((power) => [power.stateKey, false]),
    ),
    ...raceOverrides,
  };
}

function enforceDeadSpaceOcularPow(config, stateKey, rebind, capacity = 2) {
  // DeadSpace src/races.js ocularPower().pow(v) enforces vars()[0] over the
  // rendered d/p/w/t/f/c keys, then repeats in reverse while preserving v.
  const renderKeys = ["d", "p", "w", "t", "f", "c"];
  let active = 0;
  for (const key of renderKeys) {
    if (config[key]) active++;
    if (active > capacity && key !== stateKey) config[key] = false;
  }
  if (active > capacity) {
    active = 0;
    for (const key of [...renderKeys].reverse()) {
      if (config[key]) active++;
      if (active > capacity && key !== stateKey) config[key] = false;
    }
    rebind();
  }
}

function createCapturedOcularFixture({
  root,
  settings = {},
  gamePow = () => {},
}) {
  const document = createTestDocument(element("div", { id: "runtime-root" }));
  const page = {};
  const capture = installVueCapture(page);
  const vue = {
    reactive(value) {
      return value;
    },
    toRaw(value) {
      return value;
    },
    createApp() {
      return {
        use() {
          return this;
        },
        mount() {
          return {};
        },
        unmount() {},
      };
    },
  };
  page.Vue = vue;

  root.city ??= {};
  root.civic ??= {};
  page.Vue.reactive(root);
  let rebinds = 0;
  const bindOcularPower = () => {
    rebinds += 1;
    page.Vue.createApp({
      el: "#ocularPower",
      data: root.race.ocularPowerConfig,
      methods: {
        pow(stateKey) {
          gamePow(stateKey, bindOcularPower);
        },
      },
      // Vue capture records the Vue 3 methods object, not this separate option bag.
      filters: {
        max() {
          return "localized active / capacity";
        },
      },
    });
  };
  bindOcularPower();

  const checkboxClicks = [];
  const powerQuery = document.querySelector.bind(document);
  document.querySelector = (selector) => {
    const power = CAPTURED_TRAIT_OCULAR.find(
      (candidate) =>
        selector === `#ocular${candidate.id} input[type='checkbox']`,
    );
    if (power === undefined) return powerQuery(selector);
    return {
      click() {
        checkboxClicks.push(power.id);
        root.race.ocularPowerConfig[power.stateKey] =
          !root.race.ocularPowerConfig[power.stateKey];
        const handle = capture.controls.resolve("ocularPower");
        const result = capture.controls.invoke(handle, "pow", [power.stateKey]);
        if (!result.ok) throw new Error("captured Ocular pow was unavailable");
      },
    };
  };

  let periodListener;
  const pageCapture = {
    ...capture,
    isComplete: () => true,
    keyState: { readPressed: () => false },
    periods: {
      subscribe(next) {
        periodListener = next;
        return () => {
          periodListener = undefined;
        };
      },
    },
  };
  const storage = {
    getItem: () =>
      JSON.stringify({
        masterScriptToggle: true,
        tickRate: 1,
        autoMinorTrait: true,
        autoMutateTraits: false,
        autoGenetics: false,
        autoPrestige: false,
        ...settings,
      }),
    setItem: () => {},
  };
  const errors = [];
  const stop = startCapturedRuntime({
    pageCapture,
    document,
    keyboardEvent: class {},
    mouseEvent: class {},
    settingsHostWindow: { document },
    storage,
    logError: (message) => errors.push(message),
  });
  periodListener({ periods: 1 });
  stop();
  const handle = capture.controls.resolve("ocularPower");
  capture.uninstall();
  return { root, handle, checkboxClicks, errors, rebinds };
}

function psychicRoot({
  technologyLevel = 1,
  energy = 10,
  maxEnergy = 10,
} = {}) {
  const race = {
    species: "Human",
    psychic: true,
    psychicPowers: {
      boostTime: 0,
      cash: 0,
      assaultTime: 0,
      boost: { r: "Food" },
    },
  };
  const root = coreRoot(
    race,
    { psychic: technologyLevel },
    {
      Energy: resource(energy, maxEnergy),
      Human: resource(20, 100),
      Food: resource(0, 100000, 0.01),
      Lumber: resource(0, 100000, 0.03),
    },
  );
  root.stats.psykill = 0;
  root.stats.achieve = { nightmare: { mg: 2 } };
  return root;
}

// Shapeshift uses the captured sshifter control and proves the live genus postcondition.
{
  const root = coreRoot({ shapeshifter: true, ss_genus: "none" }, {});
  const fixture = createFixture({
    root,
    settings: { shifterGenus: "fungal" },
    controls: {
      sshifter: {
        setShape(genus) {
          root.race.ss_genus = genus;
          root.race.mimicked = true;
        },
      },
    },
  });
  assert.equal(root.race.ss_genus, "fungal");
  assert.equal(root.race.mimicked, true);
  assert.equal(count(fixture, "sshifter", "setShape"), 1);
}

// Already-selected and non-shapeshifter runs never resolve the shape control.
for (const race of [
  { shapeshifter: true, ss_genus: "fungal" },
  { shapeshifter: false, ss_genus: "none" },
]) {
  const fixture = createFixture({
    root: coreRoot(race, {}),
    settings: { shifterGenus: "fungal" },
    controls: { sshifter: { setShape() {} } },
  });
  assert.equal(count(fixture, "sshifter", "setShape"), 0);
  assert.equal(lookupCount(fixture, "sshifter"), 0);
}

// A successful shape change mutates the root and rebinds a downstream control. The same cycle
// ends before Psychic can act through either the prior or the replacement generation.
{
  const root = psychicRoot();
  root.race.shapeshifter = true;
  root.race.ss_genus = "none";
  let rebindControl;
  const psychicMethod = () => {
    root.resource.Energy.amount -= 10;
    root.resource.Human.amount -= 1;
    root.stats.psykill += 1;
  };
  const fixture = createFixture({
    root,
    settings: { shifterGenus: "fungal", psychicPower: "murder" },
    controls: {
      sshifter: {
        setShape(genus) {
          root.race.ss_genus = genus;
          rebindControl("psychicKill");
        },
      },
      psychicKill: { murder: psychicMethod },
      psychicBoost: { boostVal() {} },
    },
    documentSetup(state) {
      rebindControl = state.rebindControl;
    },
  });
  assert.equal(root.race.ss_genus, "fungal");
  assert.equal(root.resource.Energy.amount, 10);
  assert.equal(count(fixture, "psychicKill", "murder"), 0);
}

// Psychic Murder passes through the production period callback and mutates Energy, population,
// and the game's kill counter through the actual captured method.
{
  const root = psychicRoot();
  const fixture = createFixture({
    root,
    settings: { psychicPower: "murder" },
    controls: {
      psychicBoost: { boostVal() {} },
      psychicKill: {
        murder() {
          root.resource.Energy.amount -= 10;
          root.resource.Human.amount -= 1;
          root.stats.psykill += 1;
        },
      },
    },
  });
  assert.equal(root.resource.Energy.amount, 0);
  assert.equal(root.resource.Human.amount, 19);
  assert.equal(root.stats.psykill, 1);
  assert.equal(count(fixture, "psychicKill", "murder"), 1);
}

// Boost's automatic target order comes from the game-rendered atomic-mass radio list; rate and
// room values come from the captured resource records.
{
  const root = psychicRoot({
    technologyLevel: 5,
    energy: 60,
    maxEnergy: 60,
  });
  const fixture = createFixture({
    root,
    settings: { psychicPower: "boost", psychicBoostRes: "auto" },
    controls: {
      psychicBoost: {
        boostVal() {
          root.resource.Energy.amount -= 60;
          root.race.psychicPowers.boostTime =
            72 * root.stats.achieve.nightmare.mg;
        },
      },
    },
    documentSetup({ document }) {
      const priorQuery = document.querySelectorAll.bind(document);
      const options = ["Food", "Lumber"].map((value) => ({
        value,
        click() {
          root.race.psychicPowers.boost.r = value;
        },
      }));
      document.querySelectorAll = (selector) =>
        selector === "#psyhscrolltarget input[type='radio']"
          ? options
          : priorQuery(selector);
    },
  });
  assert.equal(root.race.psychicPowers.boost.r, "Lumber");
  assert.equal(root.resource.Energy.amount, 0);
  assert.equal(root.race.psychicPowers.boostTime, 144);
  assert.equal(count(fixture, "psychicBoost", "boostVal"), 1);
}

// Current DeadSpace stores the seven rank tiers as 0.1, 0.25, 0.5, 1, 1.33,
// 1.67 and 2. Legacy tiers 2, 3 and 4 migrate to 1.33, 1.67 and 2.
{
  for (const [rank, capacity] of [
    [0.1, 1],
    [0.25, 1],
    [0.5, 1],
    [1, 2],
    [1.33, 2],
    [1.67, 3],
    [2, 3],
  ]) {
    assert.equal(
      capturedOcularCapacity({ ocular_power: rank }),
      capacity,
      `ocular_power ${rank}`,
    );
  }

  // space.js runs legacyTraitRank() while loading legacy tRanks before the game
  // exposes the current race rank to captured readers.
  for (const [legacyRank, currentRank, capacity] of [
    [2, 1.33, 2],
    [3, 1.67, 3],
    [4, 2, 3],
  ]) {
    assert.equal(
      capturedOcularCapacity({ ocular_power: currentRank }),
      capacity,
      `legacy ocular tier ${legacyRank} migrates to ${currentRank}`,
    );
  }

  // Empowered is a major trait too: its rank-1.67 bonus puts Ocular Power at
  // 1.664 (still capacity two), while rank 2 raises it to 1.73 (capacity three).
  assert.equal(
    capturedOcularCapacity({ ocular_power: 1.33, empowered: 1.67 }),
    2,
  );
  assert.equal(capturedOcularCapacity({ ocular_power: 1.33, empowered: 2 }), 3);

  const baseOcularState = { genes: { evolve: 0 }, custom: {} };
  for (const [slot, rank, capacity] of [
    [14, 1.33, 2],
    [10, 1.73, 3],
  ]) {
    const omnivore = makeRecessiveOcularRace({
      strandGenus: ["omnivore"],
      traitSlots: { [slot]: "ocular_power" },
    });
    assert.equal(
      capturedOcularEffectiveRank(omnivore, baseOcularState),
      rank,
      `omnivore Ocular slot ${slot} effective rank`,
    );
    assert.equal(
      capturedOcularCapacity(omnivore, baseOcularState),
      capacity,
      `omnivore Ocular slot ${slot} capacity`,
    );
  }
  for (const [label, overrides, slot, capacity] of [
    ["humanoid emergent", { strandGenus: ["humanoid"] }, 12, 2],
    ["humanoid emergent boundary", { strandGenus: ["humanoid"] }, 14, 3],
    ["demonic permanent", { strandGenus: ["demonic"] }, 12, 2],
    ["demonic permanent boundary", { strandGenus: ["demonic"] }, 14, 3],
    ["empty hybrid definition", { strandGenus: ["hybrid"] }, 10, 2],
    [
      "one fanatic feeder leaves two omnivore pairs",
      { strandGenus: ["omnivore"], fanaticTraits: { beast: 1 } },
      14,
      2,
    ],
    [
      "fanatic feeders",
      { strandGenus: ["omnivore"], fanaticTraits: { beast: 1, cautious: 1 } },
      12,
      2,
    ],
    [
      "fanatic boundary",
      { strandGenus: ["omnivore"], fanaticTraits: { beast: 1, cautious: 1 } },
      14,
      3,
    ],
    [
      "separate hybrid genus pairs",
      {
        strandGenus: ["omnivore", "humanoid"],
        fanaticTraits: { beast: 1, adaptable: 1 },
      },
      16,
      2,
    ],
    [
      "separate hybrid genus boundary",
      {
        strandGenus: ["omnivore", "humanoid"],
        fanaticTraits: { beast: 1, adaptable: 1 },
      },
      14,
      3,
    ],
  ]) {
    assert.equal(
      capturedOcularCapacity(
        makeRecessiveOcularRace({
          ...overrides,
          traitSlots: { [slot]: "ocular_power" },
        }),
        baseOcularState,
      ),
      capacity,
      label,
    );
  }
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        species: "custom",
        strandGenus: undefined,
        traitSlots: { 14: "ocular_power" },
      }),
      { genes: { evolve: 0 }, custom: { race0: { genus: "omnivore" } } },
    ),
    2,
    "a custom omnivore uses its genus definition",
  );
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        species: "hybrid",
        strandGenus: undefined,
        traitSlots: { 16: "ocular_power" },
      }),
      {
        genes: { evolve: 0 },
        custom: {
          race1: { genus: "hybrid", hybrid: ["omnivore", "humanoid"] },
        },
      },
    ),
    2,
    "a hybrid design sums both genus definitions",
  );
  const recessiveOcular = makeRecessiveOcularRace({
    traitSlots: { 12: "ocular_power" },
  });
  assert.equal(
    capturedOcularEffectiveRank({ ocular_power: 1.33, empowered: 2 }),
    1.73,
    "non-recessive Ocular receives Empowered's 0.4 major bonus",
  );
  assert.equal(
    capturedOcularCapacity(recessiveOcular, baseOcularState),
    2,
    "recessive Ocular keeps its raw 1.33 rank with Empowered 2",
  );
  assert.equal(
    capturedOcularEffectiveRank(recessiveOcular, baseOcularState),
    1.33,
    "recessive Ocular rank remains raw with Empowered 2",
  );

  // Upstream's only current ladder pair that crosses the Ocular 1.67 capacity
  // step is raw 1.33 plus Empowered's major-trait +0.4 bonus.
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        traitSlots: { 12: "adaptable", 10: "ocular_power" },
      }),
      baseOcularState,
    ),
    3,
    "a different trait in the recessive pair does not suppress Empowered",
  );

  const twoRecessivePairs = makeRecessiveOcularRace({
    geneRecess: 2,
    geneSlotBonus: 1,
  });
  const expandedOcularState = { genes: { evolve: 5 }, custom: {} };
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        traitSlots: { 16: "ocular_power" },
        geneRecess: 2,
        geneSlotBonus: 1,
      }),
      expandedOcularState,
    ),
    2,
    "the first of two active recessive pairs is detected",
  );
  assert.equal(
    capturedOcularCapacity(
      {
        ...twoRecessivePairs,
        geneSlots: makeRecessiveOcularRace({
          traitSlots: { 18: "ocular_power" },
          geneRecess: 2,
          geneSlotBonus: 1,
        }).geneSlots,
      },
      expandedOcularState,
    ),
    2,
    "the last active recessive pair is detected",
  );
  assert.equal(
    capturedOcularCapacity(
      {
        ...twoRecessivePairs,
        geneSlots: makeRecessiveOcularRace({
          traitSlots: { 14: "ocular_power" },
          geneRecess: 2,
          geneSlotBonus: 1,
        }).geneSlots,
      },
      expandedOcularState,
    ),
    3,
    "the major pair immediately before the recessive range is not recessive",
  );

  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        traitSlots: { 14: "ocular_power" },
        shapeshifter: true,
        ss_genus: "fungi",
        ss_traits: ["spores", "detritivore", "spongy"],
      }),
      baseOcularState,
    ),
    2,
    "the mimic's slottable traits add their current genus pair before recessives",
  );
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        traitSlots: { 14: "ocular_power" },
        shapeshifter: true,
        ss_genus: "demonic",
        ss_traits: ["ruthless", "evil", "soul_eater"],
      }),
      baseOcularState,
    ),
    2,
    "mimic accepts declared traits and excludes emergent and permanent traits",
  );

  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        strandGenus: undefined,
        traitSlots: { 12: "ocular_power" },
      }),
      baseOcularState,
    ),
    2,
    "an empty strandGenus list falls back to the species catalog",
  );

  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        traitSlots: { 12: "ocular_power" },
        empowered: 0,
      }),
      baseOcularState,
    ),
    2,
    "recessive placement does not change raw-rank capacity without Empowered",
  );

  for (const [species, designKey] of [
    ["custom", "race0"],
    ["hybrid", "race1"],
  ]) {
    assert.equal(
      capturedOcularCapacity(
        makeRecessiveOcularRace({
          species,
          geneRecess: 0,
          traitSlots: { 12: "ocular_power" },
        }),
        {
          genes: {},
          custom: { [designKey]: { recessive: 1 } },
        },
      ),
      2,
      `${designKey}.recessive contributes an active custom recessive pair`,
    );
  }

  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        geneRecess: undefined,
        geneSlotBonus: undefined,
        strandSpan: undefined,
      }),
      { genes: {}, custom: {} },
    ),
    3,
    "uninitialized recessive, bonus, evolve, and strand-span fields retain upstream defaults",
  );
  assert.equal(
    capturedOcularCapacity(
      makeRecessiveOcularRace({
        geneSlots: undefined,
        strandSpan: undefined,
        geneSlotBonus: undefined,
      }),
      { genes: {}, custom: {} },
    ),
    3,
    "a missing geneSlots array reads as the empty array geneSlots() initializes",
  );
  assert.equal(
    capturedOcularCapacity({ ocular_power: 3 }),
    0,
    "an unmigrated legacy tier fails closed",
  );
  assert.equal(
    capturedOcularCapacity({ ocular_power: 4 }),
    0,
    "another unmigrated legacy tier fails closed",
  );
}

// Ocular powers run through the real Vue capture and the production runtime. The capture sees
// pow in methods and leaves the separate filters bag out of the control handle.
{
  const config = Object.fromEntries(
    CAPTURED_TRAIT_OCULAR.map((power) => [power.stateKey, true]),
  );
  const root = coreRoot({ ocular_power: 1, ocularPowerConfig: config }, {});
  const priorities = {
    disintegration: 50,
    petrification: 40,
    wound: 30,
    telekinesis: 20,
    fear: 10,
    charm: 0,
  };
  const fixture = createCapturedOcularFixture({
    root,
    settings: Object.fromEntries([
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_${power.id}`,
        true,
      ]),
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_p_${power.id}`,
        priorities[power.id],
      ]),
    ]),
    gamePow(stateKey, rebind) {
      // Upstream redraws the panel while an over-cap config is reconciled.
      if (Object.values(config).filter(Boolean).length > 2) rebind();
    },
  });
  assert.deepEqual(fixture.handle.methods, ["pow"]);
  assert.equal(fixture.handle.methods.includes("max"), false);
  assert.deepEqual(
    CAPTURED_TRAIT_OCULAR.filter((power) => config[power.stateKey]).map(
      (power) => power.id,
    ),
    ["disintegration", "petrification"],
  );
  assert.ok(fixture.rebinds > 1, "pow redraws and rebinds the control");
  assert.equal(fixture.checkboxClicks.length, 4);
  assert.deepEqual(fixture.errors, []);
}

// A recessive Ocular rank gives the upstream pow() method a real capacity of two. With three
// enabled settings, the incorrect three-power plan lets pow() evict the highest-priority first
// item according to its d/p/w/t/f/c render-key sweep.
{
  const config = Object.fromEntries(
    CAPTURED_TRAIT_OCULAR.map((power) => [power.stateKey, false]),
  );
  const root = coreRoot(
    makeRecessiveOcularRace({
      traitSlots: { 12: "ocular_power" },
      ocularPowerConfig: config,
    }),
  );
  root.genes = { evolve: 0 };
  root.custom = {};
  const enabled = new Set(["disintegration", "petrification", "wound"]);
  const priorities = { disintegration: 90, petrification: 80, wound: 70 };
  const fixture = createCapturedOcularFixture({
    root,
    settings: Object.fromEntries([
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_${power.id}`,
        enabled.has(power.id),
      ]),
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_p_${power.id}`,
        priorities[power.id] ?? 0,
      ]),
    ]),
    gamePow(stateKey, rebind) {
      enforceDeadSpaceOcularPow(config, stateKey, rebind);
    },
  });
  assert.deepEqual(fixture.handle.methods, ["pow"]);
  assert.deepEqual(
    CAPTURED_TRAIT_OCULAR.filter((power) => config[power.stateKey]).map(
      (power) => power.id,
    ),
    ["disintegration", "petrification"],
  );
  assert.equal(fixture.checkboxClicks.length, 2);
  assert.deepEqual(fixture.errors, []);
}

// The production capture and pow path respects both omnivore Ocular capacities.
for (const [slot, capacity, expected] of [
  [14, 2, ["disintegration", "petrification"]],
  [10, 3, ["disintegration", "petrification", "wound"]],
]) {
  const config = Object.fromEntries(
    CAPTURED_TRAIT_OCULAR.map((power) => [power.stateKey, false]),
  );
  const root = coreRoot(
    makeRecessiveOcularRace({
      strandGenus: ["omnivore"],
      traitSlots: { [slot]: "ocular_power" },
      ocularPowerConfig: config,
    }),
  );
  root.genes = { evolve: 0 };
  root.custom = {};
  const enabled = new Set(["disintegration", "petrification", "wound"]);
  const priorities = { disintegration: 90, petrification: 80, wound: 70 };
  const fixture = createCapturedOcularFixture({
    root,
    settings: Object.fromEntries([
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_${power.id}`,
        enabled.has(power.id),
      ]),
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_p_${power.id}`,
        priorities[power.id] ?? 0,
      ]),
    ]),
    gamePow(stateKey, rebind) {
      enforceDeadSpaceOcularPow(config, stateKey, rebind, capacity);
    },
  });
  assert.deepEqual(
    CAPTURED_TRAIT_OCULAR.filter((power) => config[power.stateKey]).map(
      (power) => power.id,
    ),
    expected,
    `composed omnivore Ocular slot ${slot}`,
  );
  assert.equal(fixture.checkboxClicks.length, capacity);
  assert.deepEqual(fixture.errors, []);
}

// Priorities can beat the order in which the game renders the six checkboxes.
{
  const config = Object.fromEntries(
    CAPTURED_TRAIT_OCULAR.map((power) => [power.stateKey, false]),
  );
  const root = coreRoot({ ocular_power: 1, ocularPowerConfig: config }, {});
  const priorities = {
    disintegration: 30,
    petrification: 20,
    wound: 10,
    telekinesis: 0,
    fear: 50,
    charm: 40,
  };
  createCapturedOcularFixture({
    root,
    settings: Object.fromEntries([
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_${power.id}`,
        true,
      ]),
      ...CAPTURED_TRAIT_OCULAR.map((power) => [
        `ocularPower_p_${power.id}`,
        priorities[power.id],
      ]),
    ]),
  });
  assert.deepEqual(
    CAPTURED_TRAIT_OCULAR.filter((power) => config[power.stateKey]).map(
      (power) => power.id,
    ),
    ["fear", "charm"],
  );
}

// Wish executes minor before major and verifies both game-owned cooldowns in the same cycle.
{
  const root = coreRoot(
    { wish: true, wishStats: { minor: 0, major: 0 } },
    { wish: 2 },
  );
  const fixture = createFixture({
    root,
    settings: { wishMinor: "Know", wishMajor: "Power" },
    controls: {
      minorWish: {
        know() {
          root.race.wishStats.minor = 3;
        },
      },
      majorWish: {
        power() {
          root.race.wishStats.major = 9;
        },
      },
    },
  });
  assert.equal(root.race.wishStats.minor, 3);
  assert.equal(root.race.wishStats.major, 9);
  assert.equal(count(fixture, "minorWish", "know"), 1);
  assert.equal(count(fixture, "majorWish", "power"), 1);
  assert.ok(
    fixture.invocations.findIndex((entry) => entry.elementId === "minorWish") <
      fixture.invocations.findIndex((entry) => entry.elementId === "majorWish"),
  );
}

// An unavailable set of companions performs no feature-control lookup, even when their value
// settings request work.
{
  const root = coreRoot(
    {
      shapeshifter: false,
      ss_genus: "none",
      psychic: true,
      wish: true,
    },
    { psychic: 1, wish: 2 },
    { Energy: resource(5, 10) },
  );
  const fixture = createFixture({
    root,
    settings: {
      shifterGenus: "fungal",
      psychicPower: "murder",
      wishMinor: "Know",
      wishMajor: "Power",
    },
    controls: {
      sshifter: { setShape() {} },
      psychicKill: { murder() {} },
      ocularPower: {
        pow() {},
      },
      minorWish: { know() {} },
      majorWish: { power() {} },
    },
  });
  for (const id of [
    "sshifter",
    "psychicBoost",
    "psychicKill",
    "ocularPower",
    "minorWish",
    "majorWish",
  ]) {
    assert.equal(
      lookupCount(fixture, id),
      0,
      `${id} was resolved while unavailable`,
    );
  }
  assert.equal(fixture.invocations.length, 0);
}

// An explicitly disabled Psychic setting also bypasses control discovery with full Energy.
{
  const root = psychicRoot();
  const fixture = createFixture({
    root,
    settings: { psychicPower: "none" },
    controls: { psychicBoost: { boostVal() {} }, psychicKill: { murder() {} } },
  });
  assert.equal(lookupCount(fixture, "psychicBoost"), 0);
  assert.equal(lookupCount(fixture, "psychicKill"), 0);
  assert.equal(fixture.invocations.length, 0);
}

console.log("captured trait companion runtime tests passed");
