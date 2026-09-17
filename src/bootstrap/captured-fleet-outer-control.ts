/** Captured True Path outer-fleet composition. */

import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameModalPort, GameModalRequest } from "../ports/game-modal.ts";
import {
  readAuthorityPolicyView,
  readAuthorityQuantity,
} from "../adapters/evolve/civic/authority.ts";
import { readCapturedHighPopulationPercent } from "../adapters/evolve/civic/captured-job-catalog.ts";
import { createCapturedFleetControls } from "../adapters/evolve/combat/captured-fleet-controls.ts";
import {
  createOuterFleetAdapter,
  type OuterFleetAdapterDependencies,
} from "../adapters/evolve/combat/fleet-outer.ts";
import { runOuterFleetAutomation } from "../application/fleet-outer.ts";
import { createAuthorityPolicy } from "../game/authority-policy.ts";
import { createFleetManagers } from "../game/fleet-managers.ts";
import {
  isRecord,
  readProperty,
  type UnknownRecord,
} from "../adapters/validation.ts";

interface CapturedFleetOuterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly onActivity?: GameActivitySink;
}

type FleetManagerDependencies = Parameters<typeof createFleetManagers>[0];
type CapturedGame = ReturnType<FleetManagerDependencies["getGame"]>;
type CapturedSettings = ReturnType<FleetManagerDependencies["getSettings"]>;
type CapturedResources = ReturnType<FleetManagerDependencies["getResources"]>;
type CapturedBuildings = ReturnType<FleetManagerDependencies["getBuildings"]>;
type CapturedPoly = ReturnType<FleetManagerDependencies["getPoly"]>;
type CapturedHaveTech = ReturnType<FleetManagerDependencies["getHaveTech"]>;

const COST_RESOURCES = Object.freeze([
  "Money",
  "Aluminium",
  "Adamantite",
  "Steel",
  "Alloy",
  "Neutronium",
  "Aerographene",
  "Titanium",
  "Orichalcum",
  "Copper",
  "Iridium",
  "Iron",
  "Nano_Tube",
  "Quantium",
  "Tungsten",
]);

const OUTER_REGIONS = Object.freeze([
  "spc_moon",
  "spc_red",
  "spc_gas",
  "spc_gas_moon",
  "spc_belt",
  "spc_titan",
  "spc_enceladus",
  "spc_triton",
  "spc_makemake",
  "spc_eris",
]);

const MODAL_WAIT_LIMIT = 3;

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rootRecord(rootState: GameRootStateSource): UnknownRecord {
  const root = rootState.readRoot();
  return isRecord(root) ? root : {};
}

function resourceValue(
  root: UnknownRecord,
  resourceId: string,
  field: "amount" | "max",
): number {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  const capturedField = field === "amount" ? "amount" : "max";
  const legacyField = field === "amount" ? "currentQuantity" : "maxQuantity";
  return finite(
    readProperty(resource, capturedField),
    finite(readProperty(resource, legacyField)),
  );
}

function regionEnabled(root: UnknownRecord, region: string): boolean {
  const tech = readProperty(root, "tech");
  const space = readProperty(root, "space");
  if (
    readProperty(readProperty(root, "race"), "orbit_decayed") &&
    region === "spc_moon"
  ) {
    return false;
  }
  if (readProperty(readProperty(root, "tech"), "resettle")) return false;
  const syndicate = readProperty(space, "syndicate");
  if (!isRecord(syndicate) || !Object.hasOwn(syndicate, region)) return false;
  switch (region) {
    case "spc_moon":
    case "spc_red":
    case "spc_gas":
    case "spc_gas_moon":
    case "spc_belt":
      return true;
    case "spc_titan":
    case "spc_enceladus":
      return (
        finite(readProperty(tech, "titan")) >= 3 &&
        finite(readProperty(tech, "enceladus")) >= 2
      );
    case "spc_triton":
      return finite(readProperty(tech, "triton")) >= 2;
    case "spc_makemake":
      return finite(readProperty(tech, "makemake")) >= 1;
    case "spc_eris":
      return finite(readProperty(tech, "eris")) >= 1;
    default:
      return false;
  }
}

