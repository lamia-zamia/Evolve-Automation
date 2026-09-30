/**
 * Captures DeadSpace's private structure grid and production ledger during normal page execution.
 * The two native hooks exist only until the real registry and first ledger owner are identified,
 * or the first completed worker period proves that startup capture failed.
 */

import type { GamePeriodSource } from "../../ports/game-period-source.ts";
import type {
  CapturedGameFuelInput,
  CapturedGameMechanics,
  CapturedGameRead,
  CapturedGameStructureDefinition,
  CapturedPowerBalanceRule,
  CapturedProductionBreakdown,
  CapturedProductionCell,
  CapturedProductionLedger,
} from "../../ports/captured-game-mechanics.ts";
import { isNonArrayRecord, readProperty } from "../validation.ts";

type CapturedGameCall = (this: unknown, ...args: unknown[]) => unknown;
const structureMapCaptureThreshold = 3;

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

function readMechanicsCall(
  action: Record<string, unknown>,
  name: string,
): CapturedGameRead<unknown> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, name);
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  const method = readMechanicsMethod(action, name);
  if (method === undefined) return { kind: "invalid" };
  try {
    const value = Reflect.apply(method, action, []);
    return value === undefined ? { kind: "invalid" } : { kind: "value", value };
  } catch {
    return { kind: "invalid" };
  }
}

function readMechanicsPrimitive(
  action: Record<string, unknown>,
  name: string,
): CapturedGameRead<number | string | boolean> {
  const read = readMechanicsCall(action, name);
  if (read.kind !== "value") return read;
  const value = read.value;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { kind: "value", value }
      : { kind: "invalid" };
  }
  return typeof value === "string" || typeof value === "boolean"
    ? { kind: "value", value }
    : { kind: "invalid" };
}

function readMechanicsTitle(
  action: Record<string, unknown>,
): CapturedGameRead<string> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, "title");
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  let value: unknown = "value" in descriptor ? descriptor.value : undefined;
  if (typeof value === "function") {
    try {
      value = Reflect.apply(value as CapturedGameCall, action, []);
    } catch {
      return { kind: "invalid" };
    }
  }
  return typeof value === "string"
    ? { kind: "value", value }
    : { kind: "invalid" };
}

function readMechanicsFuel(
  action: Record<string, unknown>,
  name: string,
): CapturedGameRead<readonly CapturedGameFuelInput[] | false> {
  const read = readMechanicsCall(action, name);
  if (read.kind !== "value") return read;
  const value = read.value;
  if (value === false) return { kind: "value", value: false };
  if (value === null) return { kind: "invalid" };
  const items = Array.isArray(value) ? value : [value];
  const result: CapturedGameFuelInput[] = [];
  for (const item of items) {
    if (!isNonArrayRecord(item)) return { kind: "invalid" };
    const resourceId = readMechanicsDataProperty(item, "r");
    const amount = readMechanicsDataProperty(item, "a");
    if (
      typeof resourceId !== "string" ||
      typeof amount !== "number" ||
      !Number.isFinite(amount)
    ) {
      return { kind: "invalid" };
    }
    result.push(Object.freeze({ resourceId, amount }));
  }
  return { kind: "value", value: Object.freeze(result) };
}

function readMechanicsBooleanFlag(
  action: Record<string, unknown>,
  name: string,
): CapturedGameRead<boolean> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, name);
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  const value = readMechanicsDataProperty(action, name);
  return typeof value === "boolean"
    ? { kind: "value", value }
    : { kind: "invalid" };
}

function readMechanicsAdjustmentDisabled(
  action: Record<string, unknown>,
  name: string,
): CapturedGameRead<boolean> {
  const read = readMechanicsBooleanFlag(action, name);
  return read.kind === "value"
    ? { kind: "value", value: read.value === false }
    : read;
}

