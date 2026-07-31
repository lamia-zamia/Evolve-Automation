/**
 * Pure resolution of the user's setting overrides.
 *
 * Reading a condition's operands is a live game read, so it arrives as a narrow capability. Every
 * decision is made here: which condition wins for a setting, how a list setting toggles, which
 * settings an active game task forces off, how the tick rate is normalized, and why a condition was
 * rejected. Rejections are returned as data; rendering and log-spam suppression belong to the caller.
 */

/** One stored override condition, after its shape has been checked. */
export interface OverrideCondition {
  readonly type1: string;
  readonly arg1: unknown;
  readonly type2: string;
  readonly arg2: unknown;
  readonly comparator: string;
  readonly result: unknown;
}

/** Why one condition could not produce an override value. */
export type OverrideFailureReason =
  | Readonly<{ kind: "malformed-condition" }>
  | Readonly<{ kind: "unknown-operand-type"; operandType: string }>
  | Readonly<{ kind: "unknown-comparator"; comparator: string }>
  | Readonly<{ kind: "type-mismatch"; expected: string; actual: string }>
  | Readonly<{ kind: "evaluation-error"; detail: string }>;

export interface OverrideConditionFailure {
  readonly settingKey: string;
  /** 1-based position of the condition in the setting's condition list, as the editor shows it. */
  readonly conditionNumber: number;
  readonly reason: OverrideFailureReason;
}

/** The live reads an override condition needs, named by the question rather than by the catalog shape. */
export interface OverrideConditionEvaluator {
  hasOperandType(operandType: string): boolean;
  readOperand(operandType: string, argument: unknown): unknown;
  hasComparator(comparator: string): boolean;
  compare(comparator: string, left: unknown, right: unknown): boolean;
  /** True for comparators that yield the right operand instead of the condition's stored result. */
  comparatorReturnsRightOperand(comparator: string): boolean;
}

/** Game tasks that take a setting away from the script while they run. */
export interface ForcedTaskState {
  readonly storageTaskActive: boolean;
  readonly trashTaskActive: boolean;
  readonly taxTaskActive: boolean;
}

export interface OverrideResolutionInput {
  readonly settingsRaw: Readonly<Record<string, unknown>>;
  readonly evaluator: OverrideConditionEvaluator;
  readonly activeTasks: ForcedTaskState;
}

export interface OverrideResolution {
  /** Scalar setting values that replace their raw counterpart. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Final list values for list settings, already toggled against the raw list. */
  readonly lists: Readonly<Record<string, readonly unknown[]>>;
  readonly failures: readonly OverrideConditionFailure[];
}

type ConditionOutcome =
  | Readonly<{ kind: "match"; value: unknown }>
  | Readonly<{ kind: "no-match" }>
  | Readonly<{ kind: "failure"; reason: OverrideFailureReason }>;

function isKeyedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads one stored condition. Returns `undefined` when the stored value cannot describe a condition. */
export function parseOverrideCondition(
  value: unknown,
): OverrideCondition | undefined {
  if (!isKeyedObject(value)) {
    return undefined;
  }
  const { type1, type2, cmp } = value;
  if (
    typeof type1 !== "string" ||
    typeof type2 !== "string" ||
    typeof cmp !== "string"
  ) {
    return undefined;
  }
  return {
    type1,
    arg1: value.arg1,
    type2,
    arg2: value.arg2,
    comparator: cmp,
    result: value.ret,
  };
}

function evaluateCondition(
  stored: unknown,
  evaluator: OverrideConditionEvaluator,
): ConditionOutcome {
  const condition = parseOverrideCondition(stored);
  if (condition === undefined) {
    return { kind: "failure", reason: { kind: "malformed-condition" } };
  }
  for (const operandType of [condition.type1, condition.type2]) {
    if (!evaluator.hasOperandType(operandType)) {
      return {
        kind: "failure",
        reason: { kind: "unknown-operand-type", operandType },
      };
    }
  }
  if (!evaluator.hasComparator(condition.comparator)) {
    return {
      kind: "failure",
      reason: { kind: "unknown-comparator", comparator: condition.comparator },
    };
  }
  try {
    const left = evaluator.readOperand(condition.type1, condition.arg1);
    const right = evaluator.readOperand(condition.type2, condition.arg2);
    if (!evaluator.compare(condition.comparator, left, right)) {
      return { kind: "no-match" };
    }
    return {
      kind: "match",
      value: evaluator.comparatorReturnsRightOperand(condition.comparator)
        ? right
        : condition.result,
    };
  } catch (error) {
    return {
      kind: "failure",
      reason: { kind: "evaluation-error", detail: String(error) },
    };
  }
}

