/** Immutable description of the Planet Weighting settings table. */
export interface PlanetSettingsCell {
  readonly label: string;
  readonly settingName: string;
}

export interface PlanetSettingsRow {
  readonly biome?: PlanetSettingsCell;
  readonly trait?: PlanetSettingsCell;
  readonly extra?: PlanetSettingsCell;
}

export interface PlanetSettingsReadModel {
  readonly sectionId: "planet";
  readonly sectionName: "Planet Weighting";
  readonly rows: readonly PlanetSettingsRow[];
}

export interface PlanetSettingsReadModelInput {
  readonly biomes: readonly PlanetSettingsCell[];
  readonly traits: readonly PlanetSettingsCell[];
  readonly extras: readonly PlanetSettingsCell[];
}

export type PlanetSettingsIntent = Readonly<{
  type: "reset-planet-settings";
}>;

function freezeCell(cell: PlanetSettingsCell): PlanetSettingsCell {
  return Object.freeze({ ...cell });
}

function freezeCells(
  cells: readonly PlanetSettingsCell[],
): readonly PlanetSettingsCell[] {
  return Object.freeze(cells.map(freezeCell));
}

/** Build aligned table rows from the three independently sized setting lists. */
export function createPlanetSettingsReadModel({
  biomes,
  traits,
  extras,
}: PlanetSettingsReadModelInput): PlanetSettingsReadModel {
  const frozenBiomes = freezeCells(biomes);
  const frozenTraits = freezeCells(traits);
  const frozenExtras = freezeCells(extras);
  const rowCount = Math.max(
    frozenBiomes.length,
    frozenTraits.length,
    frozenExtras.length,
  );
  const rows: PlanetSettingsRow[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    rows.push(
      Object.freeze({
        ...(frozenBiomes[index] === undefined
          ? {}
          : { biome: frozenBiomes[index] }),
        ...(frozenTraits[index] === undefined
          ? {}
          : { trait: frozenTraits[index] }),
        ...(frozenExtras[index] === undefined
          ? {}
          : { extra: frozenExtras[index] }),
      }),
    );
  }

  return Object.freeze({
    sectionId: "planet",
    sectionName: "Planet Weighting",
    rows: Object.freeze(rows),
  });
}
