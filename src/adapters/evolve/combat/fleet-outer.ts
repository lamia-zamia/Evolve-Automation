import {
  planOuterFleetBlueprint,
  planOuterFleetBuild,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
  type OuterFleetAutomaticPlan,
  type OuterFleetBlueprint,
  type OuterFleetBlueprintInput,
  type OuterFleetBuildReadinessInput,
  type OuterFleetCandidateInput,
  type OuterFleetCandidatePlan,
  type OuterFleetDecision,
  type OuterFleetReadinessPlan,
  type OuterFleetRegionInput,
  type OuterFleetTargetInput,
  type OuterFleetTargetPlan,
} from "../../../domain/combat/fleet-outer.ts";
import type {
  OuterFleetExecutor,
  OuterFleetReader,
} from "../../../ports/fleet-outer.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../validation.ts";

export interface OuterFleetAdapterDependencies {
  // TRANSITIONAL: FleetManagerOuter and WarManager remain narrow bridges to
  // the current Vue-backed shipyard and garrison controls. Replace them with
  // final Evolve/browser adapters when the remaining fleet slices migrate.
  readonly getFleetManagerOuter: () => unknown;
  readonly getWarManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly traitVal: (
    trait: string,
    index: number,
    operation?: string | number,
  ) => unknown;
  readonly assessAuthorityRemoval: (removedSoldiers: number) => unknown;
  readonly getGameLog: () => unknown;
}

interface OuterFleetSession {
  readonly manager: UnknownRecord;
  readonly warManager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly settings: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly blueprints: ReadonlyMap<OuterFleetBlueprint, UnknownRecord>;
}

const GRENADIER_CREW: Readonly<Record<string, number>> = Object.freeze({
  corvette: 1,
  frigate: 2,
  destroyer: 3,
  cruiser: 4,
  battlecruiser: 5,
  dreadnought: 6,
  explorer: 6,
});

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function decisionMatches(
  expected: Readonly<OuterFleetDecision>,
  actual: Readonly<OuterFleetDecision>,
): boolean {
  if (
    expected.kind !== actual.kind ||
    expected.blueprint !== actual.blueprint
  ) {
    return false;
  }
  if (
    expected.kind === "outer-fleet-status" &&
    actual.kind === "outer-fleet-status"
  ) {
    return (
      expected.nextShipName === actual.nextShipName &&
      expected.messageBeforeUpdate === actual.messageBeforeUpdate &&
      expected.messageAfterUpdate === actual.messageAfterUpdate
    );
  }
  return (
    expected.kind === "build-outer-fleet" &&
    actual.kind === "build-outer-fleet" &&
    expected.targetRegion === actual.targetRegion &&
    expected.targetLocationName === actual.targetLocationName &&
    expected.shipName === actual.shipName &&
    expected.shipCrew === actual.shipCrew &&
    expected.nextShipName === actual.nextShipName
  );
}

function readAuthorityAssessment(
  dependencies: OuterFleetAdapterDependencies,
  shipCrew: number,
): OuterFleetCandidateInput["authority"] {
  const raw = requireRecord(
    dependencies.assessAuthorityRemoval(shipCrew),
    "Authority removal assessment",
  );
  const status = requireString(
    raw["status"],
    "Authority removal assessment.status",
  );
  if (status === "unavailable") return Object.freeze({ status });
  if (status === "unmanaged") return Object.freeze({ status });
  if (status !== "ready") {
    throw new TypeError(`unknown Authority removal status: ${status}`);
  }
  return Object.freeze({
    status,
    target: requireNumber(raw["target"], "Authority removal assessment.target"),
    predicted: requireNumber(
      raw["predicted"],
      "Authority removal assessment.predicted",
    ),
    blocksRemoval: requireBoolean(
      raw["blocksRemoval"],
      "Authority removal assessment.blocksRemoval",
    ),
  });
}

