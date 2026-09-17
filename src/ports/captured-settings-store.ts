/** Writable raw settings owned by the captured runtime's storage adapter. */
export interface CapturedSettingsStore {
  /** The live record. Mutating it is how the settings UI writes. */
  readRaw(): Record<string, unknown>;
  /** Replaces the whole record, as an imported settings file does. */
  replaceRaw(next: Record<string, unknown>): void;
  /** Persists the current raw record. */
  persist(): void;
}
