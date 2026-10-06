/**
 * Captures DeadSpace's private structure grid and production ledger during normal page execution.
 * Native hooks retain the registry, first ledger owner, and deferred power callback queue
 * during startup; the first completed worker period removes any remaining hook.
 */

import type { GamePeriodSource } from "../../ports/game-period-source.ts";
import type {
  CapturedGameFuelInput,
  CapturedGameMechanics,
  CapturedGameRead,
  CapturedGameStructureDefinition,
  CapturedPowerBalanceRule,
  CapturedPowerRequirement,
  CapturedFuelAdjustmentMode,
  CapturedRoundedValue,
  CapturedMathRoundValue,
  CapturedSupportTopology,
  CapturedNativeSupportGrid,
  CapturedProductionBreakdown,
  CapturedProductionCell,
  CapturedProductionLedger,
} from "../../ports/captured-game-mechanics.ts";
import { isNonArrayRecord, readProperty } from "../validation.ts";
import { probeScopedNumberToFixed } from "./scoped-number-to-fixed.ts";
import { probeScopedLocalizedNumbers } from "./scoped-localized-numbers.ts";
import { probeScopedMathRound } from "./scoped-math-round.ts";
import { readCapturedActionAvailability } from "./progression/build/captured-building-availability.ts";

type CapturedGameCall = (this: unknown, ...args: unknown[]) => unknown;
const structureMapCaptureThreshold = 3;

interface CapturedGridEntry {
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  readonly actionId: string;
  readonly action: Record<string, unknown>;
  readonly info: Record<string, unknown> | false;
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

    return { entryKey, region, sector, struct, actionId, action, info };
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
): CapturedGameRead<number> {
  const read = readMechanicsCall(action, name);
  if (read.kind !== "value") return read;
  try {
    // DeadSpace applies Number() during grid discovery and arithmetic coercion in the Power pass.
    const value = Number(read.value);
    return Number.isFinite(value)
      ? { kind: "value", value }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

function readMechanicsSwitchable(
  action: Record<string, unknown>,
): CapturedGameRead<boolean> {
  const read = readMechanicsCall(action, "switchable");
  if (read.kind !== "value") return read;
  // DeadSpace action switchable() methods return booleans, including live completion gates.
  return typeof read.value === "boolean"
    ? { kind: "value", value: read.value }
    : { kind: "invalid" };
}

function readMechanicsSupportTypes(
  action: Record<string, unknown>,
): CapturedGameRead<readonly string[]> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, "s_type");
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  if (!("value" in descriptor)) return { kind: "invalid" };
  const value = descriptor.value;
  if (typeof value === "string")
    return { kind: "value", value: Object.freeze([value]) };
  try {
    if (!Array.isArray(value)) return { kind: "invalid" };
    // `supportGridTypes()` deliberately drops non-string array members.
    const types: string[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (item === undefined) continue;
      if (!("value" in item)) return { kind: "invalid" };
      if (typeof item.value === "string") {
        types.push(item.value);
      }
    }
    return { kind: "value", value: Object.freeze(types) };
  } catch {
    return { kind: "invalid" };
  }
}

function readMechanicsSupportValue(
  action: Record<string, unknown>,
  type: string,
): CapturedGameRead<number> {
  let supportForDescriptor: PropertyDescriptor | undefined;
  try {
    supportForDescriptor = Object.getOwnPropertyDescriptor(
      action,
      "support_for",
    );
  } catch {
    return { kind: "invalid" };
  }
  if (supportForDescriptor !== undefined && !("value" in supportForDescriptor))
    return { kind: "invalid" };
  const supportFor =
    supportForDescriptor !== undefined && "value" in supportForDescriptor
      ? supportForDescriptor.value
      : undefined;
  if (isNonArrayRecord(supportFor)) {
    let valueDescriptor: PropertyDescriptor | undefined;
    try {
      valueDescriptor = Object.getOwnPropertyDescriptor(supportFor, type);
    } catch {
      return { kind: "invalid" };
    }
    if (valueDescriptor !== undefined) {
      if (!("value" in valueDescriptor)) return { kind: "invalid" };
      const value = valueDescriptor.value;
      let result: unknown = value;
      if (typeof value === "function") {
        try {
          result = Reflect.apply(value as CapturedGameCall, action, []);
        } catch {
          return { kind: "invalid" };
        }
      }
      try {
        const numeric = Number(result);
        return Number.isFinite(numeric)
          ? { kind: "value", value: numeric }
          : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    }
  } else if (supportFor) {
    return { kind: "invalid" };
  }
  return readMechanicsPrimitive(action, "support");
}

function readMechanicsSupportProvider(
  action: Record<string, unknown>,
): CapturedGameRead<boolean> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, "support_provider");
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  if (!("value" in descriptor)) return { kind: "invalid" };
  return { kind: "value", value: Boolean(descriptor.value) };
}

