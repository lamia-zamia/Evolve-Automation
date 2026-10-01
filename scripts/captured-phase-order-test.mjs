import assert from "node:assert/strict";

import {
  assertRunsBefore,
  runCapturedPhaseOrderCycle,
} from "./captured-phase-order-fixture.mjs";
import { element } from "./dom-fixture.mjs";

const GALAXY_BUY_IDS = [
  "Deuterium",
  "Neutronium",
  "Adamantite",
  "Elerium",
  "Nano_Tube",
  "Graphene",
  "Stanene",
  "Bolognium",
  "Vitreloy",
];
const GALAXY_SELL_IDS = [
  "Helium_3",
  "Copper",
  "Iron",
  "Oil",
  "Titanium",
  "Lumber",
  "Aluminium",
  "Uranium",
  "Infernite",
];

function resource(amount, max, extra = {}) {
  return {
    amount,
    max,
    diff: 0,
    display: true,
    stackable: true,
    value: 1,
    trade: 0,
    ...extra,
  };
}

/**
 * The resource prologue in one save: Gather through Storage and Replicator. Every phase here is
 * enabled and every stub mutates the same live root, so the trace is the executed order.
 */
function runResourcePrologue() {
  const root = {
    race: {
      smoldering: true,
      warlord: true,
      replicator: {},
      casting: {
        farmer: 0,
        miner: 0,
        lumberjack: 0,
        science: 0,
        factory: 0,
        army: 0,
        hunting: 0,
        crafting: 0,
        total: 0,
      },
      governor: {
        tasks: { t0: "none" },
        config: {
          replicate: {
            pow: { on: false, cap: 10000 },
            res: { que: true, neg: true, cap: true },
          },
        },
      },
    },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showMarket: true,
      showResearch: true,
    },
    tech: {
      smelting: 2,
      titanium: 1,
      tau_roid: 5,
      replicator: 1,
      magic: 4,
      alchemy: 2,
    },
    genes: {},
    stats: {},
    city: {
      market: { qty: 1, mtrade: 1, trade: 0 },
      smelter: {
        count: 2,
        cap: 2,
        Star: 0,
        Iron: 2,
        Steel: 0,
        Iridium: 0,
        Coal: 2,
        Oil: 0,
        Wood: 0,
        Inferno: 0,
        Super: 0,
      },
      rock_quarry: { count: 4, asbestos: 50 },
      library: { count: 0 },
    },
    space: { titan_mine: { count: 2, ratio: 50 }, iron_ship: { on: 0 } },
    interstellar: {
      mining_droid: { count: 1, on: 6, adam: 0, uran: 0, coal: 0, alum: 0 },
    },
    tauceti: { mining_ship: { count: 1, common: 50, uncommon: 50, rare: 50 } },
    civic: {
      miner: { workers: 1 },
      priest: { workers: 0 },
      cement_worker: { workers: 1 },
      garrison: { workers: 10, max: 10, crew: 0 },
    },
    portal: {
      minions: { spawns: 1500 },
      throne: { enemy: [{ f: 100 }] },
    },
    galaxy: {
      trade: {
        max: 3,
        cur: 0,
        ...Object.fromEntries(
          GALAXY_BUY_IDS.map((_, index) => [`f${index}`, 0]),
        ),
      },
    },
    queue: { display: false, pause: false, queue: [] },
    resource: Object.fromEntries(
      [
        ...GALAXY_BUY_IDS,
        ...GALAXY_SELL_IDS,
        "Chrysotile",
        "Crates",
        "Containers",
        "Iron",
        "Steel",
        "Titanium",
        "Coal",
        "Stone",
        "Aluminium",
        "Adamantite",
        "Iridium",
        "Neutronium",
        "Orichalcum",
        "Elerium",
        "Plywood",
        "Wood",
        "Food",
        "Lumber",
        "Oil",
        "Asphodel_Powder",
        "Super_Fuel",
        "Population",
        "Money",
        "Knowledge",
        "Nano_Tube",
        "Graphene",
        "Mana",
        "Crystal",
        "Stanene",
        "Bolognium",
        "Vitreloy",
        "Deuterium",
        "Helium_3",
        "Uranium",
        "Infernite",
        "Copper",
      ].map((id) => [
        id,
        resource(id === "Crates" || id === "Containers" ? 2 : 50, 500, {
          ...(id === "Crates" || id === "Containers"
            ? { stackable: false }
            : {}),
          ...(id === "Population" ? { max: 500 } : {}),
        }),
      ]),
    ),
  };
  root.resource.Oil.display = false;
  root.resource.Super_Fuel.display = false;
  root.resource.Iron.crates = 0;
  root.resource.Iron.containers = 0;
  root.resource.Iron.max = 100;
  root.resource.Iron.amount = 50;
  root.resource.Iron.diff = 0;
  root.resource.Steel.amount = 0;
  root.resource.Steel.max = 100;
  root.resource.Steel.diff = 10;
  root.resource.Coal.amount = 1000;
  root.resource.Coal.max = 2000;
  root.resource.Coal.diff = 100;
  root.resource.Titanium.amount = 10;
  root.resource.Titanium.max = 100;
  // The three ratios move only when one side of each pair is the emptier pool.
  root.resource.Chrysotile.amount = 0;
  root.resource.Stone.amount = 500;
  root.resource.Adamantite.amount = 0;
  root.resource.Aluminium.amount = 500;
  root.resource.Iridium.amount = 0;
  root.resource.Neutronium.amount = 500;
  root.resource.Orichalcum.amount = 0;
  root.resource.Elerium.amount = 500;
  root.resource.Mana.amount = 100;
  root.resource.Mana.max = 100;
  root.resource.Mana.diff = 10;
  root.resource.Crystal.amount = 10;
  root.resource.Crystal.max = 100;
  root.resource.Crystal.diff = 0;

  const settings = {
    buildingAlwaysClick: true,
    buildingClickPerTick: 2,
    autoMarket: true,
    autoHell: true,
    warlordHandleFortress: true,
    warlordMinimumMinions: 1000,
    autoGalaxyMarket: true,
    marketMinIngredients: 0.5,
    ...Object.fromEntries(
      GALAXY_BUY_IDS.flatMap((id, index) => [
        [`res_galaxy_w_${id}`, 1],
        [`res_galaxy_p_${id}`, index + 1],
      ]),
    ),
    autoMiningDroid: true,
    autoPylon: true,
    productionRitualManaUse: 0.5,
    productionRitualSafe: true,
    spell_w_farmer: 1,
    spell_w_hunting: 10,
    autoQuarry: true,
    autoMine: true,
    autoExtractor: true,
    productionChrysotileWeight: 1,
    autoSmelter: true,
    productionSmelting: "steel",
    autoStorage: true,
    storageLimitPreMad: true,
    res_storageIron: true,
    res_storage_p_Iron: 0,
    res_min_storeIron: 1,
    res_max_storeIron: -1,
    autoReplicator: true,
    replicatorWeightingMode: "mass",
    replicator_p_Elerium: 2,
    sellIron: true,
    res_sell_r_Iron: 0.2,
  };

  return runCapturedPhaseOrderCycle({
    root,
    settings,
    documentSetup: ({ body }) => {
      const city = element("div", { id: "city" });
      const food = element("div", { id: "city-food" });
      food.classList.add("action");
      city.append(food);
      body.append(city);
    },
    controls: {
      "city-food": {
        event: "gather",
        methods: {
          action() {
            root.resource.Food.amount += 1;
          },
        },
      },
      "market-qty": {
        event: "market",
        data: root.city.market,
        methods: {
          setQty() {},
        },
      },
      "market-Food": {
        event: "market",
        methods: {
          autoBuy() {},
          autoSell() {},
          zero() {},
          purchase() {
            root.resource.Food.amount += root.city.market.qty;
            root.resource.Money.amount -= root.city.market.qty;
          },
          sell() {
            root.resource.Food.amount -= root.city.market.qty;
            root.resource.Money.amount += root.city.market.qty;
          },
        },
      },
      "market-Iron": {
        event: "market",
        methods: {
          autoBuy() {},
          autoSell() {},
          zero() {},
          purchase() {},
          sell() {
            root.resource.Iron.amount -= root.city.market.qty;
            root.resource.Money.amount += root.city.market.qty;
          },
        },
      },
      fort: {
        event: "hell",
        methods: {
          attack(index) {
            root.portal.throne.enemy.splice(index, 1);
          },
        },
      },
      galaxyTrade: {
        event: "galaxyMarket",
        methods: {
          more(index) {
            root.galaxy.trade[`f${index}`] += 1;
            root.galaxy.trade.cur += 1;
          },
          less(index) {
            root.galaxy.trade[`f${index}`] -= 1;
            root.galaxy.trade.cur -= 1;
          },
        },
      },
      iDroid: {
        event: "miningDroid",
        methods: {
          addItem(id) {
            root.interstellar.mining_droid[id] += 1;
          },
          subItem(id) {
            root.interstellar.mining_droid[id] -= 1;
          },
        },
      },
      iGraphene: {
        event: "graphene",
        methods: {
          addWood() {
            root.interstellar.g_factory.Lumber += 1;
          },
          subWood() {
            root.interstellar.g_factory.Lumber -= 1;
          },
          addCoal() {
            root.interstellar.g_factory.Coal += 1;
          },
          subCoal() {
            root.interstellar.g_factory.Coal -= 1;
          },
          addOil() {
            root.interstellar.g_factory.Oil += 1;
          },
          subOil() {
            root.interstellar.g_factory.Oil -= 1;
          },
        },
      },
      iPylon: {
        event: "pylon",
        methods: {
          addSpell(id) {
            root.race.casting[id] += 1;
            root.race.casting.total += 1;
          },
          subSpell(id) {
            root.race.casting[id] = Math.max(0, root.race.casting[id] - 1);
            root.race.casting.total = Math.max(0, root.race.casting.total - 1);
          },
        },
      },
      iQuarry: {
        event: "quarry",
        methods: {
          add() {
            root.city.rock_quarry.asbestos += 1;
          },
          sub() {
            root.city.rock_quarry.asbestos -= 1;
          },
        },
      },
      iTMine: {
        event: "mine",
        methods: {
          add() {
            root.space.titan_mine.ratio += 1;
          },
          sub() {
            root.space.titan_mine.ratio -= 1;
          },
        },
      },
      iMiningShip: {
        event: "extractor",
        methods: {
          add(id) {
            root.tauceti.mining_ship[id] += 1;
          },
          sub(id) {
            root.tauceti.mining_ship[id] -= 1;
          },
        },
      },
      iSmelter: {
        event: "smelter",
        methods: {
          addFuel(id) {
            root.city.smelter[id] += 1;
          },
          subFuel(id) {
            root.city.smelter[id] -= 1;
          },
          addMetal(id) {
            root.city.smelter[id] += 1;
          },
          subMetal(id) {
            root.city.smelter[id] -= 1;
          },
        },
      },
      createHead: {
        event: "storage",
        methods: {
          buildCrateDesc: () => "Build 1 Plywood crate for 350 storage",
          buildContainerDesc: () => "Build 125 Steel container for 800 storage",
          crate() {
            root.resource.Plywood.amount -= 10;
            root.resource.Crates.amount -= 1;
          },
          container() {
            root.resource.Steel.amount -= 125;
            root.resource.Containers.amount -= 1;
          },
        },
      },
      "stack-Iron": {
        event: "storage",
        methods: {
          addCrate() {
            root.resource.Crates.amount -= 1;
            root.resource.Iron.crates += 1;
            root.resource.Iron.max += 350;
          },
          subCrate() {
            root.resource.Crates.amount += 1;
            root.resource.Iron.crates -= 1;
            root.resource.Iron.max -= 350;
          },
          addCon() {},
          subCon() {},
        },
      },
      iReplicator: {
        event: "replicator",
        methods: {
          setVal(id) {
            root.race.replicator.res = id;
          },
        },
      },
    },
  });
}

