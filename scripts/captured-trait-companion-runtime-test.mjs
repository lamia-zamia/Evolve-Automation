import assert from "node:assert/strict";
import { CAPTURED_TRAIT_OCULAR } from "../src/adapters/evolve/traits/captured-trait-settings-catalog.ts";
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

// Ocular powers reconcile the exact top two priorities and click only the controls whose
// authoritative root values differ.
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
  const controls = {
    ocularPower: {
      max() {
        const active = Object.values(config).filter(Boolean).length;
        return `${active} / 2`;
      },
    },
  };
  const fixture = createFixture({
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
    controls,
    documentSetup({ document, rebindControl }) {
      const priorQuery = document.querySelector.bind(document);
      document.querySelector = (selector) => {
        const power = CAPTURED_TRAIT_OCULAR.find(
          (candidate) =>
            selector === `#ocular${candidate.id} input[type='checkbox']`,
        );
        if (power !== undefined) {
          return {
            click() {
              config[power.stateKey] = !config[power.stateKey];
              rebindControl("ocularPower");
            },
          };
        }
        return priorQuery(selector);
      };
    },
  });
  assert.deepEqual(
    CAPTURED_TRAIT_OCULAR.filter((power) => config[power.stateKey]).map(
      (power) => power.id,
    ),
    ["disintegration", "petrification"],
  );
  assert.equal(count(fixture, "ocularPower", "max"), 1);
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
        max() {
          return "0 / 2";
        },
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
