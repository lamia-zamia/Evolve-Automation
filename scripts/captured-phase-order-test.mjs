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
    tauceti: { mining_ship: { count: 1, common: 50, uncommon: 50, rare: 50 } },
    civic: {
      miner: { workers: 1 },
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

const prologue = runResourcePrologue();
assert.deepEqual(
  prologue.errors.filter((message) => message.includes("stopped:")),
  [],
  JSON.stringify(prologue.errors),
);
assertRunsBefore(assert, prologue.trace, "gather", "market");
assertRunsBefore(assert, prologue.trace, "market", "hell");
assertRunsBefore(assert, prologue.trace, "hell", "galaxyMarket");
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
          anx: false,
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
 * Jobs, Fleet and Mech in a save with no construction. The Mech bay is a portal Building, so this
 * save turns `mechBaysFirst` off and leaves Auto Build off: the Mech phase then reads live bay,
 * purifier and Soul Gem state without the construction unlock catalog standing between it and the
 * facts it prices.
 */
function runFleetMechChain() {
  const root = {
    race: {},
    tech: { piracy: 1 },
    genes: {},
    stats: { attacks: 0, achieve: {} },
    blood: {},
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
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
    },
    controls: {
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
      minor: { smart: 0 },
      governor: { candidates: [{ bg: "soldier" }, { bg: "educator" }] },
    },
    tech: { genetics: 3, governor: 1, mercs: 1, spy: 1, piracy: 1 },
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
        raid: 0,
        tactic: 0,
        progress: 0,
        rate: 1,
        cityGarrison: 20,
        maxCityGarrison: 20,
        m_use: 0,
        mercs: true,
      },
      foreign: {
        gov0: {
          mil: 10,
          spy: 3,
          occ: false,
          anx: false,
          buy: false,
          hstl: 0,
          unrest: 0,
          eco: 1,
          trn: 0,
          act: "",
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
      Money: { amount: 5000, max: 10000, diff: 100, display: true },
      Knowledge: { amount: 1000, max: 1000, diff: 10, display: true },
      Genes: { amount: 500, max: 1000, diff: 0, display: true },
      Authority: { amount: 0, max: 100, display: true, diff: 0 },
      Lumber: { amount: 1000, max: 1000, diff: 400, display: true },
      Iron: { amount: 500, max: 1000, diff: 10, display: true },
      Copper: { amount: 500, max: 1000, diff: 10, display: true },
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
      geneticSequence: true,
      autoMinorTrait: true,
      mTrait_smart: true,
      mTrait_w_smart: 10,
      autoCraft: true,
      autoFight: true,
      autoMercenary: true,
      autoSpyTraining: true,
      foreignTrainSpy: true,
      foreignSpyMax: 3,
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
        events: { hire: "mercenary", campaign: "battle" },
        methods: {
          vis() {
            return { ok: true, value: true };
          },
          hell() {
            return { ok: true, value: root.civic.garrison.cityGarrison };
          },
          s_max() {
            return { ok: true, value: root.civic.garrison.maxCityGarrison };
          },
          rating(value) {
            return { ok: true, value: value * 10 };
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
            root.stats.attacks += 1;
            const government = root.civic.foreign[`gov${index}`];
            if (government !== undefined && root.civic.garrison.raid > 0) {
              government.occ = true;
            }
          },
        },
      },
      foreign: {
        events: { spy: "spy" },
        methods: {
          vis() {
            return { ok: true, value: true };
          },
          gvis(index) {
            return {
              ok: true,
              value: root.civic.foreign[`gov${index}`] !== undefined,
            };
          },
          spy_disabled() {
            return { ok: true, value: false };
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
assertRunsBefore(assert, tail.trace, "minorTrait", "tax");
assertRunsBefore(assert, tail.trace, "tax", "government");
assertRunsBefore(assert, tail.trace, "government", "power");
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

console.log("captured-phase-order ok", JSON.stringify(prologue.trace));