export function createOuterFleetAdapter(
  dependencies: OuterFleetAdapterDependencies,
): {
  readonly reader: OuterFleetReader;
  readonly executor: OuterFleetExecutor;
} {
  let session: OuterFleetSession | null = null;
  let expectedDecision: Readonly<OuterFleetDecision> | null = null;
  const blueprints = new Map<OuterFleetBlueprint, UnknownRecord>();

  function activeSession(): OuterFleetSession {
    if (session === null)
      throw new Error("outer fleet cycle has not been sampled");
    return session;
  }

  function storeBlueprint(
    token: OuterFleetBlueprint,
    rawBlueprint: unknown,
    path: string,
  ): UnknownRecord {
    const blueprint = requireRecord(rawBlueprint, path);
    blueprints.set(token, blueprint);
    return blueprint;
  }

  const reader: OuterFleetReader = Object.freeze({
    readCycle() {
      session = null;
      expectedDecision = null;
      blueprints.clear();
      const manager = requireRecord(
        dependencies.getFleetManagerOuter(),
        "FleetManagerOuter",
      );
      const warManager = requireRecord(
        dependencies.getWarManager(),
        "WarManager",
      );
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      session = Object.freeze({
        manager,
        warManager,
        game,
        settings,
        resources,
        blueprints,
      });

      const initFleet = requireFunction(
        manager["initFleet"],
        "FleetManagerOuter.initFleet",
      );
      const initialized = Boolean(Reflect.apply(initFleet, manager, []));
      let mode = "none";
      let manualBlueprintAvailable = false;
      let configuredMinimumCrew = 0;
      if (initialized) {
        mode = requireString(
          settings["fleetOuterShips"],
          "settings.fleetOuterShips",
        );
        if (mode === "manual") {
          const global = requireRecord(game["global"], "game.global");
          const space = requireRecord(global["space"], "game.global.space");
          const yard = requireRecord(
            space["shipyard"],
            "game.global.space.shipyard",
          );
          const yardBlueprint = storeBlueprint(
            "yard",
            yard["blueprint"],
            "game.global.space.shipyard.blueprint",
          );
          const avail = requireFunction(
            manager["avail"],
            "FleetManagerOuter.avail",
          );
          manualBlueprintAvailable = Boolean(
            Reflect.apply(avail, manager, [yardBlueprint]),
          );
        } else if (mode !== "none") {
          configuredMinimumCrew = requireNumber(
            settings["fleetOuterCrew"],
            "settings.fleetOuterCrew",
          );
        }
      }
      const input = Object.freeze({
        initialized,
        mode,
        manualBlueprintAvailable,
        configuredMinimumCrew,
      });
      const planned = planOuterFleetCycle(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readTargeting(cycle: Readonly<OuterFleetAutomaticPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const global = requireRecord(active.game["global"], "game.global");
      const tech = requireRecord(global["tech"], "game.global.tech");
      const space = requireRecord(global["space"], "game.global.space");
      const exploreTau = requireBoolean(
        active.settings["fleetExploreTau"],
        "settings.fleetExploreTau",
      );
      const tauTechnology =
        tech["tauceti"] === undefined
          ? 0
          : requireNumber(tech["tauceti"], "game.global.tech.tauceti");
      let explorerAvailable = false;
      let explorerCount = 0;
      if (exploreTau && tauTechnology === 1) {
        const explorer = storeBlueprint(
          "explorer",
          active.manager["_explorerBlueprint"],
          "FleetManagerOuter._explorerBlueprint",
        );
        explorerAvailable = Boolean(
          Reflect.apply(
            requireFunction(active.manager["avail"], "FleetManagerOuter.avail"),
            active.manager,
            [explorer],
          ),
        );
        if (explorerAvailable) {
          explorerCount = requireNumber(
            Reflect.apply(
              requireFunction(
                active.manager["shipCount"],
                "FleetManagerOuter.shipCount",
              ),
              active.manager,
              ["tauceti", explorer],
            ),
            "Tau explorer count",
          );
        }
      }

      const tauSelected =
        exploreTau &&
        tauTechnology === 1 &&
        explorerAvailable &&
        explorerCount < 1;
      const erisTechnology =
        tech["eris"] === undefined
          ? 0
          : requireNumber(tech["eris"], "game.global.tech.eris");
      let erisWeighting = 0;
      let erisSensor = 50;
      if (!tauSelected && erisTechnology === 1) {
        erisWeighting = requireNumber(
          Reflect.apply(
            requireFunction(
              active.manager["getWeighting"],
              "FleetManagerOuter.getWeighting",
            ),
            active.manager,
            ["spc_eris"],
          ),
          "Eris fleet weighting",
        );
        if (erisWeighting > 0) {
          const assessment = requireRecord(
            Reflect.apply(
              requireFunction(
                active.manager["syndicate"],
                "FleetManagerOuter.syndicate",
              ),
              active.manager,
              ["spc_eris", true, true],
            ),
            "Eris syndicate assessment",
          );
          erisSensor = requireNumber(
            assessment["s"],
            "Eris syndicate assessment.s",
          );
        }
      }

      const erisSelected =
        !tauSelected &&
        erisTechnology === 1 &&
        erisWeighting > 0 &&
        erisSensor < 50;
      const regions: OuterFleetRegionInput[] = [];
      if (!tauSelected && !erisSelected) {
        const rawRegions = active.manager["Regions"];
        if (!Array.isArray(rawRegions)) {
          throw new TypeError("FleetManagerOuter.Regions must be an array");
        }
        const isUnlocked = requireFunction(
          active.manager["isUnlocked"],
          "FleetManagerOuter.isUnlocked",
        );
        const getWeighting = requireFunction(
          active.manager["getWeighting"],
          "FleetManagerOuter.getWeighting",
        );
        const syndicate = requireFunction(
          active.manager["syndicate"],
          "FleetManagerOuter.syndicate",
        );
        const getMaxDefense = requireFunction(
          active.manager["getMaxDefense"],
          "FleetManagerOuter.getMaxDefense",
        );
        for (let index = 0; index < rawRegions.length; index++) {
          const id = requireString(
            rawRegions[index],
            `FleetManagerOuter.Regions[${index}]`,
          );
          const unlocked = Boolean(
            Reflect.apply(isUnlocked, active.manager, [id]),
          );
          const weighting = unlocked
            ? requireNumber(
                Reflect.apply(getWeighting, active.manager, [id]),
                `fleet weighting ${id}`,
              )
            : 0;
          const syndicateRatio =
            unlocked && weighting > 0
              ? requireNumber(
                  Reflect.apply(syndicate, active.manager, [id, false, true]),
                  `syndicate ratio ${id}`,
                )
              : 1;
          const maximumDefense =
            unlocked && weighting > 0
              ? requireNumber(
                  Reflect.apply(getMaxDefense, active.manager, [id]),
                  `maximum fleet defense ${id}`,
                )
              : 0;
          let digsiteIncomplete = false;
          let requestedTroopers = 0;
          let requestedTanks = 0;
          let reportedSupport: number | null = null;
          if (id === "spc_eris") {
            const rawDigsite = space["digsite"];
            if (rawDigsite !== undefined) {
              const digsite = requireRecord(
                rawDigsite,
                "game.global.space.digsite",
              );
              const count = digsite["count"];
              if (count !== undefined) {
                digsiteIncomplete =
                  requireNumber(count, "game.global.space.digsite.count") < 100;
              }
            }
            if (digsiteIncomplete) {
              const trooper = space["shock_trooper"];
              const tank = space["tank"];
              requestedTroopers =
                trooper === undefined
                  ? 0
                  : requireNumber(
                      requireRecord(trooper, "game.global.space.shock_trooper")[
                        "on"
                      ] ?? 0,
                      "game.global.space.shock_trooper.on",
                    );
              requestedTanks =
                tank === undefined
                  ? 0
                  : requireNumber(
                      requireRecord(tank, "game.global.space.tank")["on"] ?? 0,
                      "game.global.space.tank.on",
                    );
              const support = active.resources["Eris_Support"];
              if (typeof support === "object" && support !== null) {
                const rawSupport = (support as UnknownRecord)[
                  "currentQuantity"
                ];
                reportedSupport =
                  typeof rawSupport === "number" && Number.isFinite(rawSupport)
                    ? rawSupport
                    : null;
              }
            }
          }
          regions.push(
            Object.freeze({
              id,
              unlocked,
              weighting,
              syndicateRatio,
              maximumDefense,
              digsiteIncomplete,
              requestedTroopers,
              requestedTanks,
              reportedSupport,
            }),
          );
        }
      }
      const input: OuterFleetTargetInput = Object.freeze({
        exploreTau,
        tauTechnology,
        explorerAvailable,
        explorerCount,
        erisTechnology,
        erisWeighting,
        erisSensor,
        regions: Object.freeze(regions),
      });
      const planned = planOuterFleetTarget(cycle, input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readBlueprint(target: Readonly<OuterFleetTargetPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const global = requireRecord(active.game["global"], "game.global");
      const space = requireRecord(global["space"], "game.global.space");
      const yard = requireRecord(
        space["shipyard"],
        "game.global.space.shipyard",
      );
      const avail = requireFunction(
        active.manager["avail"],
        "FleetManagerOuter.avail",
      );
      let yardAvailable = false;
      let scoutAvailable = false;
      let scoutCount = 0;
      let maximumScouts = 0;
      let fighterAvailable = false;
      if (target.forcedBlueprint !== "explorer" && target.mode === "user") {
        const yardBlueprint = storeBlueprint(
          "yard",
          yard["blueprint"],
          "game.global.space.shipyard.blueprint",
        );
        yardAvailable = Boolean(
          Reflect.apply(avail, active.manager, [yardBlueprint]),
        );
      } else if (target.forcedBlueprint === null) {
        const getScout = requireFunction(
          active.manager["getScoutBlueprint"],
          "FleetManagerOuter.getScoutBlueprint",
        );
        const scout = storeBlueprint(
          "scout",
          Reflect.apply(getScout, active.manager, []),
          "scout blueprint",
        );
        scoutAvailable = Boolean(Reflect.apply(avail, active.manager, [scout]));
        if (scoutAvailable) {
          scoutCount = requireNumber(
            Reflect.apply(
              requireFunction(
                active.manager["shipCount"],
                "FleetManagerOuter.shipCount",
              ),
              active.manager,
              [target.targetRegion, scout],
            ),
            `scout count ${target.targetRegion}`,
          );
          maximumScouts = requireNumber(
            Reflect.apply(
              requireFunction(
                active.manager["getMaxScouts"],
                "FleetManagerOuter.getMaxScouts",
              ),
              active.manager,
              [target.targetRegion],
            ),
            `maximum scouts ${target.targetRegion}`,
          );
        }
        if (!scoutAvailable || scoutCount >= maximumScouts) {
          const getFighter = requireFunction(
            active.manager["getFighterBlueprint"],
            "FleetManagerOuter.getFighterBlueprint",
          );
          const fighter = storeBlueprint(
            "fighter",
            Reflect.apply(getFighter, active.manager, []),
            "fighter blueprint",
          );
          fighterAvailable = Boolean(
            Reflect.apply(avail, active.manager, [fighter]),
          );
        }
      }
      const targetLocationName = requireString(
        Reflect.apply(
          requireFunction(
            active.manager["getLocName"],
            "FleetManagerOuter.getLocName",
          ),
          active.manager,
          [target.targetRegion],
        ),
        `location name ${target.targetRegion}`,
      );
      const input: OuterFleetBlueprintInput = Object.freeze({
        target,
        targetLocationName,
        yardAvailable,
        scoutAvailable,
        scoutCount,
        maximumScouts,
        fighterAvailable,
      });
      const planned = planOuterFleetBlueprint(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readCandidate(candidate: Readonly<OuterFleetCandidatePlan>) {
      const active = activeSession();
      expectedDecision = null;
      const blueprint = blueprints.get(candidate.blueprint);
      if (blueprint === undefined) {
        throw new Error(
          `outer fleet blueprint ${candidate.blueprint} is missing`,
        );
      }
      const shipName = requireString(
        Reflect.apply(
          requireFunction(
            active.manager["getShipName"],
            "FleetManagerOuter.getShipName",
          ),
          active.manager,
          [blueprint],
        ),
        `ship name ${candidate.blueprint}`,
      );
      const shipClass = requireString(
        blueprint["class"],
        `${candidate.blueprint} blueprint.class`,
      );
      const global = requireRecord(active.game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const baseCrew = race["grenadier"]
        ? requireNumber(
            GRENADIER_CREW[shipClass],
            `grenadier crew for ${shipClass}`,
          )
        : requireNumber(
            requireRecord(
              active.manager["ClassCrew"],
              "FleetManagerOuter.ClassCrew",
            )[shipClass],
            `FleetManagerOuter.ClassCrew.${shipClass}`,
          );
      const shipCrew =
        baseCrew *
        requireNumber(
          dependencies.traitVal("high_pop", 0, 1),
          "traitVal(high_pop)",
        );
      let authority: OuterFleetCandidateInput["authority"] = Object.freeze({
        status: "not-required",
      });
      const manageAuthority = requireBoolean(
        active.settings["authorityManage"],
        "settings.authorityManage",
      );
      const minimumAuthority = requireNumber(
        active.settings["generalMinimumAuthority"],
        "settings.generalMinimumAuthority",
      );
      if (
        manageAuthority &&
        minimumAuthority !== 0 &&
        race["universe"] === "evil"
      ) {
        const authorityResource = requireRecord(
          active.resources["Authority"],
          "resources.Authority",
        );
        const isUnlocked = requireFunction(
          authorityResource["isUnlocked"],
          "resources.Authority.isUnlocked",
        );
        if (Reflect.apply(isUnlocked, authorityResource, [])) {
          authority = readAuthorityAssessment(dependencies, shipCrew);
        }
      }
      const input: OuterFleetCandidateInput = Object.freeze({
        candidate,
        shipName,
        shipCrew,
        authority,
      });
      const planned = planOuterFleetCandidate(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readBuildReadiness(plan: Readonly<OuterFleetReadinessPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const blueprint = blueprints.get(plan.blueprint);
      if (blueprint === undefined) {
        throw new Error(`outer fleet blueprint ${plan.blueprint} is missing`);
      }
      const missingResource = Reflect.apply(
        requireFunction(
          active.manager["getMissingResource"],
          "FleetManagerOuter.getMissingResource",
        ),
        active.manager,
        [blueprint],
      );
      let missingResourceName: string | null = null;
      let currentCityGarrison = 0;
      if (missingResource) {
        const resourceId = requireString(
          missingResource,
          "missing outer-fleet resource id",
        );
        const resource = requireRecord(
          active.resources[resourceId],
          `resources.${resourceId}`,
        );
        missingResourceName = requireString(
          resource["name"],
          `resources.${resourceId}.name`,
        );
      } else {
        currentCityGarrison = requireNumber(
          active.warManager["currentCityGarrison"],
          "WarManager.currentCityGarrison",
        );
      }
      const input: OuterFleetBuildReadinessInput = Object.freeze({
        plan,
        missingResourceName,
        currentCityGarrison,
      });
      expectedDecision = planOuterFleetBuild(input);
      return input;
    },
  });

  const executor: OuterFleetExecutor = Object.freeze({
    execute(decision: Readonly<OuterFleetDecision>) {
      const active = session;
      const expected = expectedDecision;
      if (active === null || expected === null) {
        return stale(
          "outer-fleet-session-missing",
          "outer fleet session is missing",
        );
      }
      if (
        dependencies.getFleetManagerOuter() !== active.manager ||
        dependencies.getWarManager() !== active.warManager ||
        dependencies.getGame() !== active.game ||
        dependencies.getSettings() !== active.settings ||
        dependencies.getResources() !== active.resources
      ) {
        return stale(
          "outer-fleet-source-changed",
          "outer fleet source changed",
        );
      }
      if (!decisionMatches(expected, decision)) {
        return rejected(
          "invalid-outer-fleet-decision",
          "outer fleet decision does not match the sampled plan",
        );
      }
      const blueprint =
        decision.blueprint === null
          ? null
          : (blueprints.get(decision.blueprint) ?? null);
      if (decision.blueprint !== null && blueprint === null) {
        return stale(
          "outer-fleet-blueprint-changed",
          "outer fleet blueprint changed",
        );
      }
      const updateNextShip = requireFunction(
        active.manager["updateNextShip"],
        "FleetManagerOuter.updateNextShip",
      );
      const build =
        decision.kind === "build-outer-fleet"
          ? requireFunction(active.manager["build"], "FleetManagerOuter.build")
          : null;
      expectedDecision = null;

      if (
        decision.kind === "outer-fleet-status" &&
        decision.messageBeforeUpdate !== null
      ) {
        active.manager["nextShipMsg"] = decision.messageBeforeUpdate;
      }
      Reflect.apply(updateNextShip, active.manager, [blueprint]);
      if (decision.nextShipName !== null) {
        active.manager["nextShipName"] = decision.nextShipName;
      }
      if (
        decision.kind === "outer-fleet-status" &&
        decision.messageAfterUpdate !== null
      ) {
        active.manager["nextShipMsg"] = decision.messageAfterUpdate;
      }
      if (decision.kind === "outer-fleet-status") return SUCCEEDED;

      if (
        !Reflect.apply(build!, active.manager, [
          blueprint,
          decision.targetRegion,
        ])
      ) {
        active.manager["nextShipMsg"] =
          `Invalid design! Next ship(${decision.nextShipName}) is missing power`;
        return SUCCEEDED;
      }
      const gameLog = requireRecord(dependencies.getGameLog(), "GameLog");
      const logSuccess = requireFunction(
        gameLog["logSuccess"],
        "GameLog.logSuccess",
      );
      Reflect.apply(logSuccess, gameLog, [
        "outer_fleet",
        `${decision.shipName} has been assembled, and dispatched to ${decision.targetLocationName}.`,
        ["combat"],
      ]);
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
