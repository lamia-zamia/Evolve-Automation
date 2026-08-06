import type { CostConflict } from "../domain/cost-conflicts.ts";
import type { GameUiSurfacePort } from "../ports/game-ui-surface.ts";

/**
 * The DOM surface the tooltips use, as narrow structural types.
 *
 * TRANSITIONAL: the implementation is the game's jQuery and MutationObserver today. Keeping the
 * contract this small is what lets the DOM implementation be replaced without touching the notes.
 */
interface TooltipNode {
  append(content: string): TooltipNode;
  find(selector: string): TooltipNode;
}

/** The popper element the game inserts, which names the target it describes. */
interface TooltipElement {
  readonly id?: string;
  readonly dataset: { readonly id: string };
  querySelector(selector: string): unknown;
}

interface TooltipMutation {
  readonly addedNodes: {
    forEach(callback: (node: TooltipElement) => void): void;
  };
}

type TooltipObserverConstructor = new (callback: () => void) => {
  observe(target: TooltipElement, options: { childList: boolean }): void;
  disconnect(): void;
};

/** What a note reads off whatever the tooltip describes: a building, a project, or a technology. */
interface TooltipTarget {
  readonly _tab?: string;
  readonly extraDescription?: string;
  isResearched?: () => boolean;
}

/** A building also carries the counters its derived notes are computed from. */
interface TooltipBuilding extends TooltipTarget {
  readonly title: string;
  readonly count: number;
  readonly stateOnCount: number;
  readonly on?: number;
}

/**
 * The buildings whose wrappers a note reads. The script defines a wrapper for every building in the
 * game, so a note can read one the player has not unlocked; `AsphodelCorruptor` stays optional
 * because the spirit-battery note already checks for it before reading its power state.
 */
interface TooltipBuildings {
  readonly Alien1SuperFreighter: TooltipBuilding;
  readonly AlphaExchange: TooltipBuilding;
  readonly AsphodelCorruptor?: TooltipBuilding;
  readonly BadlandsAttractor: TooltipBuilding;
  readonly BlackholeMassEjector: TooltipBuilding;
  readonly BlackholeStellarEngine: TooltipBuilding;
  readonly BootCamp: TooltipBuilding;
  readonly DwarfShipyard: TooltipBuilding;
  readonly EnceladusBase: TooltipBuilding;
  readonly GorddonFreighter: TooltipBuilding;
  readonly Hospital: TooltipBuilding;
  readonly IsleSpiritBattery: TooltipBuilding;
  readonly IsleSpiritVacuum: TooltipBuilding;
  readonly LakeCoolingTower: TooltipBuilding;
  readonly LakeHarbor: TooltipBuilding;
  readonly NeutronCitadel: TooltipBuilding;
  readonly PortalCarport: TooltipBuilding;
  readonly PortalRepairDroid: TooltipBuilding;
  readonly Smokehouse: TooltipBuilding;
  readonly SpireMechBay: TooltipBuilding;
  readonly TauRedJeff: TooltipBuilding;
  readonly TauRedWomlingLab: TooltipBuilding;
}

interface TooltipResource {
  readonly title: string;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly atomicMass: number;
}

/** The resources the notes name, for their title or their stored amount. */
type TooltipResources = Readonly<
  Record<
    | "Dark"
    | "Elerium"
    | "Food"
    | "Harmony"
    | "Infernite"
    | "Power"
    | "Soul_Gem",
    TooltipResource
  >
>;

interface TooltipGame {
  readonly global: {
    readonly race: {
      readonly [trait: string]: unknown;
      readonly universe?: string;
    };
    readonly stats: {
      readonly achieve: Readonly<
        Record<string, { readonly l?: number } | undefined>
      >;
    };
    readonly tech: Readonly<Record<string, number | undefined>>;
    readonly interstellar: {
      readonly stellar_engine: { readonly exotic: number };
      readonly mass_ejector: Readonly<Record<string, number>>;
    };
    readonly tauceti: {
      readonly womling_lab: {
        readonly tech: number;
        readonly scientist: number;
      };
    };
  };
}

interface TooltipMechManager {
  initLab(): boolean;
  readonly mechsPotential: number;
  readonly activeMechs: readonly {
    readonly size: string;
    readonly power: number;
  }[];
  readonly collectorValue: number;
}

/** The build reader answers with a conflict, or reports that it could not read one. */
type TooltipCostConflict = CostConflict | { readonly status: "unavailable" };