function regionCap(root: UnknownRecord, region: string): number {
  const tech = readProperty(root, "tech");
  switch (region) {
    case "spc_titan":
      return finite(readProperty(tech, "triton")) > 0
        ? finite(readProperty(tech, "outer")) >= 4
          ? 2000
          : 1000
        : 600;
    case "spc_enceladus":
      return finite(readProperty(tech, "triton")) > 0
        ? finite(readProperty(tech, "outer")) >= 4
          ? 1500
          : 1000
        : 600;
    case "spc_triton":
      return finite(readProperty(tech, "outer")) >= 4 ? 5000 : 3000;
    case "spc_makemake":
      return 2500;
    case "spc_eris":
      return 7500;
    default:
      return region === "spc_moon" || region === "spc_red" ? 1250 : 1020;
  }
}

function shipCosts(
  blueprint: Readonly<UnknownRecord>,
  ships: readonly unknown[],
): Record<string, number> {
  // Mirrors DeadSpace's private `shipCosts()` because no captured control exposes arbitrary-design
  // pricing; the visible #shipYardCosts answers only the currently selected design.
  const costs: Record<string, number> = {};
  let healthInflate = 1;
  let powerInflate = 1;
  let creepFactor = 1;
  const shipClass = String(blueprint["class"] ?? "");
  switch (String(blueprint["class"] ?? "")) {
    case "corvette":
      costs.Money = 2500000;
      costs.Aluminium = 500000;
      creepFactor = 2;
      break;
    case "frigate":
      costs.Money = 5000000;
      costs.Aluminium = 1250000;
      healthInflate = 1.1;
      powerInflate = 1.09;
      creepFactor = 1.5;
      break;
    case "destroyer":
      costs.Money = 15000000;
      costs.Aluminium = 3500000;
      healthInflate = 1.2;
      powerInflate = 1.18;
      creepFactor = 1.2;
      break;
    case "cruiser":
      costs.Money = 50000000;
      costs.Adamantite = 1000000;
      healthInflate = 1.3;
      powerInflate = 1.25;
      break;
    case "battlecruiser":
      costs.Money = 125000000;
      costs.Adamantite = 2600000;
      healthInflate = 1.35;
      powerInflate = 1.3;
      creepFactor = 0.8;
      break;
    case "dreadnought":
      costs.Money = 500000000;
      costs.Adamantite = 8000000;
      healthInflate = 1.4;
      powerInflate = 1.35;
      creepFactor = 0.5;
      break;
    case "explorer":
      costs.Money = 800000000;
      costs.Adamantite = 9500000;
      healthInflate = 1.45;
      break;
    default:
      return costs;
  }
  switch (blueprint["armor"]) {
    case "steel":
      costs.Steel = Math.round(350000 ** healthInflate);
      break;
    case "alloy":
      costs.Alloy = Math.round(250000 ** healthInflate);
      break;
    case "neutronium":
      costs.Neutronium = Math.round(10000 ** healthInflate);
      break;
  }
  const alternateCost =
    shipClass === "freighter" || shipClass === "supply_ship";
  const engineCost: Readonly<Record<string, number>> = {
    ion: alternateCost ? 10000 : 75000,
    tie: alternateCost ? 45000 : 150000,
    pulse: alternateCost ? 30000 : 125000,
    photon: alternateCost ? 75000 : 210000,
    vacuum: alternateCost ? 125000 : 300000,
    emdrive: 1250000,
  };
  const engine = engineCost[String(blueprint["engine"] ?? "")];
  if (engine !== undefined) costs.Titanium = Math.round(engine ** powerInflate);
  const alternateMaterial = shipClass === "explorer";
  const powerCost: Readonly<Record<string, number>> = {
    solar: 40000,
    diesel: 40000,
    fission: 50000,
    fusion: 50000,
    elerium: 60000,
  };
  const power = powerCost[String(blueprint["power"] ?? "")];
  if (power !== undefined) {
    costs[alternateMaterial ? "Orichalcum" : "Copper"] = Math.round(
      power ** healthInflate,
    );
    const iridium = {
      solar: 15000,
      diesel: 15000,
      fission: 30000,
      fusion: 40000,
      elerium: 55000,
    }[String(blueprint["power"] ?? "")];
    if (iridium !== undefined)
      costs.Iridium = Math.round(iridium ** powerInflate);
  }
  if (shipClass !== "explorer") {
    const sensorPower = { radar: 1.04, lidar: 1.08, quantum: 1.12 }[
      String(blueprint["sensor"] ?? "")
    ];
    if (sensorPower !== undefined)
      costs.Money = Math.round((costs.Money ?? 0) ** sensorPower);
  }
  switch (blueprint["weapon"]) {
    case "railgun":
      costs.Iron = Math.round(25000 ** healthInflate);
      break;
    case "laser":
      costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.05);
      costs.Nano_Tube = Math.round(12000 ** healthInflate);
      break;
    case "p_laser":
      costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.035);
      costs.Nano_Tube = Math.round(12000 ** healthInflate);
      break;
    case "plasma":
      costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.1);
      costs.Nano_Tube = Math.round(20000 ** healthInflate);
      break;
    case "phaser":
      costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.15);
      costs.Quantium = Math.round(18000 ** healthInflate);
      break;
    case "disruptor":
      costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.2);
      costs.Quantium = Math.round(35000 ** healthInflate);
      break;
  }
  if (blueprint["special"] === "massdriver") {
    costs.Iridium = Math.round((costs.Iridium ?? 0) ** 1.2);
    costs.Tungsten = Math.round(750000 ** healthInflate);
    costs.Quantium = Math.round(40000 ** healthInflate);
  }
  if (shipClass === "explorer") {
    costs.Iron = (costs.Iron ?? 0) * 10;
    costs.Titanium = (costs.Titanium ?? 0) * 5;
    costs.Iridium = (costs.Iridium ?? 0) * 50;
  }
  const sameTier = ships.filter((ship) => {
    const value = isRecord(ship) ? ship : {};
    return (
      value["class"] === blueprint["class"] &&
      ((shipClass !== "freighter" && shipClass !== "supply_ship") ||
        value["special"] === blueprint["special"])
    );
  }).length;
  const creep = 1 + ((sameTier - 2) / 25) * creepFactor;
  for (const resourceId of Object.keys(costs)) {
    costs[resourceId] =
      shipClass === "explorer"
        ? Math.ceil(costs[resourceId]! * (sameTier + 1) * 3)
        : sameTier < 2
          ? Math.ceil(costs[resourceId]! * (sameTier === 0 ? 0.75 : 0.9))
          : sameTier > 2
            ? Math.ceil(costs[resourceId]! * creep)
            : costs[resourceId]!;
  }
  return costs;
}

