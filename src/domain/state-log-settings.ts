/**
 * Immutable description of the State Log settings panel. Browser code renders this
 * read model; application code owns the reset intent it can emit.
 */
export interface StateLogSettingsControl {
  readonly kind: "toggle" | "number";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface StateLogSettingsReadModel {
  readonly sectionId: "stateLog";
  readonly sectionName: "State Log";
  readonly controls: readonly StateLogSettingsControl[];
}

export type StateLogSettingsIntent = Readonly<{
  type: "reset-state-log-settings";
}>;

const stateLogSettingsReadModel: StateLogSettingsReadModel = Object.freeze({
  sectionId: "stateLog",
  sectionName: "State Log",
  controls: Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "stateLogEnabled",
      label: "Record state log",
      hint: "Record compact bottleneck-focused snapshots of game state over the run into localStorage (key ea_state_log), for offline analysis. Retrieve via window.eaExportStateLog() in the console.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "stateLogAutoDownload",
      label: "Auto-download log on reset",
      hint: "When a reset (prestige) commits, automatically download the recorded state log as a JSON file.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "stateLogInterval",
      label: "Sample every N ticks",
      hint: "How often to record a state snapshot, counted in processed script ticks. A full run stays well under the 20000-sample cap at the default.",
    }),
  ]),
});

export function getStateLogSettingsReadModel(): StateLogSettingsReadModel {
  return stateLogSettingsReadModel;
}
