import type {
  GameMechBayRead,
  GameOuterFleetNextShip,
  GamePriorityTargetsPort,
  GameQueueKind,
  GameQueueRead,
  GameTriggerRead,
} from "../../ports/game-priority-targets.ts";
import {
  callBoolean,
  callVoid,
  coerceNumber,
  isFiniteNumber,
  isNonArrayRecord,
  readProperty,
  requireFunction,
  requireRecord,
} from "../validation.ts";

export interface GamePriorityTargetsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getSpyManager: () => unknown;
  readonly getFleetManagerOuter: () => unknown;
  readonly getMechManager: () => unknown;
  readonly getTriggerManager: () => unknown;
  readonly getJQuery: () => unknown;
}

const NOORDER_SETTING: Record<GameQueueKind, string> = {
  queue: "qAny",
  r_queue: "qAny_res",
};

function readGlobal(dependencies: GamePriorityTargetsEvolveDependencies) {
  const game = requireRecord(dependencies.getGame(), "game");
  return readProperty(game, "global");
}

function readQueue(
  kind: GameQueueKind,
  dependencies: GamePriorityTargetsEvolveDependencies,
): GameQueueRead {
  const rawGlobal = readGlobal(dependencies);
  if (!isNonArrayRecord(rawGlobal)) {
    // The game model may not exist yet on the very first sample; a queue then
    // contributes nothing.
    return Object.freeze({ display: false, items: [], noorder: false });
  }
  const rawQueue = rawGlobal[kind];
  const display = isNonArrayRecord(rawQueue) && Boolean(rawQueue["display"]);
  const rawItems = isNonArrayRecord(rawQueue) ? rawQueue["queue"] : [];
  const items = Array.isArray(rawItems) ? rawItems : [];
  const rawSettings = rawGlobal["settings"];
  const noorder =
    isNonArrayRecord(rawSettings) &&
    Boolean(rawSettings[NOORDER_SETTING[kind]]);
  return Object.freeze({ display, items, noorder });
}

function readCostMap(rawCost: unknown): Readonly<Record<string, number>> {
  if (!isNonArrayRecord(rawCost)) {
    return Object.freeze({});
  }
  const cost: Record<string, number> = {};
  for (const key of Object.keys(rawCost)) {
    const value = rawCost[key];
    if (isFiniteNumber(value)) {
      cost[key] = value;
    }
  }
  return Object.freeze(cost);
}

function readOuterFleetNextShip(
  dependencies: GamePriorityTargetsEvolveDependencies,
): GameOuterFleetNextShip {
  const outer = requireRecord(
    dependencies.getFleetManagerOuter(),
    "FleetManagerOuter",
  );
  return Object.freeze({
    affordable: Boolean(outer["nextShipAffordable"]),
    name:
      typeof outer["nextShipName"] === "string" ? outer["nextShipName"] : "",
    cost: readCostMap(outer["nextShipCost"]),
  });
}

function readMechBay(
  dependencies: GamePriorityTargetsEvolveDependencies,
): GameMechBayRead {
  const global = readGlobal(dependencies);
  const portal = isNonArrayRecord(global) ? global["portal"] : undefined;
  const mechbay = isNonArrayRecord(portal) ? portal["mechbay"] : undefined;
  if (!isNonArrayRecord(mechbay)) {
    // Mech bay data exists once the bay itself does; before that, zero space
    // suppresses every reservation with no game-work to read.
    return Object.freeze({ max: 0, bay: 0, blueprintSize: "small" });
  }
  const blueprint = mechbay["blueprint"];
  // `max` and `bay` arrive once the bay itself does; before that the game
  // leaves them lazily absent, and a missing value must read as zero space
  // rather than poison the capacity comparison with NaN.
  const max = isFiniteNumber(mechbay["max"]) ? mechbay["max"] : 0;
  const bay = isFiniteNumber(mechbay["bay"]) ? mechbay["bay"] : 0;
  const blueprintSize =
    isNonArrayRecord(blueprint) && typeof blueprint["size"] === "string"
      ? blueprint["size"]
      : "small";
  return Object.freeze({ max, bay, blueprintSize });
}

function readMechLabReady(
  dependencies: GamePriorityTargetsEvolveDependencies,
): boolean {
  return callBoolean(
    requireRecord(dependencies.getMechManager(), "MechManager"),
    "initLab",
    "MechManager",
  );
}

