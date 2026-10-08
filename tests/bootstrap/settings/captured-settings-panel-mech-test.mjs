import assert from "node:assert/strict";
import { createCapturedMech } from "../../../src/adapters/evolve/combat/captured-mech.ts";
import { planCapturedMechBuild } from "../../../src/domain/combat/captured-mech.ts";
import {
  createMechInfoPanel,
  createPage,
  mechInfoOverride,
} from "../../support/fixtures/settings-panel-fixture.mjs";

// --- Mech Info visibility follows the effective setting layer -------------------------------

{
  const page = createMechInfoPanel(
    { autoMech: false, overrides: { autoMech: [mechInfoOverride(true)] } },
    "human",
  );
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().autoMech, false);
  assert.equal(page.effectiveSettings.autoMech, true);
  assert.equal(
    Boolean(page.root.querySelector(".script_autoMech").checked),
    false,
  );
  assert.equal(
    page.notes().length,
    1,
    "an effective autoMech override enables Mech Info while the raw checkbox stays unchecked",
  );
}

{
  const page = createMechInfoPanel(
    { autoMech: true, overrides: { autoMech: [mechInfoOverride(false)] } },
    "human",
  );
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().autoMech, true);
  assert.equal(page.effectiveSettings.autoMech, false);
  assert.equal(page.root.querySelector(".script_autoMech").checked, true);
  assert.equal(
    page.notes().length,
    0,
    "an effective autoMech override disables Mech Info while the raw checkbox stays checked",
  );
}

{
  const page = createMechInfoPanel(
    { autoMech: false, overrides: { autoMech: [mechInfoOverride(false)] } },
    "human",
  );
  page.panel.ensurePanel();
  const toggle = page.root.querySelector(".script_autoMech");
  toggle.checked = true;
  toggle.dispatch("change");
  assert.equal(page.settings.readRaw().autoMech, true);
  assert.equal(page.effectiveSettings.autoMech, false);
  assert.equal(
    page.notes().length,
    0,
    "the raw enable callback leaves Mech Info hidden when the effective value stays false",
  );
}

{
  const page = createMechInfoPanel(
    { autoMech: true, overrides: { autoMech: [mechInfoOverride(true)] } },
    "human",
  );
  page.panel.ensurePanel();
  assert.equal(page.notes().length, 1);
  const toggle = page.root.querySelector(".script_autoMech");
  toggle.checked = false;
  toggle.dispatch("change");
  assert.equal(page.settings.readRaw().autoMech, false);
  assert.equal(page.effectiveSettings.autoMech, true);
  assert.equal(
    page.notes().length,
    1,
    "the raw disable callback keeps Mech Info visible when the effective value stays true",
  );
}

{
  const page = createMechInfoPanel(
    { autoMech: true, overrides: { autoMech: [mechInfoOverride(false)] } },
    "elf",
  );
  page.panel.ensurePanel();
  assert.equal(page.notes().length, 1);

  page.gameRoot.race.species = "human";
  page.refreshEffectiveSettings();
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().autoMech, true);
  assert.equal(page.effectiveSettings.autoMech, false);
  assert.equal(
    page.notes().length,
    0,
    "a dynamic effective true-to-false transition removes Mech Info rows",
  );
  assert.ok(page.mechObserver().disconnectCount > 0);
}

{
  const page = createMechInfoPanel(
    { autoMech: true, overrides: { autoMech: [mechInfoOverride(false)] } },
    "human",
  );
  page.panel.ensurePanel();
  assert.equal(page.effectiveSettings.autoMech, false);
  assert.equal(page.notes().length, 0);
  const originalRows = [...page.list.children];

  page.gameRoot.race.species = "elf";
  page.refreshEffectiveSettings();
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().autoMech, true);
  assert.equal(page.effectiveSettings.autoMech, true);
  assert.equal(page.notes().length, 1);
  assert.deepEqual(
    [...page.list.children],
    originalRows,
    "Mech Info appears on effective false-to-true without a mech-list redraw",
  );
}

// --- captured Mech settings render once and persist through the shared lifecycle ----------------

