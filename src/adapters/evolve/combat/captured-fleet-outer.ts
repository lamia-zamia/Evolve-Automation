/** Captured Truepath outer-fleet adapter over the game's root and shipyard controls. */

import {
  assessAuthorityRemoval,
  type AuthorityPolicyView,
} from "../../../domain/civic/authority.ts";
import {
  planOuterFleetBlueprint,
  planOuterFleetBuild,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
  type OuterFleetAuthorityAssessment,
  type OuterFleetAutomaticPlan,
  type OuterFleetBlueprint,
  type OuterFleetBlueprintInput,
  type OuterFleetBuildReadinessInput,
  type OuterFleetCandidateInput,
  type OuterFleetCandidatePlan,
  type OuterFleetCycleInput,
  type OuterFleetDecision,
  type OuterFleetReadinessPlan,
  type OuterFleetRegionInput,
  type OuterFleetTargetInput,
  type OuterFleetTargetPlan,
} from "../../../domain/combat/fleet-outer.ts";
import type { GameActivitySink } from "../../../ports/game-message-log.ts";
import type { GameFleetControlsPort } from "../../../ports/game-fleet-controls.ts";
import type {
  GameModalPort,
  GameModalRequest,
} from "../../../ports/game-modal.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  OuterFleetExecutor,
  OuterFleetReader,
} from "../../../ports/fleet-outer.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { readCapturedHighPopulationPercent } from "../civic/captured-job-catalog.ts";
import {
  finite,
  isRecord,
  readProperty,
  type UnknownRecord,
} from "../../validation.ts";

interface CapturedOuterFleetAdapterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameFleetControlsPort;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly onActivity?: GameActivitySink;
}

interface CapturedOuterFleetSession {
  readonly root: UnknownRecord;
  readonly sourceUnavailable: boolean;
  readonly settings: UnknownRecord;
  readonly blueprints: Map<OuterFleetBlueprint, UnknownRecord>;
}

const CAPTURED_OUTER_FLEET_ELEMENT = "shipPlans";
const CAPTURED_OUTER_FLEET_DISPATCH_ATTEMPTS = 30;
const CAPTURED_OUTER_FLEET_MODAL_WAITS = 3;
const CAPTURED_OUTER_FLEET_REGIONS = Object.freeze([
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
const CAPTURED_OUTER_FLEET_PARTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    class: Object.freeze([
      "corvette",
      "frigate",
      "destroyer",
      "cruiser",
      "battlecruiser",
      "dreadnought",
      "explorer",
    ]),
    power: Object.freeze(["solar", "diesel", "fission", "fusion", "elerium"]),
    weapon: Object.freeze([
      "railgun",
      "laser",
      "p_laser",
      "plasma",
      "phaser",
      "disruptor",
    ]),
    armor: Object.freeze(["steel", "alloy", "neutronium"]),
    engine: Object.freeze([
      "ion",
      "tie",
      "pulse",
      "photon",
      "vacuum",
      "emdrive",
    ]),
    sensor: Object.freeze(["visual", "radar", "lidar", "quantum"]),
  });
const CAPTURED_OUTER_FLEET_EXPLORER = Object.freeze({
  class: "explorer",
  armor: "neutronium",
  weapon: "railgun",
  engine: "emdrive",
  power: "elerium",
  sensor: "quantum",
});
const CAPTURED_OUTER_FLEET_CREW: Readonly<Record<string, number>> =
  Object.freeze({
    corvette: 2,
    frigate: 3,
    destroyer: 4,
    cruiser: 6,
    battlecruiser: 8,
    dreadnought: 10,
    explorer: 10,
  });
const CAPTURED_OUTER_FLEET_WEAPON_POWER: Readonly<Record<string, number>> =
  Object.freeze({
    railgun: 36,
    laser: 64,
    p_laser: 54,
    plasma: 90,
    phaser: 114,
    disruptor: 156,
  });
const CAPTURED_OUTER_FLEET_CLASS_POWER: Readonly<Record<string, number>> =
  Object.freeze({
    corvette: 1,
    frigate: 1.5,
    destroyer: 2.75,
    cruiser: 5.5,
    battlecruiser: 10,
    dreadnought: 22,
    explorer: 1.2,
  });
const CAPTURED_OUTER_FLEET_SENSOR_RANGE: Readonly<Record<string, number>> =
  Object.freeze({
    visual: 1,
    radar: 20,
    lidar: 35,
    quantum: 60,
  });
