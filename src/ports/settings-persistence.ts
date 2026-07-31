/** Writes the current stored settings back to storage after a player edit. */
export interface SettingsPersistence {
  save(): void;
}
