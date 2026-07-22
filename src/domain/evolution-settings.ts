/** Immutable read model for Evolution targets and the evolution queue. */
export interface EvolutionSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}
export type EvolutionSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly EvolutionSettingsOption[];
    }>;
export interface EvolutionQueueItem {
  readonly index: number;
  readonly raceLabel: string;
  readonly raceClass: string;
  readonly prestigeLabel: string;
  readonly prestigeClass: string;
  readonly starLevel: number;
  readonly json: string;
}
export interface EvolutionSettingsReadModel {
  readonly sectionId: "evolution";
  readonly sectionName: "Evolution";
  readonly controls: readonly EvolutionSettingsControl[];
  readonly prestigeOptions: readonly EvolutionSettingsOption[];
  readonly queue: readonly EvolutionQueueItem[];
  readonly raceWarning:
    Readonly<{ className: string; text: string }> | undefined;
}
export type EvolutionSettingsIntent =
  | Readonly<{ type: "reset-evolution-settings" }>
  | Readonly<{ type: "set-evolution-target"; value: string }>
  | Readonly<{ type: "add-evolution"; prestigeType: string }>
  | Readonly<{ type: "remove-evolution"; index: number }>
  | Readonly<{ type: "edit-evolution"; index: number; json: string }>
  | Readonly<{ type: "reorder-evolutions"; indexes: readonly number[] }>;
export function createEvolutionSettingsReadModel(input: {
  readonly controls: readonly EvolutionSettingsControl[];
  readonly prestigeOptions: readonly EvolutionSettingsOption[];
  readonly queue: readonly EvolutionQueueItem[];
  readonly raceWarning?:
    Readonly<{ className: string; text: string }> | undefined;
}): EvolutionSettingsReadModel {
  const freezeOptions = (options: readonly EvolutionSettingsOption[]) =>
    Object.freeze(options.map((option) => Object.freeze({ ...option })));
  return Object.freeze({
    sectionId: "evolution",
    sectionName: "Evolution",
    controls: Object.freeze(
      input.controls.map((control) =>
        Object.freeze(
          "options" in control
            ? { ...control, options: freezeOptions(control.options) }
            : { ...control },
        ),
      ),
    ),
    prestigeOptions: freezeOptions(input.prestigeOptions),
    queue: Object.freeze(input.queue.map((item) => Object.freeze({ ...item }))),
    raceWarning:
      input.raceWarning === undefined
        ? undefined
        : Object.freeze({ ...input.raceWarning }),
  });
}