/**
 * Mining Droid through Pylon: the three resource-conversion phases that sit between Galaxy Market
 * and the production ratios, plus Alchemy's mana ledger the Pylon then re-reads.
 *
 * The save is a separate one because the Graphene adapter stands down for a warlord or a True Path
 * race (`captured-graphene.ts`), and the resource prologue needs the warlord to reach the Hell
 * fortress control its own Hell assertion reads. Nothing here is otherwise state-dependent, so the
 * two fixtures between them cover the whole conversion block.
 */
function runMagicProductionChain() {
  const root = {
    race: {
      casting: {
        farmer: 0,
        miner: 0,
        lumberjack: 0,
        science: 0,
        factory: 0,
        army: 0,
        hunting: 0,
        crafting: 0,
        total: 0,
      },
      alchemy: { Iron: 0, Copper: 0 },
    },
    tech: { magic: 4, roguemagic: 4, alchemy: 2 },
    genes: {},
    stats: {},
    settings: { civTabs: 1, spaceTabs: 0, showCity: true },
    civic: {
      priest: { workers: 0 },
      cement_worker: { workers: 1 },
    },
    city: { biome: "plains", ptrait: [] },
    interstellar: {
      mining_droid: { count: 1, on: 6, adam: 0, uran: 0, coal: 0, alum: 0 },
      g_factory: { count: 1, on: 4, Lumber: 0, Coal: 0, Oil: 0 },
    },
    queue: { display: false, pause: false, queue: [] },
    resource: {
      Graphene: { amount: 0, max: 1000, diff: 0, display: true },
      Lumber: { amount: 1000, max: 1000, diff: 100, display: true },
      Coal: { amount: 1000, max: 1000, diff: 100, display: true },
      Oil: { amount: 1000, max: 1000, diff: 100, display: true },
      Iron: { amount: 10, max: 1000, diff: 0, display: true },
      Copper: { amount: 10, max: 1000, diff: 0, display: true },
      Adamantite: { amount: 0, max: 1000, diff: 0, display: true },
      Uranium: { amount: 0, max: 1000, diff: 0, display: true },
      Aluminium: { amount: 0, max: 1000, diff: 0, display: true },
      Mana: { amount: 100, max: 100, diff: 10 },
      Crystal: { amount: 10, max: 100, diff: 0 },
      Population: { amount: 4, max: 10, diff: 0, display: true },
      Food: { amount: 100, max: 1000, diff: 0, display: true },
    },
  };

  return runCapturedPhaseOrderCycle({
    root,
    settings: {
      autoMiningDroid: true,
      autoGraphenePlant: true,
      autoAlchemy: true,
      autoPylon: true,
      magicAlchemyManaUse: 0.5,
      res_alchemy_Iron: true,
      res_alchemy_Copper: true,
      res_alchemy_w_Iron: 2,
      res_alchemy_w_Copper: 1,
      productionRitualManaUse: 0.5,
      productionRitualSafe: true,
      spell_w_farmer: 1,
      spell_w_hunting: 10,
    },
    controls: {
      iDroid: {
        event: "miningDroid",
        methods: {
          addItem(id) {
            root.interstellar.mining_droid[id] += 1;
          },
          subItem(id) {
            root.interstellar.mining_droid[id] -= 1;
          },
        },
      },
      iGraphene: {
        event: "graphene",
        methods: {
          addWood() {
            root.interstellar.g_factory.Lumber += 1;
          },
          subWood() {
            root.interstellar.g_factory.Lumber -= 1;
          },
          addCoal() {
            root.interstellar.g_factory.Coal += 1;
          },
          subCoal() {
            root.interstellar.g_factory.Coal -= 1;
          },
          addOil() {
            root.interstellar.g_factory.Oil += 1;
          },
          subOil() {
            root.interstellar.g_factory.Oil -= 1;
          },
        },
      },
      alchemyIron: {
        event: "alchemy",
        methods: spellControls(root),
      },
      alchemyCopper: {
        event: "alchemy",
        methods: spellControls(root),
      },
      iPylon: {
        event: "pylon",
        methods: {
          addSpell(id) {
            root.race.casting[id] += 1;
            root.race.casting.total += 1;
          },
          subSpell(id) {
            root.race.casting[id] = Math.max(0, root.race.casting[id] - 1);
            root.race.casting.total = Math.max(0, root.race.casting.total - 1);
          },
        },
      },
    },
  });
}

/**
 * Alchemy's own capture contract: the adapter re-reads `resource.Mana.diff` before every spell and
 * refuses a plan whose mana ledger moved, so the stub has to keep the ledger in step the way the
 * game does. The same two methods serve every `alchemy<Resource>` row; the resource is the
 * invocation's own argument.
 */
function spellControls(root) {
  return {
    addSpell(id) {
      root.race.alchemy[id] += 1;
      root.resource.Mana.diff -= 1;
    },
    subSpell(id) {
      root.race.alchemy[id] -= 1;
      root.resource.Mana.diff += 1;
    },
  };
}

const magic = runMagicProductionChain();
assert.deepEqual(
  magic.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(magic.errors),
);
assertRunsBefore(assert, magic.trace, "miningDroid", "graphene");
assertRunsBefore(assert, magic.trace, "graphene", "alchemy");
assertRunsBefore(assert, magic.trace, "alchemy", "pylon");
// Alchemy spends mana the Pylon phase then re-reads, and the Pylon's own ritual total moved.
assert.ok(
  magic.root.resource.Mana.diff < 10,
  "the Alchemy phase must spend the mana the Pylon phase reads",
);
assert.ok(magic.root.race.casting.total > 0, "Pylon must act");

const prologue = runResourcePrologue();
assert.deepEqual(
  prologue.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(prologue.errors),
);
assertRunsBefore(assert, prologue.trace, "gather", "market");
assertRunsBefore(assert, prologue.trace, "market", "hell");
assertRunsBefore(assert, prologue.trace, "hell", "galaxyMarket");
assertRunsBefore(assert, prologue.trace, "miningDroid", "pylon");
assertRunsBefore(assert, prologue.trace, "pylon", "quarry");
assertRunsBefore(assert, prologue.trace, "quarry", "mine");
assertRunsBefore(assert, prologue.trace, "mine", "extractor");
assertRunsBefore(assert, prologue.trace, "extractor", "smelter");
assertRunsBefore(assert, prologue.trace, "smelter", "storage");
assertRunsBefore(assert, prologue.trace, "storage", "replicator");

const FLEET_SHIPS = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const FLEET_REGIONS = [
  "gxy_gateway",
  "gxy_stargate",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];
const MECH_FIGURES = {
  small: { supply: 75_000, gems: 1, space: 2, mounts: 1, slots: 1 },
  medium: { supply: 180_000, gems: 4, space: 5, mounts: 2, slots: 2 },
};

