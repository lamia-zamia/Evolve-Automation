export type QueuedSettingsCommand =
  | Readonly<{ kind: "consume-first" }>
  | Readonly<{
      kind: "write-setting";
      settingName: string;
      value: unknown;
    }>
  | Readonly<{
      kind: "type-mismatch";
      settingName: string;
      currentValue: unknown;
      queuedValue: unknown;
    }>
  | Readonly<{ kind: "repeat-first" }>;

export interface QueuedSettingsPlan {
  readonly commands: readonly QueuedSettingsCommand[];
}

/** Plans applying the first queued Evolution settings row without changing its inputs. */
export function planQueuedSettings({
  enabled,
  repeat,
  settingsRaw,
  queuedSettings,
  hasQueuedSettings,
}: {
  readonly enabled: boolean;
  readonly repeat: boolean;
  readonly settingsRaw: Readonly<Record<string, unknown>>;
  readonly queuedSettings: Readonly<Record<string, unknown>>;
  readonly hasQueuedSettings: boolean;
}): QueuedSettingsPlan | undefined {
  if (!enabled || !hasQueuedSettings) return undefined;
  const commands: QueuedSettingsCommand[] = [{ kind: "consume-first" }];
  for (const [settingName, queuedValue] of Object.entries(queuedSettings)) {
    const storedSettingValue = settingsRaw[settingName];
    if (typeof storedSettingValue === typeof queuedValue) {
      commands.push({ kind: "write-setting", settingName, value: queuedValue });
    } else {
      commands.push({
        kind: "type-mismatch",
        settingName,
        currentValue: storedSettingValue,
        queuedValue,
      });
    }
  }
  if (repeat) commands.push({ kind: "repeat-first" });
  return { commands };
}
