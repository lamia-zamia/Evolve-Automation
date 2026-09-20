/**
 * Captured replacement for the script's queue load used immediately before cataclysm. It mutates
 * only the browser-owned settings record and leaves compatibility-only override/state managers out
 * of the captured runtime. The queue mutation itself is shared with the compatibility helper.
 */

import type { CapturedSettingsStore } from "../../../../ports/captured-settings-store.ts";
import { isNonArrayRecord } from "../../../validation.ts";
import { applyQueuedSettings } from "../../../../utils/queued-settings.ts";

export interface CapturedQueuedSettingsDependencies {
  readonly settings: CapturedSettingsStore;
  /** Rebuilds the script settings section when the game-facing panel is enabled. */
  readonly refreshSettings?: () => void;
  readonly onWarning?: (message: string) => void;
}

export interface CapturedQueuedSettings {
  readonly loadQueuedSettings: () => void;
  /** Re-queues the just-applied row at the front after a failed result-check reset. */
  readonly restoreEvolutionAfterResult: () => void;
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
        settingsRaw["evolutionQueueEnabled"] !== true ||
        evolutionQueue === undefined ||
        queuedEvolution === undefined ||
        !isNonArrayRecord(queuedEvolution)
      ) {
        return;
      }

      const applied = applyQueuedSettings({
        enabled: true,
        repeat: settingsRaw["evolutionQueueRepeat"] === true,
        settingsRaw,
        evolutionQueue: evolutionQueue as Record<string, unknown>[],
        onTypeMismatch: (settingName, currentValue, queuedValue) => {
          onWarning(
            `Type mismatch during loading queued settings: settingsRaw.${settingName} type: ${typeof currentValue}, value: ${currentValue}; queuedEvolution.${settingName} type: ${typeof queuedValue}, value: ${queuedValue};`,
          );
        },
      });
      if (!applied) return;
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
      if (settingsRaw["evolutionQueueRepeat"] !== true) {
        rawQueue.push({ ...lastAppliedEvolution });
      }
      const current = rawQueue.pop();
      if (current !== undefined) rawQueue.unshift(current);
      settings.persist();
    },
    readEvolutionAttempts: () => evolutionAttempts,
  });
}