/**
 * Trigger through Mech in one late-game save: construction, the Jobs/Craftsmen family, the Fleet
 * reassignment and a Mech build. `activeTrigger` decides whether the trigger's own click happens,
 * which is also what decides whether Research and Build run at all.
 */
function runProgressionChain({ activeTrigger }) {
  const root = {
    race: {},
    tech: { "polymer-reserve": 0, piracy: 1 },
    genes: {},
    stats: { attacks: 0, achieve: {} },
    blood: {},
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
      showPortal: false,
      qKey: false,
      keyMap: { q: "q" },
    },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      craftsman: { workers: 0, max: 0, display: false },
      garrison: {
        display: true,
        workers: 0,
        max: 3,
        crew: 0,
        m_use: 0,
        mercs: true,
      },
      foreign: {
        gov0: {
          mil: 10,
          spy: 3,
          occ: false,
          // Annexed under a Sabotage policy: the Espionage phase releases it, which is the one
          // path that both succeeds and leaves the cycle free for Battle.
          anx: true,
          buy: false,
          hstl: 0,
          unrest: 0,
          eco: 1,
          trn: 0,
          act: "",
        },
      },
      govern: { type: "democracy" },
    },
    city: {
      biome: "plains",
      ptrait: [],
      foundry: {
        count: 0,
        Plywood: 0,
        Brick: 0,
        crafting: 0,
        rcap: { Plywood: 2, Brick: 2 },
      },
      factory: {
        count: 1,
        on: 0,
        Lux: 1,
        Furs: 0,
        Alloy: 0,
        Polymer: 0,
        Nano: 0,
        Stanene: 0,
      },
    },
    portal: undefined,
    galaxy: {
      defense: Object.fromEntries(
        FLEET_REGIONS.map((region) => [
          region,
          Object.fromEntries(
            FLEET_SHIPS.map((ship) => [
              ship,
              region === "gxy_gateway" && ship === "corvette_ship" ? 2 : 0,
            ]),
          ),
        ]),
      ),
      ...Object.fromEntries(
        FLEET_SHIPS.map((ship) => [
          ship,
          { count: ship === "corvette_ship" ? 2 : 0 },
        ]),
      ),
      bolognium_ship: { on: 1 },
    },
    queue: { display: true, pause: false, queue: [] },
    resource: {
      Population: { amount: 4, max: 10, display: true, diff: 0 },
      Knowledge: { amount: 100, max: 1000, display: true, diff: 10 },
      Money: { amount: 1000, max: 10000, display: true, diff: 10 },
      Polymer: { amount: 100, max: 1000, display: true, diff: 1 },
      Plywood: { amount: 100, max: 1000, display: true, diff: 0 },
      Brick: { amount: 0, max: 1000, display: true, diff: 0 },
      Iron: { amount: 100, max: 1000, display: true, diff: 0 },
      Furs: { amount: 100, max: 1000, display: true, diff: 0 },
      Alloy: { amount: 100, max: 1000, display: true, diff: 0 },
      Nano_Tube: { amount: 100, max: 1000, display: true, diff: 0 },
      Stanene: { amount: 100, max: 1000, display: true, diff: 0 },
      Lumber: { amount: 100, max: 1000, display: true, diff: 0 },
      Oil: { amount: 100, max: 1000, display: true, diff: 0 },
      Copper: { amount: 100, max: 1000, display: true, diff: 0 },
      Aluminium: { amount: 100, max: 1000, display: true, diff: 0 },
      Coal: { amount: 100, max: 1000, display: true, diff: 0 },
      Neutronium: { amount: 100, max: 1000, display: true, diff: 0 },
      Bolognium: { amount: 0, max: 1000, display: true, diff: 0 },
      Soul_Gem: { amount: 500, max: 5000, diff: 0, display: true },
      Supply: { amount: 0, max: 2_000_000, diff: 5_000, display: false },
    },
  };

  const cityPanel = element("div", { id: "city" });
  const portalPanel = element("div", { id: "portal" });
  const researchPanel = element("div", { id: "tech" });
  const researchRow = element("div");
  researchRow.classList.add("action");
  researchRow.id = "tech-polymer-reserve";
  const price = element("button");
  price.classList.add("button", "res-Polymer");
  price.attributes.set("data-polymer", 1);
  researchRow.append(price);
  researchPanel.append(researchRow);

  return runCapturedPhaseOrderCycle({
    root,
    mount: true,
    documentSetup: ({ body }) => {
      body.append(cityPanel, portalPanel, researchPanel);
    },
    settings: {
      autoTrigger: true,
      autoResearch: true,
      autoBuild: true,
      autoFactory: true,
      autoJobs: true,
      autoCraftsmen: true,
      jobManageServants: true,
      job_unemployed: true,
      job_farmer: true,
      job_b1_unemployed: 0,
      job_b2_unemployed: 0,
      job_b3_unemployed: 0,
      job_b1_farmer: -1,
      job_b2_farmer: -1,
      job_b3_farmer: -1,
      productionCraftsmen: "always",
      craftPlywood: true,
      job_Plywood: true,
      foundry_w_Plywood: 1,
      craftBrick: true,
      job_Brick: true,
      foundry_w_Brick: 1,
      "batcity-foundry": true,
      "bld_w_city-foundry": 100,
      autoFleet: true,
      fleetCrewReclaim: true,
      fleetMaxCover: true,
      mechBaysFirst: false,
      triggers: [
        {
          priority: 0,
          requirementType: "BuildingCount",
          requirementId: "city-foundry",
          requirementCount: activeTrigger ? 0 : 1,
          actionType: "build",
          actionId: "city-foundry",
          actionCount: 1,
        },
      ],
    },
    controls: {
      "#mainColumn div.content": {
        methods: {
          swapTab(index) {
            root.settings.civTabs = index;
          },
        },
      },
      mTabCivil: {
        methods: {
          swapTab(index) {
            root.settings.spaceTabs = index;
          },
        },
      },
      buildQueue: {
        methods: {
          setData() {
            return { ok: true, value: { "data-Money": 10 } };
          },
        },
      },
      "tech-polymer-reserve": {
        event: "research",
        methods: {
          action() {
            root.tech["polymer-reserve"] = 1;
            if (cityPanel.querySelectorAll("#city-foundry").length > 0) return;
            const row = element("div", { id: "city-foundry" });
            row.classList.add("action");
            cityPanel.append(row);
          },
        },
      },
      "city-foundry": {
        event: activeTrigger ? "trigger" : "build",
        data: { act: root.city.foundry },
        methods: {
          action() {
            root.city.foundry.count += 1;
            root.city.foundry.cap = 2;
            root.civic.craftsman.max = 2;
            root.civic.craftsman.display = true;
          },
        },
      },
      iFactory: {
        event: "factory",
        methods: {
          addItem(id) {
            root.city.factory[id] += 1;
          },
          subItem(id) {
            root.city.factory[id] -= 1;
          },
        },
      },
      "civ-unemployed": {
        event: "jobs",
        methods: {
          add() {},
          sub() {},
          setDefault(id) {
            root.civic.d_job = id;
          },
        },
      },
      "civ-farmer": {
        event: "jobs",
        methods: {
          add() {},
          sub() {},
          setDefault(id) {
            root.civic.d_job = id;
          },
        },
      },
      foundry: {
        event: "jobs",
        methods: {
          add(id) {
            root.city.foundry[id] += 1;
          },
          sub(id) {
            root.city.foundry[id] -= 1;
          },
        },
      },
      resPlywood: {
        methods: { craftCost: () => "<div>Lumber 100</div>", craft() {} },
      },
      resBrick: {
        methods: { craftCost: () => "<div>Lumber 50</div>", craft() {} },
      },
      fleet: {
        event: "fleet",
        methods: {
          add(region, ship) {
            root.galaxy.defense[region][ship] += 1;
          },
          sub(region, ship) {
            root.galaxy.defense[region][ship] -= 1;
          },
        },
      },
    },
  });
}

const triggered = runProgressionChain({ activeTrigger: true });
assert.deepEqual(
  triggered.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(triggered.errors),
);
// A trigger click is the first mutation of the cycle and suppresses Research and Build entirely.
assert.equal(triggered.trace[0], "trigger", JSON.stringify(triggered.trace));
assert.equal(
  triggered.trace.includes("research"),
  false,
  JSON.stringify(triggered.trace),
);
assert.equal(
  triggered.trace.includes("build"),
  false,
  JSON.stringify(triggered.trace),
);

const untriggered = runProgressionChain({ activeTrigger: false });
assert.deepEqual(
  untriggered.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(untriggered.errors),
);
// With no trigger click, Research is the first mutation of the cycle. Together with the trace
// above — where the trigger's own click is first — this places the Trigger gate ahead of
// Research: no save can put a later phase's mutation in front of one of these two.
assert.equal(
  untriggered.trace[0],
  "research",
  JSON.stringify(untriggered.trace),
);
assertRunsBefore(assert, untriggered.trace, "research", "build");
assertRunsBefore(assert, untriggered.trace, "build", "factory");
assertRunsBefore(assert, untriggered.trace, "factory", "jobs");
assertRunsBefore(assert, untriggered.trace, "jobs", "fleet");
assertRunsBefore(assert, triggered.trace, "trigger", "factory");
assertRunsBefore(assert, triggered.trace, "jobs", "fleet");

