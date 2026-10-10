/**
 * Captures DeadSpace's private structure grid and production ledger during normal page execution.
 * Native hooks retain the registry, first ledger owner, and deferred power callback queue
 * during startup; the first completed worker period removes any remaining hook.
 */

import type { GamePeriodSource } from "../../ports/game-period-source.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type {
  CapturedGameFuelInput,
  CapturedGameMechanics,
  CapturedGameRead,
  CapturedTechDefinition,
  CapturedGameStructureIdentity,
  CapturedGameStructureDefinition,
  CapturedSupportAnchorResolver,
  CapturedSupportMechanicsSample,
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
import {
  readCapturedActionAvailability,
  readCapturedActionControlAvailabilityForTab,
} from "./progression/build/captured-building-availability.ts";

type CapturedGameCall = (this: unknown, ...args: unknown[]) => unknown;
const structureMapCaptureThreshold = 3;

interface CapturedNativeTechDefinitionIdentity extends CapturedTechDefinition {
  readonly action: Record<string, unknown>;
}

interface CapturedNativeTechRegistrySnapshot {
  readonly registry: Record<string, unknown>;
  readonly keys: readonly string[];
  readonly definitions: readonly CapturedNativeTechDefinitionIdentity[];
  readonly definitionsByActionId?: ReadonlyMap<
    string,
    CapturedNativeTechDefinitionIdentity
  >;
  readonly publicDefinitions: readonly CapturedTechDefinition[];
}

function readNativeTechRegistrySnapshot(
  registry: unknown,
  rawKeys: unknown,
  retainActionIndex = false,
): CapturedNativeTechRegistrySnapshot | undefined {
  if (
    !isNonArrayRecord(registry) ||
    !Array.isArray(rawKeys) ||
    rawKeys.length === 0
  ) {
    return undefined;
  }

  const keys: string[] = [];
  const definitions: CapturedNativeTechDefinitionIdentity[] = [];
  const definitionsByActionId = retainActionIndex
    ? new Map<string, CapturedNativeTechDefinitionIdentity>()
    : undefined;
  const seenActionIds = new Set<string>();
  for (const rawKey of rawKeys) {
    if (
      typeof rawKey !== "string" ||
      rawKey.length === 0 ||
      rawKey.trim() !== rawKey
    ) {
      return undefined;
    }
    const action = readMechanicsDataProperty(registry, rawKey);
    if (!isNonArrayRecord(action)) return undefined;
    const actionId = readMechanicsDataProperty(action, "id");
    const grant = readMechanicsDataProperty(action, "grant");
    if (
      typeof actionId !== "string" ||
      actionId.trim() !== actionId ||
      !actionId.startsWith("tech-") ||
      actionId.length === "tech-".length ||
      seenActionIds.has(actionId) ||
      !Array.isArray(grant) ||
      readMechanicsDataProperty(grant, "length") !== 2
    ) {
      return undefined;
    }
    const grantTechnology = readMechanicsDataProperty(grant, "0");
    const grantLevel = readMechanicsDataProperty(grant, "1");
    if (
      typeof grantTechnology !== "string" ||
      grantTechnology.trim().length === 0 ||
      typeof grantLevel !== "number" ||
      !Number.isFinite(grantLevel) ||
      grantLevel < 0
    ) {
      return undefined;
    }

    keys.push(rawKey);
    seenActionIds.add(actionId);
    const definition = Object.freeze({
      registryKey: rawKey,
      actionId,
      grantTechnology,
      grantLevel,
      action,
    });
    definitions.push(definition);
    definitionsByActionId?.set(actionId, definition);
  }

  return Object.freeze({
    registry: registry as Record<string, unknown>,
    keys: Object.freeze(keys),
    definitions: Object.freeze(definitions),
    ...(definitionsByActionId === undefined ? {} : { definitionsByActionId }),
    publicDefinitions: Object.freeze(
      definitions.map((definition) =>
        Object.freeze({
          registryKey: definition.registryKey,
          actionId: definition.actionId,
          grantTechnology: definition.grantTechnology,
          grantLevel: definition.grantLevel,
        }),
      ),
    ),
  });
}

