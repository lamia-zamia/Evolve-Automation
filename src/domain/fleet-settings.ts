/** Immutable description of the Fleet settings panel. */
export interface FleetSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type FleetSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "number" | "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly FleetSettingsOption[];
    }>;

export interface FleetSettingsRegion {
  readonly id: string;
  readonly label: string;
  readonly settingName?: string;
}

export interface FleetSettingsReadModel {
  readonly sectionId: "fleet";
  readonly sectionName: "Fleet";
  readonly outerControls: readonly FleetSettingsControl[];
  readonly outerComponents: Readonly<
    Record<string, readonly FleetSettingsOption[]>
  >;
  readonly outerRegions: readonly FleetSettingsRegion[];
  readonly andromedaControls: readonly FleetSettingsControl[];
  readonly andromedaRegions: readonly FleetSettingsRegion[];
}

export type FleetSettingsIntent =
  | Readonly<{ type: "reset-fleet-settings"; secondaryPrefix: string }>
  | Readonly<{
      type: "reorder-andromeda-regions";
      secondaryPrefix: string;
      regionIds: readonly string[];
    }>;

function freezeOption(option: FleetSettingsOption): FleetSettingsOption {
  return Object.freeze({ ...option });
}

function freezeControls(
  controls: readonly FleetSettingsControl[],
): readonly FleetSettingsControl[] {
  return Object.freeze(
    controls.map((control) =>
      Object.freeze(
        "options" in control
          ? {
              ...control,
              options: Object.freeze(control.options.map(freezeOption)),
            }
          : { ...control },
      ),
    ),
  );
}

function freezeRegions(
  regions: readonly FleetSettingsRegion[],
): readonly FleetSettingsRegion[] {
  return Object.freeze(regions.map((region) => Object.freeze({ ...region })));
}

export function createFleetSettingsReadModel(input: {
  readonly outerControls: readonly FleetSettingsControl[];
  readonly outerComponents: Readonly<
    Record<string, readonly FleetSettingsOption[]>
  >;
  readonly outerRegions: readonly FleetSettingsRegion[];
  readonly andromedaControls: readonly FleetSettingsControl[];
  readonly andromedaRegions: readonly FleetSettingsRegion[];
}): FleetSettingsReadModel {
  const components: Record<string, readonly FleetSettingsOption[]> = {};
  for (const [key, options] of Object.entries(input.outerComponents)) {
    components[key] = Object.freeze(options.map(freezeOption));
  }
  return Object.freeze({
    sectionId: "fleet",
    sectionName: "Fleet",
    outerControls: freezeControls(input.outerControls),
    outerComponents: Object.freeze(components),
    outerRegions: freezeRegions(input.outerRegions),
    andromedaControls: freezeControls(input.andromedaControls),
    andromedaRegions: freezeRegions(input.andromedaRegions),
  });
}