export interface TooltipUIDependencies {
  getJQuery: () => (node: TooltipElement) => TooltipNode;
  getUiSurface: () => GameUiSurfacePort;
  getMutationObserver: () => TooltipObserverConstructor;
  getSettings: () => {
    readonly autoARPA: boolean;
    readonly autoBuild: boolean;
    readonly autoFleet: boolean;
    readonly masterScriptToggle: boolean;
  };
  getState: () => {
    readonly queuedTargetsAll: readonly unknown[];
    readonly triggerTargets: readonly unknown[];
    readonly tooltips: Readonly<Record<string, string | undefined>>;
  };
  getGame: () => TooltipGame;
  getBuildings: () => TooltipBuildings;
  getJobs: () => { readonly HellSurveyor: { readonly count: number } };
  getResources: () => TooltipResources;
  getTechIds: () => Readonly<Record<string, TooltipTarget | undefined>>;
  getBuildingIds: () => Readonly<Record<string, TooltipTarget | undefined>>;
  getArpaIds: () => Readonly<Record<string, TooltipTarget | undefined>>;
  getMechManager: () => TooltipMechManager;
  getFleetManagerOuter: () => { readonly nextShipMsg?: string };
  getPoly: () => { timeFormat(seconds: number): string };
  readCitadelConsumption: () => (count: number) => number;
  readNiceNumber: () => (value: number) => string;
  readCostConflict: () => (
    target: TooltipTarget,
  ) => TooltipCostConflict | null | undefined;
  readTechConflict: () => (target: TooltipTarget) => string | undefined;
  readHaveTech: () => (id: string, level: number) => boolean;
  readHealingRate: () => () => number;
  readGrowthRate: () => () => number;
  readGovernor: () => () => string;
  readTraitVal: () => (
    id: string,
    fallback: number,
    operation: string,
  ) => number;
  isTechnology: (value: unknown) => boolean;
}

