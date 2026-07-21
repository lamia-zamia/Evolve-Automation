export interface StateLogStore {
  /** Load the persisted state-log record. Returns `null` when nothing is stored. */
  load(): unknown;
  /** Persist the state-log record. */
  save(record: unknown): void;
}
