/**
 * Captures DeadSpace's private structure grid and production ledger during normal page execution.
 * The two native hooks exist only until the real registry and first ledger owner are identified,
 * or the first completed worker period proves that startup capture failed.
 */

import type { GamePeriodSource } from "../../ports/game-period-source.ts";
import type {
  CapturedGameFuelInput,
  CapturedGameMechanics,
  CapturedGameStructureDefinition,
  CapturedPowerBalanceRule,
  CapturedProductionBreakdown,
  CapturedProductionCell,
  CapturedProductionLedger,
} from "../../ports/captured-game-mechanics.ts";
import { isNonArrayRecord, readProperty } from "../validation.ts";

type CapturedGameCall = (this: unknown, ...args: unknown[]) => unknown;

interface CapturedGridEntry {
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  readonly actionId: string;
  readonly action: Record<string, unknown>;
}

export interface CapturedGameMechanicsInstall {
  readonly mechanics: CapturedGameMechanics;
  uninstall(): void;
}

function readMechanicsProperty(owner: unknown, key: PropertyKey): unknown {
  try {
    return readProperty(owner, key);
  } catch {
    return undefined;
  }
}

function readMechanicsDataProperty(owner: unknown, key: PropertyKey): unknown {
  if (
    (typeof owner !== "object" || owner === null) &&
    typeof owner !== "function"
  ) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function readMechanicsEntry(
  mapKey: unknown,
  candidate: unknown,
): CapturedGridEntry | undefined {
  if (!isNonArrayRecord(candidate) || typeof mapKey !== "string") {
    return undefined;
  }

  try {
    const entryKey = readMechanicsDataProperty(candidate, "key");
    const region = readMechanicsDataProperty(candidate, "region");
    const sector = readMechanicsDataProperty(candidate, "sector");
    const struct = readMechanicsDataProperty(candidate, "struct");
    const action = readMechanicsDataProperty(candidate, "c_action");
    const info = readMechanicsDataProperty(candidate, "info");
    if (
      entryKey !== mapKey ||
      typeof region !== "string" ||
      region.length === 0 ||
      typeof sector !== "string" ||
      sector.length === 0 ||
      typeof struct !== "string" ||
      struct.length === 0 ||
      mapKey !== `${sector}:${struct}` ||
      (info !== false && !isNonArrayRecord(info)) ||
      !isNonArrayRecord(action)
    ) {
      return undefined;
    }

    const actionId = readMechanicsDataProperty(action, "id");
    if (typeof actionId !== "string" || actionId.trim().length === 0) {
      return undefined;
    }

    // A grid definition has at least one of the game's read-only power/support semantics.
    const hasGridRead = [
      "powered",
      "p_fuel",
      "support",
      "support_fuel",
      "power_limit",
      "powerBalancer",
    ].some(
      (name) => typeof readMechanicsDataProperty(action, name) === "function",
    );
    if (!hasGridRead) return undefined;

    return { entryKey, region, sector, struct, actionId, action };
  } catch {
    return undefined;
  }
}

function readMechanicsMethod(
  action: Record<string, unknown>,
  name: string,
): CapturedGameCall | undefined {
  const method = readMechanicsDataProperty(action, name);
  return typeof method === "function"
    ? (method as CapturedGameCall)
    : undefined;
}

function invokeMechanicsMethod(
  action: Record<string, unknown>,
  name: string,
): unknown {
  const method = readMechanicsMethod(action, name);
  if (method === undefined) return undefined;
  try {
    return Reflect.apply(method, action, []);
  } catch {
    return undefined;
  }
}

function readMechanicsNumber(
  action: Record<string, unknown>,
  name: string,
): number | undefined {
  const value = invokeMechanicsMethod(action, name);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readMechanicsFuel(
  action: Record<string, unknown>,
  name: string,
): readonly CapturedGameFuelInput[] | undefined {
  const value = invokeMechanicsMethod(action, name);
  if (value === undefined || value === null || value === false) {
    return undefined;
  }
  const items = Array.isArray(value) ? value : [value];
  const result: CapturedGameFuelInput[] = [];
  for (const item of items) {
    if (!isNonArrayRecord(item)) return undefined;
    const resourceId = readMechanicsDataProperty(item, "r");
    const amount = readMechanicsDataProperty(item, "a");
    if (
      typeof resourceId !== "string" ||
      typeof amount !== "number" ||
      !Number.isFinite(amount)
    ) {
      return undefined;
    }
    result.push(Object.freeze({ resourceId, amount }));
  }
  return Object.freeze(result);
}

function readMechanicsFuelFlag(
  action: Record<string, unknown>,
  name: string,
): boolean | undefined {
  const value = readMechanicsDataProperty(action, name);
  return typeof value === "boolean" ? value : undefined;
}

function readMechanicsBalancer(
  action: Record<string, unknown>,
): readonly CapturedPowerBalanceRule[] | false | undefined {
  const value = invokeMechanicsMethod(action, "powerBalancer");
  if (value === false) return false;
  if (!Array.isArray(value)) return undefined;
  const result: CapturedPowerBalanceRule[] = [];
  for (const item of value) {
    if (!isNonArrayRecord(item)) return undefined;
    const resourceId = readMechanicsDataProperty(item, "r");
    const stateField = readMechanicsDataProperty(item, "k");
    if (typeof resourceId === "string" && typeof stateField === "string") {
      result.push(Object.freeze({ kind: "resource", resourceId, stateField }));
      continue;
    }
    const supportAmount = readMechanicsDataProperty(item, "s");
    if (typeof supportAmount === "number" && Number.isFinite(supportAmount)) {
      result.push(Object.freeze({ kind: "support", amount: supportAmount }));
      continue;
    }
    return undefined;
  }
  return Object.freeze(result);
}

function createMechanicsDefinition(
  entry: CapturedGridEntry,
): CapturedGameStructureDefinition {
  const action = entry.action;
  return Object.freeze({
    entryKey: entry.entryKey,
    region: entry.region,
    sector: entry.sector,
    struct: entry.struct,
    actionId: entry.actionId,
    readPowered: () => readMechanicsNumber(action, "powered"),
    readFuel: () => readMechanicsFuel(action, "p_fuel"),
    readFuelAdjustmentRequested: () =>
      readMechanicsFuelFlag(action, "p_fuel_adjust"),
    readSupport: () => readMechanicsNumber(action, "support"),
    readSupportFuel: () => readMechanicsFuel(action, "support_fuel"),
    readSupportFuelAdjustmentDisabled: () => {
      const value = readMechanicsDataProperty(action, "support_fuel_adjust");
      return typeof value === "boolean" ? value === false : undefined;
    },
    readPowerLimit: () => readMechanicsNumber(action, "power_limit"),
    readPowerBalancer: () => readMechanicsBalancer(action),
  });
}

function readCapturedProductionCells(
  source: unknown,
): Readonly<Record<string, CapturedProductionCell>> | undefined {
  if (!isNonArrayRecord(source)) return undefined;
  const result: Record<string, CapturedProductionCell> = Object.create(
    null,
  ) as Record<string, CapturedProductionCell>;
  try {
    for (const key of Object.keys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !("value" in descriptor)) continue;
      const value = descriptor.value;
      if (typeof value === "string") result[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) {
        result[key] = value;
      }
    }
  } catch {
    return undefined;
  }
  return Object.freeze(result);
}

function readCapturedProductionLedger(
  source: unknown,
): CapturedProductionLedger | undefined {
  if (!isNonArrayRecord(source)) return undefined;
  const result: Record<
    string,
    Readonly<Record<string, CapturedProductionCell>>
  > = Object.create(null) as Record<
    string,
    Readonly<Record<string, CapturedProductionCell>>
  >;
  try {
    for (const key of Object.keys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !("value" in descriptor)) continue;
      const cells = readCapturedProductionCells(descriptor.value);
      if (cells !== undefined) result[key] = cells;
    }
  } catch {
    return undefined;
  }
  return Object.freeze(result);
}

