import assert from "node:assert/strict";

import { createOuterFleetAdapter } from "../src/adapters/evolve/combat/fleet-outer.ts";
import { runOuterFleetAutomation } from "../src/application/fleet-outer.ts";
import {
  calculateOuterFleetDefenseTarget,
  planOuterFleetCycle,
} from "../src/domain/combat/fleet-outer.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  const blueprints = {
    yard: { kind: "yard", class: scenario.yardClass ?? "corvette" },
    explorer: { kind: "explorer", class: "explorer" },
    scout: { kind: "scout", class: scenario.scoutClass ?? "corvette" },
    fighter: { kind: "fighter", class: scenario.fighterClass ?? "corvette" },
  };
  let nextShipMsg = "previous message";
  let nextShipName = "previous name";
  const regions = scenario.regions ?? ["spc_red"];
  const manager = {
    Regions: regions,
    ClassCrew: {
      corvette: scenario.corvetteCrew ?? 2,
      explorer: scenario.explorerCrew ?? 10,
    },
    _explorerBlueprint: blueprints.explorer,
    get nextShipMsg() {
      return nextShipMsg;
    },
    set nextShipMsg(value) {
      nextShipMsg = value;
      trace.stateChange("next-ship-message", { value });
    },
    get nextShipName() {
      return nextShipName;
    },
    set nextShipName(value) {
      nextShipName = value;
      trace.stateChange("next-ship-name", { value });
    },
    initFleet() {
      trace.managerCall("initFleet", {});
      return scenario.initialized ?? true;
    },
    avail(blueprint) {
      return !(scenario.unavailableBlueprints ?? []).includes(blueprint.kind);
    },
    updateNextShip(blueprint) {
      trace.managerCall("updateNextShip", {
        blueprint: blueprint?.kind ?? null,
      });
      trace.command("update-next-ship", {
        blueprint: blueprint?.kind ?? null,
      });
      this.nextShipMsg = null;
      this.nextShipName = null;
    },
    getWeighting(region) {
      return scenario.weightings?.[region] ?? 1;
    },
    getMaxDefense(region) {
      return scenario.maximumDefense?.[region] ?? 0.9;
    },
    getMaxScouts(region) {
      return scenario.maximumScouts?.[region] ?? 0;
    },
    isUnlocked(region) {
      return !(scenario.lockedRegions ?? []).includes(region);
    },
    syndicate(region, extra) {
      return extra
        ? { s: scenario.sensors?.[region] ?? 100 }
        : (scenario.syndicateRatios?.[region] ?? 0.5);
    },
    getScoutBlueprint: () => blueprints.scout,
    getFighterBlueprint: () => blueprints.fighter,
    shipCount(region, blueprint) {
      return scenario.shipCounts?.[`${region}:${blueprint.kind}`] ?? 0;
    },
    getLocName(region) {
      return (
        scenario.locationNames?.[region] ??
        {
          tauceti: "Tau Ceti",
          spc_eris: "Eris",
          spc_red: "Red Planet",
          spc_moon: "Moon",
        }[region] ??
        region
      );
    },
    getShipName(blueprint) {
      return {
        yard: "Yard Ship",
        explorer: "Explorer",
        scout: "Scout",
        fighter: "Fighter",
      }[blueprint.kind];
    },
    getMissingResource() {
      return scenario.missingResource ?? null;
    },
    build(blueprint, region) {
      trace.managerCall("build", { blueprint: blueprint.kind, region });
      trace.command("build-outer-ship", {
        blueprint: blueprint.kind,
        region,
      });
      return scenario.buildSuccess ?? true;
    },
  };
  const game = {
    global: {
      race: {
        universe: scenario.universe ?? "evil",
        grenadier: scenario.grenadier ?? false,
      },
      tech: {
        tauceti: scenario.tauTechnology ?? 0,
        eris: scenario.erisTechnology ?? 2,
      },
      space: {
        shipyard: { blueprint: blueprints.yard },
        ...(scenario.digsite === undefined
          ? {}
          : {
              digsite: { count: scenario.digsite },
              shock_trooper: { on: scenario.troopers ?? 0 },
              tank: { on: scenario.tanks ?? 0 },
            }),
      },
    },
  };
  const settings = {
    fleetOuterShips: scenario.mode ?? "custom",
    fleetOuterCrew: scenario.minimumCrew ?? 30,
    fleetExploreTau: scenario.exploreTau ?? false,
    authorityManage: scenario.authorityManage ?? false,
    generalMinimumAuthority: scenario.authorityTarget ?? 100,
  };
  const resources = {
    Authority: {
      currentQuantity: scenario.authority ?? 100,
      maxQuantity: scenario.authorityMaximum ?? 100,
      isUnlocked: () => scenario.authorityUnlocked ?? true,
    },
    Eris_Support: { currentQuantity: scenario.erisSupport ?? 0 },
    Adamantite: { name: "Adamantite" },
  };
  const warManager = {
    currentCityGarrison: scenario.currentCityGarrison ?? 100,
  };
  const traitVal = (trait, index, fallback) => {
    if (trait === "high_pop" && index === 0) {
      return scenario.highPopulationMultiplier ?? 1;
    }
    if (trait === "high_pop" && index === 1) {
      return scenario.highPopulationPercent ?? 100;
    }
    return fallback;
  };
  const assessAuthorityRemoval = (removedSoldiers) => {
    if (scenario.authorityUnavailable) {
      return { status: "unavailable", reason: "invalid-resource" };
    }
    const target =
      settings.generalMinimumAuthority < 0
        ? resources.Authority.maxQuantity
        : settings.generalMinimumAuthority;
    const predicted = Math.floor(
      resources.Authority.currentQuantity -
        ((removedSoldiers * 0.7 * (scenario.highPopulationPercent ?? 100)) /
          100) *
          (scenario.grenadier ? 1.75 : 1),
    );
    return {
      status: "ready",
      target,
      predicted,
      blocksRemoval: predicted < target,
    };
  };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.managerCall("logSuccess", { id });
      trace.log(id, { message, categories });
    },
  };
  return {
    trace,
    manager,
    warManager,
    game,
    settings,
    resources,
    traitVal,
    assessAuthorityRemoval,
    GameLog,
  };
}