function sameNativeTechRegistrySnapshot(
  first: CapturedNativeTechRegistrySnapshot,
  second: CapturedNativeTechRegistrySnapshot,
): boolean {
  return (
    first.registry === second.registry &&
    first.keys.length === second.keys.length &&
    first.keys.every((key, index) => key === second.keys[index]) &&
    first.definitions.length === second.definitions.length &&
    first.definitions.every((definition, index) => {
      const other = second.definitions[index];
      return (
        other !== undefined &&
        definition.action === other.action &&
        definition.actionId === other.actionId &&
        definition.grantTechnology === other.grantTechnology &&
        definition.grantLevel === other.grantLevel
      );
    })
  );
}

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

// The page's own storage is the only authority for an installed string pack. DeadSpace
// src/vars.js exports `save = window.localStorage`, and src/locale.js applies a pack only when
// `save.getItem('string_pack') || false` is truthy and `settings.sPackOn` is on. vars.js also
// defaults sPackOn to true for every fresh profile, so the toggle alone proves nothing.
const CUSTOM_PACK_STORAGE_KEY = "string_pack";

function hasActiveCustomStringPack(
  pageWindow: unknown,
  stringPackOn: unknown,
): boolean {
  // A disabled toggle leaves the served assets authoritative whatever storage holds.
  if (stringPackOn !== true) return false;
  const storage = readMechanicsProperty(pageWindow, "localStorage");
  const getItem = readMechanicsProperty(storage, "getItem");
  if (typeof getItem !== "function") return true;
  try {
    // locale.js coerces the stored value with `|| false`, so a missing key (null) and an empty
    // string are both inert. The pack body is never needed: its existence alone means the served
    // templates no longer match the strings the page resolves.
    const stored: unknown = Reflect.apply(
      getItem as CapturedGameCall,
      storage,
      [CUSTOM_PACK_STORAGE_KEY],
    );
    return Boolean(stored);
  } catch {
    // Without a readable answer the served assets cannot be proven authoritative.
    return true;
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

/**
 * Whether a retained receiver still only holds what the private support map holds: whole
 * non-negative counts, keyed by captured consumer struct names. Anything else means the probe
 * retained the wrong object, and the read answers invalid rather than a stranger's number.
 */
function isSupportOnAuthority(
  value: Record<string, unknown>,
  supportConsumerNames: ReadonlySet<string>,
): boolean {
  if (!isNonArrayRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (!supportConsumerNames.has(key)) return false;
    const count = readMechanicsDataProperty(value, key);
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return false;
  }
  return true;
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
  resolveAnchor?: CapturedSupportAnchorResolver,
): CapturedGameRead<CapturedSupportTopology> {
  const { info } = entry;
  if (info === false) {
    return {
      kind: "value",
      value: Object.freeze({
        anchorEntryKey: null,
        unlimited: false,
        enabled: { kind: "value", value: true } as const,
        conditionEvaluated: false,
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
    const resolved = resolveAnchor?.(entry.region, support);
    if (resolved?.kind === "invalid") return { kind: "invalid" };
    if (resolved?.kind === "value") anchorEntryKey = resolved.value;
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
  let conditionEvaluated = false;
  if (conditionDescriptor !== undefined) {
    if (!("value" in conditionDescriptor)) {
      enabled = { kind: "invalid" };
    } else if (conditionDescriptor.value) {
      if (typeof conditionDescriptor.value !== "function") {
        enabled = { kind: "invalid" };
      } else {
        conditionEvaluated = true;
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
      conditionEvaluated,
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
  candidate: unknown,
  resolveCapturedAnchor: CapturedSupportAnchorResolver = () => ({
    kind: "value",
    value: null,
  }),
): CapturedGameStructureDefinition {
  const action = entry.action;
  const ship = readMechanicsDataProperty(action, "ship");
  const shipRecord = isNonArrayRecord(ship) ? ship : undefined;
  const matchesCurrentIdentity = (): boolean => {
    const liveCandidate = registry.get(entry.entryKey);
    const liveEntry = readMechanicsEntry(entry.entryKey, liveCandidate);
    return (
      liveCandidate === candidate &&
      liveEntry?.action === action &&
      liveEntry.region === entry.region &&
      liveEntry.sector === entry.sector &&
      liveEntry.struct === entry.struct &&
      liveEntry.actionId === entry.actionId &&
      liveEntry.info === entry.info
    );
  };
  const currentState = (root: unknown): boolean => {
    const state = readMechanicsProperty(
      readMechanicsProperty(root, entry.region),
      entry.struct,
    );
    const stateOn = readMechanicsProperty(state, "on");
    return (
      matchesCurrentIdentity() &&
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
    matchesCurrentIdentity,
    readAvailability: (root: unknown) =>
      readCapturedActionAvailability(
        root,
        action,
        entry.region,
        entry.sector,
        entry.struct,
        entry.info,
      ),
    readControlAvailabilityForTab: (root: unknown, tabIndex: number) =>
      readCapturedActionControlAvailabilityForTab(
        root,
        action,
        entry.region,
        entry.sector,
        entry.struct,
        entry.info,
        tabIndex,
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
    readSupportTopology: (resolveAnchor?: CapturedSupportAnchorResolver) =>
      readMechanicsSupportTopology(
        entry,
        resolveAnchor ?? resolveCapturedAnchor,
      ),
    readNativeSupportGrids: (
      root: unknown,
      sample?: CapturedSupportMechanicsSample,
    ) => {
      if (!currentState(root)) return { kind: "invalid" as const };
      const support =
        sample?.support ?? readMechanicsPrimitive(action, "support");
      if (support.kind === "invalid") return support;
      if (support.kind === "absent")
        return { kind: "value" as const, value: Object.freeze([]) };
      const types = sample?.supportTypes ?? readMechanicsSupportTypes(action);
      if (types.kind !== "value")
        return types.kind === "absent"
          ? { kind: "value" as const, value: Object.freeze([]) }
          : types;
      const provider = sample?.provider ?? readMechanicsSupportProvider(action);
      if (provider.kind === "invalid") return provider;
      const topology =
        sample?.topology ??
        readMechanicsSupportTopology(entry, resolveCapturedAnchor);
      if (topology.kind !== "value") return topology;
      const nativeSupport = readMechanicsProperty(root, "support");
      const result: CapturedNativeSupportGrid[] = [];
      for (const type of types.value) {
        const ordered = orderedKeys(readMechanicsProperty(nativeSupport, type));
        if (ordered === undefined) return { kind: "invalid" as const };
        const consumer = support.value < 0;
        if (ordered.has(entry.entryKey) !== consumer)
          return { kind: "invalid" as const };
        const output =
          sample === undefined
            ? readMechanicsSupportValue(action, type)
            : (sample.supportValues.get(type) ?? { kind: "invalid" as const });
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
    captureTechDefinitionsDuring: <T>(draw: () => T): T => draw(),
    readTechDefinitions: () => undefined,
    readStructures: () => undefined,
    readStructureIdentities: () => undefined,
    readPowerOrder: () => ({ kind: "invalid" as const }),
    readSupportOrder: () => ({ kind: "invalid" as const }),
    readProductionBreakdown: () => undefined,
    readEffectivePowerCount: () => ({ kind: "invalid" as const }),
    readEffectiveSupportCount: () => ({ kind: "invalid" as const }),
    readLocalizedText: () => ({ kind: "absent" as const }),
    readAdjustedFuelFactor: () => ({ kind: "invalid" as const }),
    readRoundedValues: () => ({ kind: "invalid" as const }),
    readEffectRoundedValues: () => ({ kind: "invalid" as const }),
    readEffectLocalizedNumericInputs: () => ({ kind: "invalid" as const }),
    readMathRoundValues: () => ({ kind: "invalid" as const }),
    readGuardPostRating: () => ({ kind: "invalid" as const }),
  });
}

function resolveCapturedStructureOrder(
  registry: Map<unknown, unknown>,
  rawOrder: unknown,
  structuresByEntryKey?: ReadonlyMap<string, CapturedGameStructureDefinition>,
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
      if (structuresByEntryKey === undefined) {
        const entry = readMechanicsEntry(key, candidate);
        if (entry === undefined) return { kind: "invalid" };
        result.push(createMechanicsDefinition(entry, registry, candidate));
      } else {
        const snapshotDefinition = structuresByEntryKey.get(key);
        if (
          snapshotDefinition === undefined ||
          !snapshotDefinition.matchesCurrentIdentity()
        )
          return { kind: "invalid" };
        result.push(snapshotDefinition);
      }
    }
    return { kind: "value", value: Object.freeze(result) };
  } catch {
    return { kind: "invalid" };
  }
}

export function installCapturedGameMechanics(
  pageWindow: unknown,
  periods: GamePeriodSource,
  rootState?: GameRootStateSource,
  isCaptureComplete: () => boolean = () => true,
): CapturedGameMechanicsInstall {
  if (!isNonArrayRecord(pageWindow)) {
    return Object.freeze({
      mechanics: emptyGameMechanics(),
      uninstall: () => {},
    });
  }

  // DeadSpace keeps loc() module-private on the unmodified page. Read the same served template
  // assets synchronously when game.loc is absent; an active custom string pack fails closed because
  // its override cannot be identified from the root. Keep the asset cache inside this capture.
  const templatePacks = new Map<string, Record<string, unknown> | undefined>();
  const loadTemplatePack = (
    path: string,
  ): Record<string, unknown> | undefined => {
    if (templatePacks.has(path)) return templatePacks.get(path);
    let pack: Record<string, unknown> | undefined;
    try {
      const constructor = readMechanicsProperty(pageWindow, "XMLHttpRequest");
      if (typeof constructor === "function") {
        const request = Reflect.construct(constructor, []) as XMLHttpRequest;
        request.open("GET", path, false);
        request.send();
        const parsed: unknown =
          request.status === 200 ? JSON.parse(request.responseText) : undefined;
        if (isNonArrayRecord(parsed)) pack = parsed;
      }
    } catch {
      /* An unavailable native asset leaves the marginal unknown. */
    }
    templatePacks.set(path, pack);
    return pack;
  };
  const readEffectTemplate = (key: string): string | undefined => {
    const game = readMechanicsProperty(pageWindow, "game");
    const localize = readMechanicsProperty(game, "loc");
    if (typeof localize === "function") {
      try {
        const value = Reflect.apply(localize as CapturedGameCall, game, [key]);
        return typeof value === "string" ? value : undefined;
      } catch {
        return undefined;
      }
    }
    const root = rootState?.readRoot();
    const settings = readProperty(root, "settings");
    if (
      hasActiveCustomStringPack(pageWindow, readProperty(settings, "sPackOn"))
    )
      return undefined;
    const rawLocale = readProperty(settings, "locale");
    const locale = rawLocale === undefined ? "en-US" : rawLocale;
    if (typeof locale !== "string" || !/^[a-z]{2}-[A-Z]{2}$/u.test(locale))
      return undefined;
    const base = loadTemplatePack("strings/strings.json");
    if (base === undefined) return undefined;
    const override =
      locale === "en-US"
        ? undefined
        : loadTemplatePack(`strings/strings.${locale}.json`);
    if (locale !== "en-US" && override === undefined) return undefined;
    const value = override?.[key] ?? base[key];
    return typeof value === "string" ? value : undefined;
  };

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
  let structureIdentitySnapshot:
    readonly CapturedGameStructureIdentity[] | undefined;
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
    installSupportOnProbe();
  };
  let nativeSupportOn: Record<string, unknown> | undefined;
  /** Consumer struct names, from the captured action definitions; the probe is keyed on them. */
  const supportConsumerNames = new Set<string>();
  const supportOnFirstReceivers = new Map<string, Record<string, unknown>>();
  const supportOnProbeSetters = new Map<
    string,
    (this: unknown, value: unknown) => void
  >();

  function registerSupportConsumer(entry: CapturedGridEntry): void {
    const support = readMechanicsPrimitive(entry.action, "support");
    if (support.kind !== "value" || support.value >= 0) return;
    supportConsumerNames.add(entry.struct);
    installSupportOnProbe();
  }

  /**
   * Pinned vars.js keeps `support_on` private too, and no single struct name is written on every
   * pass, so one accessor cannot name it. Instead: learn which captured actions are support consumers
   * (`support()` is negative in pinned `initStructureGrids`), install one temporary accessor per
   * consumer struct on the page's `Object.prototype`, and take the first receiver each name reaches
   * that is not the already-identified `p_on`.
   *
   * Pinned `industry.js::initStructureGrids` writes configured counts into both `p_on` and
   * `support_on`. The later native support pass overwrites `support_on[consumer.struct]` with the
   * clamped count before the `int_on`/`gal_on`/`spire_on` aliases. Excluding the already-retained
   * `p_on` object makes the first remaining consumer write identify the private `support_on` map;
   * retaining that object captures its later effective-count writes as well. Since the pinned
   * initializer fills every registry entry before that later support pass, the retained Map stays
   * observed only until the first distinct receiver is identified. Every temporary accessor is
   * removed at that seam.
   */
  function restoreSupportOnProbe(): void {
    for (const [name, setter] of supportOnProbeSetters) {
      if (
        isNonArrayRecord(objectPrototype) &&
        Object.getOwnPropertyDescriptor(objectPrototype, name)?.set === setter
      ) {
        try {
          delete (objectPrototype as unknown as Record<string, unknown>)[name];
        } catch {
          /* A non-configurable probe is left in place; it forwards the ordinary write. */
        }
      }
    }
    supportOnProbeSetters.clear();
  }

  function retainSupportOn(receiver: Record<string, unknown>): void {
    nativeSupportOn = receiver;
    restoreSupportOnProbe();
    restoreMapSet();
  }

  function observeSupportOnWrite(
    name: string,
    receiver: unknown,
    value: unknown,
  ): void {
    if (nativeSupportOn !== undefined || stopped) return;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      !isNonArrayRecord(receiver) ||
      receiver === nativePowerOn ||
      supportOnFirstReceivers.has(name)
    )
      return;
    supportOnFirstReceivers.set(name, receiver);
    for (const candidate of supportOnFirstReceivers.values()) {
      if (candidate !== receiver) return;
    }
    retainSupportOn(receiver);
  }

  function installSupportOnProbe(): void {
    if (
      stopped ||
      nativeSupportOn !== undefined ||
      nativePowerOn === undefined ||
      !isNonArrayRecord(objectPrototype) ||
      typeof objectDefineProperty !== "function"
    )
      return;
    for (const name of supportConsumerNames) {
      if (
        supportOnProbeSetters.has(name) ||
        Object.getOwnPropertyDescriptor(objectPrototype, name) !== undefined
      )
        continue;
      const setter = function capturedNativeSupportOnProbe(
        this: unknown,
        value: unknown,
      ): void {
        Reflect.apply(
          objectDefineProperty as CapturedGameCall,
          objectConstructor,
          [
            this,
            name,
            { configurable: true, enumerable: true, writable: true, value },
          ],
        );
        try {
          observeSupportOnWrite(name, this, value);
        } catch {
          /* A probe must never disturb the game's own write. */
        }
      };
      supportOnProbeSetters.set(name, setter);
      try {
        Object.defineProperty(objectPrototype, name, {
          configurable: true,
          enumerable: false,
          set: setter,
        });
      } catch {
        supportOnProbeSetters.delete(name);
      }
    }
  }

  let stopped = false;
  let capturedTechRegistry: CapturedNativeTechRegistrySnapshot | undefined;
  let capturedTechRegistryObjectKeys: CapturedGameCall | undefined;
  let capturedTechAuthorityInvalid = false;
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
      if (structureEntries !== undefined) {
        if (this === structureEntries && args.length >= 2) {
          const entry = readMechanicsEntry(args[0], args[1]);
          if (entry !== undefined) registerSupportConsumer(entry);
        }
      } else if (args.length >= 2) {
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
                candidateMap.forEach((candidate, key) => {
                  const retainedEntry = readMechanicsEntry(key, candidate);
                  if (retainedEntry !== undefined)
                    registerSupportConsumer(retainedEntry);
                });
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
    restoreSupportOnProbe();
    if (productionBreakdownOwner === undefined) restoreConsumeSetter();
    unsubscribeFirstPeriod?.();
    unsubscribeFirstPeriod = undefined;
  }
  unsubscribeFirstPeriod = periods.subscribe(
    restoreUnmatchedHooksAfterFirstPeriod,
  );

  function readRetainedNativeTechRegistry():
    CapturedNativeTechRegistrySnapshot | undefined {
    const retained = capturedTechRegistry;
    const originalObjectKeys = capturedTechRegistryObjectKeys;
    if (
      stopped ||
      capturedTechAuthorityInvalid ||
      retained === undefined ||
      originalObjectKeys === undefined
    )
      return undefined;
    try {
      const rawKeys = Reflect.apply(originalObjectKeys, objectConstructor, [
        retained.registry,
      ]);
      const current = readNativeTechRegistrySnapshot(
        retained.registry,
        rawKeys,
      );
      return current !== undefined &&
        sameNativeTechRegistrySnapshot(retained, current)
        ? retained
        : undefined;
    } catch {
      return undefined;
    }
  }

  const mechanics: CapturedGameMechanics = Object.freeze({
    captureTechDefinitionsDuring<T>(draw: () => T): T {
      if (
        stopped ||
        capturedTechAuthorityInvalid ||
        capturedTechRegistry !== undefined
      )
        return draw();
      if (
        typeof objectConstructor !== "function" ||
        typeof objectDefineProperty !== "function"
      ) {
        return draw();
      }

      let originalDescriptor: PropertyDescriptor | undefined;
      try {
        originalDescriptor = Object.getOwnPropertyDescriptor(
          objectConstructor,
          "keys",
        );
      } catch {
        return draw();
      }
      if (
        originalDescriptor === undefined ||
        !("value" in originalDescriptor) ||
        typeof originalDescriptor.value !== "function" ||
        originalDescriptor.configurable !== true
      ) {
        return draw();
      }

      const originalObjectKeys = originalDescriptor.value as CapturedGameCall;
      const candidates = new Map<
        Record<string, unknown>,
        CapturedNativeTechRegistrySnapshot
      >();
      let candidateChanged = false;
      const scopedObjectKeys: CapturedGameCall = function (
        this: unknown,
        ...args: unknown[]
      ): unknown {
        const keys = Reflect.apply(originalObjectKeys, this, args);
        let candidate: CapturedNativeTechRegistrySnapshot | undefined;
        try {
          candidate = readNativeTechRegistrySnapshot(args[0], keys, true);
        } catch {
          // An unrelated proxy must not change the result of the game's Object.keys call.
          return keys;
        }
        if (candidate !== undefined) {
          const previous = candidates.get(candidate.registry);
          if (previous === undefined) {
            candidates.set(candidate.registry, candidate);
          } else if (!sameNativeTechRegistrySnapshot(previous, candidate)) {
            candidateChanged = true;
          }
        }
        return keys;
      };

      try {
        Reflect.apply(
          objectDefineProperty as CapturedGameCall,
          objectConstructor,
          [
            objectConstructor,
            "keys",
            { ...originalDescriptor, value: scopedObjectKeys },
          ],
        );
      } catch {
        return draw();
      }

      let result: T;
      try {
        result = draw();
      } finally {
        Reflect.apply(
          objectDefineProperty as CapturedGameCall,
          objectConstructor,
          [objectConstructor, "keys", originalDescriptor],
        );
      }

      if (!candidateChanged && candidates.size === 1) {
        const candidate = candidates.values().next().value;
        if (candidate !== undefined) {
          try {
            const finalKeys = Reflect.apply(
              originalObjectKeys,
              objectConstructor,
              [candidate.registry],
            );
            const finalSnapshot = readNativeTechRegistrySnapshot(
              candidate.registry,
              finalKeys,
            );
            if (
              finalSnapshot !== undefined &&
              sameNativeTechRegistrySnapshot(candidate, finalSnapshot)
            ) {
              capturedTechRegistry = candidate;
              capturedTechRegistryObjectKeys = originalObjectKeys;
            }
          } catch {
            /* A registry that changed during the draw has no retained authority. */
          }
        }
      }
      return result;
    },
    readTechDefinitions(): readonly CapturedTechDefinition[] | undefined {
      return readRetainedNativeTechRegistry()?.publicDefinitions;
    },
    adjustPower(
      root: unknown,
      entryKey: string,
      expectedStateOn: number,
      targetStateOn: number,
      isCurrent: () => boolean = () => true,
      preflightOnly = false,
      expectedStructure?: CapturedGameStructureDefinition,
    ): CapturedGameRead<boolean> {
      const entries = structureEntries;
      const entry =
        entries === undefined
          ? undefined
          : readMechanicsEntry(entryKey, entries.get(entryKey));
      if (
        stopped ||
        entry === undefined ||
        (expectedStructure !== undefined &&
          (expectedStructure.entryKey !== entry.entryKey ||
            expectedStructure.region !== entry.region ||
            expectedStructure.sector !== entry.sector ||
            expectedStructure.struct !== entry.struct ||
            expectedStructure.actionId !== entry.actionId ||
            !expectedStructure.matchesCurrentIdentity())) ||
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
      if (
        !isCurrent() ||
        (expectedStructure !== undefined &&
          !expectedStructure.matchesCurrentIdentity())
      )
        return { kind: "invalid" };
      if (preflightOnly) return { kind: "value", value: true };
      // actions.js setAction's power_on/off: one unit per iteration, game on_cap,
      // then deferred postPower. An explicit target avoids keyboard multiplier overshoot.
      const direction = targetStateOn > expectedStateOn ? 1 : -1;
      try {
        for (let on = expectedStateOn; on !== targetStateOn; on += direction) {
          if (
            !isCurrent() ||
            (expectedStructure !== undefined &&
              !expectedStructure.matchesCurrentIdentity()) ||
            readMechanicsProperty(state, "on") !== on
          )
            return { kind: "invalid" };
          state["on"] = on + direction;
          if (
            !isCurrent() ||
            (expectedStructure !== undefined &&
              !expectedStructure.matchesCurrentIdentity()) ||
            readMechanicsProperty(state, "on") !== on + direction
          )
            return { kind: "invalid" };
        }
        if (postPower !== undefined && targetStateOn !== expectedStateOn)
          powerCallbackQueue!.set([entry.action, "postPower"], [direction > 0]);
        if (
          !isCurrent() ||
          (expectedStructure !== undefined &&
            !expectedStructure.matchesCurrentIdentity())
        )
          return { kind: "invalid" };
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
        let anchorResolver: CapturedSupportAnchorResolver = () => ({
          kind: "value",
          value: null,
        });
        const result: CapturedGameStructureDefinition[] = [];
        for (const [key, value] of entries) {
          const entry = readMechanicsEntry(key, value);
          if (entry !== undefined)
            result.push(
              createMechanicsDefinition(entry, entries, value, (...args) =>
                anchorResolver(...args),
              ),
            );
        }
        const byRegion = new Map<
          string,
          Map<string, CapturedGameStructureDefinition | null>
        >();
        for (const definition of result) {
          let byStruct = byRegion.get(definition.region);
          if (byStruct === undefined) {
            byStruct = new Map();
            byRegion.set(definition.region, byStruct);
          }
          if (byStruct.has(definition.struct))
            byStruct.set(definition.struct, null);
          else byStruct.set(definition.struct, definition);
        }
        anchorResolver = (region, struct) => {
          const byStruct = byRegion.get(region);
          if (byStruct === undefined || !byStruct.has(struct))
            return { kind: "value", value: null };
          const candidate = byStruct.get(struct);
          if (
            candidate === null ||
            candidate === undefined ||
            candidate.region !== region ||
            candidate.struct !== struct ||
            !candidate.matchesCurrentIdentity()
          )
            return { kind: "invalid" };
          return { kind: "value", value: candidate.entryKey };
        };
        return Object.freeze(result);
      } catch {
        return undefined;
      }
    },
    readStructureIdentities():
      readonly CapturedGameStructureIdentity[] | undefined {
      if (stopped || rootState?.isReactivitySuppressed() === true)
        return undefined;
      if (structureIdentitySnapshot !== undefined)
        return structureIdentitySnapshot;
      const entries = structureEntries;
      if (entries === undefined || !isCaptureComplete()) return undefined;
      try {
        const result: CapturedGameStructureIdentity[] = [];
        for (const [key, value] of entries) {
          const entry = readMechanicsEntry(key, value);
          if (entry === undefined) continue;
          result.push(
            Object.freeze({
              entryKey: entry.entryKey,
              region: entry.region,
              sector: entry.sector,
              struct: entry.struct,
              actionId: entry.actionId,
            }),
          );
        }
        structureIdentitySnapshot = Object.freeze(result);
        return structureIdentitySnapshot;
      } catch {
        return undefined;
      }
    },
    readPowerOrder(
      root: unknown,
      structuresByEntryKey?: ReadonlyMap<
        string,
        CapturedGameStructureDefinition
      >,
    ): CapturedGameRead<readonly CapturedGameStructureDefinition[]> {
      const entries = structureEntries;
      if (entries === undefined || stopped) return { kind: "invalid" };
      const order = readMechanicsProperty(root, "power");
      return order === undefined
        ? { kind: "absent" }
        : resolveCapturedStructureOrder(entries, order, structuresByEntryKey);
    },
    readSupportOrder(
      root: unknown,
      type: string,
      structuresByEntryKey?: ReadonlyMap<
        string,
        CapturedGameStructureDefinition
      >,
    ): CapturedGameRead<readonly CapturedGameStructureDefinition[]> {
      const entries = structureEntries;
      if (entries === undefined || stopped) return { kind: "invalid" };
      const support = readMechanicsProperty(root, "support");
      if (support === undefined) return { kind: "absent" };
      const order = readMechanicsProperty(support, type);
      return order === undefined
        ? { kind: "absent" }
        : resolveCapturedStructureOrder(entries, order, structuresByEntryKey);
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
    readEffectiveSupportCount(
      root: unknown,
      entryKey: string,
    ): CapturedGameRead<number> {
      if (rootState !== undefined) {
        try {
          if (rootState.readRoot() !== root) return { kind: "invalid" };
        } catch {
          return { kind: "invalid" };
        }
      }
      if (
        stopped ||
        nativeSupportOn === undefined ||
        structureEntries === undefined
      )
        return { kind: "invalid" };
      const entry = structureEntries.get(entryKey);
      const parsed = readMechanicsEntry(entryKey, entry);
      if (parsed === undefined) return { kind: "invalid" };
      const support = readMechanicsPrimitive(parsed.action, "support");
      // Only a consumer is clamped into support_on; a provider's contribution is its p_on count.
      if (support.kind !== "value" || support.value >= 0)
        return { kind: "invalid" };
      if (!isSupportOnAuthority(nativeSupportOn, supportConsumerNames))
        return { kind: "invalid" };
      const state = readMechanicsProperty(
        readMechanicsProperty(root, parsed.region),
        parsed.struct,
      );
      const configured = readMechanicsProperty(state, "on");
      const effective = readMechanicsDataProperty(
        nativeSupportOn,
        parsed.struct,
      );
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
    readEffectLocalizedNumericInputs(
      entryKey: string,
      localizationKey: string,
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
        const template = readEffectTemplate(localizationKey);
        if (template === undefined || template === localizationKey)
          return { kind: "invalid" };
        const observed = probeScopedLocalizedNumbers(
          pageWindow,
          template,
          () => {
            if (typeof Reflect.apply(effect, entry.action, []) !== "string")
              throw new TypeError("native effect did not return text");
          },
        );
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
      capturedTechRegistry = undefined;
      capturedTechRegistryObjectKeys = undefined;
      unsubscribeFirstPeriod?.();
      unsubscribeFirstPeriod = undefined;
      restoreMapSet();
      restorePowerCallbackHooks();
      restorePowerOnProbe();
      restoreSupportOnProbe();
      restoreConsumeSetter();
    },
  });
}