function readStoredConditions(
  storedOverrides: unknown,
): readonly (readonly [string, readonly unknown[]])[] {
  if (!isKeyedObject(storedOverrides)) {
    return [];
  }
  const entries: [string, readonly unknown[]][] = [];
  for (const [settingKey, conditions] of Object.entries(storedOverrides)) {
    if (Array.isArray(conditions)) {
      entries.push([settingKey, conditions as readonly unknown[]]);
    }
  }
  return entries;
}

/**
 * The tick rate the game accepts: rounded to a half tick and capped at 240. The lower bound is half a
 * tick, because the raw value is rounded and floored in doubled units before being halved.
 */
export function normalizeTickRate(rawTickRate: unknown): number {
  return Math.min(240, Math.max(1, Math.round(Number(rawTickRate) * 2)) / 2);
}

/** Settings the script must not act on while the game itself is running the matching task. */
export function overridesForcedByActiveTasks(
  activeTasks: ForcedTaskState,
): Readonly<Record<string, false>> {
  const forced: Record<string, false> = {};
  if (activeTasks.storageTaskActive) {
    forced.autoStorage = false;
  }
  if (activeTasks.trashTaskActive) {
    forced.autoEject = false;
  }
  if (activeTasks.taxTaskActive) {
    forced.autoTax = false;
  }
  return forced;
}

/** Renders one failure as the line the player sees. */
export function describeOverrideFailure(
  failure: OverrideConditionFailure,
): string {
  return `Condition ${failure.conditionNumber} for setting ${failure.settingKey} invalid! Fix or remove it. (${describeFailureReason(failure.reason)})`;
}

function describeFailureReason(reason: OverrideFailureReason): string {
  switch (reason.kind) {
    case "malformed-condition":
      return "condition is not a valid override condition";
    case "unknown-operand-type":
      return `${reason.operandType} variable not found`;
    case "unknown-comparator":
      return `${reason.comparator} comparator not found`;
    case "type-mismatch":
      return `Expected type: ${reason.expected}; Override type: ${reason.actual}`;
    case "evaluation-error":
      return reason.detail;
  }
}

export function resolveOverrides({
  settingsRaw,
  evaluator,
  activeTasks,
}: OverrideResolutionInput): OverrideResolution {
  const values: Record<string, unknown> = {};
  const listToggles = new Map<string, unknown[]>();
  const failures: OverrideConditionFailure[] = [];

  for (const [settingKey, conditions] of readStoredConditions(
    settingsRaw.overrides,
  )) {
    const base = settingsRaw[settingKey];
    for (let index = 0; index < conditions.length; index++) {
      const outcome = evaluateCondition(conditions[index], evaluator);
      if (outcome.kind === "no-match") {
        continue;
      }
      if (outcome.kind === "failure") {
        failures.push({
          settingKey,
          conditionNumber: index + 1,
          reason: outcome.reason,
        });
        continue;
      }
      if (typeof base === typeof outcome.value) {
        values[settingKey] = outcome.value;
        break;
      }
      if (Array.isArray(base)) {
        const toggles = listToggles.get(settingKey) ?? [];
        toggles.push(outcome.value);
        listToggles.set(settingKey, toggles);
        continue;
      }
      failures.push({
        settingKey,
        conditionNumber: index + 1,
        reason: {
          kind: "type-mismatch",
          expected: typeof base,
          actual: typeof outcome.value,
        },
      });
    }
  }

  Object.assign(values, overridesForcedByActiveTasks(activeTasks));
  values.tickRate = normalizeTickRate(values.tickRate ?? settingsRaw.tickRate);

  const lists: Record<string, readonly unknown[]> = {};
  for (const [settingKey, toggles] of listToggles) {
    const base = settingsRaw[settingKey];
    if (!Array.isArray(base)) {
      continue;
    }
    const next: unknown[] = base.slice();
    for (const item of toggles) {
      const index = next.indexOf(item);
      if (index > -1) {
        next.splice(index, 1);
      } else {
        next.push(item);
      }
    }
    lists[settingKey] = next;
  }

  return { values, lists, failures };
}
