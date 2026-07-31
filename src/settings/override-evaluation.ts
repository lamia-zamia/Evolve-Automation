import {
  describeOverrideFailure,
  resolveOverrides,
  type OverrideConditionEvaluator,
  type OverrideConditionFailure,
} from "../domain/override-resolution.ts";

interface CheckType {
  fn: (arg: unknown) => unknown;
}

interface WindowManagerContract {
  isOpen: () => boolean;
}

interface GameLogContract {
  logDanger: (kind: string, message: string, categories: string[]) => void;
}

/** The one game read this module makes: the messages already on screen, used to avoid log spam. */
interface RecentMessagesContract {
  global: { lastMsg: { all: Record<string, { m?: unknown }> } };
}

interface OverrideEvaluationDependencies {
  getSafeMode: () => boolean;
  getSettings: () => Record<string, unknown>;
  getSettingsRaw: () => Record<string, unknown>;
  getCheckTypes: () => Record<string, CheckType>;
  getCheckCompare: () => Record<string, (a: unknown, b: unknown) => boolean>;
  getCheckCustom: () => Record<string, unknown>;
  getHaveTask: () => (task: string) => boolean;
  getWindowManager: () => WindowManagerContract;
  getGame: () => RecentMessagesContract;
  getGameLog: () => GameLogContract;
  getJQuery: () => (selector: string) => { length: number };
  changeDisplayInputNode: (node: unknown) => void;
}

export function createOverrideEvaluation({
  getSafeMode,
  getSettings,
  getSettingsRaw,
  getCheckTypes,
  getCheckCompare,
  getCheckCustom,
  getHaveTask,
  getWindowManager,
  getGame,
  getGameLog,
  getJQuery,
  changeDisplayInputNode,
}: OverrideEvaluationDependencies) {
  function sampleEvaluator(): OverrideConditionEvaluator {
    const checkTypes = getCheckTypes();
    const checkCompare = getCheckCompare();
    const checkCustom = getCheckCustom();
    return {
      hasOperandType: (operandType) => Boolean(checkTypes[operandType]),
      readOperand: (operandType, argument) => {
        const checkType = checkTypes[operandType];
        if (!checkType) {
          throw new Error(`${operandType} variable not found`);
        }
        return checkType.fn(argument);
      },
      hasComparator: (comparator) => Boolean(checkCompare[comparator]),
      compare: (comparator, left, right) => {
        const compare = checkCompare[comparator];
        if (!compare) {
          throw new Error(`${comparator} comparator not found`);
        }
        return compare(left, right);
      },
      comparatorReturnsRightOperand: (comparator) =>
        Boolean(checkCustom[comparator]),
    };
  }

  function reportFailures(failures: readonly OverrideConditionFailure[]): void {
    if (failures.length === 0 || getWindowManager().isOpen()) {
      return;
    }
    const gameLog = getGameLog();
    // Every message names its setting and condition number, so one pass cannot repeat itself; only
    // messages left over from an earlier pass need suppressing.
    const shown = Object.values(getGame().global.lastMsg.all);
    for (const failure of failures) {
      const message = describeOverrideFailure(failure);
      if (!shown.some((entry) => entry.m === message)) {
        gameLog.logDanger("special", message, ["events", "major_events"]);
      }
    }
  }

  function refreshVisibleOverrideValue(): void {
    const currentNode = getJQuery()("#script_override_true_value:visible");
    if (currentNode.length !== 0) {
      changeDisplayInputNode(currentNode);
    }
  }

  function updateOverrides() {
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();

    // Safe mode doesn't update overrides and always disables script toggle
    if (getSafeMode()) {
      Object.assign(settings, settingsRaw);
      settings.masterScriptToggle = false;
      return;
    }

    const haveTask = getHaveTask();
    const resolution = resolveOverrides({
      settingsRaw,
      evaluator: sampleEvaluator(),
      activeTasks: {
        storageTaskActive: haveTask("bal_storage") || haveTask("combo_storage"),
        trashTaskActive: haveTask("trash"),
        taxTaskActive: haveTask("tax"),
      },
    });

    Object.assign(settings, settingsRaw, resolution.values);
    for (const [key, list] of Object.entries(resolution.lists)) {
      settings[key] = list;
    }

    reportFailures(resolution.failures);
    refreshVisibleOverrideValue();
  }

  return { updateOverrides };
}