function capturedOuterFleetRoot(
  rootState: GameRootStateSource,
): UnknownRecord | undefined {
  const root = rootState.readRoot();
  return isRecord(root) ? root : undefined;
}

function capturedOuterFleetSettings(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function capturedOuterFleetYard(
  root: UnknownRecord,
): UnknownRecord | undefined {
  const yard = readProperty(readProperty(root, "space"), "shipyard");
  return isRecord(yard) ? yard : undefined;
}

function capturedOuterFleetShips(root: UnknownRecord): readonly unknown[] {
  const ships = readProperty(capturedOuterFleetYard(root), "ships");
  return Array.isArray(ships) ? ships : [];
}

function capturedOuterFleetAmount(
  root: UnknownRecord,
  resourceId: string,
): number | undefined {
  return finite(
    readProperty(
      readProperty(readProperty(root, "resource"), resourceId),
      "amount",
    ),
  );
}

function capturedOuterFleetPartBlueprint(
  settings: UnknownRecord,
  prefix: string,
): UnknownRecord {
  const blueprint: Record<string, unknown> = {};
  for (const type of Object.keys(CAPTURED_OUTER_FLEET_PARTS)) {
    const part = settings[`${prefix}${type}`];
    if (typeof part === "string") blueprint[type] = part;
  }
  return blueprint;
}

function capturedOuterFleetBlueprintAvailable(
  root: UnknownRecord,
  controls: GameFleetControlsPort,
  blueprint: UnknownRecord,
): boolean {
  const yard = capturedOuterFleetYard(root);
  const yardBlueprint = readProperty(yard, "blueprint");
  if (!isRecord(yardBlueprint)) return false;
  const shipClass = blueprint["class"];
  if (typeof shipClass !== "string") return false;
  if (
    shipClass === "explorer" &&
    (blueprint["weapon"] !== "railgun" || blueprint["sensor"] !== "quantum")
  ) {
    return false;
  }
  for (const type of Object.keys(CAPTURED_OUTER_FLEET_PARTS)) {
    const part = blueprint[type];
    if (typeof part !== "string") return false;
    if (
      yardBlueprint[type] === part ||
      (shipClass === "explorer" && (type === "weapon" || type === "sensor"))
    ) {
      continue;
    }
    const index = CAPTURED_OUTER_FLEET_PARTS[type]?.indexOf(part) ?? -1;
    if (
      index < 0 ||
      !controls.isPartAvailable({
        elementId: CAPTURED_OUTER_FLEET_ELEMENT,
        type,
        part,
        index,
      })
    ) {
      return false;
    }
  }
  return true;
}

function capturedOuterFleetRegionEnabled(
  root: UnknownRecord,
  region: string,
): boolean {
  const tech = readProperty(root, "tech");
  const space = readProperty(root, "space");
  if (
    readProperty(readProperty(root, "race"), "orbit_decayed") &&
    region === "spc_moon"
  ) {
    return false;
  }
  if (readProperty(tech, "resettle")) return false;
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
        (finite(readProperty(tech, "titan")) ?? 0) >= 3 &&
        (finite(readProperty(tech, "enceladus")) ?? 0) >= 2
      );
    case "spc_triton":
      return (finite(readProperty(tech, "triton")) ?? 0) >= 2;
    case "spc_makemake":
      return (finite(readProperty(tech, "makemake")) ?? 0) >= 1;
    case "spc_eris":
      return (finite(readProperty(tech, "eris")) ?? 0) >= 1;
    default:
      return false;
  }
}

function capturedOuterFleetRegionCap(
  root: UnknownRecord,
  region: string,
): number {
  const tech = readProperty(root, "tech");
  switch (region) {
    case "spc_titan":
      return (finite(readProperty(tech, "triton")) ?? 0) > 0
        ? (finite(readProperty(tech, "outer")) ?? 0) >= 4
          ? 2000
          : 1000
        : 600;
    case "spc_enceladus":
      return (finite(readProperty(tech, "triton")) ?? 0) > 0
        ? (finite(readProperty(tech, "outer")) ?? 0) >= 4
          ? 1500
          : 1000
        : 600;
    case "spc_triton":
      return (finite(readProperty(tech, "outer")) ?? 0) >= 4 ? 5000 : 3000;
    case "spc_makemake":
      return 2500;
    case "spc_eris":
      return 7500;
    default:
      return region === "spc_moon" || region === "spc_red" ? 1250 : 1020;
  }
}