function readMechanicsSupportTopology(
  entry: CapturedGridEntry,
  registry: Map<unknown, unknown>,
): CapturedGameRead<CapturedSupportTopology> {
  const { info } = entry;
  if (info === false) {
    return {
      kind: "value",
      value: Object.freeze({
        anchorEntryKey: null,
        unlimited: false,
        enabled: { kind: "value", value: true } as const,
      }),
    };
  }
  let supportDescriptor: PropertyDescriptor | undefined;
  let unlimitedDescriptor: PropertyDescriptor | undefined;
  try {
    supportDescriptor = Object.getOwnPropertyDescriptor(info, "support");
    unlimitedDescriptor = Object.getOwnPropertyDescriptor(
      info,
      "support_unlimited",
    );
  } catch {
    return { kind: "invalid" };
  }
  if (
    (supportDescriptor !== undefined && !("value" in supportDescriptor)) ||
    (unlimitedDescriptor !== undefined && !("value" in unlimitedDescriptor))
  ) {
    return { kind: "invalid" };
  }
  const support =
    supportDescriptor !== undefined && "value" in supportDescriptor
      ? supportDescriptor.value
      : undefined;
  let anchorEntryKey: string | null = null;
  if (support) {
    if (typeof support !== "string") return { kind: "invalid" };
    for (const [key, value] of registry) {
      const candidate = readMechanicsEntry(key, value);
      if (
        candidate !== undefined &&
        candidate.region === entry.region &&
        candidate.struct === support
      ) {
        anchorEntryKey = candidate.entryKey;
        break;
      }
    }
    // `initStructureGrids()` keeps a false anchor when the info.support name has no matching
    // action in the same region. The live support pass then disables that group, so null is a
    // complete observation rather than a malformed mechanics read.
  }
  let conditionDescriptor: PropertyDescriptor | undefined;
  try {
    conditionDescriptor = Object.getOwnPropertyDescriptor(
      info,
      "support_condition",
    );
  } catch {
    return { kind: "invalid" };
  }
  let enabled: CapturedGameRead<boolean> = { kind: "value", value: true };
  if (conditionDescriptor !== undefined) {
    if (!("value" in conditionDescriptor)) {
      enabled = { kind: "invalid" };
    } else if (conditionDescriptor.value) {
      if (typeof conditionDescriptor.value !== "function") {
        enabled = { kind: "invalid" };
      } else {
        try {
          enabled = {
            kind: "value",
            value: Boolean(
              Reflect.apply(
                conditionDescriptor.value as CapturedGameCall,
                info,
                [],
              ),
            ),
          };
        } catch {
          enabled = { kind: "invalid" };
        }
      }
    }
  }
  const unlimitedValue =
    unlimitedDescriptor !== undefined && "value" in unlimitedDescriptor
      ? unlimitedDescriptor.value
      : undefined;
  return {
    kind: "value",
    value: Object.freeze({
      anchorEntryKey,
      unlimited: Boolean(unlimitedValue),
      enabled,
    }),
  };
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

function readMechanicsDescription(
  action: Record<string, unknown>,
): CapturedGameRead<string> {
  const result = readMechanicsCall(action, "desc");
  return result.kind !== "value"
    ? result
    : typeof result.value === "string"
      ? { kind: "value", value: result.value }
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
    const rawAmount = readMechanicsDataProperty(item, "a");
    if (typeof resourceId !== "string") return { kind: "invalid" };
    try {
      // Fuel quantities are multiplied and compared numerically by the upstream Power pass.
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount)) return { kind: "invalid" };
      result.push(Object.freeze({ resourceId, amount }));
    } catch {
      return { kind: "invalid" };
    }
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
    if (supportAmount !== undefined) {
      try {
        const amount = Number(supportAmount);
        if (Number.isFinite(amount)) {
          result.push(Object.freeze({ kind: "support", amount }));
          continue;
        }
      } catch {
        return { kind: "invalid" };
      }
    }
    return { kind: "invalid" };
  }
  return { kind: "value", value: Object.freeze(result) };
}

function readMechanicsPowerRequirements(
  action: Record<string, unknown>,
): CapturedGameRead<readonly CapturedPowerRequirement[]> {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(action, "power_reqs");
  } catch {
    return { kind: "invalid" };
  }
  if (descriptor === undefined) return { kind: "absent" };
  if (!("value" in descriptor) || !isNonArrayRecord(descriptor.value)) {
    return { kind: "invalid" };
  }
  const result: CapturedPowerRequirement[] = [];
  try {
    for (const techId of Object.keys(descriptor.value)) {
      const requirement = Object.getOwnPropertyDescriptor(
        descriptor.value,
        techId,
      );
      if (requirement === undefined || !("value" in requirement)) {
        return { kind: "invalid" };
      }
      const level = Number(requirement.value);
      if (!Number.isFinite(level)) return { kind: "invalid" };
      result.push(Object.freeze({ techId, level }));
    }
  } catch {
    return { kind: "invalid" };
  }
  return { kind: "value", value: Object.freeze(result) };
}

function sameMechanicsDescriptor(
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.configurable === right.configurable &&
    left.enumerable === right.enumerable &&
    left.writable === right.writable &&
    left.value === right.value &&
    left.get === right.get &&
    left.set === right.set
  );
}

type FuelProbeResult =
  | { readonly kind: "value"; readonly factor: number }
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" };

function fuelAdjustmentRegionMatches(
  region: string,
  mode: CapturedFuelAdjustmentMode,
): boolean {
  return mode === "space"
    ? region === "space" || region === "underground" || region === "surface"
    : region !== "space" && region !== "underground" && region !== "surface";
}

function fuelAdjustmentResourceMatches(
  resourceId: string,
  mode: CapturedFuelAdjustmentMode,
): boolean {
  return mode === "space"
    ? resourceId === "Oil" ||
        resourceId === "Helium_3" ||
        resourceId === "Super_Fuel"
    : resourceId === "Deuterium" ||
        resourceId === "Helium_3" ||
        resourceId === "Super_Fuel";
}