function readMechPreferredSize(
  dependencies: GamePriorityTargetsEvolveDependencies,
): string | undefined {
  const mechManager = requireRecord(
    dependencies.getMechManager(),
    "MechManager",
  );
  const getPreferredSize = requireFunction(
    mechManager["getPreferredSize"],
    "MechManager.getPreferredSize",
  );
  // The manager's preferred-size scan reads `this` (active mechs, `size`
  // bag), so the method must run bound to the manager record.
  const preferredList = Reflect.apply(getPreferredSize, mechManager, []);
  return Array.isArray(preferredList) && typeof preferredList[0] === "string"
    ? preferredList[0]
    : undefined;
}

function readMechCost(
  size: string,
  dependencies: GamePriorityTargetsEvolveDependencies,
): number {
  const mechManager = requireRecord(
    dependencies.getMechManager(),
    "MechManager",
  );
  const getMechCost = requireFunction(
    mechManager["getMechCost"],
    "MechManager.getMechCost",
  );
  // Mech costs are derived from the manager's own design data (`this`),
  // so the method must run bound to the manager record.
  const cost = Reflect.apply(getMechCost, mechManager, [
    Object.freeze({ size }),
  ]);
  return Array.isArray(cost) && isFiniteNumber(cost[0]) ? cost[0] : 0;
}

function readTriggerTargets(
  dependencies: GamePriorityTargetsEvolveDependencies,
): readonly GameTriggerRead[] {
  const triggerManager = requireRecord(
    dependencies.getTriggerManager(),
    "TriggerManager",
  );
  const rawTriggers = triggerManager["targetTriggers"];
  if (!Array.isArray(rawTriggers)) {
    return Object.freeze([]);
  }
  const triggers: GameTriggerRead[] = [];
  for (const raw of rawTriggers) {
    if (!isNonArrayRecord(raw)) continue;
    const actionId = raw["actionId"];
    if (typeof actionId === "string") {
      triggers.push(Object.freeze({ actionId }));
    }
  }
  return Object.freeze(triggers);
}

function resetTargetTriggers(
  dependencies: GamePriorityTargetsEvolveDependencies,
): void {
  callVoid(
    requireRecord(dependencies.getTriggerManager(), "TriggerManager"),
    "resetTargetTriggers",
    "TriggerManager",
  );
}

function readTechActionIds(
  dependencies: GamePriorityTargetsEvolveDependencies,
): readonly string[] {
  const jquery = dependencies.getJQuery();
  const ids: string[] = [];
  if (typeof jquery !== "function") {
    return Object.freeze(ids);
  }
  const collection = jquery("#tech .action");
  if (
    collection === null ||
    collection === undefined ||
    typeof collection !== "object" ||
    typeof collection["each"] !== "function"
  ) {
    return Object.freeze(ids);
  }
  collection["each"].call(collection, function (this: unknown) {
    const id = readProperty(this, "id");
    if (typeof id === "string") {
      ids.push(id);
    }
  });
  return Object.freeze(ids);
}

/** Evolve adapter for the live reads behind the priority-target planner. */
export function createGamePriorityTargetsEvolveAdapter(
  dependencies: GamePriorityTargetsEvolveDependencies,
): GamePriorityTargetsPort {
  return Object.freeze({
    readQueue(kind: GameQueueKind): GameQueueRead {
      return readQueue(kind, dependencies);
    },
    readSpyPurchaseMoney(): number {
      const spy = requireRecord(dependencies.getSpyManager(), "SpyManager");
      return coerceNumber(spy["purchaseMoney"]);
    },
    readOuterFleetNextShip(): GameOuterFleetNextShip {
      return readOuterFleetNextShip(dependencies);
    },
    readMechBay(): GameMechBayRead {
      return readMechBay(dependencies);
    },
    readMechLabReady(): boolean {
      return readMechLabReady(dependencies);
    },
    readMechPreferredSize(): string | undefined {
      return readMechPreferredSize(dependencies);
    },
    readMechCost(size: string): number {
      return readMechCost(size, dependencies);
    },
    readTriggerTargets(): readonly GameTriggerRead[] {
      return readTriggerTargets(dependencies);
    },
    resetTargetTriggers(): void {
      resetTargetTriggers(dependencies);
    },
    readTechActionIds(): readonly string[] {
      return readTechActionIds(dependencies);
    },
  });
}