/** Mirrors DeadSpace's private `shipCosts()` because no captured control prices arbitrary designs. */
function capturedOuterFleetShipCosts(
  blueprint: Readonly<UnknownRecord>,
  ships: readonly unknown[],
): Record<string, number> {
  const costs: Record<string, number> = {};
  let healthInflate = 1;
  let powerInflate = 1;
  let creepFactor = 1;
  const shipClass = String(blueprint["class"] ?? "");
  switch (shipClass) {
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
  const alternateCost = ["freighter", "supply_ship"].includes(
    String(blueprint["class"] ?? ""),
  );
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
      (!["freighter", "supply_ship"].includes(
        String(blueprint["class"] ?? ""),
      ) ||
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

function capturedOuterFleetSyndicate(
  root: UnknownRecord,
  region: string,
  extra: boolean,
  all: boolean,
): { readonly p: number; readonly r: number; readonly s: number } | number {
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const space = readProperty(root, "space");
  const syndicate = readProperty(space, "syndicate");
  if (
    (finite(readProperty(tech, "syndicate")) ?? 0) <= 0 ||
    readProperty(race, "truepath") !== true ||
    !isRecord(syndicate) ||
    !Object.hasOwn(syndicate, region)
  ) {
    return extra ? { p: 1, r: 0, s: 0 } : 1;
  }
  const gov3 = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    "gov3",
  );
  const rivalRel = finite(readProperty(gov3, "hstl"));
  if (rivalRel === undefined) return extra ? { p: 1, r: 0, s: 0 } : 1;
  const rival =
    rivalRel < 10
      ? 250 - 25 * rivalRel
      : rivalRel > 60
        ? -13 * (rivalRel - 60)
        : 0;
  let divisor = 1000;
  switch (region) {
    case "spc_home":
    case "spc_moon":
    case "spc_red":
    case "spc_hell":
      divisor = 1250 + rival;
      break;
    case "spc_gas":
    case "spc_gas_moon":
    case "spc_belt":
      divisor = 1020 + rival;
      break;
    case "spc_titan":
    case "spc_enceladus":
      divisor =
        (finite(readProperty(tech, "triton")) ?? 0) <= 0
          ? 600
          : capturedOuterFleetRegionCap(root, region);
      break;
    case "spc_triton":
    case "spc_makemake":
    case "spc_eris":
      divisor = capturedOuterFleetRegionCap(root, region);
      break;
  }
  let piracy = finite(syndicate[region]) ?? 0;
  let patrol = 0;
  let sensor = 0;
  const ships = capturedOuterFleetShips(root);
  for (const ship of ships) {
    if (!isRecord(ship) || ship["location"] !== region) continue;
    const active =
      all === true ||
      ((finite(ship["transit"]) ?? 1) === 0 && ship["fueled"] === true);
    if (!active) continue;
    const rating =
      (CAPTURED_OUTER_FLEET_WEAPON_POWER[String(ship["weapon"] ?? "")] ?? 0) *
      (CAPTURED_OUTER_FLEET_CLASS_POWER[String(ship["class"] ?? "")] ?? 0);
    patrol +=
      (finite(ship["damage"]) ?? 0) > 0
        ? Math.round((rating * (100 - (finite(ship["damage"]) ?? 0))) / 100)
        : Math.round(rating);
    sensor +=
      CAPTURED_OUTER_FLEET_SENSOR_RANGE[String(ship["sensor"] ?? "")] ?? 0;
  }
  const spaceRoot = isRecord(space) ? space : {};
  const buildingOn = (id: string) =>
    finite(readProperty(readProperty(spaceRoot, id), "on")) ?? 0;
  if (region === "spc_enceladus") patrol += buildingOn("operating_base") * 50;
  else if (region === "spc_titan") patrol += buildingOn("sam") * 25;
  else if (region === "spc_triton" && buildingOn("fob") > 0) {
    patrol += 500;
    sensor += 10;
  }
  if (sensor > 100)
    sensor = Math.round(((sensor - 100) / (sensor + 100)) * 100) + 100;
  patrol = Math.round(patrol * ((sensor + 25) / 125));
  piracy = piracy - patrol > 0 ? piracy - patrol : 0;
  return extra
    ? { p: 1 - +(piracy / divisor).toFixed(4), r: piracy, s: sensor }
    : 1 - +(piracy / divisor).toFixed(4);
}

function capturedOuterFleetLocationName(region: string): string {
  return region === "tauceti" ? "tech_era_tauceti" : region;
}

function capturedOuterFleetShipName(blueprint: UnknownRecord): string {
  return `outer_shipyard_class_${String(blueprint["class"] ?? "")}`;
}

function capturedOuterFleetCurrentGarrison(root: UnknownRecord): number {
  const civic = readProperty(root, "civic");
  const garrison = readProperty(civic, "garrison");
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  const fob = readProperty(readProperty(root, "space"), "fob");
  return (
    (finite(readProperty(garrison, "workers")) ?? 0) -
    (finite(readProperty(garrison, "crew")) ?? 0) -
    (finite(readProperty(fortress, "garrison")) ?? 0) -
    (finite(readProperty(fob, "troops")) ?? 0)
  );
}

function capturedOuterFleetAuthorityView(
  root: UnknownRecord,
  settings: UnknownRecord,
): Readonly<AuthorityPolicyView> | undefined {
  const manage = settings["authorityManage"];
  const configuredTarget = finite(settings["generalMinimumAuthority"]);
  const authority = readProperty(readProperty(root, "resource"), "Authority");
  const current = finite(readProperty(authority, "amount"));
  const maximum = finite(readProperty(authority, "max"));
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const civic = readProperty(root, "civic");
  const government = readProperty(civic, "govern");
  const rawEvilTechLevel = readProperty(tech, "evil");
  const evilTechLevel =
    rawEvilTechLevel === undefined ? 0 : finite(rawEvilTechLevel);
  const highPopulationPercent = finite(readCapturedHighPopulationPercent(root));
  const governmentType = readProperty(government, "type");
  if (
    typeof manage !== "boolean" ||
    configuredTarget === undefined ||
    current === undefined ||
    current < 0 ||
    maximum === undefined ||
    maximum < 0 ||
    !isRecord(tech) ||
    !isRecord(race) ||
    !isRecord(civic) ||
    typeof governmentType !== "string" ||
    evilTechLevel === undefined ||
    evilTechLevel < 0 ||
    highPopulationPercent === undefined ||
    highPopulationPercent < 0
  ) {
    return undefined;
  }
  return Object.freeze({
    target: Object.freeze({
      manage,
      configuredTarget,
      maximum,
    }),
    current,
    modifiers: Object.freeze({
      evilTechLevel,
      highPopulationPercent,
      grenadier: readProperty(race, "grenadier") === true,
      governmentType,
    }),
  });
}

function capturedOuterFleetAuthorityAssessment(
  root: UnknownRecord,
  settings: UnknownRecord,
  removedSoldiers: number,
): OuterFleetAuthorityAssessment {
  const view = capturedOuterFleetAuthorityView(root, settings);
  return view === undefined
    ? { status: "unavailable" }
    : assessAuthorityRemoval(view, removedSoldiers);
}

function capturedOuterFleetBlueprintMatches(
  left: UnknownRecord,
  right: UnknownRecord,
): boolean {
  return Object.keys(CAPTURED_OUTER_FLEET_PARTS).every(
    (type) => left[type] === right[type],
  );
}

function capturedOuterFleetShipCount(
  root: UnknownRecord,
  region: string,
  blueprint: UnknownRecord,
): number {
  return capturedOuterFleetShips(root).filter((ship) => {
    if (!isRecord(ship) || ship["location"] !== region) return false;
    return capturedOuterFleetBlueprintMatches(ship, blueprint);
  }).length;
}

function capturedOuterFleetDecisionMatches(
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

function capturedOuterFleetModal(getDocument: () => unknown): GameModalPort {
  let pending: { readonly action: () => void; waits: number } | null = null;
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
        if (pending.waits >= CAPTURED_OUTER_FLEET_MODAL_WAITS) {
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

export function createCapturedOuterFleetAdapter(
  dependencies: CapturedOuterFleetAdapterDependencies,
): {
  readonly reader: OuterFleetReader;
  readonly executor: OuterFleetExecutor;
} {
  const gameModal = capturedOuterFleetModal(dependencies.getDocument);
  let pendingDispatch: {
    index: number;
    region: string;
    attempts: number;
  } | null = null;
  let session: CapturedOuterFleetSession | null = null;
  let expectedDecision: Readonly<OuterFleetDecision> | null = null;

  function activeSession(): CapturedOuterFleetSession {
    if (session === null)
      throw new Error("captured outer fleet cycle has not been sampled");
    return session;
  }

  function storeBlueprint(
    token: OuterFleetBlueprint,
    raw: unknown,
    path: string,
    blueprints: Map<OuterFleetBlueprint, UnknownRecord>,
  ): UnknownRecord {
    if (!isRecord(raw)) throw new TypeError(`${path} must be a record`);
    blueprints.set(token, raw);
    return raw;
  }

  function dispatchPendingShip(root: UnknownRecord): void {
    const pending = pendingDispatch;
    if (pending === null) return;
    const ship = capturedOuterFleetShips(root)[pending.index];
    if (isRecord(ship) && ship["location"] === pending.region) {
      pendingDispatch = null;
      return;
    }
    if (ship === undefined || !isRecord(ship)) return;
    if (gameModal.isOpen()) return;
    if (pending.attempts >= CAPTURED_OUTER_FLEET_DISPATCH_ATTEMPTS) {
      pendingDispatch = null;
      return;
    }
    pending.attempts += 1;
    gameModal.open({
      triggerSelector: dependencies.controls.dispatchTrigger(pending.index),
      title: `outer_shipyard_dispatch ${String(ship["name"] ?? "")}`,
      action: () => {
        dependencies.controls.dispatchShip({
          index: pending.index,
          region: pending.region,
        });
      },
    });
  }

  const reader: OuterFleetReader = Object.freeze({
    readCycle(): OuterFleetCycleInput {
      session = null;
      expectedDecision = null;
      const blueprints = new Map<OuterFleetBlueprint, UnknownRecord>();
      const root = capturedOuterFleetRoot(dependencies.rootState);
      const settings = capturedOuterFleetSettings(dependencies.readSettings());
      if (root === undefined) {
        session = Object.freeze({
          root: {},
          sourceUnavailable: true,
          settings,
          blueprints,
        });
        const input = Object.freeze({
          initialized: false,
          mode: "none",
          manualBlueprintAvailable: false,
          configuredMinimumCrew: 0,
        });
        const planned = planOuterFleetCycle(input);
        expectedDecision =
          planned.kind === "outer-fleet-status" ? planned : null;
        return input;
      }
      dispatchPendingShip(root);
      const yard = capturedOuterFleetYard(root);
      const initialized =
        (finite(readProperty(readProperty(root, "tech"), "syndicate")) ?? 0) >
          0 &&
        yard !== undefined &&
        Object.hasOwn(yard, "blueprint") &&
        dependencies.controls.isRendered(CAPTURED_OUTER_FLEET_ELEMENT);
      let manualBlueprintAvailable = false;
      if (initialized && settings["fleetOuterShips"] === "manual") {
        manualBlueprintAvailable = capturedOuterFleetBlueprintAvailable(
          root,
          dependencies.controls,
          storeBlueprint(
            "yard",
            yard["blueprint"],
            "shipyard.blueprint",
            blueprints,
          ),
        );
      }
      const input = Object.freeze({
        initialized,
        busy: pendingDispatch !== null,
        mode:
          typeof settings["fleetOuterShips"] === "string"
            ? settings["fleetOuterShips"]
            : "none",
        manualBlueprintAvailable,
        configuredMinimumCrew: finite(settings["fleetOuterCrew"]) ?? 0,
      });
      session = Object.freeze({
        root,
        sourceUnavailable: false,
        settings,
        blueprints,
      });
      const planned = planOuterFleetCycle(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readTargeting(cycle: Readonly<OuterFleetAutomaticPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const root = active.root;
      const tech = readProperty(root, "tech");
      const settings = active.settings;
      const exploreTau = settings["fleetExploreTau"] === true;
      const tauTechnology = finite(readProperty(tech, "tauceti")) ?? 0;
      let explorerAvailable = false;
      let explorerCount = 0;
      if (exploreTau && tauTechnology === 1) {
        const explorer = storeBlueprint(
          "explorer",
          CAPTURED_OUTER_FLEET_EXPLORER,
          "explorer blueprint",
          active.blueprints,
        );
        explorerAvailable = capturedOuterFleetBlueprintAvailable(
          root,
          dependencies.controls,
          explorer,
        );
        if (explorerAvailable)
          explorerCount = capturedOuterFleetShipCount(
            root,
            "tauceti",
            explorer,
          );
      }
      const erisTechnology = finite(readProperty(tech, "eris")) ?? 0;
      const erisWeighting = finite(settings["fleet_outer_pr_spc_eris"]) ?? 0;
      const erisSensor =
        erisTechnology === 1 && erisWeighting > 0
          ? Number(
              (
                capturedOuterFleetSyndicate(root, "spc_eris", true, true) as {
                  readonly s: number;
                }
              ).s,
            )
          : 50;
      const regions: OuterFleetRegionInput[] = [];
      const space = readProperty(root, "space");
      if (
        !(
          exploreTau &&
          tauTechnology === 1 &&
          explorerAvailable &&
          explorerCount < 1
        ) &&
        !(erisTechnology === 1 && erisWeighting > 0 && erisSensor < 50)
      ) {
        for (const id of CAPTURED_OUTER_FLEET_REGIONS) {
          const unlocked = capturedOuterFleetRegionEnabled(root, id);
          const weighting = unlocked
            ? (finite(settings[`fleet_outer_pr_${id}`]) ?? 0)
            : 0;
          const syndicate =
            unlocked && weighting > 0
              ? Number(capturedOuterFleetSyndicate(root, id, false, true))
              : 1;
          const maximumDefense = finite(settings[`fleet_outer_def_${id}`]) ?? 1;
          const digsite = readProperty(space, "digsite");
          const digsiteIncomplete =
            id === "spc_eris" &&
            isRecord(digsite) &&
            (finite(digsite["count"]) ?? 100) < 100;
          const troopers = digsiteIncomplete
            ? (finite(
                readProperty(readProperty(space, "shock_trooper"), "on"),
              ) ?? 0)
            : 0;
          const tanks = digsiteIncomplete
            ? (finite(readProperty(readProperty(space, "tank"), "on")) ?? 0)
            : 0;
          const support = readProperty(
            readProperty(root, "resource"),
            "Eris_Support",
          );
          const reportedSupport =
            digsiteIncomplete && isRecord(support)
              ? (finite(support["amount"]) ?? null)
              : null;
          regions.push(
            Object.freeze({
              id,
              unlocked,
              weighting,
              syndicateRatio: syndicate,
              maximumDefense,
              digsiteIncomplete,
              requestedTroopers: troopers,
              requestedTanks: tanks,
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
      const yard = capturedOuterFleetYard(active.root);
      const avail = (blueprint: UnknownRecord) =>
        capturedOuterFleetBlueprintAvailable(
          active.root,
          dependencies.controls,
          blueprint,
        );
      let yardAvailable = false;
      let scoutAvailable = false;
      let scoutCount = 0;
      let maximumScouts = 0;
      let fighterAvailable = false;
      if (target.forcedBlueprint !== "explorer" && target.mode === "user") {
        if (yard !== undefined) {
          yardAvailable = avail(
            storeBlueprint(
              "yard",
              yard["blueprint"],
              "shipyard.blueprint",
              active.blueprints,
            ),
          );
        }
      } else if (target.forcedBlueprint === null) {
        const scout = storeBlueprint(
          "scout",
          capturedOuterFleetPartBlueprint(active.settings, "fleet_scout_"),
          "scout blueprint",
          active.blueprints,
        );
        scoutAvailable = avail(scout);
        if (scoutAvailable) {
          scoutCount = capturedOuterFleetShipCount(
            active.root,
            target.targetRegion,
            scout,
          );
          maximumScouts =
            finite(active.settings[`fleet_outer_sc_${target.targetRegion}`]) ??
            0;
        }
        if (!scoutAvailable || scoutCount >= maximumScouts) {
          const fighter = storeBlueprint(
            "fighter",
            capturedOuterFleetPartBlueprint(active.settings, "fleet_outer_"),
            "fighter blueprint",
            active.blueprints,
          );
          fighterAvailable = avail(fighter);
        }
      }
      const input: OuterFleetBlueprintInput = Object.freeze({
        target,
        targetLocationName: capturedOuterFleetLocationName(target.targetRegion),
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
      const blueprint = active.blueprints.get(candidate.blueprint);
      if (blueprint === undefined)
        throw new Error(
          `captured outer fleet blueprint ${candidate.blueprint} is missing`,
        );
      const shipClass = blueprint["class"];
      if (typeof shipClass !== "string")
        throw new TypeError(
          `captured ${candidate.blueprint} blueprint.class must be a string`,
        );
      const shipName = capturedOuterFleetShipName(blueprint);
      const shipCrew = (CAPTURED_OUTER_FLEET_CREW[shipClass] ?? 0) * 1;
      if (shipCrew <= 0)
        throw new TypeError(`unknown outer fleet class ${shipClass}`);
      let authority: OuterFleetAuthorityAssessment = { status: "not-required" };
      const authorityResource = readProperty(
        readProperty(active.root, "resource"),
        "Authority",
      );
      if (
        active.settings["authorityManage"] === true &&
        (finite(active.settings["generalMinimumAuthority"]) ?? 0) !== 0 &&
        readProperty(readProperty(active.root, "race"), "universe") ===
          "evil" &&
        readProperty(authorityResource, "display") !== false
      ) {
        authority = capturedOuterFleetAuthorityAssessment(
          active.root,
          active.settings,
          shipCrew,
        );
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
      const blueprint = active.blueprints.get(plan.blueprint);
      if (blueprint === undefined)
        throw new Error(
          `captured outer fleet blueprint ${plan.blueprint} is missing`,
        );
      const costs = capturedOuterFleetShipCosts(
        blueprint,
        capturedOuterFleetShips(active.root),
      );
      let missingResourceName: string | null = null;
      for (const [resourceId, cost] of Object.entries(costs)) {
        const amount = capturedOuterFleetAmount(active.root, resourceId);
        if (amount === undefined || amount < cost) {
          missingResourceName = resourceId;
          break;
        }
      }
      const input: OuterFleetBuildReadinessInput = Object.freeze({
        plan,
        missingResourceName,
        currentCityGarrison: capturedOuterFleetCurrentGarrison(active.root),
      });
      const planned = planOuterFleetBuild(input);
      expectedDecision = planned;
      return input;
    },
  });

  const executor: OuterFleetExecutor = Object.freeze({
    execute(decision: Readonly<OuterFleetDecision>) {
      const active = session;
      const expected = expectedDecision;
      if (active === null || expected === null)
        return stale(
          "captured-outer-fleet-session-missing",
          "captured outer fleet session is missing",
        );
      if (
        (!active.sourceUnavailable &&
          capturedOuterFleetRoot(dependencies.rootState) !== active.root) ||
        capturedOuterFleetSettings(dependencies.readSettings()) !==
          active.settings
      ) {
        return stale(
          "captured-outer-fleet-source-changed",
          "captured outer fleet source changed",
        );
      }
      if (!capturedOuterFleetDecisionMatches(expected, decision))
        return rejected(
          "invalid-captured-outer-fleet-decision",
          "captured outer fleet decision does not match the sampled plan",
        );
      expectedDecision = null;
      if (decision.kind === "outer-fleet-status") return SUCCEEDED;
      const blueprint = active.blueprints.get(decision.blueprint);
      if (blueprint === undefined)
        return stale(
          "captured-outer-fleet-blueprint-changed",
          "captured outer fleet blueprint changed",
        );
      for (const [type, part] of Object.entries(blueprint)) {
        if (type === "name" || typeof part !== "string") continue;
        const index = CAPTURED_OUTER_FLEET_PARTS[type]?.indexOf(part) ?? -1;
        if (
          index < 0 ||
          !dependencies.controls.setPart({
            elementId: CAPTURED_OUTER_FLEET_ELEMENT,
            type,
            part,
            index,
          })
        ) {
          return rejected(
            "captured-outer-fleet-part-not-invoked",
            "outer fleet part control was not invoked",
          );
        }
      }
      if (!dependencies.controls.hasShipPower(CAPTURED_OUTER_FLEET_ELEMENT))
        return rejected(
          "captured-outer-fleet-power-unavailable",
          "outer fleet blueprint has insufficient power",
        );
      const build = dependencies.controls.buildShip({
        elementId: CAPTURED_OUTER_FLEET_ELEMENT,
      });
      if (!build.actionable)
        return rejected(
          "captured-outer-fleet-build-not-invoked",
          "outer fleet build control was not invoked",
        );
      if (build.builtIndex === null)
        return stale(
          "captured-outer-fleet-build-no-transition",
          "outer fleet build returned without adding a ship",
        );
      pendingDispatch = {
        index: build.builtIndex,
        region: decision.targetRegion,
        attempts: 0,
      };
      dependencies.onActivity?.({
        message: `${decision.shipName} has been assembled, and dispatched to ${decision.targetLocationName}.`,
        color: "success",
        tags: ["combat"],
      });
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