function createAutomation(fixture, overrides = {}) {
  return createOuterFleetAdapter({
    getFleetManagerOuter:
      overrides.getFleetManagerOuter ?? (() => fixture.manager),
    getWarManager: overrides.getWarManager ?? (() => fixture.warManager),
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    traitVal: overrides.traitVal ?? fixture.traitVal,
    assessAuthorityRemoval:
      overrides.assessAuthorityRemoval ?? fixture.assessAuthorityRemoval,
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
  });
}

assert.deepEqual(
  planOuterFleetCycle({
    initialized: false,
    mode: "none",
    manualBlueprintAvailable: false,
    configuredMinimumCrew: 0,
  }),
  {
    kind: "outer-fleet-status",
    blueprint: null,
    nextShipName: null,
    messageBeforeUpdate: "No ships needed yet",
    messageAfterUpdate: null,
  },
);
assert.equal(
  calculateOuterFleetDefenseTarget({
    id: "spc_eris",
    unlocked: true,
    weighting: 1,
    syndicateRatio: 0.47,
    maximumDefense: 0.01,
    digsiteIncomplete: true,
    requestedTroopers: 23,
    requestedTanks: 7,
    reportedSupport: 30,
  }),
  350 / 723,
);

const malformed = createFixture({ mode: "none" });
malformed.settings.fleetOuterShips = 1;
assert.throws(
  () => runOuterFleetAutomation(createAutomation(malformed)),
  /settings\.fleetOuterShips must be a string/,
);

const stale = createFixture({ mode: "none" });
let currentManager = stale.manager;
const staleAutomation = createAutomation(stale, {
  getFleetManagerOuter: () => currentManager,
});
const staleDecision = planOuterFleetCycle(staleAutomation.reader.readCycle());
currentManager = { ...stale.manager };
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");

console.log(
  "Outer fleet domain and phased Evolve adapter/application tests passed",
);
