export interface SettingsReader<TSettings> {
  readSettings(): Readonly<TSettings>;
}