/**
 * Storage's technology target and the Replicator's demand sample, over the Storage allocation
 * debounce.
 *
 * Elerium holds 100 of a maximum 100 while one real Research offer in the drawn `#tech` panel costs
 * 400 Elerium. Auto Research is on, so `readTechnologyTargets()` is enabled, and the offer is
 * unaffordable on purpose, so Research never buys it and the offer — and its 400 — survives every
 * cycle. The build queue is empty and the research queue already holds that same offer, which is
 * what makes the route distinction visible:
 *
 * - Storage reads the offer's full cost through its technology target source and
 *   `CapturedDemandSample.storageRequired`, both of which take 400 as it stands. One free crate of
 *   the fixture's 350 capacity raises the maximum to 450, past the target.
 * - `createCapturedQueueReservationSource()` cannot be that source while the maximum is 100:
 *   `couldBeStored()` drops a target the game's own `checkMaxCosts` cannot hold, so the queue route
 *   reads nothing until the crate exists.
 *
 * So the shared sample the earlier phases froze holds no Elerium request at all
 * (`requestedQuantity` 0, `isDemanded` false) and Replicator answers from the Iron it does know. The
 * runtime ends that sample at Storage's phase boundary, Replicator takes a fresh one, the queue
 * reservation is now storable, and `requestedQuantity` becomes `min(400, 450) = 400` against an
 * unchanged holding of 100 — which promotes Elerium to a demanded priority of `100 * 1` above
 * Iron's `2 * 2`. Remove the two assignments that end the sample after Storage and Replicator keeps
 * answering from the frozen one.
 *
 * `offeredTechnology: false` runs the identical save with no `#tech` row. Nothing else in this save
 * can hold Elerium, so Storage never expands, the queue route stays unstorable and Replicator never
 * moves: that is what pins the expansion to the offered technology.
 */
function runStorageReplicatorDemand({ offeredTechnology }) {
  const decisions = [];
  const root = {
    race: {
      replicator: {},
      governor: {
        tasks: { t0: "none" },
        config: {
          replicate: {
            pow: { on: false, cap: 10000 },
            res: { que: true, neg: true, cap: true },
          },
        },
      },
    },
    tech: { replicator: 1, "elerium-reserve": 0, r_queue: 1 },
    genes: {},
    stats: {},
    settings: {
      civTabs: 3,
      spaceTabs: 0,
      showCity: true,
      showStorage: true,
      qKey: false,
      keyMap: {},
      qAny: false,
      qAny_res: false,
    },
    queue: { display: false, pause: false, queue: [] },
    r_queue: {
      display: true,
      pause: false,
      queue: [
        { id: "tech-elerium-reserve", label: "Elerium Reserve", req: true },
      ],
    },
    resource: {
      Population: { amount: 4, max: 10, display: true, diff: 0 },
      Food: { amount: 100, max: 1000, display: true, diff: 1 },
      Lumber: { amount: 500, max: 1000, display: true, diff: 10 },
      Stone: { amount: 500, max: 1000, display: true, diff: 10 },
      Chrysotile: { amount: 500, max: 1000, display: true, diff: 10 },
      Furs: { amount: 0, max: 1000, display: false, diff: 0 },
      Mana: { amount: 100, max: 100, display: true, diff: 1 },
      Crates: { amount: 1, max: 5, display: true, stackable: false },
      Containers: { amount: 0, max: 5, display: true, stackable: false },
      Plywood: { amount: 100, max: 1000, display: true, stackable: false },
      Steel: { amount: 100, max: 1000, display: true, stackable: false },
      Knowledge: { amount: 100, max: 1000, display: true, stackable: false },
      Elerium: {
        amount: 100,
        max: 100,
        display: true,
        stackable: true,
        crates: 0,
        containers: 0,
      },
      Iron: {
        amount: 50,
        max: 1000,
        display: true,
        stackable: true,
        crates: 0,
        containers: 0,
      },
    },
  };

  const researchPanel = element("div", { id: "tech" });
  if (offeredTechnology) {
    const row = element("div");
    row.classList.add("action");
    Object.defineProperty(row, "id", { value: "tech-elerium-reserve" });
    row.attributes = [
      { name: "id", value: "tech-elerium-reserve" },
      { name: "class", value: "action" },
    ];
    const price = element("button");
    Object.defineProperty(price, "id", { value: "" });
    price.attributes = [
      { name: "class", value: "button res-Elerium" },
      { name: "data-elerium", value: "400" },
    ];
    row.append(price);
    researchPanel.append(row);
  }

  return {
    ...runCapturedPhaseOrderCycle({
      root,
      cycles: 3,
      settings: {
        // Gather is the phase that samples demand before anything else runs, so the cycle carries
        // a frozen sample into Storage rather than letting Storage create its own.
        buildingAlwaysClick: true,
        buildingClickPerTick: 2,
        autoStorage: true,
        autoReplicator: true,
        autoResearch: true,
        storageAssignExtra: false,
        res_storageElerium: true,
        res_storage_p_Elerium: 0,
        res_min_storeElerium: 1,
        res_max_storeElerium: -1,
        replicatorWeightingMode: "weight",
        // Elerium alone is left enabled so the two candidates are exactly the managed resource and
        // the resource the phase falls back to. Iron outranks an undemanded Elerium (`2 * 2` against
        // `1 * 1`) and loses to a demanded one (`100 * 1`), so the chosen resource states which
        // sample Replicator read.
        replicator_Plywood: false,
        replicator_p_Iron: 2,
      },
      documentSetup: ({ body }) => {
        const city = element("div", { id: "city" });
        const food = element("div", { id: "city-food" });
        food.classList.add("action");
        city.append(food);
        body.append(researchPanel, city);
      },
      controls: {
        "city-food": {
          event: "gather",
          methods: {
            action() {
              root.resource.Plywood.amount += 1;
            },
          },
        },
        createHead: {
          event: "storage",
          methods: {
            buildCrateDesc: () => "Build 1 Plywood crate for 350 storage",
            buildContainerDesc: () =>
              "Build 125 Steel container for 800 storage",
            crate() {
              root.resource.Plywood.amount -= 10;
              root.resource.Crates.amount -= 1;
            },
            container() {
              root.resource.Steel.amount -= 125;
              root.resource.Containers.amount -= 1;
            },
          },
        },
        "stack-Elerium": {
          event: "storage",
          methods: {
            addCrate() {
              root.resource.Crates.amount -= 1;
              root.resource.Elerium.crates += 1;
              root.resource.Elerium.max += 350;
            },
            subCrate() {
              root.resource.Crates.amount += 1;
              root.resource.Elerium.crates -= 1;
              root.resource.Elerium.max -= 350;
            },
            addCon() {},
            subCon() {},
          },
        },
        "tech-elerium-reserve": {
          event: "research",
          methods: {
            action() {
              root.tech["elerium-reserve"] = 1;
            },
          },
        },
        iReplicator: {
          event: "replicator",
          methods: {
            setVal(id) {
              // The capacity at the moment of the decision is the whole point of this fixture, so
              // record it rather than inferring it from the accumulated trace.
              decisions.push({
                id,
                amount: root.resource.Elerium.amount,
                max: root.resource.Elerium.max,
              });
              root.race.replicator.res = id;
            },
          },
        },
      },
    }),
    decisions,
  };
}

// --- Storage's technology target, then Replicator's refreshed demand ---------------------------
const storageDemand = runStorageReplicatorDemand({ offeredTechnology: true });
// Only the Building-unlock discovery pass reports anything here, and it reports the same
// unavailable tab control every other fixture in this file leaves uncaptured. No phase stopped.
assert.deepEqual(
  storageDemand.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(storageDemand.errors),
);
assert.deepEqual(
  storageDemand.errors,
  [
    "progression skipped building-unlocks city: no captured control for #mainColumn div.content",
  ],
  "Storage must reach its technology target source with the Building catalog unavailable",
);
const demandCycles = storageDemand.cycleTrace.map((entry) => ({
  cycle: entry.cycle,
  trace: entry.trace,
  replicator: entry.invocations
    .filter(
      ({ elementId, method }) =>
        elementId === "iReplicator" && method === "setVal",
    )
    .map(({ args }) => args[0]),
  crates: entry.invocations.filter(({ method }) => method === "addCrate")
    .length,
}));
// The Storage allocation debounce is three consistent ticks, so the grant lands in the third cycle
// and the two before it are the frozen-capacity ones.
assert.deepEqual(
  demandCycles.map(({ replicator, crates }) => ({ replicator, crates })),
  [
    { replicator: ["Iron"], crates: 0 },
    { replicator: ["Iron"], crates: 0 },
    { replicator: ["Elerium"], crates: 1 },
  ],
  JSON.stringify(demandCycles),
);
// Storage reached its own captured action boundary before Replicator's, in the very cycle the
// decision changed.
assertRunsBefore(assert, demandCycles[2].trace, "storage", "replicator");
assertRunsBefore(assert, demandCycles[2].trace, "gather", "replicator");
assert.equal(storageDemand.root.resource.Elerium.max, 450);
assert.equal(storageDemand.root.resource.Elerium.amount, 100);
assert.equal(storageDemand.root.resource.Elerium.crates, 1);
assert.equal(storageDemand.root.resource.Crates.amount, 0);
// The 400 survived the whole run: Research never bought the offer, so the technology target the
// grant came from is still there afterwards.
assert.equal(storageDemand.root.tech["elerium-reserve"], 0);
assert.equal(
  storageDemand.invocations.some(
    ({ elementId, method }) =>
      elementId === "tech-elerium-reserve" && method === "action",
  ),
  false,
  "the unaffordable offer must survive every cycle",
);

