/**
 * Pure equivalents of the legacy `autoQuarry` / `autoMine` / `autoExtractor`
 * ratio decisions. Each returns the production-ratio delta to apply (or null /
 * empty when the industry is not initialised). The composition root calls
 * `increaseProduction`; these functions perform no reads or mutations.
 */

const MAX = Number.MAX_SAFE_INTEGER;

/** Legacy `resource.isDemanded() ? MAX : 100 - storageRatio * 100`. */
function fullnessWeight(demanded: boolean, storageRatio: number): number {
  return demanded ? MAX : 100 - storageRatio * 100;
}

export interface QuarryRatioInput {
  readonly initialised: boolean;
  readonly currentRatio: number;
  readonly chrysotileDemanded: boolean;
  readonly chrysotileStorageRatio: number;
  readonly stoneDemanded: boolean;
  readonly stoneStorageRatio: number;
  readonly hasMetalRefinery: boolean;
  readonly aluminiumDemanded: boolean;
  readonly aluminiumStorageRatio: number;
  readonly chrysotileWeight: number;
}

export function planQuarryRatio(
  input: Readonly<QuarryRatioInput>,
): number | null {
  if (!input.initialised) {
    return null;
  }
  let chrysotileWeigth = fullnessWeight(
    input.chrysotileDemanded,
    input.chrysotileStorageRatio,
  );
  let stoneWeigth = fullnessWeight(
    input.stoneDemanded,
    input.stoneStorageRatio,
  );
  if (input.hasMetalRefinery) {
    stoneWeigth = Math.max(
      stoneWeigth,
      fullnessWeight(input.aluminiumDemanded, input.aluminiumStorageRatio),
    );
  }
  chrysotileWeigth *= input.chrysotileWeight;
  const newRatio = Math.round(
    (chrysotileWeigth / (chrysotileWeigth + stoneWeigth)) * 100,
  );
  return newRatio - input.currentRatio;
}

export interface MineRatioInput {
  readonly initialised: boolean;
  readonly currentRatio: number;
  readonly adamantiteDemanded: boolean;
  readonly adamantiteStorageRatio: number;
  readonly aluminiumDemanded: boolean;
  readonly aluminiumStorageRatio: number;
  readonly adamantiteWeight: number;
}

export function planMineRatio(input: Readonly<MineRatioInput>): number | null {
  if (!input.initialised) {
    return null;
  }
  let adamantiteWeigth = fullnessWeight(
    input.adamantiteDemanded,
    input.adamantiteStorageRatio,
  );
  const aluminiumWeight = fullnessWeight(
    input.aluminiumDemanded,
    input.aluminiumStorageRatio,
  );
  adamantiteWeigth *= input.adamantiteWeight;
  const newRatio = Math.round(
    (adamantiteWeigth / (adamantiteWeigth + aluminiumWeight)) * 100,
  );
  return newRatio - input.currentRatio;
}

export interface ExtractorProductionInput {
  readonly id: string;
  readonly res1Demanded: boolean;
  readonly res1StorageRatio: number;
  readonly res2Demanded: boolean;
  readonly res2StorageRatio: number;
  readonly weight: number;
  readonly currentRatio: number;
}

export interface ExtractorRatioInput {
  readonly initialised: boolean;
  readonly productions: readonly ExtractorProductionInput[];
}

export interface ExtractorRatioAdjustment {
  readonly id: string;
  readonly delta: number;
}

export function planExtractorRatios(
  input: Readonly<ExtractorRatioInput>,
): readonly ExtractorRatioAdjustment[] {
  if (!input.initialised) {
    return Object.freeze([]);
  }
  return Object.freeze(
    input.productions.map((prod) => {
      const res1Weight = fullnessWeight(
        prod.res1Demanded,
        prod.res1StorageRatio,
      );
      const res2Weight =
        fullnessWeight(prod.res2Demanded, prod.res2StorageRatio) * prod.weight;
      const newRatio = Math.round(
        (res2Weight / (res1Weight + res2Weight)) * 100,
      );
      return Object.freeze({
        id: prod.id,
        delta: newRatio - prod.currentRatio,
      });
    }),
  );
}