function readMechanicsBalancer(
  action: Record<string, unknown>,
): CapturedGameRead<readonly CapturedPowerBalanceRule[] | false> {
  const read = readMechanicsCall(action, "powerBalancer");
  if (read.kind !== "value") return read;
  const value = read.value;
  if (value === false) return { kind: "value", value: false };
  if (!Array.isArray(value)) return { kind: "invalid" };
  const result: CapturedPowerBalanceRule[] = [];
  for (const item of value) {
    if (!isNonArrayRecord(item)) return { kind: "invalid" };
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
    return { kind: "invalid" };
  }
  return { kind: "value", value: Object.freeze(result) };
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
    readTitle: () => readMechanicsTitle(action),
    readPowered: () => readMechanicsPrimitive(action, "powered"),
    readFuel: () => readMechanicsFuel(action, "p_fuel"),
    readFuelAdjustmentRequested: () =>
      readMechanicsBooleanFlag(action, "p_fuel_adjust"),
    readSupport: () => readMechanicsPrimitive(action, "support"),
    readSupportFuel: () => readMechanicsFuel(action, "support_fuel"),
    readSupportFuelAdjustmentDisabled: () =>
      readMechanicsAdjustmentDisabled(action, "support_fuel_adjust"),
    readPowerLimit: () => readMechanicsPrimitive(action, "power_limit"),
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
  const mapSizeDescriptor = isNonArrayRecord(mapPrototype)
    ? Object.getOwnPropertyDescriptor(mapPrototype, "size")
    : undefined;
  const mapSizeGetter = mapSizeDescriptor?.get;
  const objectConstructor = readMechanicsProperty(pageWindow, "Object");
  const objectPrototype = readMechanicsProperty(objectConstructor, "prototype");
  const objectDefineProperty = readMechanicsDataProperty(
    objectConstructor,
    "defineProperty",
  );

  let structureEntries: Map<unknown, unknown> | undefined;
  let candidateStructureMap: Map<unknown, unknown> | undefined;
  let candidateStructureKeys = new Set<string>();
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
      if (originalConsumeDescriptor === undefined) {
        delete objectPrototype["consume"];
      } else {
        Object.defineProperty(
          objectPrototype,
          "consume",
          originalConsumeDescriptor,
        );
      }
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
          const candidateMap = this as unknown as Map<unknown, unknown>;
          let size: unknown;
          try {
            size =
              typeof mapSizeGetter === "function"
                ? Reflect.apply(mapSizeGetter, candidateMap, [])
                : undefined;
          } catch {
            size = undefined;
          }
          if (candidateMap === candidateStructureMap) {
            if (
              candidateStructureKeys.has(entry.entryKey) ||
              size !== candidateStructureKeys.size + 1
            ) {
              candidateStructureMap = undefined;
              candidateStructureKeys = new Set<string>();
            } else {
              candidateStructureKeys.add(entry.entryKey);
              if (candidateStructureKeys.size >= structureMapCaptureThreshold) {
                structureEntries = candidateMap;
                restoreMapSet();
              }
            }
          } else if (size === 1) {
            candidateStructureMap = candidateMap;
            candidateStructureKeys = new Set([entry.entryKey]);
          }
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
    originalConsumeDescriptor === undefined &&
    typeof objectDefineProperty === "function"
  ) {
    const temporaryConsumeSetter = function capturedProductionConsumeSet(
      this: unknown,
      value: unknown,
    ): void {
      let isLedgerOwner = false;
      if (productionBreakdownOwner === undefined) {
        isLedgerOwner = isProductionConsumeOwner(this, value);
      }
      if (typeof objectDefineProperty !== "function") {
        throw new TypeError("page Object.defineProperty is unavailable");
      }
      // Match inherited writable-data assignment on successful writes by defining an ordinary
      // own data property on the actual receiver. Object.defineProperty covers arrays, functions,
      // proxies, and exotic objects. It also throws when the receiver cannot accept the property;
      // unlike native sloppy assignment, this brief hook cannot silently fail because the setter
      // would make the assignment itself report success. During the hook, `"consume" in receiver`
      // is true through the prototype chain; deleting the hook restores that visibility.
      Reflect.apply(
        objectDefineProperty as CapturedGameCall,
        objectConstructor,
        [
          this,
          "consume",
          { configurable: true, enumerable: true, writable: true, value },
        ],
      );
      if (isLedgerOwner) {
        retainProductionBreakdownOwner(this as Record<string, unknown>);
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