const noTechnologyDemand = runStorageReplicatorDemand({
  offeredTechnology: false,
});
assert.deepEqual(
  noTechnologyDemand.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(noTechnologyDemand.errors),
);
assert.deepEqual(
  noTechnologyDemand.cycleTrace.map((entry) =>
    entry.invocations
      .filter(
        ({ elementId, method }) =>
          elementId === "iReplicator" && method === "setVal",
      )
      .map(({ args }) => args[0]),
  ),
  [["Iron"], ["Iron"], ["Iron"]],
  "nothing but the offered technology can hold Elerium in this save",
);
assert.equal(noTechnologyDemand.root.resource.Elerium.max, 100);
assert.equal(noTechnologyDemand.root.resource.Crates.amount, 1);

/**
 * Jobs, Fleet and Mech in a save with no construction. The Mech bay is a portal Building, so this
 * save turns `mechBaysFirst` off and leaves Auto Build off: the Mech phase then reads live bay,
 * purifier and Soul Gem state without the construction unlock catalog standing between it and the
 * facts it prices.
 */
function runFleetMechChain() {
  const root = {
    race: { deconstructor: true },
    tech: { piracy: 1, genetics: 7 },
    genes: {},
    stats: { attacks: 0, achieve: {} },
    blood: {},
    arpa: { sequence: { on: false, boost: false, auto: false } },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
      qKey: false,
      keyMap: { q: "q" },
      arpa: { genetics: true },
    },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      craftsman: { workers: 0, max: 0, display: false },
    },
    city: { biome: "plains", ptrait: [] },
    portal: {
      mechbay: {
        max: 25,
        bay: 0,
        active: 0,
        scouts: 2,
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
      spire: {
        count: 1,
        type: "rocky",
        progress: 0,
        status: { dark: true },
        boss: "water_elm",
      },
    },
    galaxy: {
      defense: Object.fromEntries(
        FLEET_REGIONS.map((region) => [
          region,
          Object.fromEntries(
            FLEET_SHIPS.map((ship) => [
              ship,
              region === "gxy_gateway" && ship === "corvette_ship" ? 2 : 0,
            ]),
          ),
        ]),
      ),
      ...Object.fromEntries(
        FLEET_SHIPS.map((ship) => [
          ship,
          { count: ship === "corvette_ship" ? 2 : 0 },
        ]),
      ),
      bolognium_ship: { on: 1 },
    },
    queue: { display: false, pause: false, queue: [] },
    resource: {
      Population: { amount: 4, max: 10, display: true, diff: 0 },
      Knowledge: { amount: 100, max: 1000, display: true, diff: 10 },
      Money: { amount: 1000, max: 10000, display: true, diff: 10 },
      Soul_Gem: { amount: 500, max: 5000, diff: 0, display: true },
      Supply: { amount: 0, max: 2_000_000, diff: 5_000, display: false },
    },
  };

  return runCapturedPhaseOrderCycle({
    root,
    settings: {
      autoJobs: true,
      jobManageServants: false,
      job_unemployed: true,
      autoCraftsmen: false,
      autoFleet: true,
      fleetCrewReclaim: true,
      fleetMaxCover: true,
      autoMech: true,
      mechBaysFirst: false,
      mechBuild: "random",
      mechSize: "small",
      mechSizeGravity: "auto",
      mechFillBay: false,
      mechScrap: "none",
      mechSaveSupplyRatio: 0,
      autoGenetics: true,
      geneticsSequence: "enabled",
      geneticsBoost: "enabled",
    },
    controls: {
      arpaSequence: {
        event: "genetics",
        methods: {
          toggle() {
            root.arpa.sequence.on = !root.arpa.sequence.on;
          },
          booster() {
            root.arpa.sequence.boost = !root.arpa.sequence.boost;
          },
          auto_seq() {
            root.arpa.sequence.auto = !root.arpa.sequence.auto;
          },
          novo() {},
        },
      },
      "civ-unemployed": {
        event: "jobs",
        methods: {
          add() {},
          sub() {},
          setDefault(id) {
            root.civic.d_job = id;
          },
        },
      },
      fleet: {
        event: "fleet",
        methods: {
          add(region, ship) {
            root.galaxy.defense[region][ship] += 1;
          },
          sub(region, ship) {
            root.galaxy.defense[region][ship] -= 1;
          },
        },
      },
      mechAssembly: {
        events: { setType: "mech" },
        methods: {
          setSize(id) {
            root.portal.mechbay.blueprint.size = id;
          },
          setType(id) {
            root.portal.mechbay.blueprint.chassis = id;
          },
          setWep(id, index) {
            root.portal.mechbay.blueprint.hardpoint[index] = id;
          },
          setEquip(id, index) {
            root.portal.mechbay.blueprint.equip[index] = id;
          },
          bay(id) {
            return { ok: true, value: MECH_FIGURES[id].space };
          },
          price(id) {
            return { ok: true, value: MECH_FIGURES[id].supply };
          },
          soul(id) {
            return { ok: true, value: MECH_FIGURES[id].gems };
          },
          build() {
            const blueprint = root.portal.mechbay.blueprint;
            const figures = MECH_FIGURES[blueprint.size];
            root.portal.mechbay.mechs.push({ size: blueprint.size });
            root.portal.mechbay.bay += figures.space;
            root.portal.mechbay.active += 1;
            root.portal.purifier.supply -= figures.supply;
            root.resource.Soul_Gem.amount -= figures.gems;
          },
        },
      },
      mechList: { methods: { scrap() {} } },
    },
  });
}

const fleetMech = runFleetMechChain();
assert.deepEqual(
  fleetMech.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(fleetMech.errors),
);
assertRunsBefore(assert, fleetMech.trace, "jobs", "fleet");
assertRunsBefore(assert, fleetMech.trace, "fleet", "mech");
// The ARPA genetic sequence the Genetics phase toggles is read again by every Minor Trait purchase
// after it, so Mech's save carries the toggle the later tail phases read.
assertRunsBefore(assert, fleetMech.trace, "mech", "genetics");
assert.ok(fleetMech.root.arpa.sequence.on, "Genetics must act");
// Fleet's own live mutation is what Mech's cycle sees: the fleet roster moved, and the Mech the
// phase then reserved supply for is a different bay from the one an earlier Fleet position left.
// Fleet's own live mutation is what the later phases see: the defence roster moved, and the Mech
// phase then reconfigured the blueprint against that same root.
assert.ok(
  fleetMech.invocations.some(
    ({ elementId, method, args }) =>
      elementId === "fleet" &&
      (method === "add" || method === "sub") &&
      fleetMech.root.galaxy.defense[args[0]][args[1]] !== 2,
  ),
  JSON.stringify(fleetMech.invocations.filter((i) => i.elementId === "fleet")),
);
assert.equal(fleetMech.root.portal.mechbay.blueprint.chassis, "spider");

/**
 * Genetics through Power in one late-game save: the traits, the crafting pass, the completed
 * combat block, the civic tail and Power's post-purge handoff. Power's position is read from its
 * own production error path, because an unavailable cycle is exactly what this save gives it and
 * standing down is the retained behaviour.
 */