{
  const page = createPage(
    JSON.stringify({ autoMech: false, mechBuild: "none" }),
  );
  page.panel.ensurePanel();
  assert.equal(page.root.querySelectorAll("#script_mechSettings").length, 1);
  const buildMode = page.root.querySelectorAll(".script_mechBuild")[0];
  assert.ok(buildMode, "the captured Mech settings section exposes build mode");
  const gravitySize = page.root.querySelectorAll(".script_mechSizeGravity")[0];
  assert.ok(
    gravitySize,
    "the captured Mech settings section exposes gravity size",
  );
  assert.equal(gravitySize.value, "auto");
  gravitySize.value = "large";
  gravitySize.dispatch("change");
  assert.equal(page.settings.readRaw().mechSizeGravity, "large");
  buildMode.value = "user";
  buildMode.dispatch("change");
  assert.equal(page.settings.readRaw().mechBuild, "user");
  assert.equal(JSON.parse(page.storage.writes()).mechBuild, "user");
  page.panel.ensurePanel();
  assert.equal(
    page.root.querySelectorAll("#script_mechSettings").length,
    1,
    "repeated panel discovery must not add another Mech section",
  );
}

// --- active Mech overrides reach the captured Mech planner --------------------------------------

{
  const page = createPage(
    JSON.stringify({
      autoMech: true,
      mechBuild: "random",
      overrides: {
        mechBuild: [
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: "user",
          },
        ],
      },
    }),
  );
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().mechBuild, "random");
  assert.equal(page.effectiveSettings.mechBuild, "user");
  page.gameRoot.settings = { qKey: false, keyMap: { q: "q" } };
  page.gameRoot.portal = {
    mechbay: {
      max: 10,
      bay: 0,
      active: 0,
      scouts: 0,
      mechs: [],
      blueprint: {
        size: "small",
        chassis: "tread",
        hardpoint: ["laser"],
        equip: [],
        infernal: false,
      },
    },
    purifier: { supply: 75_000, sup_max: 100_000 },
  };
  page.gameRoot.resource = { Soul_Gem: { amount: 1 } };
  const assembly = {
    elementId: "mechAssembly",
    generation: 1,
    methods: ["build", "bay", "price", "soul"],
  };
  const controls = {
    resolve: (id) => (id === "mechAssembly" ? assembly : undefined),
    invoke: (_handle, method) => {
      if (method === "bay") return { ok: true, value: 1 };
      if (method === "price") return { ok: true, value: 75_000 };
      if (method === "soul") return { ok: true, value: 1 };
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["mechAssembly"],
  };
  const mech = createCapturedMech({
    rootState: {
      readRoot: () => page.gameRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => page.effectiveSettings,
    keyState: { readPressed: () => false },
  });
  assert.deepEqual(planCapturedMechBuild(mech.reader.read()), {
    kind: "build-captured-mech",
    designSize: "small",
    expectedBaySpace: 10,
    expectedPurifierSupply: 75_000,
    expectedSoulGems: 1,
  });
}

// --- the captured Mech reset uses lifecycle defaults and removes its overrides ------------------

{
  const page = createPage(
    JSON.stringify({
      autoMech: true,
      mechBuild: "none",
      mechSizeGravity: "large",
      overrides: {
        mechBuild: [
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: "user",
          },
        ],
      },
    }),
  );
  page.panel.ensurePanel();
  page.root.querySelectorAll("#script_resetmech")[0].dispatch("click");
  assert.equal(page.settings.readRaw().autoMech, false);
  assert.equal(page.settings.readRaw().mechBuild, "random");
  assert.equal(page.settings.readRaw().mechSizeGravity, "auto");
  assert.equal(
    page.root.querySelectorAll(".script_mechSizeGravity")[0].value,
    "auto",
  );
  assert.equal(page.settings.readRaw().overrides.mechBuild, undefined);
  const persisted = JSON.parse(page.storage.writes());
  assert.equal(persisted.mechBuild, "random");
  assert.equal(persisted.mechSizeGravity, "auto");
  assert.equal(persisted.overrides.mechBuild, undefined);
  assert.equal(
    page.root.querySelectorAll(".script_autoMech")[0].checked,
    false,
  );
}

// --- the captured Mech Info callback safely handles an absent lab list --------------------------

{
  const { panel, logged, diagnostics } = createPage(
    JSON.stringify({ autoMech: true }),
  );
  panel.ensurePanel();
  assert.equal(
    diagnostics.some((line) => line.includes("mech info panel")),
    false,
    "the captured Mech Info section is no longer an unported placeholder",
  );
  assert.deepEqual(logged, []);
}

console.log("captured-settings-panel-mech passed");