export function createTooltipUI({
  getJQuery,
  getUiSurface,
  getMutationObserver,
  getSettings,
  getState,
  getGame,
  getBuildings,
  getJobs,
  getResources,
  getTechIds,
  getBuildingIds,
  getArpaIds,
  getMechManager,
  getFleetManagerOuter,
  getPoly,
  readCitadelConsumption,
  readNiceNumber,
  readCostConflict,
  readTechConflict,
  readHaveTech,
  readHealingRate,
  readGrowthRate,
  readGovernor,
  readTraitVal,
  isTechnology,
}: TooltipUIDependencies) {
  function getTooltipInfo(obj: TooltipTarget) {
    const settings = getSettings();
    const state = getState();
    const game = getGame();
    const buildings = getBuildings();
    const jobs = getJobs();
    const resources = getResources();
    const MechManager = getMechManager();
    const FleetManagerOuter = getFleetManagerOuter();
    const getCitadelConsumption = readCitadelConsumption();
    const getNiceNumber = readNiceNumber();
    const getCostConflict = readCostConflict();
    const getTechConflict = readTechConflict();
    const haveTech = readHaveTech();
    const getHealingRate = readHealingRate();
    const getGrowthRate = readGrowthRate();
    const getGovernor = readGovernor();
    const traitVal = readTraitVal();
    const notes = [];
    if (obj === buildings.NeutronCitadel) {
      const citadels = buildings.NeutronCitadel.stateOnCount;
      const diff =
        getCitadelConsumption(citadels + 1) - getCitadelConsumption(citadels);
      notes.push(
        `Next level will increase total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.SpireMechBay && MechManager.initLab()) {
      notes.push(
        `Current team potential: ${getNiceNumber(MechManager.mechsPotential)}`,
      );
      const supplyCollected = MechManager.activeMechs
        .filter((mech) => mech.size === "collector")
        .reduce(
          (sum, mech) => sum + mech.power * MechManager.collectorValue,
          0,
        );
      if (supplyCollected > 0) {
        notes.push(`Supplies collected: ${getNiceNumber(supplyCollected)} /s`);
      }
    }

    if (
      (isTechnology(obj) ||
        (!settings.autoARPA && obj._tab === "arpa") ||
        (!settings.autoBuild && obj._tab !== "arpa")) &&
      !state.queuedTargetsAll.includes(obj) &&
      !state.triggerTargets.includes(obj)
    ) {
      const conflict = getCostConflict(obj);
      if (conflict) {
        notes.push(
          conflict.status === "unavailable"
            ? "Cost reservation data unavailable; action blocked for safety"
            : `Conflicts with ${conflict.targetNames
                .map((action) => {
                  return `<span class="has-text-info">${action}</span>`;
                })
                .join(", ")} for ${conflict.resourceNames
                .map((res) => {
                  return `<span class="has-text-info">${res}</span>`;
                })
                .join(", ")} (${conflict.targetCause})`,
        );
      }
    }

    if (isTechnology(obj)) {
      if (state.queuedTargetsAll.includes(obj)) {
        notes.push("Queued research, processing...");
      } else if (state.triggerTargets.includes(obj)) {
        notes.push("Active trigger, processing...");
      } else {
        const conflict = getTechConflict(obj);
        if (conflict) {
          notes.push(conflict);
        }
      }
    }

    if (obj === buildings.GorddonFreighter && haveTech("banking", 13)) {
      const count = buildings.GorddonFreighter.stateOnCount;
      const total = ((1 + (count + 1) * 0.03) / (1 + count * 0.03) - 1) * 100;
      const crew = total / 3;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (obj === buildings.Alien1SuperFreighter && haveTech("banking", 13)) {
      const count = buildings.Alien1SuperFreighter.stateOnCount;
      const total = ((1 + (count + 1) * 0.08) / (1 + count * 0.08) - 1) * 100;
      const crew = total / 5;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (
      obj === buildings.Hospital ||
      (obj === buildings.BootCamp && game.global.race["artifical"]) ||
      (obj === buildings.EnceladusBase && game.global.race["orbit_decayed"])
    ) {
      notes.push(`~${getNiceNumber(getHealingRate())} soldiers healed per day`);
    }
    if (obj === buildings.Hospital) {
      const growth = 1 / (getGrowthRate() * 4);
      notes.push(`~${getNiceNumber(growth)} seconds to increase population`);
    }
    if (obj === buildings.PortalCarport && jobs.HellSurveyor.count > 0) {
      const influx = 5 * (1 + buildings.BadlandsAttractor.stateOnCount * 0.22);
      const demons = (influx * 10 + influx * 50) / 2;
      let divisor = getGovernor() === "sports" ? 1100 : 1000;
      divisor *= traitVal("blurry", 0, "+");
      divisor *= traitVal("instinct", 0, "+");
      divisor += haveTech("infernite", 5) ? 250 : 0;
      const danger = demons / divisor;
      const risk = 10 - Math.min(10, jobs.HellSurveyor.count) / 2;
      const rate = (danger / 2) * Math.min(1, danger / risk);
      const wreck = 1 / (rate / 5);
      notes.push(
        `Up to ~${getNiceNumber(
          wreck,
        )} seconds to break car (with full supression)`,
      );
    }
    if (obj === buildings.PortalRepairDroid) {
      const droids = buildings.PortalRepairDroid.stateOnCount;
      const wallRepair = Math.round(200 * 0.95 ** droids) / 4;
      const carRepair = Math.round(180 * 0.92 ** droids) / 4;
      notes.push(`${getNiceNumber(wallRepair)} seconds to repair 1% of wall`);
      notes.push(`${getNiceNumber(carRepair)} seconds to repair car`);
    }
    if (obj === buildings.BadlandsAttractor) {
      const attractors = buildings.BadlandsAttractor.stateOnCount;
      const influx = 5 * (1 + attractors * 0.22);
      let gem_chance =
        (game.global.stats.achieve.technophobe?.l ?? 0) >= 5 ? 9000 : 10000;
      if (
        game.global.race.universe === "evil" &&
        resources.Dark.currentQuantity > 1
      ) {
        const de =
          resources.Dark.currentQuantity *
          (1 + resources.Harmony.currentQuantity * 0.01);
        gem_chance -= Math.round(Math.log2(de) * 2);
      }
      gem_chance = Math.round(gem_chance * 0.948 ** attractors);
      gem_chance = Math.round(gem_chance * traitVal("ghostly", 2, "-"));
      gem_chance = Math.max(12, gem_chance);
      const drop = (1 / gem_chance) * 100;
      notes.push(
        `~${getNiceNumber(drop)}% chance to find ${resources.Soul_Gem.title}`,
      );
      notes.push(
        `Up to ~${getNiceNumber(influx * 10)}-${getNiceNumber(
          influx * 50,
        )} demons spawned per day`,
      );
    }
    if (obj === buildings.Smokehouse) {
      const spoilage = 50 * 0.9 ** buildings.Smokehouse.count;
      notes.push(
        `${getNiceNumber(spoilage)}% of stored ${
          resources.Food.title
        } spoiled per second`,
      );
    }
    if (obj === buildings.LakeCoolingTower) {
      const coolers = buildings.LakeCoolingTower.stateOnCount;
      const current = 500 * 0.92 ** coolers;
      const next = 500 * 0.92 ** (coolers + 1);
      const diff =
        (current - next) *
        buildings.LakeHarbor.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.DwarfShipyard) {
      if (settings.autoFleet && FleetManagerOuter.nextShipMsg) {
        notes.push(FleetManagerOuter.nextShipMsg);
      }
    }
    if (obj === buildings.IsleSpiritBattery) {
      const batteries = buildings.IsleSpiritBattery.stateOnCount;
      let coefficient = 0.9;

      if (
        game.global.race["warlord"] &&
        buildings.AsphodelCorruptor &&
        (game.global.tech.asphodel ?? 0) >= 13
      ) {
        const corruptors = buildings.AsphodelCorruptor.on;
        coefficient = 1 - (1 + (corruptors || 0) * 0.03) / 10;
      }

      const current = 18_000 * coefficient ** batteries;
      const next = 18_000 * coefficient ** (batteries + 1);
      const diff =
        (current - next) *
        buildings.IsleSpiritVacuum.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }

    if (obj.extraDescription) {
      notes.push(obj.extraDescription);
    }
    return notes.join("<br>");
  }

  function tooltipObserverCallback(mutations: readonly TooltipMutation[]) {
    const settings = getSettings();
    const MutationObserver = getMutationObserver();
    if (!settings.masterScriptToggle || !getUiSurface().isPageVisible()) {
      return;
    }
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node) => {
        if (node.id === "popper") {
          const popperObserver = new MutationObserver(() => {
            if (!node.querySelector(".script-tooltip")) {
              popperObserver.disconnect();
              addTooltip(node);
              popperObserver.observe(node, { childList: true });
            }
          });
          addTooltip(node);
          popperObserver.observe(node, { childList: true });
        }
      }),
    );
  }

  const infusionStep: Readonly<Record<string, number | undefined>> = {
    "blood-lust": 15,
    "blood-illuminate": 12,
    "blood-greed": 16,
    "blood-hoarder": 14,
    "blood-artisan": 8,
    "blood-attract": 4,
    "blood-wrath": 2,
  };

  function addTooltip(node: TooltipElement) {
    const $ = getJQuery();
    const state = getState();
    const game = getGame();
    const buildings = getBuildings();
    const resources = getResources();
    const techIds = getTechIds();
    const buildingIds = getBuildingIds();
    const arpaIds = getArpaIds();
    const poly = getPoly();
    const getNiceNumber = readNiceNumber();
    $(node).append(`<span class="script-tooltip" hidden></span>`);
    const dataId = node.dataset.id;
    if (dataId === "powerStatus") {
      $(node).append(
        `<p class="modal_bd"><span>Disabled</span><span class="has-text-danger">${getNiceNumber(
          resources.Power.maxQuantity,
        )}</span></p>`,
      );
      return;
    } else if (infusionStep[dataId]) {
      $(node)
        .find(".costList .res-Blood_Stone")
        .append(` (+${infusionStep[dataId]})`);
      return;
    } else if (state.tooltips[dataId]) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${state.tooltips[dataId]}</div>`,
      );
      return;
    }

    const arpaId = dataId.match(/^popArpa([a-z_-]+)\d*$/)?.[1];
    const queuedId = dataId.match(/^q([A-Za-z_-]+)\d*$/)?.[1];
    const obj =
      arpaId !== undefined
        ? arpaIds[`arpa${arpaId}`]
        : queuedId !== undefined
          ? (buildingIds[queuedId] ?? arpaIds[queuedId])
          : (buildingIds[dataId] ?? techIds[dataId]);
    if (!obj || (isTechnology(obj) && obj.isResearched?.())) {
      return;
    }

    if (
      obj === buildings.BlackholeStellarEngine &&
      game.global.race.universe !== "magic" &&
      buildings.BlackholeMassEjector.count > 0 &&
      game.global.interstellar.stellar_engine.exotic < 0.025
    ) {
      const ejected = game.global.interstellar.mass_ejector;
      const massPerSec =
        resources.Elerium.atomicMass * (ejected.Elerium ?? 0) +
          resources.Infernite.atomicMass * (ejected.Infernite ?? 0) || -1;
      const missingExotics =
        (0.025 - game.global.interstellar.stellar_engine.exotic) * 1e10;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Contaminated in [${poly.timeFormat(
          missingExotics / massPerSec,
        )}]</div>`,
      );
    }
    if (obj === buildings.TauRedJeff && buildings.TauRedWomlingLab.count > 0) {
      let expo = (game.global.stats.achieve.overlord?.l ?? 0) >= 5 ? 4.9 : 5;
      expo -= game.global.race["lone_survivor"] ? 0.1 : 0;
      const nextTech = ((game.global.tech.womling_tech ?? 0) + 2) ** expo;
      const curTech = game.global.tauceti.womling_lab.tech;
      const completion = Math.floor((curTech / nextTech) * 100);
      $(node).find("div:eq(1)>div:eq(5)").append(` (${completion}%)`);
      const rate =
        (game.global.tauceti.womling_lab.scientist / 2) *
        Math.min(1, game.global.tauceti.womling_lab.scientist * 0.1);
      const eta = rate > 0 ? Math.ceil((nextTech - curTech) / rate) : -1;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Next Tech Level in ~[${poly.timeFormat(
          eta,
        )}]</div>`,
      );
    }

    const description = getTooltipInfo(obj);
    if (description) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${description}</div>`,
      );
    }
  }

  return { getTooltipInfo, tooltipObserverCallback, addTooltip };
}