function createGameModal(getDocument: () => unknown): GameModalPort {
  let pending: { action: () => void; waits: number } | null = null;
  const document = () => {
    const value = getDocument();
    return isRecord(value) && typeof value["querySelector"] === "function"
      ? (value as unknown as {
          querySelector(selector: string): { click?(): void } | null;
          getElementById?(id: string): unknown;
        })
      : undefined;
  };
  const close = () =>
    document()?.querySelector(".modal .modal-close")?.click?.();
  return Object.freeze({
    isOpen(): boolean {
      if (pending !== null) {
        const destination = document()?.querySelector(
          "#modalBox .shipDispatch button",
        );
        if (typeof destination?.click === "function") {
          pending.action();
          close();
          pending = null;
          return true;
        }
        pending.waits += 1;
        if (pending.waits >= MODAL_WAIT_LIMIT) {
          pending = null;
          close();
          return false;
        }
        return true;
      }
      const modal = document()?.getElementById?.("modalBox");
      return modal !== null && modal !== undefined;
    },
    canOpen(triggerSelector: string): boolean {
      return document()?.querySelector(triggerSelector) !== null;
    },
    open(request: GameModalRequest): void {
      if (pending !== null || this.isOpen()) return;
      const trigger = document()?.querySelector(request.triggerSelector);
      if (typeof trigger?.click !== "function") return;
      pending = { action: request.action, waits: 0 };
      trigger.click();
    },
    isAwaitingScriptModal(): boolean {
      return pending !== null;
    },
    captureScriptModal(): void {},
  });
}

