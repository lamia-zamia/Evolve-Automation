export interface SettingsStore {
  /** Load the persisted settings record. Returns `{}` when nothing is stored. */
  load(): unknown;
  /** Persist the settings record. */
  save(record: unknown): void;
}