function readFuelProbeResult(
  action: Record<string, unknown>,
  probe: (
    read: () => unknown,
  ) => CapturedGameRead<readonly CapturedRoundedValue[]>,
  objectConstructor: unknown,
  mode: CapturedFuelAdjustmentMode,
  resourceId: string,
): FuelProbeResult | undefined {
  if (!fuelAdjustmentResourceMatches(resourceId, mode)) return undefined;
  const fuelDescriptor = Object.getOwnPropertyDescriptor(action, "p_fuel");
  const effectDescriptor = Object.getOwnPropertyDescriptor(action, "effect");
  if (
    fuelDescriptor === undefined ||
    !("value" in fuelDescriptor) ||
    typeof fuelDescriptor.value !== "function" ||
    fuelDescriptor.configurable !== true ||
    effectDescriptor === undefined ||
    !("value" in effectDescriptor) ||
    typeof effectDescriptor.value !== "function"
  ) {
    return undefined;
  }

  const originalFuel = fuelDescriptor;
  const effect = effectDescriptor.value as CapturedGameCall;
  const pageDefineProperty = readMechanicsDataProperty(
    objectConstructor,
    "defineProperty",
  );
  if (typeof pageDefineProperty !== "function") return undefined;

  const originalFuelValue = readMechanicsFuel(action, "p_fuel");
  if (originalFuelValue.kind !== "value" || originalFuelValue.value === false) {
    return undefined;
  }
  const matchingFuels = originalFuelValue.value.filter(
    (fuel) => fuel.resourceId === resourceId,
  );
  if (matchingFuels.length !== 1) return undefined;

  const source = Reflect.apply(
    fuelDescriptor.value as CapturedGameCall,
    action,
    [],
  );
  const arraySource = Array.isArray(source);
  const probeAmounts = [4.25, 13.75] as const;
  const observations: number[][] = [];
  let result: FuelProbeResult = { kind: "absent" };
  try {
    // One probe per amount, so each amount's roundings belong to its own effect call. A `p_fuel`
    // this probe could not observe at all is a probe this action is skipped for, as it was when the
    // page's `toFixed` was checked up front; an effect that throws is the answer being unreadable
    // rather than the action being silent, and invalidates the whole read.
    for (const amount of probeAmounts) {
      const controlledFuel: CapturedGameCall = function capturedFuelAmount() {
        const item = { r: resourceId, a: amount };
        return arraySource ? [item] : item;
      };
      Reflect.apply(pageDefineProperty as CapturedGameCall, objectConstructor, [
        action,
        "p_fuel",
        { ...fuelDescriptor, value: controlledFuel },
      ]);
      let thrown: unknown;
      const read = probe(() => {
        try {
          Reflect.apply(effect, action, []);
        } catch (error) {
          thrown = error;
        }
      });
      if (thrown !== undefined) {
        result = { kind: "invalid" };
        break;
      }
      if (read.kind !== "value") return undefined;
      observations.push(read.value.map((value) => value.receiver));
    }
    if (result.kind !== "invalid") {
      const [first, second] = observations;
      if (first !== undefined && second !== undefined) {
        const firstScaled: number[] = [];
        const secondScaled: number[] = [];
        for (const left of first) {
          if (!Number.isFinite(left)) continue;
          for (const right of second) {
            if (!Number.isFinite(right)) continue;
            const slope = (right - left) / (probeAmounts[1] - probeAmounts[0]);
            if (!Number.isFinite(slope) || slope <= 0) continue;
            const firstFactor = left / probeAmounts[0];
            const secondFactor = right / probeAmounts[1];
            if (
              Math.abs(firstFactor - secondFactor) <=
              1e-9 * Math.max(1, Math.abs(firstFactor), Math.abs(secondFactor))
            ) {
              firstScaled.push(firstFactor);
              secondScaled.push(secondFactor);
            }
          }
        }
        const factors = [...firstScaled, ...secondScaled];
        if (firstScaled.length === 0 && secondScaled.length === 0) {
          result = { kind: "absent" };
        } else if (
          firstScaled.length === 1 &&
          secondScaled.length === 1 &&
          factors.every((factor) => factor === factors[0])
        ) {
          result = { kind: "value", factor: factors[0]! };
        } else {
          result = { kind: "invalid" };
        }
      }
    }
  } catch {
    result = { kind: "invalid" };
  } finally {
    try {
      Reflect.apply(pageDefineProperty as CapturedGameCall, objectConstructor, [
        action,
        "p_fuel",
        fuelDescriptor,
      ]);
    } finally {
      // A failed restoration invalidates the oracle result instead of silently leaving the page
      // action definition modified.
      if (
        !sameMechanicsDescriptor(
          Object.getOwnPropertyDescriptor(action, "p_fuel"),
          originalFuel,
        )
      ) {
        result = { kind: "invalid" };
      }
    }
  }
  return result;
}