function runTailChain() {
  const root = {
    race: {
      deconstructor: true,
      elusive: false,
      minor: { smart: 0 },
      governor: { candidates: [{ bg: "soldier" }, { bg: "educator" }] },
      // The Craft gate reads the species citizens row the game keeps for the Crafting panel.
      species: "human",
    },
    tech: { genetics: 7, governor: 1, mercs: 1, spy: 2, piracy: 1 },
    genes: {},
    arpa: { sequence: { on: false, boost: false, auto: false } },
    stats: { attacks: 0, achieve: {} },
    blood: {},
    prestige: {
      Plasmid: { count: 1000 },
      AntiPlasmid: { count: 1000 },
      Phage: { count: 0 },
    },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
      mtorder: ["smart"],
      mKeys: false,
      keyMap: { x10: "Shift", x25: "Control", x100: "Alt" },
    },
    civic: {
      govern: { type: "democracy" },
      taxes: { tax_rate: 20, display: true, incomeAdjusted: false },
      garrison: {
        display: true,
        workers: 0,
        max: 3,
        crew: 0,
        wounded: 0,
        raid: 1,
        tactic: 0,
        progress: 0,
        rate: 1,
        cityGarrison: 20,
        maxCityGarrison: 30,
        m_use: 0,
        mercs: true,
      },
      foreign: {
        // Annexed under a Sabotage policy: Espionage releases it, which is the one path that both
        // succeeds and leaves the cycle free for Battle.
        gov0: {
          mil: 90,
          spy: 3,
          sab: 0,
          occ: false,
          anx: true,
          buy: false,
          hstl: 0,
          unrest: 20,
          eco: 1,
          trn: 0,
          act: "none",
        },
        // An ordinary free power with room under `foreignSpyMax`, so Spy Training has a target
        // Espionage's release does not consume.
        gov1: {
          mil: 10,
          spy: 0,
          sab: 0,
          occ: false,
          anx: false,
          buy: false,
          hstl: 0,
          unrest: 0,
          eco: 1,
          trn: 0,
          act: "none",
        },
      },
    },
    city: {
      biome: "plains",
      ptrait: [],
      morale: { current: 200, cap: 500, potential: 0, entertain: 0 },
      nanite_factory: { count: 1, Copper: 0, Iron: 0 },
    },
    portal: {
      bireme: { count: 1, on: 1 },
      transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
    },
    interstellar: { mass_ejector: { count: 1, on: 1, Iron: 0 } },
    policy: "Sabotage",
    galaxy: {
      defense: Object.fromEntries(
        FLEET_REGIONS.map((region) => [
          region,
          Object.fromEntries(
            FLEET_SHIPS.map((ship) => [
              ship,
              region === "gxy_gateway" && ship === "corvette_ship" ? 2 : 0,
            ]),
          ),
        ]),
      ),
      ...Object.fromEntries(
        FLEET_SHIPS.map((ship) => [
          ship,
          { count: ship === "corvette_ship" ? 2 : 0 },
        ]),
      ),
      bolognium_ship: { on: 1 },
    },
    queue: { display: false, pause: false, queue: [] },
    resource: {
      human: { display: true },
      Money: { amount: 5000, max: 10000, diff: 100, display: true },
      Knowledge: { amount: 1000, max: 1000, diff: 10, display: true },
      Genes: { amount: 500, max: 1000, diff: 0, display: true },
      Authority: { amount: 0, max: 100, display: true, diff: 0 },
      Lumber: {
        amount: 1000,
        max: 1000,
        diff: 400,
        display: true,
        name: "Lumber",
      },
      Iron: { amount: 1000, max: 1000, diff: 10, display: true },
      Copper: { amount: 1000, max: 1000, diff: 10, display: true },
      Plywood: { amount: 5, max: -1, diff: 0, display: true },
      Brick: { amount: 0, max: -1, diff: 0, display: true },
      Population: { amount: 20, max: 100, diff: 0, display: true },
      Nanite: { amount: 0, max: 100, diff: 0, display: true },
      Supply: { amount: 0, max: 2000000, diff: 5000, display: false },
    },
  };

  return runCapturedPhaseOrderCycle({
    root,
    // No managed Building at all: Power must stand down on its own unavailable cycle, through the
    // production error path, without discovering a panel.
    mechanics: {
      readStructures: () => undefined,
      readProductionBreakdown: () => undefined,
    },
    logEvents: [
      {
        match: /^autoPower: captured-power-cycle-unavailable:/,
        event: "power",
      },
    ],
    documentSetup: ({ body }) => {
      const breakdown = element("div", { id: "geneticBreakdown" });
      const minor = element("div", { id: "geneticMinor" });
      const row = element("div");
      row.classList.add("trait", "t-smart", "traitRow");
      const heading = element("h4");
      heading.textContent = "smart";
      row.append(heading);
      minor.append(row);
      breakdown.append(minor);
      const craftAll = element("div", { id: "incPlywoodA" });
      body.append(breakdown, craftAll);
    },
    settings: {
      autoGenetics: true,
      geneticsSequence: "enabled",
      geneticsBoost: "enabled",
      autoMinorTrait: true,
      mTrait_smart: true,
      mTrait_w_smart: 10,
      autoCraft: true,
      autoFight: true,
      autoMercenary: true,
      autoSpyTraining: true,
      foreignTrainSpy: true,
      foreignSpyMax: 3,
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Sabotage",
      // Battle keeps its target under a Sabotage policy; Influence would stop the raid instead.
      foreignPolicySuperior: "Sabotage",
      foreignPolicyRival: "Ignore",
      foreignForceSabotage: false,
      foreignUnification: false,
      foreignOccupyLast: false,
      foreignPacifist: false,
      achievementGuards: false,
      foreignHireMercDeadSoldiers: 0,
      foreignHireMercCostLowerThanIncome: 1,
      foreignHireMercMoneyStoragePercent: 0,
      warOccupy: true,
      warRaid: true,
      autoTax: true,
      generalRequestedTaxRate: -1,
      generalMinimumTaxRate: 20,
      generalMinimumMorale: 105,
      generalMaximumMorale: 500,
      authorityManage: false,
      generalMinimumAuthority: 100,
      autoGovernment: true,
      govGovernor: "educator",
      govInterim: "none",
      autoNanite: true,
      naniteMode: "cap",
      res_naniteCopper: true,
      autoSupply: true,
      supplyMode: "cap",
      res_supplyCopper: true,
      autoEject: true,
      ejectMode: "cap",
      res_ejectIron: true,
      autoFleet: true,
      fleetCrewReclaim: true,
      fleetMaxCover: true,
      autoPower: true,
    },
    controls: {
      fleet: {
        event: "fleet",
        methods: {
          add(region, ship) {
            root.galaxy.defense[region][ship] += 1;
          },
          sub(region, ship) {
            root.galaxy.defense[region][ship] -= 1;
          },
        },
      },
      arpaSequence: {
        event: "genetics",
        methods: {
          toggle() {
            root.arpa.sequence.on = !root.arpa.sequence.on;
          },
          booster() {
            root.arpa.sequence.boost = !root.arpa.sequence.boost;
          },
          auto_seq() {
            root.arpa.sequence.auto = !root.arpa.sequence.auto;
          },
          novo() {},
        },
      },
      geneticBreakdown: {
        events: { gene: "minorTrait" },
        methods: {
          genePurchasable() {
            return true;
          },
          gene(traitId) {
            root.resource.Genes.amount -= 5;
            root.race.minor[traitId] += 1;
            root.race[traitId] = (root.race[traitId] ?? 0) + 1;
          },
          geneCost() {
            return "Buy smart for 5 Genes";
          },
          gain() {},
          purge() {},
          addCost() {
            return "gain for 10 Plasmids";
          },
          removeCost() {
            return "purge for 10 Plasmids";
          },
        },
      },
      resPlywood: {
        events: { craft: "craft" },
        methods: {
          craftCost() {
            return "<div>Lumber 100</div>";
          },
          craft(id, volume) {
            root.resource.Lumber.amount -= 100 * volume;
            root.resource.Plywood.amount += volume;
          },
        },
      },
      garrison: {
        events: {
          hire: "mercenary",
          // Espionage's release and Battle's raid are both `campaign(index)`, so the phase is read
          // off the live control flags the stub is about to change.
          campaign: ([index]) => {
            const government = root.civic.foreign[`gov${index}`];
            return government.occ || government.anx || government.buy
              ? "espionage"
              : "battle";
          },
        },
        methods: {
          vis() {
            return true;
          },
          hell() {
            return root.civic.garrison.cityGarrison;
          },
          s_max() {
            return root.civic.garrison.maxCityGarrison;
          },
          rating(value) {
            return value * 10;
          },
          hire() {
            root.resource.Money.amount -= 75;
            root.civic.garrison.workers += 1;
            root.civic.garrison.m_use += 1;
          },
          next() {
            root.civic.garrison.tactic += 1;
          },
          last() {
            root.civic.garrison.tactic -= 1;
          },
          aNext() {
            root.civic.garrison.raid += 1;
          },
          aLast() {
            root.civic.garrison.raid = Math.max(
              0,
              root.civic.garrison.raid - 1,
            );
          },
          campaign(index) {
            const government = root.civic.foreign[`gov${index}`];
            if (government.occ || government.anx || government.buy) {
              government.occ = false;
              government.anx = false;
              government.buy = false;
              return undefined;
            }
            root.stats.attacks += 1;
            if (root.policy === "Occupy") government.occ = true;
            return undefined;
          },
        },
      },
      foreign: {
        events: { spy: "spy" },
        methods: {
          vis() {
            return true;
          },
          gvis(index) {
            return root.civic.foreign[`gov${index}`] !== undefined;
          },
          trigModal() {
            return true;
          },
          spy_disabled() {
            return false;
          },
          spy(index) {
            root.resource.Money.amount -= 100;
            root.civic.foreign[`gov${index}`].trn = 1;
          },
        },
      },
      tax_rates: {
        event: "tax",
        methods: {
          add() {
            root.civic.taxes.tax_rate += 1;
          },
          sub() {
            root.civic.taxes.tax_rate -= 1;
          },
        },
      },
      candidates: {
        event: "government",
        methods: {
          appoint(index) {
            root.race.governor.g = root.race.governor.candidates[index];
          },
        },
      },
      iNFactory: {
        event: "nanite",
        methods: {
          addItem(id) {
            root.city.nanite_factory[id] += 1;
          },
          subItem(id) {
            root.city.nanite_factory[id] -= 1;
          },
        },
      },
      supplyCopper: {
        event: "supply",
        methods: {
          supplyMore(id) {
            root.portal.transport.cargo[id] += 1;
          },
          supplyLess(id) {
            root.portal.transport.cargo[id] -= 1;
          },
        },
      },
      ejectIron: {
        event: "eject",
        methods: {
          ejectMore(id) {
            root.interstellar.mass_ejector[id] += 1;
          },
          ejectLess(id) {
            root.interstellar.mass_ejector[id] -= 1;
          },
        },
      },
    },
  });
}

