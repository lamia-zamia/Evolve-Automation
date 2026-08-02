import {
  planMechCycle,
  resolveMechScrapMode,
  shouldReadMechScrapCandidates,
  shouldSaveMechSupply,
  type MechBuildDecision,
  type MechContinuation,
  type MechCost,
  type MechCycleDecision,
  type MechCycleInput,
  type MechDesign,
  type MechPlanningInput,
  type MechResourceInput,
  type MechScrapCandidate,
  type MechScrapDecision,
  type MechSummary,
} from "../../../domain/combat/mech.ts";
import type { MechExecutor, MechReader } from "../../../ports/mech.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

export interface MechAdapterDependencies {
  // TRANSITIONAL: MechManager still owns the Vue-backed lab controls and its
  // current random design generator. Replace both with the final browser and
  // randomness adapters when the shared manager is retired.
  readonly getMechManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly haveTech: (technology: string, level?: number) => unknown;
  readonly haveTask: (task: string) => unknown;
  readonly getGameLog: () => unknown;
  readonly getJQuery: () => unknown;
  readonly readDebugEnabled?: () => boolean;
  readonly debugLog?: (message: string) => void;
}

interface MechSession {
  readonly manager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly settings: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly buildings: UnknownRecord;
  readonly bay: UnknownRecord;
  readonly cycleInput: Readonly<MechCycleInput>;
  readonly mechs: Map<number, UnknownRecord>;
  readonly designs: Map<string, UnknownRecord>;
  planningInput: Readonly<MechPlanningInput> | null;
  nextToken: number;
}

