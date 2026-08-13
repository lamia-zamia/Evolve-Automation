import type { EvolutionLogEvent } from "../../domain/progression/evolution/evolution-result.ts";
import { decideEvolutionResult } from "../../domain/progression/evolution/evolution-result.ts";
import { readEvolutionResultInput } from "./progression/evolution/evolution-result.ts";

interface EvolutionSettings {
  readonly masterScriptToggle: boolean;
  readonly evolutionQueueEnabled: boolean;
  readonly evolutionQueueRepeat: boolean;
}

interface EvolutionState {
  evoCheckNeeded: boolean;
  goal: string;
}

interface EvolutionSettingsRaw {
  readonly evolutionQueue: unknown[];
  readonly evolutionQueueRepeat: boolean;
}

interface ResetButton {
  innerText: string;
  disabled: boolean;
  click(): void;
}

interface EvolutionGameLog {
  logDanger(category: string, message: string, tags: string[]): void;
  logWarning(category: string, message: string, tags: string[]): void;
  logInfo(category: string, message: string, tags: string[]): void;
}

interface EvolutionLogMessage {
  readonly level: "danger" | "warning" | "info";
  readonly message: string;
  readonly tags: readonly string[];
}

interface EvolutionResultTestActions {
  readonly addEvolutionSetting?: () => void;
  readonly updateSettingsFromState?: () => void;
}

interface EvolutionResultCheckDependencies {
  readonly getSettings: () => EvolutionSettings;
  readonly getSettingsRaw: () => EvolutionSettingsRaw;
  readonly getState: () => EvolutionState;
  readonly getGame: () => unknown;
  readonly getRaces: () => unknown;
  readonly getTraitManager: () => unknown;
  readonly getGameLog: () => EvolutionGameLog;
  readonly getResetButton: () => ResetButton;
  readonly localize: (key: string) => string;
  readonly formatLog: (
    event: Readonly<EvolutionLogEvent>,
    localize: (key: string) => string,
  ) => EvolutionLogMessage;
  readonly addEvolutionSetting: () => void;
  readonly updateSettingsFromState: () => void;
  readonly getTestActions: () => EvolutionResultTestActions | undefined;
}

export interface EvolutionResultCheck {
  checkEvolutionResult(): boolean;
}

export function createEvolutionResultCheck({
  getSettings,
  getSettingsRaw,
  getState,
  getGame,
  getRaces,
  getTraitManager,
  getGameLog,
  getResetButton,
  localize,
  formatLog,
  addEvolutionSetting,
  updateSettingsFromState,
  getTestActions,
}: EvolutionResultCheckDependencies): EvolutionResultCheck {
  function checkEvolutionResult(): boolean {
    const settings = getSettings();
    const state = getState();
    if (!settings.masterScriptToggle || !state.evoCheckNeeded) {
      return true;
    }
    state.evoCheckNeeded = false;

    const read = readEvolutionResultInput(
      settings,
      getGame(),
      getRaces(),
      getTraitManager(),
    );
    if (read.status !== "ready") {
      // Malformed evolution data: continue the tick without a risky soft reset.
      return true;
    }
    const decision = decideEvolutionResult(read.input);
    const gameLog = getGameLog();
    for (const event of decision.logs) {
      const { level, message, tags } = formatLog(event, localize);
      if (level === "danger") {
        gameLog.logDanger("special", message, [...tags]);
      } else if (level === "warning") {
        gameLog.logWarning("special", message, [...tags]);
      } else {
        gameLog.logInfo("special", message, [...tags]);
      }
    }

    if (decision.needReset) {
      const resetButton = getResetButton();
      if (resetButton.innerText === localize("reset_soft")) {
        const actions = getTestActions();
        const addEvolutionSettingFn =
          actions?.addEvolutionSetting ?? addEvolutionSetting;
        const updateSettingsFromStateFn =
          actions?.updateSettingsFromState ?? updateSettingsFromState;
        const settingsRaw = getSettingsRaw();
        if (
          settings.evolutionQueueEnabled &&
          settingsRaw.evolutionQueue.length > 0
        ) {
          if (!settings.evolutionQueueRepeat) {
            addEvolutionSettingFn();
          }
          settingsRaw.evolutionQueue.unshift(settingsRaw.evolutionQueue.pop());
        }
        updateSettingsFromStateFn();

        state.goal = "GameOverMan";
        resetButton.disabled = false;
        resetButton.click();
        return false;
      }
    }
    return true;
  }

  return { checkEvolutionResult };
}
