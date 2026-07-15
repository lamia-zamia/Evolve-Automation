/* eslint-disable @typescript-eslint/no-explicit-any */
interface CheckType {
  fn: (arg: unknown) => unknown;
}

interface WindowManagerContract {
  isOpen: () => boolean;
}

interface GameLogContract {
  logDanger: (kind: string, message: string, categories: string[]) => void;
}

interface OverrideEvaluationDependencies {
  getSafeMode: () => boolean;
  getSettings: () => Record<string, any>;
  getSettingsRaw: () => Record<string, any>;
  getCheckTypes: () => Record<string, CheckType>;
  getCheckCompare: () => Record<string, (a: unknown, b: unknown) => boolean>;
  getCheckCustom: () => Record<string, unknown>;
  getHaveTask: () => (task: string) => boolean;
  getWindowManager: () => WindowManagerContract;
  getGame: () => any;
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
  function updateOverrides() {
    const safeMode = getSafeMode();
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();
    const checkTypes = getCheckTypes();
    const checkCompare = getCheckCompare();
    const checkCustom = getCheckCustom();
    const haveTask = getHaveTask();
    const WindowManager = getWindowManager();
    const game = getGame();
    const GameLog = getGameLog();
    const $ = getJQuery();

    // Safe mode doesn't update overrides and always disables script toggle
    if (safeMode) {
      Object.assign(settings, settingsRaw);
      settings.masterScriptToggle = false;
      return;
    }

    let xorLists = {};
    let overrides = {};
    for (let key in settingsRaw.overrides) {
      let conditions = settingsRaw.overrides[key];
      for (let i = 0; i < conditions.length; i++) {
        let check = conditions[i];
        try {
          if (!checkTypes[check.type1]) {
            throw `${check.type1} variable not found`;
          }
          if (!checkTypes[check.type2]) {
            throw `${check.type2} variable not found`;
          }
          if (!checkCompare[check.cmp]) {
            throw `${checkCompare[check.cmp]} comparator not found`;
          }
          let var1 = checkTypes[check.type1].fn(check.arg1);
          let var2 = checkTypes[check.type2].fn(check.arg2);
          if (!checkCompare[check.cmp](var1, var2)) {
            continue;
          }
          let ret = checkCustom[check.cmp] ? var2 : check.ret;

          if (typeof settingsRaw[key] === typeof ret) {
            // Override single value
            overrides[key] = ret;
            break;
          } else if (typeof settingsRaw[key] === "object") {
            // Xor lists
            xorLists[key] = xorLists[key] ?? [];
            xorLists[key].push(ret);
          } else {
            throw `Expected type: ${typeof settingsRaw[
              key
            ]}; Override type: ${typeof ret}`;
          }
        } catch (error) {
          let msg = `Condition ${
            i + 1
          } for setting ${key} invalid! Fix or remove it. (${error})`;
          if (
            !WindowManager.isOpen() &&
            !Object.values(game.global.lastMsg.all).find(
              (log: any) => log.m === msg,
            )
          ) {
            // Don't spam with errors
            GameLog.logDanger("special", msg, ["events", "major_events"]);
          }
          continue; // Some argument not valid, skip condition
        }
      }
    }

    if (haveTask("bal_storage") || haveTask("combo_storage")) {
      overrides["autoStorage"] = false;
    }
    if (haveTask("trash")) {
      overrides["autoEject"] = false;
    }
    if (haveTask("tax")) {
      overrides["autoTax"] = false;
    }
    let rawTickRate = overrides["tickRate"] ?? settingsRaw["tickRate"];
    overrides["tickRate"] = Math.min(
      240,
      Math.max(1, Math.round(rawTickRate * 2)) / 2,
    );

    // Apply overrides
    Object.assign(settings, settingsRaw, overrides);

    // Xor lists
    for (let key in xorLists) {
      settings[key] = settingsRaw[key].slice();
      for (let item of xorLists[key]) {
        let index = settings[key].indexOf(item);
        if (index > -1) {
          settings[key].splice(index, 1);
        } else {
          settings[key].push(item);
        }
      }
    }

    let currentNode = $(`#script_override_true_value:visible`);
    if (currentNode.length !== 0) {
      changeDisplayInputNode(currentNode);
    }
  }

  return { updateOverrides };
}
