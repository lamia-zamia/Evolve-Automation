export interface QueuedSettingsMutation {
  readonly enabled: boolean;
  readonly repeat: boolean;
  readonly settingsRaw: Record<string, unknown>;
  readonly evolutionQueue: Record<string, unknown>[];
  readonly onTypeMismatch: (
    settingName: string,
    currentValue: unknown,
    queuedValue: unknown,
  ) => void;
}

/**
 * Applies one queued settings record. Callers own persistence and the other derived-settings
 * effects their runtime can actually provide.
 */
export function applyQueuedSettings({
  enabled,
  repeat,
  settingsRaw,
  evolutionQueue,
  onTypeMismatch,
}: QueuedSettingsMutation): boolean {
  if (!enabled || evolutionQueue.length === 0) return false;
  const queuedEvolution = evolutionQueue.shift();
  if (queuedEvolution === undefined) return false;
  for (const [settingName, settingValue] of Object.entries(queuedEvolution)) {
    if (typeof settingsRaw[settingName] === typeof settingValue) {
      settingsRaw[settingName] = settingValue;
    } else {
      onTypeMismatch(settingName, settingsRaw[settingName], settingValue);
    }
  }
  if (repeat) evolutionQueue.push(queuedEvolution);
  return true;
}