function call(
  target: UnknownRecord,
  key: string,
  path: string,
  args: readonly unknown[] = [],
): unknown {
  return Reflect.apply(requireFunction(target[key], path), target, args);
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function readSummary(
  value: unknown,
  path: string,
): {
  readonly summary: Readonly<MechSummary>;
  readonly raw: UnknownRecord;
} {
  const raw = requireRecord(value, path);
  return {
    raw,
    summary: Object.freeze({
      id: requireNumber(raw["id"], `${path}.id`),
      size: requireString(raw["size"], `${path}.size`),
      infernal: Boolean(raw["infernal"]),
      power: requireNumber(raw["power"], `${path}.power`),
      efficiency: requireNumber(raw["efficiency"], `${path}.efficiency`),
    }),
  };
}

function readResource(
  value: unknown,
  path: string,
): {
  readonly raw: UnknownRecord;
  readonly input: Readonly<MechResourceInput>;
} {
  const raw = requireRecord(value, path);
  return {
    raw,
    input: Object.freeze({
      current: requireNumber(raw["currentQuantity"], `${path}.currentQuantity`),
      maximum: requireNumber(raw["maxQuantity"], `${path}.maxQuantity`),
      spare: requireNumber(raw["spareQuantity"], `${path}.spareQuantity`),
      spareMaximum: requireNumber(
        raw["spareMaxQuantity"],
        `${path}.spareMaxQuantity`,
      ),
      rate: requireNumber(raw["rateOfChange"], `${path}.rateOfChange`),
      storageRatio: requireNumber(raw["storageRatio"], `${path}.storageRatio`),
    }),
  };
}

function readCost(value: unknown, path: string): Readonly<MechCost> {
  const values = readArray(value, path);
  return Object.freeze({
    gems: requireNumber(values[0], `${path}[0]`),
    supply: requireNumber(values[1], `${path}[1]`),
    space: requireNumber(values[2], `${path}[2]`),
  });
}

function readDesign(
  raw: UnknownRecord,
  token: string,
  path: string,
): Readonly<MechDesign> {
  return Object.freeze({
    token,
    size: requireString(raw["size"], `${path}.size`),
    power: requireNumber(raw["power"], `${path}.power`),
    efficiency: requireNumber(raw["efficiency"], `${path}.efficiency`),
  });
}

function cycleDecisionsMatch(
  left: Readonly<MechCycleDecision>,
  right: Readonly<MechCycleDecision>,
): boolean {
  return (
    left.prolongActive === right.prolongActive &&
    left.savingSupply === right.savingSupply &&
    left.proceed === right.proceed &&
    left.drag?.oldId === right.drag?.oldId &&
    left.drag?.newId === right.drag?.newId
  );
}

function unavailableCycle(): Readonly<MechCycleInput> {
  return Object.freeze({
    available: false,
    prolongActive: false,
    savingSupply: false,
    totalMechs: 0,
    activeMechs: Object.freeze([]),
    inactiveMechs: Object.freeze([]),
    hasTask: false,
    buildMode: "none",
  });
}

export function createMechAdapter(dependencies: MechAdapterDependencies): {
  readonly reader: MechReader;
  readonly executor: MechExecutor;
} {
  let session: MechSession | null = null;

  const debug = (message: () => string): void => {
    if (dependencies.readDebugEnabled?.() === true && dependencies.debugLog) {
      dependencies.debugLog(`[mech] ${message()}`);
    }
  };

  const reader: MechReader = Object.freeze({
    readCycle() {
      session = null;
      const manager = requireRecord(
        dependencies.getMechManager(),
        "MechManager",
      );
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      if (race["warlord"]) {
        debug(() => "cycle: unavailable (warlord race)");
        return unavailableCycle();
      }
      if (!callBoolean(manager, "initLab", "MechManager")) {
        debug(
          () => "cycle: unavailable (initLab failed, mech lab Vue missing)",
        );
        return unavailableCycle();
      }
      const jquery = dependencies.getJQuery();
      if (typeof jquery !== "function") {
        throw new TypeError("jQuery must be a function");
      }
      const dragged = requireRecord(
        Reflect.apply(jquery, undefined, [
          "#mechList .mechRow[draggable=true]",
        ]),
        "mech draggable rows",
      );
      const draggableRows = requireNumber(
        dragged["length"],
        "mech draggable rows.length",
      );
      if (draggableRows > 0) {
        debug(() => `cycle: unavailable (${draggableRows} rows mid-drag)`);
        return unavailableCycle();
      }

      const portal = requireRecord(global["portal"], "game.global.portal");
      const bay = requireRecord(
        portal["mechbay"],
        "game.global.portal.mechbay",
      );
      const purifier = requireRecord(
        buildings["SpirePurifier"],
        "buildings.SpirePurifier",
      );
      const prolongActive = Boolean(manager["isActive"]);
      const savingSupply =
        Boolean(manager["saveSupply"]) &&
        requireBoolean(settings["mechBaysFirst"], "settings.mechBaysFirst") &&
        requireNumber(
          purifier["stateOffCount"],
          "buildings.SpirePurifier.stateOffCount",
        ) === 0;
      const inactiveRaw = readArray(
        manager["inactiveMechs"],
        "MechManager.inactiveMechs",
      );
      const mechs = new Map<number, UnknownRecord>();
      const inactiveMechs = inactiveRaw.map((value, index) => {
        const result = readSummary(
          value,
          `MechManager.inactiveMechs[${index}]`,
        );
        mechs.set(result.summary.id, result.raw);
        return result.summary;
      });
      const activeMechs =
        inactiveMechs.length === 0
          ? []
          : readArray(manager["activeMechs"], "MechManager.activeMechs").map(
              (value, index) => {
                const result = readSummary(
                  value,
                  `MechManager.activeMechs[${index}]`,
                );
                mechs.set(result.summary.id, result.raw);
                return result.summary;
              },
            );
      const bayMechs = readArray(
        bay["mechs"],
        "game.global.portal.mechbay.mechs",
      );
      const input = Object.freeze({
        available: true,
        prolongActive,
        savingSupply,
        totalMechs: bayMechs.length,
        activeMechs: Object.freeze(activeMechs),
        inactiveMechs: Object.freeze(inactiveMechs),
        hasTask:
          inactiveMechs.length === 0
            ? Boolean(dependencies.haveTask("mech"))
            : false,
        buildMode: requireString(settings["mechBuild"], "settings.mechBuild"),
      });
      session = {
        manager,
        game,
        settings,
        resources,
        buildings,
        bay,
        cycleInput: input,
        mechs,
        designs: new Map<string, UnknownRecord>(),
        planningInput: null,
        nextToken: 1,
      };
      debug(
        () =>
          `cycle: mechs=${input.totalMechs} active=${activeMechs.length} inactive=${inactiveMechs.length}` +
          ` isActive=${String(input.prolongActive)} saveSupply=${String(manager["saveSupply"])}` +
          ` savingSupply=${String(input.savingSupply)} hasTask=${String(input.hasTask)} buildMode=${input.buildMode}`,
      );
      return input;
    },

    readPlanning(decision: Readonly<MechCycleDecision>) {
      const active = session;
      if (active === null) throw new Error("mech cycle has not been sampled");
      const expected = planMechCycle(active.cycleInput);
      if (expected === null || !cycleDecisionsMatch(expected, decision)) {
        throw new Error("mech cycle decision does not match the sampled plan");
      }
      const { manager, settings, resources, buildings, bay } = active;
      let rawDesign: UnknownRecord;
      let forceBuild = false;
      if (active.cycleInput.buildMode === "random") {
        const preferred = readArray(
          call(manager, "getPreferredSize", "MechManager.getPreferredSize"),
          "MechManager.getPreferredSize result",
        );
        const size = requireString(preferred[0], "preferred mech size");
        forceBuild = Boolean(preferred[1]);
        rawDesign = requireRecord(
          call(manager, "getRandomMech", "MechManager.getRandomMech", [size]),
          "random mech",
        );
      } else {
        const blueprint = requireRecord(bay["blueprint"], "mechbay.blueprint");
        const statistics = requireRecord(
          call(manager, "getMechStats", "MechManager.getMechStats", [
            blueprint,
          ]),
          "blueprint mech statistics",
        );
        rawDesign = { ...blueprint, ...statistics };
      }
      const design = readDesign(rawDesign, "primary", "selected mech");
      active.designs.set(design.token, rawDesign);
      const cost = readCost(
        call(manager, "getMechCost", "MechManager.getMechCost", [rawDesign]),
        "selected mech cost",
      );
      const fillBay = requireBoolean(
        settings["mechFillBay"],
        "settings.mechFillBay",
      );
      const supply = readResource(resources["Supply"], "resources.Supply");
      const gems = readResource(resources["Soul_Gem"], "resources.Soul_Gem");
      if (!fillBay && supply.input.spareMaximum < cost.supply) {
        debug(
          () =>
            `planning: stop, fillBay off and supply capacity ${supply.input.spareMaximum} < cost ${cost.supply}`,
        );
        return null;
      }

      const baySpace =
        requireNumber(bay["max"], "mechbay.max") -
        requireNumber(bay["bay"], "mechbay.bay");
      const tower = requireRecord(
        buildings["SpireTower"],
        "buildings.SpireTower",
      );
      const prestigeType = requireString(
        settings["prestigeType"],
        "settings.prestigeType",
      );
      const lastFloor =
        requireBoolean(settings["autoPrestige"], "settings.autoPrestige") &&
        prestigeType === "demonic" &&
        requireNumber(tower["count"], "buildings.SpireTower.count") >=
          requireNumber(
            settings["prestigeDemonicFloor"],
            "settings.prestigeDemonicFloor",
          ) &&
        Boolean(dependencies.haveTech("waygate", 3));
      const savingSupply = lastFloor ? false : decision.savingSupply;
      const saveSupplyRatio = requireNumber(
        settings["mechSaveSupplyRatio"],
        "settings.mechSaveSupplyRatio",
      );
      let titanSupplyRefund = 0;
      let saveTimeToClear = Number.POSITIVE_INFINITY;
      if (saveSupplyRatio > 0 && !lastFloor && !forceBuild) {
        if (baySpace < cost.space) {
          titanSupplyRefund = readCostLikeRefund(
            call(manager, "getMechRefund", "MechManager.getMechRefund", [
              { size: "titan" },
            ]),
            "titan mech refund",
          ).supply;
        }
        saveTimeToClear = callNumber(manager, "getTimeToClear", "MechManager");
      }
      if (
        shouldSaveMechSupply({
          saveSupplyRatio,
          lastFloor,
          forceBuild,
          supplyMaximum: supply.input.maximum,
          supplyCurrent: supply.input.current,
          supplyRate: supply.input.rate,
          baySpace,
          designSpace: cost.space,
          titanSupplyRefund,
          timeToClear: saveTimeToClear,
        })
      ) {
        debug(
          () =>
            `planning: stop, saving supply for next floor (ratio=${saveSupplyRatio}` +
            ` supply=${supply.input.current}/${supply.input.maximum} rate=${supply.input.rate}` +
            ` timeToClear=${saveTimeToClear} titanRefund=${titanSupplyRefund})`,
        );
        return null;
      }

      const mechBayBuilding = requireRecord(
        buildings["SpireMechBay"],
        "buildings.SpireMechBay",
      );
      const purifier = requireRecord(
        buildings["SpirePurifier"],
        "buildings.SpirePurifier",
      );
      const autoBuild = requireBoolean(
        settings["autoBuild"],
        "settings.autoBuild",
      );
      const baysFirst = requireBoolean(
        settings["mechBaysFirst"],
        "settings.mechBaysFirst",
      );
      let canExpandBay = false;
      if (
        autoBuild &&
        baysFirst &&
        callBoolean(mechBayBuilding, "isAutoBuildable", "SpireMechBay")
      ) {
        canExpandBay = callBoolean(
          mechBayBuilding,
          "isAffordable",
          "SpireMechBay",
          true,
        );
        if (!canExpandBay) {
          const purifierAuto = callBoolean(
            purifier,
            "isAutoBuildable",
            "SpirePurifier",
          );
          canExpandBay =
            purifierAuto &&
            callBoolean(purifier, "isAffordable", "SpirePurifier", true) &&
            requireNumber(
              purifier["stateOffCount"],
              "buildings.SpirePurifier.stateOffCount",
            ) === 0;
        }
      }
      const configuredScrapMode = requireString(
        settings["mechScrap"],
        "settings.mechScrap",
      );
      const minimumSupplyRate = requireNumber(
        settings["mechMinSupply"],
        "settings.mechMinSupply",
      );
      const waygate = requireRecord(
        buildings["SpireWaygate"],
        "buildings.SpireWaygate",
      );
      const waygateActiveCount = requireNumber(
        waygate["stateOnCount"],
        "buildings.SpireWaygate.stateOnCount",
      );
      const mechsPower = requireNumber(
        manager["mechsPower"],
        "MechManager.mechsPower",
      );
      let timeToClear = 0;
      const suppressMixed =
        canExpandBay &&
        supply.input.current < supply.input.maximum &&
        !decision.prolongActive &&
        supply.input.rate >= minimumSupplyRate;
      if (
        configuredScrapMode === "mixed" &&
        !suppressMixed &&
        waygateActiveCount !== 1
      ) {
        timeToClear = callNumber(manager, "getTimeToClear", "MechManager");
      }
      const sizeOrder = readArray(manager["Size"], "MechManager.Size").map(
        (value, index) => requireString(value, `MechManager.Size[${index}]`),
      );
      const base: MechPlanningInput = {
        design,
        cost,
        forceBuild,
        prolongActive: decision.prolongActive,
        savingSupply,
        fillBay,
        baySpace,
        bayMaximum: requireNumber(bay["max"], "mechbay.max"),
        scouts: requireNumber(bay["scouts"], "mechbay.scouts"),
        sizeOrder: Object.freeze(sizeOrder),
        supply: supply.input,
        gems: gems.input,
        lastFloor,
        canExpandBay,
        configuredScrapMode,
        waygateActiveCount,
        minimumSupplyRate,
        saveSupplyRatio,
        scrapEfficiency: requireNumber(
          settings["mechScrapEfficiency"],
          "settings.mechScrapEfficiency",
        ),
        scoutsRatio: requireNumber(
          settings["mechScouts"],
          "settings.mechScouts",
        ),
        rebuildScouts: requireBoolean(
          settings["mechScoutsRebuild"],
          "settings.mechScoutsRebuild",
        ),
        mechsPower,
        timeToClear,
        activeMechs: Object.freeze([]),
      };
      // Calling this pure helper here controls which live manager values are
      // sampled; locked branches remain just as lazy as in the legacy path.
      const resolvedScrapMode = resolveMechScrapMode(base);
      let candidates: readonly MechScrapCandidate[] = Object.freeze([]);
      if (shouldReadMechScrapCandidates(base)) {
        const bestMech = requireRecord(
          manager["bestMech"],
          "MechManager.bestMech",
        );
        candidates = Object.freeze(
          readArray(manager["activeMechs"], "MechManager.activeMechs").map(
            (value, index) => {
              const path = `MechManager.activeMechs[${index}]`;
              const { raw, summary } = readSummary(value, path);
              active.mechs.set(summary.id, raw);
              const best = requireRecord(
                bestMech[summary.size],
                `MechManager.bestMech.${summary.size}`,
              );
              const bestPower = requireNumber(
                best["power"],
                `MechManager.bestMech.${summary.size}.power`,
              );
              let gemRefund = 0;
              let supplyRefund = 0;
              let space = 0;
              if (!(
                (summary.infernal && summary.size !== "collector") ||
                summary.power >= bestPower
              )) {
                const refund = readCostLikeRefund(
                  call(manager, "getMechRefund", "MechManager.getMechRefund", [
                    raw,
                  ]),
                  `${path} refund`,
                );
                gemRefund = refund.gems;
                supplyRefund = refund.supply;
                space = callNumber(manager, "getMechSpace", "MechManager", raw);
              }
              return Object.freeze({
                ...summary,
                bestPower,
                gemRefund,
                supplyRefund,
                space,
              });
            },
          ),
        );
      }
      const input = Object.freeze({ ...base, activeMechs: candidates });
      active.planningInput = input;
      debug(
        () =>
          `planning: size=${design.size} forceBuild=${String(forceBuild)}` +
          ` cost={gems:${cost.gems},supply:${cost.supply},space:${cost.space}}` +
          ` bay=${base.bayMaximum - baySpace}/${base.bayMaximum} scouts=${base.scouts}` +
          ` supply={cur:${Math.round(supply.input.current)},max:${supply.input.maximum},spare:${Math.round(supply.input.spare)},spareMax:${supply.input.spareMaximum},rate:${Math.round(supply.input.rate)},ratio:${supply.input.storageRatio.toFixed(3)}}` +
          ` gems={cur:${gems.input.current},spare:${gems.input.spare}}` +
          ` lastFloor=${String(lastFloor)} savingSupply=${String(savingSupply)} canExpandBay=${String(canExpandBay)}` +
          ` scrapMode=${resolvedScrapMode} scrapCandidates=${candidates.length}` +
          ` mechsPower=${mechsPower} timeToClear=${timeToClear}`,
      );
      return input;
    },

    readSmallerCost(size: string) {
      const active = session;
      if (active === null || active.planningInput === null) {
        throw new Error("mech planning has not been sampled");
      }
      const cost = readCost(
        call(active.manager, "getMechCost", "MechManager.getMechCost", [
          { size },
        ]),
        `mech cost for ${size}`,
      );
      debug(
        () =>
          `planning: trying smaller size=${size} cost={gems:${cost.gems},supply:${cost.supply},space:${cost.space}}`,
      );
      return cost;
    },

    readSmallerDesign(size: string) {
      const active = session;
      if (active === null || active.planningInput === null) {
        throw new Error("mech planning has not been sampled");
      }
      const raw = requireRecord(
        call(active.manager, "getRandomMech", "MechManager.getRandomMech", [
          size,
        ]),
        `random ${size} mech`,
      );
      const token = `smaller-${active.nextToken++}`;
      const design = readDesign(raw, token, `random ${size} mech`);
      active.designs.set(token, raw);
      return design;
    },
  });

  const executor: MechExecutor = Object.freeze({
    prepare(decision: Readonly<MechCycleDecision>) {
      const active = session;
      if (active === null)
        return stale("mech-session-missing", "mech session is missing");
      if (
        dependencies.getMechManager() !== active.manager ||
        dependencies.getGame() !== active.game
      ) {
        return stale("mech-source-changed", "mech source changed");
      }
      const expected = planMechCycle(active.cycleInput);
      if (expected === null || !cycleDecisionsMatch(expected, decision)) {
        return rejected(
          "invalid-mech-cycle-decision",
          "mech cycle decision does not match the sampled plan",
        );
      }
      debug(
        () =>
          `prepare: isActive ${String(active.manager["isActive"])} -> false, proceed=${String(decision.proceed)}` +
          ` drag=${decision.drag === null ? "none" : `${decision.drag.oldId}->${decision.drag.newId}`}`,
      );
      active.manager["isActive"] = false;
      active.manager["saveSupply"] = false;
      if (decision.drag !== null) {
        call(active.manager, "dragMech", "MechManager.dragMech", [
          decision.drag.oldId,
          decision.drag.newId,
        ]);
      }
      return SUCCEEDED;
    },

    scrap(decision: Readonly<MechScrapDecision>) {
      const active = session;
      if (active === null || active.planningInput === null) {
        return stale("mech-planning-missing", "mech planning is missing");
      }
      const log = requireRecord(dependencies.getGameLog(), "GameLog");
      const logSuccess = requireFunction(
        log["logSuccess"],
        "GameLog.logSuccess",
      );
      const rawMechs: UnknownRecord[] = [];
      for (const id of decision.ids) {
        const mech = active.mechs.get(id);
        if (mech === undefined) {
          return stale(
            "mech-scrap-target-changed",
            "mech scrap target changed",
            { id },
          );
        }
        rawMechs.push(mech);
      }
      if (rawMechs.length > 1) {
        Reflect.apply(logSuccess, log, [
          "mech_scrap",
          `${rawMechs.length} mechs (~${Math.round(decision.averageRating * 100)}%) has been scrapped.`,
          ["hell"],
        ]);
      } else if (rawMechs.length === 1) {
        const description = requireString(
          call(active.manager, "mechDesc", "MechManager.mechDesc", [
            rawMechs[0],
          ]),
          "mech description",
        );
        Reflect.apply(logSuccess, log, [
          "mech_scrap",
          `${description} mech has been scrapped.`,
          ["hell"],
        ]);
      }
      debug(
        () =>
          `scrap: ids=[${decision.ids.join(",")}] gained={supply:${Math.round(decision.supplyGained)},gems:${decision.gemsGained},space:${decision.spaceGained}}`,
      );
      for (const mech of rawMechs) {
        call(active.manager, "scrapMech", "MechManager.scrapMech", [mech]);
      }
      const supply = requireRecord(
        active.resources["Supply"],
        "resources.Supply",
      );
      const gems = requireRecord(
        active.resources["Soul_Gem"],
        "resources.Soul_Gem",
      );
      supply["currentQuantity"] = Math.min(
        requireNumber(
          supply["currentQuantity"],
          "resources.Supply.currentQuantity",
        ) + decision.supplyGained,
        requireNumber(supply["maxQuantity"], "resources.Supply.maxQuantity"),
      );
      gems["currentQuantity"] =
        requireNumber(
          gems["currentQuantity"],
          "resources.Soul_Gem.currentQuantity",
        ) + decision.gemsGained;
      return SUCCEEDED;
    },

    build(
      decision: Readonly<MechBuildDecision>,
      continuation: Readonly<MechContinuation>,
    ) {
      const active = session;
      if (active === null || active.planningInput === null) {
        return stale("mech-planning-missing", "mech planning is missing");
      }
      const rawDesign = active.designs.get(decision.designToken);
      if (rawDesign === undefined) {
        return rejected("unknown-mech-design", "mech design token is unknown");
      }
      const supply = requireRecord(
        active.resources["Supply"],
        "resources.Supply",
      );
      const gems = requireRecord(
        active.resources["Soul_Gem"],
        "resources.Soul_Gem",
      );
      if (
        requireNumber(
          supply["currentQuantity"],
          "resources.Supply.currentQuantity",
        ) !== continuation.supplyCurrent ||
        requireNumber(
          gems["currentQuantity"],
          "resources.Soul_Gem.currentQuantity",
        ) !== continuation.gemsCurrent
      ) {
        debug(
          () =>
            `build: stale, supply ${String(supply["currentQuantity"])} vs ${continuation.supplyCurrent},` +
            ` gems ${String(gems["currentQuantity"])} vs ${continuation.gemsCurrent}`,
        );
        return stale("mech-resources-changed", "mech resources changed");
      }
      debug(
        () =>
          `build: size=${String(rawDesign["size"])} cost={gems:${decision.cost.gems},supply:${decision.cost.supply}}` +
          ` restoring isActive=${String(decision.prolongActive)}`,
      );
      call(active.manager, "buildMech", "MechManager.buildMech", [rawDesign]);
      supply["currentQuantity"] =
        continuation.supplyCurrent - decision.cost.supply;
      gems["currentQuantity"] = continuation.gemsCurrent - decision.cost.gems;
      active.manager["isActive"] = decision.prolongActive;
      session = null;
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}

function readCostLikeRefund(
  value: unknown,
  path: string,
): { readonly gems: number; readonly supply: number } {
  const values = readArray(value, path);
  return Object.freeze({
    gems: requireNumber(values[0], `${path}[0]`),
    supply: requireNumber(values[1], `${path}[1]`),
  });
}
