/**
 * Captured replacement for the script's queue load used immediately before cataclysm. The adapter
 * applies the pure Evolution policy's commands and owns persistence, warnings and UI refresh.
 */

import type { CapturedSettingsStore } from "../../../../ports/captured-settings-store.ts";
import { isNonArrayRecord } from "../../../validation.ts";
import { planQueuedSettings } from "../../../../domain/progression/evolution/queued-settings.ts";

export interface CapturedQueuedSettingsDependencies {
  readonly settings: CapturedSettingsStore;
  /** Rebuilds the script settings section when the game-facing panel is enabled. */
  readonly refreshSettings?: () => void;
  readonly onWarning?: (message: string) => void;
}

export interface CapturedQueuedSettings {
  readonly loadQueuedSettings: () => void;
  /** Re-queues the just-applied row and returns a rollback for an uncommitted reset. */
  readonly restoreEvolutionAfterResult: () =>
    { readonly rollback: () => void } | undefined;
  /** The page-session counter consumed by the future captured evolution reader. */
  readonly readEvolutionAttempts: () => number;
}

export function createCapturedQueuedSettings({
  settings,
  refreshSettings,
  onWarning = () => {},
}: CapturedQueuedSettingsDependencies): CapturedQueuedSettings {
  let evolutionAttempts = 0;
  let lastAppliedEvolution: Record<string, unknown> | undefined;

  return Object.freeze({
    loadQueuedSettings() {
      const settingsRaw = settings.readRaw();
      const rawQueue = settingsRaw["evolutionQueue"];
      const evolutionQueue = Array.isArray(rawQueue) ? rawQueue : undefined;
      const queuedEvolution = evolutionQueue?.[0];
      if (
        evolutionQueue === undefined ||
        queuedEvolution === undefined ||
        !isNonArrayRecord(queuedEvolution)
      ) {
        return;
      }

      const plan = planQueuedSettings({
        enabled: settingsRaw["evolutionQueueEnabled"] === true,
        repeat: settingsRaw["evolutionQueueRepeat"] === true,
        settingsRaw,
        queuedSettings: queuedEvolution,
        hasQueuedSettings: true,
      });
      if (plan === undefined) return;
      for (const command of plan.commands) {
        switch (command.kind) {
          case "consume-first":
            evolutionQueue.shift();
            break;
          case "write-setting":
            settingsRaw[command.settingName] = command.value;
            break;
          case "type-mismatch":
            onWarning(
              `Type mismatch during loading queued settings: settingsRaw.${command.settingName} type: ${typeof command.currentValue}, value: ${command.currentValue}; queuedEvolution.${command.settingName} type: ${typeof command.queuedValue}, value: ${command.queuedValue};`,
            );
            break;
          case "repeat-first":
            evolutionQueue.push(queuedEvolution);
            break;
        }
      }
      lastAppliedEvolution = { ...queuedEvolution };
      evolutionAttempts += 1;
      settings.persist();
      if (settingsRaw["showSettings"] === true) refreshSettings?.();
    },
    restoreEvolutionAfterResult() {
      const settingsRaw = settings.readRaw();
      if (settingsRaw["evolutionQueueEnabled"] !== true) return;
      const rawQueue = settingsRaw["evolutionQueue"];
      if (!Array.isArray(rawQueue) || lastAppliedEvolution === undefined)
        return;
      const originalQueue = [...rawQueue];
      if (settingsRaw["evolutionQueueRepeat"] !== true) {
        rawQueue.push({ ...lastAppliedEvolution });
      }
      const current = rawQueue.pop();
      if (current !== undefined) rawQueue.unshift(current);
      settings.persist();
      let rolledBack = false;
      return Object.freeze({
        rollback() {
          if (rolledBack || settings.readRaw()["evolutionQueue"] !== rawQueue)
            return;
          rolledBack = true;
          rawQueue.splice(0, rawQueue.length, ...originalQueue);
          settings.persist();
        },
      });
    },
    readEvolutionAttempts: () => evolutionAttempts,
  });
}