function createMechanicsDefinition(
  entry: CapturedGridEntry,
  registry: Map<unknown, unknown>,
): CapturedGameStructureDefinition {
  const action = entry.action;
  const ship = readMechanicsDataProperty(action, "ship");
  const shipRecord = isNonArrayRecord(ship) ? ship : undefined;
  const currentState = (root: unknown): boolean => {
    const liveEntry = readMechanicsEntry(
      entry.entryKey,
      registry.get(entry.entryKey),
    );
    const state = readMechanicsProperty(
      readMechanicsProperty(root, entry.region),
      entry.struct,
    );
    const stateOn = readMechanicsProperty(state, "on");
    return (
      liveEntry?.action === action &&
      liveEntry.region === entry.region &&
      liveEntry.sector === entry.sector &&
      liveEntry.struct === entry.struct &&
      liveEntry.actionId === entry.actionId &&
      isNonArrayRecord(state) &&
      typeof stateOn === "number" &&
      Number.isFinite(stateOn)
    );
  };
  const orderedKeys = (source: unknown): Set<string> | undefined => {
    if (!Array.isArray(source)) return undefined;
    const keys = new Set<string>();
    try {
      for (const key of source) {
        if (typeof key !== "string" || keys.has(key)) return undefined;
        keys.add(key);
      }
    } catch {
      return undefined;
    }
    return keys;
  };
  return Object.freeze({
    entryKey: entry.entryKey,
    region: entry.region,
    sector: entry.sector,
    struct: entry.struct,
    actionId: entry.actionId,
    readAvailability: (root: unknown) =>
      readCapturedActionAvailability(
        root,
        action,
        entry.region,
        entry.sector,
        entry.struct,
        entry.info,
      ),
    readTitle: () => readMechanicsTitle(action),
    readDescription: () => readMechanicsDescription(action),
    readValue: () => readMechanicsPrimitive(action, "val"),
    readWorkers: () => readMechanicsPrimitive(action, "workers"),
    readShipRating: () =>
      shipRecord === undefined
        ? { kind: "absent" as const }
        : readMechanicsPrimitive(shipRecord, "rating"),
    ownsPowered: Object.prototype.hasOwnProperty.call(action, "powered"),
    readPowered: () => readMechanicsPrimitive(action, "powered"),
    readPowerGridRole: (root: unknown, sampledPowered?: number) => {
      if (!currentState(root)) return { kind: "invalid" as const };
      const ordered = orderedKeys(readMechanicsProperty(root, "power"));
      if (ordered === undefined) return { kind: "invalid" as const };
      const power =
        sampledPowered === undefined
          ? readMechanicsPrimitive(action, "powered")
          : Number.isFinite(sampledPowered)
            ? { kind: "value" as const, value: sampledPowered }
            : { kind: "invalid" as const };
      if (power.kind === "invalid") return power;
      const watts = power.kind === "value" ? power.value : 0;
      const listed = ordered.has(entry.entryKey);
      if (listed !== watts > 0) return { kind: "invalid" as const };
      return {
        kind: "value" as const,
        value:
          watts > 0
            ? ("consumer" as const)
            : watts < 0
              ? ("generator" as const)
              : ("none" as const),
      };
    },
    readSwitchable: () => readMechanicsSwitchable(action),
    readPowerRequirements: () => readMechanicsPowerRequirements(action),
    readFuel: () => readMechanicsFuel(action, "p_fuel"),
    readFuelAdjustmentRequested: () =>
      readMechanicsBooleanFlag(action, "p_fuel_adjust"),
    readSupport: () => readMechanicsPrimitive(action, "support"),
    readSupportTypes: () => readMechanicsSupportTypes(action),
    readSupportValue: (type: string) => readMechanicsSupportValue(action, type),
    readSupportProvider: () => readMechanicsSupportProvider(action),
    readSupportTopology: () => readMechanicsSupportTopology(entry, registry),
    readNativeSupportGrids: (root: unknown) => {
      if (!currentState(root)) return { kind: "invalid" as const };
      const support = readMechanicsPrimitive(action, "support");
      if (support.kind === "invalid") return support;
      if (support.kind === "absent")
        return { kind: "value" as const, value: Object.freeze([]) };
      const types = readMechanicsSupportTypes(action);
      if (types.kind !== "value")
        return types.kind === "absent"
          ? { kind: "value" as const, value: Object.freeze([]) }
          : types;
      const provider = readMechanicsSupportProvider(action);
      if (provider.kind === "invalid") return provider;
      const topology = readMechanicsSupportTopology(entry, registry);
      if (topology.kind !== "value") return topology;
      const nativeSupport = readMechanicsProperty(root, "support");
      const result: CapturedNativeSupportGrid[] = [];
      for (const type of types.value) {
        const ordered = orderedKeys(readMechanicsProperty(nativeSupport, type));
        if (ordered === undefined) return { kind: "invalid" as const };
        const consumer = support.value < 0;
        if (ordered.has(entry.entryKey) !== consumer)
          return { kind: "invalid" as const };
        const output = readMechanicsSupportValue(action, type);
        if (output.kind !== "value") return { kind: "invalid" as const };
        // initStructureGrids() places a zero-output action in neither native loop
        // unless it is explicitly marked as a provider.
        if (
          !consumer &&
          output.value <= 0 &&
          !(provider.kind === "value" && provider.value)
        )
          continue;
        result.push(
          Object.freeze({
            type,
            contribution: output.value,
            consumer,
            provider:
              output.value > 0 || (provider.kind === "value" && provider.value),
            topology: topology.value,
          }),
        );
      }
      return { kind: "value" as const, value: Object.freeze(result) };
    },
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
      else if (typeof value === "number") {
        // Keep malformed source rows visible to the feature adapter so it can
        // fail only the affected consumption capability closed.
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
    adjustPower: () => ({ kind: "invalid" as const }),
    readStructures: () => undefined,
    readPowerOrder: () => ({ kind: "invalid" as const }),
    readSupportOrder: () => ({ kind: "invalid" as const }),
    readProductionBreakdown: () => undefined,
    readEffectivePowerCount: () => ({ kind: "invalid" as const }),
    readLocalizedText: () => ({ kind: "absent" as const }),
    readAdjustedFuelFactor: () => ({ kind: "invalid" as const }),
    readRoundedValues: () => ({ kind: "invalid" as const }),
    readEffectRoundedValues: () => ({ kind: "invalid" as const }),
    readEffectNumericInputs: () => ({ kind: "invalid" as const }),
    readMathRoundValues: () => ({ kind: "invalid" as const }),
    readGuardPostRating: () => ({ kind: "invalid" as const }),
  });
}

function resolveCapturedStructureOrder(
  registry: Map<unknown, unknown>,
  rawOrder: unknown,
): CapturedGameRead<readonly CapturedGameStructureDefinition[]> {
  if (!Array.isArray(rawOrder)) return { kind: "invalid" };
  const result: CapturedGameStructureDefinition[] = [];
  const seen = new Set<string>();
  try {
    for (const key of rawOrder) {
      if (typeof key !== "string") return { kind: "invalid" };
      if (seen.has(key)) return { kind: "invalid" };
      seen.add(key);
      const candidate = registry.get(key);
      // A stale root-list key has no live registry entry and is ignored by support processing.
      if (candidate === undefined) continue;
      const entry = readMechanicsEntry(key, candidate);
      if (entry === undefined) return { kind: "invalid" };
      result.push(createMechanicsDefinition(entry, registry));
    }
    return { kind: "value", value: Object.freeze(result) };
  } catch {
    return { kind: "invalid" };
  }
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
  let powerCallbackQueue: Map<unknown, unknown> | undefined;
  const callbackQueueCandidates = new Set<Map<unknown, unknown>>();
  const callbackIteratorDescriptor = isNonArrayRecord(mapPrototype)
    ? Object.getOwnPropertyDescriptor(mapPrototype, Symbol.iterator)
    : undefined;
  const callbackClearDescriptor = isNonArrayRecord(mapPrototype)
    ? Object.getOwnPropertyDescriptor(mapPrototype, "clear")
    : undefined;
  let callbackSequence:
    | {
        phase: "iterated" | "cleared" | "repeated";
        queue: unknown;
        repeat?: unknown;
      }
    | undefined;
  let callbackIteratorHook: CapturedGameCall | undefined;
  let callbackClearHook: CapturedGameCall | undefined;
  function restorePowerCallbackHooks(): void {
    if (isNonArrayRecord(mapPrototype)) {
      if (
        callbackIteratorHook !== undefined &&
        Object.getOwnPropertyDescriptor(mapPrototype, Symbol.iterator)
          ?.value === callbackIteratorHook &&
        callbackIteratorDescriptor !== undefined
      )
        Object.defineProperty(
          mapPrototype,
          Symbol.iterator,
          callbackIteratorDescriptor,
        );
      if (
        callbackClearHook !== undefined &&
        Object.getOwnPropertyDescriptor(mapPrototype, "clear")?.value ===
          callbackClearHook &&
        callbackClearDescriptor !== undefined
      )
        Object.defineProperty(mapPrototype, "clear", callbackClearDescriptor);
    }
    callbackIteratorHook = undefined;
    callbackClearHook = undefined;
  }
  if (
    isNonArrayRecord(mapPrototype) &&
    callbackIteratorDescriptor?.configurable &&
    callbackClearDescriptor?.configurable &&
    typeof callbackIteratorDescriptor.value === "function" &&
    typeof callbackClearDescriptor.value === "function"
  ) {
    const nativeCallbackIterator =
      callbackIteratorDescriptor.value as CapturedGameCall;
    const nativeCallbackClear =
      callbackClearDescriptor.value as CapturedGameCall;
    callbackIteratorHook = function capturedPowerCallbackIterator(
      this: unknown,
      ...args: unknown[]
    ) {
      // actions.js doCallbacks always iterates/clears queue, then iterates/clears repeat.
      callbackSequence =
        callbackSequence?.phase === "cleared" && callbackSequence.queue !== this
          ? { ...callbackSequence, phase: "repeated", repeat: this }
          : { phase: "iterated", queue: this };
      return Reflect.apply(nativeCallbackIterator, this, args);
    };
    callbackClearHook = function capturedPowerCallbackClear(
      this: unknown,
      ...args: unknown[]
    ) {
      const result = Reflect.apply(nativeCallbackClear, this, args);
      if (
        callbackSequence?.phase === "iterated" &&
        callbackSequence.queue === this
      )
        callbackSequence = { ...callbackSequence, phase: "cleared" };
      else if (
        callbackSequence?.phase === "repeated" &&
        callbackSequence.repeat === this &&
        isNonArrayRecord(callbackSequence.queue)
      ) {
        callbackQueueCandidates.add(
          callbackSequence.queue as unknown as Map<unknown, unknown>,
        );
        callbackSequence = undefined;
      } else callbackSequence = undefined;
      return result;
    };
    Object.defineProperty(mapPrototype, Symbol.iterator, {
      ...callbackIteratorDescriptor,
      value: callbackIteratorHook,
    });
    Object.defineProperty(mapPrototype, "clear", {
      ...callbackClearDescriptor,
      value: callbackClearHook,
    });
  }
  let candidateStructureMap: Map<unknown, unknown> | undefined;
  let candidateStructureKeys = new Set<string>();
  let productionBreakdownOwner: Record<string, unknown> | undefined;
  let nativePowerOn: Record<string, unknown> | undefined;
  const retainNativePowerOn = (receiver: Record<string, unknown>): void => {
    nativePowerOn = receiver;
  };
  let stopped = false;
  let mapHook: CapturedGameCall | undefined;
  let consumeSetter: ((this: unknown, value: unknown) => void) | undefined;
  let powerOnSetter: ((this: unknown, value: unknown) => void) | undefined;
  const originalPowerOnProbeDescriptor = isNonArrayRecord(objectPrototype)
    ? Object.getOwnPropertyDescriptor(objectPrototype, "coal_power")
    : undefined;

  function restorePowerOnProbe(): void {
    if (
      powerOnSetter !== undefined &&
      isNonArrayRecord(objectPrototype) &&
      Object.getOwnPropertyDescriptor(objectPrototype, "coal_power")?.set ===
        powerOnSetter
    ) {
      if (originalPowerOnProbeDescriptor === undefined)
        delete objectPrototype["coal_power"];
      else
        Object.defineProperty(
          objectPrototype,
          "coal_power",
          originalPowerOnProbeDescriptor,
        );
    }
    powerOnSetter = undefined;
  }

  // Pinned vars.js keeps p_on private. Its first generator pass writes coal_power (including zero)
  // before any fuel-dependent generator. Observe that one ordinary own-property creation, then
  // retain only the private object; the setter is removed after the first period.
  if (
    isNonArrayRecord(objectPrototype) &&
    originalPowerOnProbeDescriptor === undefined &&
    typeof objectDefineProperty === "function"
  ) {
    powerOnSetter = function capturedNativePowerOnProbe(
      this: unknown,
      value: unknown,
    ): void {
      Reflect.apply(
        objectDefineProperty as CapturedGameCall,
        objectConstructor,
        [
          this,
          "coal_power",
          { configurable: true, enumerable: true, writable: true, value },
        ],
      );
      if (
        nativePowerOn === undefined &&
        isNonArrayRecord(this) &&
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
      )
        retainNativePowerOn(this);
    };
    Object.defineProperty(objectPrototype, "coal_power", {
      configurable: true,
      enumerable: false,
      set: powerOnSetter,
    });
  }
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
    if (callbackQueueCandidates.size === 1)
      powerCallbackQueue = callbackQueueCandidates.values().next().value;
    restoreMapSet();
    restorePowerCallbackHooks();
    restorePowerOnProbe();
    if (productionBreakdownOwner === undefined) restoreConsumeSetter();
    unsubscribeFirstPeriod?.();
    unsubscribeFirstPeriod = undefined;
  }
  unsubscribeFirstPeriod = periods.subscribe(
    restoreUnmatchedHooksAfterFirstPeriod,
  );

  const mechanics: CapturedGameMechanics = Object.freeze({
    adjustPower(
      root: unknown,
      entryKey: string,
      expectedStateOn: number,
      targetStateOn: number,
      isCurrent: () => boolean = () => true,
      preflightOnly = false,
    ): CapturedGameRead<boolean> {
      const entries = structureEntries;
      const entry =
        entries === undefined
          ? undefined
          : readMechanicsEntry(entryKey, entries.get(entryKey));
      if (
        stopped ||
        entry === undefined ||
        !Number.isSafeInteger(expectedStateOn) ||
        !Number.isSafeInteger(targetStateOn) ||
        targetStateOn < 0
      )
        return { kind: "invalid" };
      const state = readMechanicsProperty(
        readMechanicsProperty(root, entry.region),
        entry.struct,
      );
      if (
        !isNonArrayRecord(state) ||
        (!preflightOnly &&
          readMechanicsProperty(state, "on") !== expectedStateOn)
      )
        return { kind: "invalid" };
      const increasing = targetStateOn > expectedStateOn;
      const capRead = increasing
        ? readMechanicsPrimitive(entry.action, "on_cap")
        : { kind: "value" as const, value: expectedStateOn };
      const cap =
        capRead.kind === "absent"
          ? readMechanicsProperty(state, "count")
          : capRead.kind === "value"
            ? capRead.value
            : undefined;
      const postPower = readMechanicsDataProperty(entry.action, "postPower");
      if (
        typeof cap !== "number" ||
        !Number.isFinite(cap) ||
        (targetStateOn > expectedStateOn && targetStateOn > Math.ceil(cap)) ||
        (postPower !== undefined &&
          (typeof postPower !== "function" || powerCallbackQueue === undefined))
      )
        return { kind: "invalid" };
      if (!isCurrent()) return { kind: "invalid" };
      if (preflightOnly) return { kind: "value", value: true };
      // actions.js setAction's power_on/off: one unit per iteration, game on_cap,
      // then deferred postPower. An explicit target avoids keyboard multiplier overshoot.
      const direction = targetStateOn > expectedStateOn ? 1 : -1;
      try {
        for (let on = expectedStateOn; on !== targetStateOn; on += direction) {
          if (!isCurrent() || readMechanicsProperty(state, "on") !== on)
            return { kind: "invalid" };
          state["on"] = on + direction;
          if (
            !isCurrent() ||
            readMechanicsProperty(state, "on") !== on + direction
          )
            return { kind: "invalid" };
        }
        if (postPower !== undefined && targetStateOn !== expectedStateOn)
          powerCallbackQueue!.set([entry.action, "postPower"], [direction > 0]);
        return {
          kind: "value",
          value: readMechanicsProperty(state, "on") === targetStateOn,
        };
      } catch {
        return { kind: "invalid" };
      }
    },
    readStructures(): readonly CapturedGameStructureDefinition[] | undefined {
      const entries = structureEntries;
      if (entries === undefined || stopped) return undefined;
      try {
        const result: CapturedGameStructureDefinition[] = [];
        for (const [key, value] of entries) {
          const entry = readMechanicsEntry(key, value);
          if (entry !== undefined)
            result.push(createMechanicsDefinition(entry, entries));
        }
        return Object.freeze(result);
      } catch {
        return undefined;
      }
    },
    readPowerOrder(
      root: unknown,
    ): CapturedGameRead<readonly CapturedGameStructureDefinition[]> {
      const entries = structureEntries;
      if (entries === undefined || stopped) return { kind: "invalid" };
      const order = readMechanicsProperty(root, "power");
      return order === undefined
        ? { kind: "absent" }
        : resolveCapturedStructureOrder(entries, order);
    },
    readSupportOrder(
      root: unknown,
      type: string,
    ): CapturedGameRead<readonly CapturedGameStructureDefinition[]> {
      const entries = structureEntries;
      if (entries === undefined || stopped) return { kind: "invalid" };
      const support = readMechanicsProperty(root, "support");
      if (support === undefined) return { kind: "absent" };
      const order = readMechanicsProperty(support, type);
      return order === undefined
        ? { kind: "absent" }
        : resolveCapturedStructureOrder(entries, order);
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
      const game = readMechanicsProperty(pageWindow, "game");
      const exposedBreakdown =
        readMechanicsProperty(pageWindow, "breakdown") ??
        readMechanicsProperty(game, "breakdown");
      const capacity =
        readCapturedProductionLedger(readMechanicsDataProperty(owner, "c")) ??
        readCapturedProductionLedger(
          readMechanicsProperty(exposedBreakdown, "c"),
        );
      return Object.freeze({
        production,
        consumption,
        ...(capacity === undefined ? {} : { capacity }),
      });
    },
    readEffectivePowerCount(
      root: unknown,
      entryKey: string,
    ): CapturedGameRead<number> {
      if (
        stopped ||
        nativePowerOn === undefined ||
        structureEntries === undefined
      )
        return { kind: "invalid" };
      const entry = structureEntries.get(entryKey);
      const parsed = readMechanicsEntry(entryKey, entry);
      if (parsed === undefined) return { kind: "invalid" };
      const state = readMechanicsProperty(
        readMechanicsProperty(root, parsed.region),
        parsed.struct,
      );
      const configured = readMechanicsProperty(state, "on");
      const effective = readMechanicsDataProperty(nativePowerOn, parsed.struct);
      return typeof configured === "number" &&
        Number.isSafeInteger(configured) &&
        configured >= 0 &&
        typeof effective === "number" &&
        Number.isSafeInteger(effective) &&
        effective >= 0 &&
        effective <= configured
        ? { kind: "value", value: effective }
        : { kind: "invalid" };
    },
    readLocalizedText(key: string): CapturedGameRead<string> {
      if (stopped) return { kind: "invalid" };
      const game = readMechanicsProperty(pageWindow, "game");
      const localize = readMechanicsProperty(game, "loc");
      if (localize === undefined) return { kind: "absent" };
      if (typeof localize !== "function") return { kind: "invalid" };
      try {
        const value = Reflect.apply(localize as CapturedGameCall, game, [key]);
        return typeof value === "string"
          ? { kind: "value", value }
          : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    },
    readAdjustedFuelFactor(
      mode: CapturedFuelAdjustmentMode,
      resourceId: string,
    ): CapturedGameRead<number> {
      const entries = structureEntries;
      const objectConstructor = readMechanicsProperty(pageWindow, "Object");
      if (
        entries === undefined ||
        stopped ||
        !fuelAdjustmentResourceMatches(resourceId, mode)
      ) {
        return { kind: "invalid" };
      }
      const factors: number[] = [];
      let invalidCandidate = false;
      try {
        for (const [key, value] of entries) {
          const entry = readMechanicsEntry(key, value);
          if (
            entry === undefined ||
            !fuelAdjustmentRegionMatches(entry.region, mode)
          ) {
            continue;
          }
          const rawFuel = readMechanicsFuel(entry.action, "p_fuel");
          if (rawFuel.kind !== "value" || rawFuel.value === false) continue;
          if (
            rawFuel.value.filter((fuel) => fuel.resourceId === resourceId)
              .length !== 1
          ) {
            continue;
          }
          const probed = readFuelProbeResult(
            entry.action,
            mechanics.readRoundedValues,
            objectConstructor,
            mode,
            resourceId,
          );
          if (probed?.kind === "invalid") {
            invalidCandidate = true;
            break;
          }
          if (probed?.kind === "value") factors.push(probed.factor);
        }
      } catch {
        return { kind: "invalid" };
      }
      if (invalidCandidate) return { kind: "invalid" };
      if (factors.length === 0) return { kind: "absent" };
      const first = factors[0]!;
      const consistent = factors.every(
        (factor) =>
          Math.abs(factor - first) <=
          1e-9 * Math.max(1, Math.abs(factor), Math.abs(first)),
      );
      return consistent ? { kind: "value", value: first } : { kind: "invalid" };
    },
    /**
     * The only route to a game answer that exists solely as a rounded literal, and the only place
     * the page prototype is patched at all. The prototype is the page's own, so the patch is scoped
     * to the one synchronous `read` and undone before this returns.
     */
    readRoundedValues(
      read: () => unknown,
    ): CapturedGameRead<readonly CapturedRoundedValue[]> {
      if (stopped) return { kind: "invalid" };
      const observations = probeScopedNumberToFixed(pageWindow, (seen) => {
        read();
        return seen;
      });
      return observations === undefined
        ? { kind: "invalid" }
        : { kind: "value", value: observations };
    },
    readEffectRoundedValues(
      entryKey: string,
      isCurrent?: () => boolean,
    ): CapturedGameRead<readonly CapturedRoundedValue[]> {
      try {
        const entries = structureEntries;
        const candidate = entries?.get(entryKey);
        const entry = readMechanicsEntry(entryKey, candidate);
        const descriptor =
          entry === undefined
            ? undefined
            : Object.getOwnPropertyDescriptor(entry.action, "effect");
        if (
          stopped ||
          entries === undefined ||
          entry === undefined ||
          descriptor === undefined ||
          !("value" in descriptor) ||
          typeof descriptor.value !== "function" ||
          (isCurrent !== undefined && !isCurrent())
        )
          return { kind: "invalid" };
        const action = entry.action;
        const effect = descriptor.value as CapturedGameCall;
        const observed = mechanics.readRoundedValues(() => {
          Reflect.apply(effect, action, []);
        });
        const currentEntry = readMechanicsEntry(entryKey, candidate);
        const current =
          entries === structureEntries &&
          entries.get(entryKey) === candidate &&
          currentEntry?.action === action &&
          currentEntry.actionId === entry.actionId &&
          currentEntry.region === entry.region &&
          currentEntry.sector === entry.sector &&
          currentEntry.struct === entry.struct &&
          readMechanicsMethod(action, "effect") === effect &&
          (isCurrent === undefined || isCurrent());
        return current && observed.kind === "value"
          ? observed
          : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    },
    readEffectNumericInputs(
      entryKey: string,
      isCurrent?: () => boolean,
    ): CapturedGameRead<readonly number[]> {
      try {
        const entries = structureEntries;
        const candidate = entries?.get(entryKey);
        const entry = readMechanicsEntry(entryKey, candidate);
        const effect = entry && readMechanicsMethod(entry.action, "effect");
        if (
          stopped ||
          entries === undefined ||
          entry === undefined ||
          effect === undefined ||
          (isCurrent !== undefined && !isCurrent())
        )
          return { kind: "invalid" };
        const observed = probeScopedLocalizedNumbers(pageWindow, () => {
          if (typeof Reflect.apply(effect, entry.action, []) !== "string")
            throw new TypeError("native effect did not return text");
        });
        const current = readMechanicsEntry(entryKey, candidate);
        return observed !== undefined &&
          entries === structureEntries &&
          entries.get(entryKey) === candidate &&
          current?.action === entry.action &&
          current.actionId === entry.actionId &&
          current.region === entry.region &&
          current.sector === entry.sector &&
          current.struct === entry.struct &&
          readMechanicsMethod(entry.action, "effect") === effect &&
          (isCurrent === undefined || isCurrent())
          ? { kind: "value", value: observed }
          : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    },
    readMathRoundValues(
      read: () => unknown,
    ): CapturedGameRead<readonly CapturedMathRoundValue[]> {
      if (stopped) return { kind: "invalid" };
      const observations = probeScopedMathRound(pageWindow, () => {
        read();
      });
      return observations === undefined
        ? { kind: "invalid" }
        : { kind: "value", value: observations };
    },
    readGuardPostRating(
      root: unknown,
      isCurrent: () => boolean,
    ): CapturedGameRead<number> {
      const entries = structureEntries;
      const candidate = entries?.get("prtl_ruins:guard_post");
      const entry =
        entries === undefined
          ? undefined
          : readMechanicsEntry("prtl_ruins:guard_post", candidate);
      if (
        stopped ||
        !isNonArrayRecord(root) ||
        entry?.actionId !== "portal-guard_post" ||
        readMechanicsMethod(entry.action, "effect") === undefined ||
        !isCurrent()
      )
        return { kind: "invalid" };
      const action = entry.action;
      const observed = mechanics.readMathRoundValues(() => {
        const effect = readMechanicsCall(action, "effect");
        if (effect.kind !== "value")
          throw new TypeError("guard-post effect unavailable");
      });
      const current =
        entries !== undefined &&
        entries === structureEntries &&
        entries.get(entry.entryKey) === candidate &&
        readMechanicsEntry(entry.entryKey, candidate)?.action === action &&
        isCurrent();
      if (!current || observed.kind !== "value" || observed.value.length !== 1)
        return { kind: "invalid" };
      return { kind: "value", value: observed.value[0]!.result };
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
      restorePowerCallbackHooks();
      restorePowerOnProbe();
      restoreConsumeSetter();
    },
  });
}