export function createCapturedOuterFleetControl(
  dependencies: CapturedFleetOuterDependencies,
): {
  readonly autoFleetOuter: () => ReturnType<typeof runOuterFleetAutomation>;
} {
  const fleetControls = createCapturedFleetControls({
    controls: dependencies.controls,
    getDocument: dependencies.getDocument,
  });
  const settingsSurface = {} as CapturedSettings;
  const resourcesSurface = {} as CapturedResources;
  const buildingsSurface = {} as CapturedBuildings;
  const actionsSpace = {} as CapturedGame["actions"]["space"];
  const gameSurface = {
    global: {} as CapturedGame["global"],
    actions: { space: actionsSpace },
    loc: (key: string) => key,
  } as CapturedGame;
  const polySurface = { shipCosts: () => ({}) } as CapturedPoly;
  const haveTech: CapturedHaveTech = (id: string, level = 1) =>
    finite(
      readProperty(
        readProperty(rootRecord(dependencies.rootState), "tech"),
        id,
      ),
    ) >= level;

  const syncSettings = (): void => {
    const raw = dependencies.readSettings();
    if (!isRecord(raw)) return;
    for (const key of Object.keys(settingsSurface)) delete settingsSurface[key];
    Object.assign(settingsSurface, raw);
  };
  const syncGame = (): void => {
    const root = rootRecord(dependencies.rootState);
    gameSurface.global = root as CapturedGame["global"];
    for (const region of OUTER_REGIONS) {
      actionsSpace[region] ??= {
        info: {
          name: () => region,
          syndicate: () => regionEnabled(root, region),
          syndicate_cap: () => regionCap(root, region),
        },
      };
    }
  };
  const syncResources = (): void => {
    const ids = new Set([...COST_RESOURCES, "Authority", "Eris_Support"]);
    const root = rootRecord(dependencies.rootState);
    const resourceRoot = readProperty(root, "resource");
    if (isRecord(resourceRoot))
      for (const id of Object.keys(resourceRoot)) ids.add(id);
    for (const id of ids) {
      if (resourcesSurface[id] !== undefined) continue;
      const resource = {
        get currentQuantity() {
          return resourceValue(
            rootRecord(dependencies.rootState),
            id,
            "amount",
          );
        },
        get maxQuantity() {
          return resourceValue(rootRecord(dependencies.rootState), id, "max");
        },
        hasStorage: () =>
          resourceValue(rootRecord(dependencies.rootState), id, "max") > 0,
      };
      if (id === "Authority") {
        Object.assign(resource, {
          isUnlocked: () => {
            const authority = readProperty(
              readProperty(rootRecord(dependencies.rootState), "resource"),
              "Authority",
            );
            return readProperty(authority, "display") !== false;
          },
        });
      }
      resourcesSurface[id] = resource;
    }
  };
  const syncBuildings = (): void => {
    const ids: Readonly<Record<string, string>> = {
      EnceladusBase: "operating_base",
      TitanSAM: "sam",
      TritonFOB: "fob",
    };
    for (const [name, id] of Object.entries(ids)) {
      buildingsSurface[name] ??= {
        get stateOnCount() {
          return finite(
            readProperty(
              readProperty(
                readProperty(rootRecord(dependencies.rootState), "space"),
                id,
              ),
              "on",
            ),
          );
        },
      };
    }
  };
  const poly: CapturedPoly = {
    shipCosts(blueprint) {
      const root = rootRecord(dependencies.rootState);
      const ships = readProperty(
        readProperty(readProperty(root, "space"), "shipyard"),
        "ships",
      );
      return shipCosts(blueprint, Array.isArray(ships) ? ships : []);
    },
  } as CapturedPoly;
  Object.assign(polySurface, poly);
  const gameModal = createGameModal(dependencies.getDocument);
  const managers = createFleetManagers({
    getGame: () => {
      syncGame();
      return gameSurface;
    },
    getSettings: () => {
      syncSettings();
      return settingsSurface;
    },
    getResources: () => {
      syncResources();
      return resourcesSurface;
    },
    getBuildings: () => {
      syncBuildings();
      return buildingsSurface;
    },
    getPoly: () => polySurface,
    getHaveTech: () => haveTech,
    fleetControls,
    gameModal,
  });
  const authorityPolicy = createAuthorityPolicy({
    getGame: () => {
      syncGame();
      return gameSurface;
    },
    getSettings: () => {
      syncSettings();
      return settingsSurface;
    },
    getResources: () => {
      syncResources();
      return resourcesSurface;
    },
    readHighPopulationPercent: () =>
      readCapturedHighPopulationPercent(rootRecord(dependencies.rootState)),
    readAuthorityPolicyView,
    readAuthorityQuantity,
  });
  const manager = managers.FleetManagerOuter as unknown as UnknownRecord;
  const warManager = {
    get currentCityGarrison() {
      const root = rootRecord(dependencies.rootState);
      const garrison = readProperty(readProperty(root, "civic"), "garrison");
      const fortress = readProperty(
        readProperty(readProperty(root, "portal"), "fortress"),
        "garrison",
      );
      const fob = readProperty(
        readProperty(readProperty(root, "space"), "fob"),
        "troops",
      );
      return (
        finite(readProperty(garrison, "workers")) -
        finite(readProperty(garrison, "crew")) -
        finite(fortress) -
        finite(fob)
      );
    },
  } as UnknownRecord;
  const activity = {
    logSuccess(_kind: string, message: string, tags: string[]) {
      dependencies.onActivity?.({ message, color: "success", tags });
    },
  };
  const adapterDependencies: OuterFleetAdapterDependencies = {
    getFleetManagerOuter: () => manager,
    getWarManager: () => warManager,
    getGame: () => {
      syncGame();
      return gameSurface;
    },
    getSettings: () => {
      syncSettings();
      return settingsSurface;
    },
    getResources: () => {
      syncResources();
      return resourcesSurface;
    },
    traitVal: (trait, _index, operation) => {
      const rank = readProperty(
        readProperty(rootRecord(dependencies.rootState), "race"),
        trait,
      );
      if (rank && operation === 1) return 1;
      if (operation === "+" || operation === "-" || operation === "=") return 1;
      return operation ?? 0;
    },
    assessAuthorityRemoval: authorityPolicy.assessAuthorityRemoval,
    getGameLog: () => activity,
    executeBuild: (blueprint, _targetRegion) => {
      for (const [type, part] of Object.entries(blueprint)) {
        if (type === "name" || typeof part !== "string") continue;
        if (!fleetControls.setPart({ elementId: "shipPlans", type, part })) {
          return Object.freeze({
            invoked: false,
            started: false,
            builtIndex: null,
          });
        }
      }
      if (!fleetControls.hasShipPower("shipPlans")) {
        return Object.freeze({
          invoked: false,
          started: false,
          builtIndex: null,
        });
      }
      const result = fleetControls.buildShip({ elementId: "shipPlans" });
      return Object.freeze({
        invoked: result.actionable,
        started: result.actionable && result.builtIndex !== null,
        builtIndex: result.builtIndex,
      });
    },
  };
  const adapter = createOuterFleetAdapter(adapterDependencies);
  return Object.freeze({
    autoFleetOuter: () => runOuterFleetAutomation(adapter),
  });
}