function isProductionConsumeOwner(owner: unknown, assigned: unknown): boolean {
  if (!isNonArrayRecord(owner) || !isNonArrayRecord(assigned)) return false;
  try {
    // On the first normal production pass, the owner has exactly the already-created Global
    // breakdown section; `consume` is assigned before resource slots are recreated. This is a
    // nonlocalized ledger shape and does not name any resource or structure.
    const ownerKeys = Object.keys(owner);
    if (
      ownerKeys.length !== 1 ||
      ownerKeys[0] !== "Global" ||
      Object.keys(assigned).length !== 0
    ) {
      return false;
    }
    const section = readMechanicsDataProperty(owner, "Global");
    return isNonArrayRecord(section);
  } catch {
    return false;
  }
}

function emptyGameMechanics(): CapturedGameMechanics {
  return Object.freeze({
    readStructures: () => undefined,
    readProductionBreakdown: () => undefined,
  });
}

export function installCapturedGameMechanics(
  pageWindow: unknown,
  periods: GamePeriodSource,
): CapturedGameMechanicsInstall {
  if (!isNonArrayRecord(pageWindow)) {
    return Object.freeze({
      mechanics: emptyGameMechanics(),
      uninstall: () => {},
    });
  }

  const mapConstructor = readMechanicsProperty(pageWindow, "Map");
  const mapPrototype = readMechanicsProperty(mapConstructor, "prototype");
  const mapSetDescriptor = isNonArrayRecord(mapPrototype)
    ? Object.getOwnPropertyDescriptor(mapPrototype, "set")
    : undefined;
  const objectConstructor = readMechanicsProperty(pageWindow, "Object");
  const objectPrototype = readMechanicsProperty(objectConstructor, "prototype");

  let structureEntries: Map<unknown, unknown> | undefined;
  let productionBreakdownOwner: Record<string, unknown> | undefined;
  let stopped = false;
  let mapHook: CapturedGameCall | undefined;
  let consumeSetter: ((this: unknown, value: unknown) => void) | undefined;
  let unsubscribeFirstPeriod: (() => void) | undefined;

  function restoreMapSet(): void {
    if (
      mapHook !== undefined &&
      isNonArrayRecord(mapPrototype) &&
      Object.getOwnPropertyDescriptor(mapPrototype, "set")?.value === mapHook &&
      mapSetDescriptor !== undefined
    ) {
      Object.defineProperty(mapPrototype, "set", mapSetDescriptor);
    }
    mapHook = undefined;
  }

  function restoreConsumeSetter(): void {
    if (
      consumeSetter !== undefined &&
      isNonArrayRecord(objectPrototype) &&
      Object.getOwnPropertyDescriptor(objectPrototype, "consume")?.set ===
        consumeSetter
    ) {
      delete objectPrototype["consume"];
    }
    consumeSetter = undefined;
  }

  function retainProductionBreakdownOwner(
    owner: Record<string, unknown>,
  ): void {
    productionBreakdownOwner = owner;
    restoreConsumeSetter();
  }

  if (
    isNonArrayRecord(mapPrototype) &&
    mapSetDescriptor !== undefined &&
    mapSetDescriptor.configurable === true &&
    typeof mapSetDescriptor.value === "function"
  ) {
    const nativeMapSet = mapSetDescriptor.value as CapturedGameCall;
    const mapSetCapture: CapturedGameCall = function capturedStructureMapSet(
      this: unknown,
      ...args: unknown[]
    ): unknown {
      const result = Reflect.apply(nativeMapSet, this, args);
      if (structureEntries === undefined && args.length >= 2) {
        const entry = readMechanicsEntry(args[0], args[1]);
        if (entry !== undefined && isNonArrayRecord(this)) {
          structureEntries = this as unknown as Map<unknown, unknown>;
          restoreMapSet();
        }
      }
      return result;
    };
    mapHook = mapSetCapture;
    Object.defineProperty(mapPrototype, "set", {
      ...mapSetDescriptor,
      value: mapSetCapture,
    });
  }

  const originalConsumeDescriptor = isNonArrayRecord(objectPrototype)
    ? Object.getOwnPropertyDescriptor(objectPrototype, "consume")
    : undefined;
  if (
    isNonArrayRecord(objectPrototype) &&
    originalConsumeDescriptor === undefined
  ) {
    const temporaryConsumeSetter = function capturedProductionConsumeSet(
      this: unknown,
      value: unknown,
    ): void {
      let isLedgerOwner = false;
      if (productionBreakdownOwner === undefined) {
        isLedgerOwner = isProductionConsumeOwner(this, value);
      }
      if (
        ((typeof this === "object" && this !== null) ||
          typeof this === "function") &&
        isNonArrayRecord(this)
      ) {
        try {
          const assigned = Reflect.defineProperty(this, "consume", {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
          if (assigned && isLedgerOwner) {
            retainProductionBreakdownOwner(this);
          }
        } catch {
          // Preserve startup if an unrelated nonextensible object receives this assignment.
        }
      }
    };
    consumeSetter = temporaryConsumeSetter;
    Object.defineProperty(objectPrototype, "consume", {
      configurable: true,
      enumerable: false,
      set: temporaryConsumeSetter,
    });
  }

  function restoreUnmatchedHooksAfterFirstPeriod(): void {
    if (structureEntries === undefined) restoreMapSet();
    if (productionBreakdownOwner === undefined) restoreConsumeSetter();
    unsubscribeFirstPeriod?.();
    unsubscribeFirstPeriod = undefined;
  }
  unsubscribeFirstPeriod = periods.subscribe(
    restoreUnmatchedHooksAfterFirstPeriod,
  );

  const mechanics: CapturedGameMechanics = Object.freeze({
    readStructures(): readonly CapturedGameStructureDefinition[] | undefined {
      const entries = structureEntries;
      if (entries === undefined || stopped) return undefined;
      try {
        const result: CapturedGameStructureDefinition[] = [];
        for (const [key, value] of entries) {
          const entry = readMechanicsEntry(key, value);
          if (entry !== undefined)
            result.push(createMechanicsDefinition(entry));
        }
        return Object.freeze(result);
      } catch {
        return undefined;
      }
    },
    readProductionBreakdown(): CapturedProductionBreakdown | undefined {
      const owner = productionBreakdownOwner;
      if (owner === undefined || stopped) return undefined;
      const consumption = readCapturedProductionLedger(
        readMechanicsDataProperty(owner, "consume"),
      );
      const productionSource: Record<string, unknown> = Object.create(
        null,
      ) as Record<string, unknown>;
      try {
        for (const key of Object.keys(owner)) {
          if (key === "consume") continue;
          const value = readMechanicsDataProperty(owner, key);
          if (isNonArrayRecord(value)) productionSource[key] = value;
        }
      } catch {
        return undefined;
      }
      const production = readCapturedProductionLedger(productionSource);
      if (consumption === undefined || production === undefined)
        return undefined;
      return Object.freeze({ production, consumption });
    },
  });

  return Object.freeze({
    mechanics,
    uninstall() {
      if (stopped) return;
      stopped = true;
      unsubscribeFirstPeriod?.();
      unsubscribeFirstPeriod = undefined;
      restoreMapSet();
      restoreConsumeSetter();
    },
  });
}