const tail = runTailChain();
assert.deepEqual(
  tail.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(tail.errors),
);
// Fleet's live roster mutation is settled long before the civic tail, and Power still refuses its
// own cycle on the post-tail root rather than on a sample from before those mutations.
assertRunsBefore(assert, tail.trace, "fleet", "minorTrait");
assertRunsBefore(assert, tail.trace, "genetics", "minorTrait");
assertRunsBefore(assert, tail.trace, "minorTrait", "craft");
assertRunsBefore(assert, tail.trace, "craft", "mercenary");
assertRunsBefore(assert, tail.trace, "mercenary", "spy");
assertRunsBefore(assert, tail.trace, "spy", "espionage");
assertRunsBefore(assert, tail.trace, "espionage", "battle");
assertRunsBefore(assert, tail.trace, "battle", "tax");
assertRunsBefore(assert, tail.trace, "tax", "government");
assertRunsBefore(assert, tail.trace, "government", "nanite");
assertRunsBefore(assert, tail.trace, "nanite", "supply");
assertRunsBefore(assert, tail.trace, "supply", "eject");
assertRunsBefore(assert, tail.trace, "eject", "power");
assertRunsBefore(assert, tail.trace, "fleet", "power");
assert.equal(tail.trace.at(-1), "power", JSON.stringify(tail.trace));
// Power performs no panel discovery on this path: the only thing it reports is the retained
// unavailable answer for a capture with no managed Building.
assert.deepEqual(
  tail.errors.filter((message) => message.startsWith("autoPower")),
  [
    "autoPower: captured-power-cycle-unavailable: Authoritative Power cycle input is unavailable; retry on a later tick.",
  ],
);

// --- the restored moves, and what each one costs the shared demand sample -------------------
//
// Smelter → Storage. Smelter re-routes next-period rates through `city.smelter`; the captured
// demand sample reads no production ratio and no `resource[id].diff`, so nothing it moves is a
// fact Storage's own decision is built from. Storage in turn owns the capacity ledger
// (`resource[id].max`, `crates`, `containers`) that every later consumer's request is clamped
// against, which is why the runtime ends the sample at its phase boundary — see
// `scripts/captured-fleet-outer-test.mjs` and `src/application/fleet-outer.ts` for the other
// boundary. This save's planner reads its crate and container descriptors and declines to act, so
// what is locked here is the execution order and the fact that Storage reaches its own action
// boundary before Replicator does.
assertRunsBefore(assert, prologue.trace, "smelter", "storage");
assertRunsBefore(assert, prologue.trace, "storage", "replicator");
assert.notEqual(prologue.root.city.smelter.Iron, 2, "Smelter must act");
assert.notEqual(prologue.root.city.smelter.Steel, 0, "Smelter must act");
assert.ok(
  prologue.invocations.some(
    ({ elementId }) =>
      elementId === "createHead" || elementId.startsWith("stack-"),
  ),
  "Storage must reach its own captured action boundary",
);

// Fleet → Mech → Power. Fleet's roster mutation and Mech's blueprint edit both land before the
// civic tail and long before Power, and Power's refusal is still the retained unavailable answer.
assertRunsBefore(assert, fleetMech.trace, "fleet", "mech");
assertRunsBefore(assert, tail.trace, "fleet", "power");

// Minor Trait → the civic tail → Power. The Gene purchase and the civic mutations happen before
// Power refreshes demand, and Power reports the post-tail root rather than an earlier sample.
assertRunsBefore(assert, tail.trace, "minorTrait", "power");
assert.equal(
  tail.root.resource.Genes.amount < 500,
  true,
  "the minor-trait phase must spend Genes before Power runs",
);
assert.notEqual(tail.root.civic.taxes.tax_rate, 20, "Tax must act");
assert.equal(tail.root.civic.govern.type, "democracy");

// --- Prestige through Mutate Traits, the block that runs after Power ---------------------------

/**
 * Every phase from Power to Mutate Traits, in one save whose Ascension is the gate that opens the
 * run the later phases act on.
 *
 *   Power -> Prestige -> Shapeshift -> Psychic -> Ocular -> Wish -> Mutate Traits
 *
 * Three cycles, each one earning its place:
 *
 * - The first commits the prestige planner's one-tick `Reset` goal and nothing else, because the
 *   astral focus, the psychic and wish tiers, the Genetics lab and the Shapeshifter trait are all
 *   still absent, so no phase behind the prestige branch has a target to act on.
 * - The second clicks the Ascension Building and then takes the shape, and the shape is what makes
 *   the runtime `invalidateCapturedCyclePlanning(); return;`. Psychic was already eligible in that
 *   cycle — the ascension granted its tier and the Energy pool is full — and still did not run,
 *   which is what places the Psychic phase behind the Shapeshift phase rather than merely beside it.
 * - The third is where every phase behind the shape gets its turn, and it is the only cycle in
 *   which all of them can be compared in one order.
 *
 * Every entry is a production phase really invoking a captured control and really changing the live
 * root, with one documented departure: the Ocular toggle is the one interaction the fixture's
 * control registry cannot see, because the game reaches `pow` through its own checkbox rather than
 * through an invoked method, so that click records itself in `executed`. Every other phase is
 * recorded by the registry, and the assertion below proves the two logs hold the same phases in the
 * same order.
 */
function runPrestigeTraitChain() {
  const executed = [];
  const ocularConfig = {
    d: false,
    p: false,
    w: false,
    t: false,
    f: false,
    c: false,
  };
  const root = {
    race: {
      psychic: true,
      psychicPowers: {
        boostTime: 0,
        cash: 0,
        assaultTime: 0,
        boost: { r: "Food" },
      },
      // The astral focus, the psychic and wish tiers, the Genetics lab and the Shapeshifter trait
      // are all what the ascension hands this run, so none of the five phases behind the prestige
      // branch has a target until the prestige action has really run.
      ocular_power: 0,
      ocularPowerConfig: ocularConfig,
      wish: true,
      wishStats: { minor: 0, major: 0 },
      shapeshifter: false,
      ss_genus: "none",
      species: "human",
      universe: "standard",
      minor: { smart: 0 },
    },
    tech: {},
    genes: {},
    stats: { psykill: 0, ascend: 0, attacks: 0, achieve: {} },
    blood: {},
    prestige: {
      Plasmid: { count: 1000 },
      AntiPlasmid: { count: 1000 },
      Phage: { count: 0 },
    },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
      mtorder: ["smart"],
      arpa: { genetics: true },
    },
    city: { biome: "plains", ptrait: [] },
    queue: { display: false, pause: false, queue: [] },
    interstellar: { ascend: 0 },
    resource: {
      Energy: { amount: 60, max: 60, diff: 0, display: true },
      human: { amount: 20, max: 100, diff: 0, display: true },
      Food: { amount: 100, max: 1000, diff: 0, display: true },
      Genes: { amount: 500, max: 1000, diff: 0, display: true },
      Population: { amount: 4, max: 10, diff: 0, display: true },
      Money: { amount: 1000, max: 10000, diff: 10, display: true },
    },
  };

  const ascendPanel = element("div", { id: "interstellar" });
  const ascendRow = element("div", { id: "interstellar-ascend" });
  ascendRow.classList.add("action");
  ascendPanel.append(ascendRow);
  const breakdownPanel = element("div", { id: "geneticBreakdown" });
  const mutationRow = classRow("traitRow");
  mutationRow.append(classRow("addsmart basic-button"));
  breakdownPanel.append(mutationRow);

  const run = runCapturedPhaseOrderCycle({
    root,
    // Three cycles: the first commits the prestige goal, the second clicks the Building and then
    // takes the shape the runtime ends that cycle on, and the third is where the four phases behind
    // the Shapeshift phase get their turn.
    cycles: 3,
    // The prestige branch reads its Building row out of the panel the interstellar region's own
    // draw leaves on screen, so this is the one scenario in the file that has to let tabs draw.
    mount: true,
    // No managed Building at all, so Power reports its retained unavailable cycle answer through
    // the production error path rather than discovering a panel.
    mechanics: {
      readStructures: () => undefined,
      readProductionBreakdown: () => undefined,
    },
    logEvents: [
      {
        match: /^autoPower: captured-power-cycle-unavailable:/,
        event: "power",
      },
    ],
    documentSetup: ({ document, body }) => {
      const querySelector = document.querySelector.bind(document);
      // The game renders each Ocular power as a checkbox inside its own `#ocular<id>` row, and
      // changes to that checkbox are what the captured `pow` method is bound to. The fixture's
      // registry is not reachable from inside a click handler, so the click runs the same
      // `pow` work the `pow` control carries and records the phase itself.
      document.querySelector = (selector) => {
        const power = OCULAR_POWERS.find(
          (candidate) =>
            selector === `#ocular${candidate.id} input[type='checkbox']`,
        );
        if (power === undefined) return querySelector(selector);
        return {
          click() {
            ocularConfig[power.stateKey] = !ocularConfig[power.stateKey];
            enforceOcularCapacity(ocularConfig, power.stateKey);
            executed.push("ocular");
          },
        };
      };
      body.append(ascendPanel, breakdownPanel);
    },
    settings: {
      autoPower: true,
      autoPrestige: true,
      prestigeType: "ascension",
      autoMinorTrait: true,
      shifterGenus: "fungal",
      psychicPower: "murder",
      ocularPower_disintegration: true,
      ocularPower_petrification: true,
      ocularPower_wound: true,
      ocularPower_telekinesis: false,
      ocularPower_fear: false,
      ocularPower_charm: false,
      ocularPower_p_disintegration: 90,
      ocularPower_p_petrification: 80,
      ocularPower_p_wound: 70,
      ocularPower_p_telekinesis: 0,
      ocularPower_p_fear: 0,
      ocularPower_p_charm: 0,
      wishMinor: "Know",
      autoMutateTraits: true,
      mutableTrait_gain_smart: true,
      mutableTrait_p_smart: 0,
    },
    controls: {
      // The two tab controls the interstellar panel discovery draws through. They write the game's
      // own tab settings, and the runtime puts them back after the pass.
      "#mainColumn div.content": {
        methods: {
          swapTab(index) {
            root.settings.civTabs = index;
          },
        },
      },
      mTabCivil: {
        methods: {
          swapTab(index) {
            root.settings.spaceTabs = index;
          },
        },
      },
      "interstellar-ascend": {
        event: "prestige",
        methods: {
          action() {
            // `stats.ascend` is the game's own reset counter and is deliberately left alone: the
            // adapter reads it as the postcondition, and moving it would end the cycle the way a
            // committed reset does. What the ascension does hand over is the run's astral focus,
            // psychic and wish tiers, Genetics lab and Shapeshifter trait.
            root.interstellar.ascend += 1;
            root.race.shapeshifter = true;
            root.race.ocular_power = 1;
            root.tech.psychic = 1;
            root.tech.wish = 2;
            root.tech.genetics = 7;
            executed.push("prestige");
          },
        },
      },
      sshifter: {
        event: "shapeshift",
        methods: {
          setShape(genus) {
            // DeadSpace `shapeShift(genus)`: the mimic trait set is rebuilt and `race.ss_genus`
            // takes the requested genus.
            root.race.ss_traits = [`ss_${genus}`];
            root.race.ss_genus = genus;
            executed.push("shapeshift");
          },
        },
      },
      psychicBoost: {
        // Read by the Psychic phase's own control discovery, never invoked in Murder mode.
        methods: {
          boostVal() {},
        },
      },
      psychicKill: {
        event: "psychic",
        methods: {
          murder() {
            // DeadSpace `psychicKill().murder()`: 10 Energy below psychic 5, one citizen of the
            // species, and the game's own kill counter.
            root.resource.Energy.amount -= 10;
            root.resource.human.amount -= 1;
            root.stats.psykill += 1;
            executed.push("psychic");
          },
        },
      },
      ocularPower: {
        event: "ocular",
        methods: {
          pow(stateKey) {
            // Only the game's own checkbox change reaches this method, so the phase reaches it
            // through the click above rather than by invoking the control.
            enforceOcularCapacity(ocularConfig, stateKey);
          },
        },
      },
      minorWish: {
        event: "wish",
        methods: {
          know() {
            root.race.wishStats.minor = 3;
            executed.push("wish");
          },
        },
      },
      arpaSequence: {
        // Read by the Genetics panel discovery, which is satisfied by the pair and never draws.
        methods: {
          toggle() {},
          booster() {},
          auto_seq() {},
          novo() {},
        },
      },
      geneticBreakdown: {
        events: { gain: "mutateTrait" },
        methods: {
          genePurchasable() {
            return true;
          },
          gene() {},
          geneCost() {
            return "Buy smart for 5 Genes";
          },
          gain(traitId) {
            root.race[traitId] = 1;
            root.prestige.Plasmid.count -= 30;
            executed.push("mutateTrait");
          },
          purge() {},
          addCost() {
            return "gain for 30 Plasmids";
          },
          removeCost() {
            return "purge for 30 Plasmids";
          },
        },
      },
    },
  });
  return { ...run, executed };
}

/**
 * The six Ocular powers in the order DeadSpace renders them, with the `race.ocularPowerConfig`
 * state key each checkbox writes (`src/adapters/evolve/traits/captured-trait-settings-catalog.ts`).
 */
const OCULAR_POWERS = [
  { id: "disintegration", stateKey: "d" },
  { id: "petrification", stateKey: "p" },
  { id: "wound", stateKey: "w" },
  { id: "telekinesis", stateKey: "t" },
  { id: "fear", stateKey: "f" },
  { id: "charm", stateKey: "c" },
];

/**
 * DeadSpace's `traits.ocular_power.vars()` `pow(stateKey)`, which enforces the rank's capacity over
 * the rendered `d/p/w/t/f/c` keys while preserving the key it was handed. Rank 1 is two active
 * powers, and this save enables three, so the lowest-priority one is dropped by the method the
 * checkbox is bound to rather than by the script.
 */
function enforceOcularCapacity(config, stateKey) {
  let active = 0;
  for (const { stateKey: key } of OCULAR_POWERS) {
    if (config[key]) active += 1;
    if (active > 2 && key !== stateKey) config[key] = false;
  }
}

/** A test element carrying `className` as a string, which is how the trait panel is read. */
function classRow(className) {
  const node = element("div", { className });
  for (const token of className.split(/\s+/)) node.classList.add(token);
  return node;
}

const chain = runPrestigeTraitChain();
assert.deepEqual(
  chain.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(chain.errors),
);
// Power reports one unavailable cycle per cycle of the run and discovers nothing; every other phase
// either acted or stood down without reporting. Nothing else is tolerated here.
assert.deepEqual(
  chain.errors,
  [
    "autoPower: captured-power-cycle-unavailable: Authoritative Power cycle input is unavailable; retry on a later tick.",
    "autoPower: captured-power-cycle-unavailable: Authoritative Power cycle input is unavailable; retry on a later tick.",
    "autoPower: captured-power-cycle-unavailable: Authoritative Power cycle input is unavailable; retry on a later tick.",
  ],
  JSON.stringify(chain.errors),
);
// The fixture pushes each log-event marker into `cycleTrace` alongside the per-cycle records, so
// the records are the entries that carry a trace of their own.
const chainCycles = chain.cycleTrace.filter(
  (entry) => typeof entry === "object",
);
// The first cycle only commits the prestige goal: the ascension has not been clicked, so none of
// the five phases behind it has a target, and Power is the only phase that reports itself.
assert.deepEqual(
  chainCycles.map(({ cycle, trace }) => ({ cycle, trace })),
  [
    { cycle: 0, trace: ["power"] },
    // The Ascension click, then the shape, and nothing after the shape: the runtime ended the cycle
    // because the shape really landed. Psychic was already eligible here and still did not run.
    { cycle: 1, trace: ["power", "prestige", "shapeshift"] },
    { cycle: 2, trace: ["power", "psychic", "wish", "mutateTrait"] },
  ],
  JSON.stringify(chain.cycleTrace),
);
// The six phases the control registry records, in the order it recorded them. The Ocular checkbox
// clicks are the two entries this registry cannot see, so the two logs have to agree on the rest
// before the ordering below is read off the log that can see all seven.
assert.deepEqual(
  chain.executed.filter((phase) => phase !== "ocular"),
  chain.trace.filter((phase) => phase !== "power"),
  JSON.stringify(chain.executed),
);
assert.deepEqual(
  chain.executed,
  [
    "prestige",
    "shapeshift",
    "psychic",
    "ocular",
    "ocular",
    "wish",
    "mutateTrait",
  ],
  JSON.stringify(chain.executed),
);
// Power hands off to the prestige branch in the cycle the Ascension click lands in.
assertRunsBefore(assert, chainCycles[1].trace, "power", "prestige");
assertRunsBefore(assert, chain.executed, "prestige", "shapeshift");
assertRunsBefore(assert, chain.executed, "shapeshift", "psychic");
assertRunsBefore(assert, chain.executed, "psychic", "ocular");
assertRunsBefore(assert, chain.executed, "ocular", "wish");
assertRunsBefore(assert, chain.executed, "wish", "mutateTrait");

// Every entry above is one captured control a production phase really invoked, and the two
// checkbox clicks are the two Ocular toggles the phase really made.
assert.deepEqual(
  chain.invocations
    .filter(({ elementId }) =>
      [
        "interstellar-ascend",
        "sshifter",
        "psychicKill",
        "minorWish",
        "geneticBreakdown",
      ].includes(elementId),
    )
    .map(({ elementId, method }) => `${elementId}.${method}`),
  [
    "interstellar-ascend.action",
    "sshifter.setShape",
    "psychicKill.murder",
    "minorWish.know",
    "geneticBreakdown.gain",
  ],
  JSON.stringify(chain.invocations),
);
// The live root each phase really changed. Without these the ordering above could be read off
// phases that decided not to act.
assert.equal(chain.root.interstellar.ascend, 1, "Prestige must act");
assert.equal(
  chain.root.stats.ascend,
  0,
  "the ascension must not move its own reset counter",
);
assert.equal(chain.root.race.ss_genus, "fungal", "Shapeshift must act");
assert.equal(chain.root.stats.psykill, 1, "Psychic must act");
assert.equal(
  chain.root.resource.Energy.amount,
  50,
  "Psychic must spend its Energy",
);
assert.deepEqual(
  chain.root.race.ocularPowerConfig,
  { d: true, p: true, w: false, t: false, f: false, c: false },
  "Ocular must reconcile the config to what its rank allows",
);
assert.equal(chain.root.race.wishStats.minor, 3, "Wish must act");
assert.equal(chain.root.race.smart, 1, "Mutate Traits must act");
assert.equal(chain.root.prestige.Plasmid.count, 970, "Mutate Traits must pay");

console.log("captured-phase-order ok", JSON.stringify(prologue.trace));
