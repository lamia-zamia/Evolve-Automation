/** Validated DeadSpace factory capacity shared by allocation and demand samples. */

import { isRecord, readProperty } from "../../../validation.ts";

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readRegionalFactoryOn(
  root: unknown,
  region: string,
  id: string,
): number | undefined {
  const owner = readProperty(root, region);
  if (owner === undefined) return 0;
  if (!isRecord(owner)) return undefined;
  const structure = readProperty(owner, id);
  if (structure === undefined) return 0;
  if (!isRecord(structure)) return undefined;
  const count = finiteNonNegative(structure["count"]);
  const on = finiteNonNegative(structure["on"]);
  if (
    count === undefined ||
    on === undefined ||
    !Number.isSafeInteger(count) ||
    !Number.isSafeInteger(on) ||
    on > count
  ) {
    return undefined;
  }
  return on;
}

function readHighPopulationScale(root: unknown): number | undefined {
  const rank = readProperty(readProperty(root, "race"), "high_pop");
  if (rank === undefined || rank === false) return 1;
  if (typeof rank !== "number" || !Number.isFinite(rank)) return undefined;
  switch (rank) {
    case 0.1:
    case 0.25:
      return 2;
    case 0.5:
      return 3;
    case 1:
      return 4;
    case 2:
      return 5;
    case 3:
      return 6;
    case 4:
      return 7;
    default:
      return undefined;
  }
}

function readRankedFactoryLines(
  root: unknown,
  region: string,
  id: string,
): number | undefined {
  const owner = readProperty(root, region);
  const structure = readProperty(owner, id);
  if (structure === undefined) return 0;
  if (!isRecord(structure)) return undefined;
  const rankValue = structure["rank"];
  const rank =
    rankValue === undefined || rankValue === null
      ? 1
      : finiteNonNegative(rankValue);
  return rank !== undefined && Number.isSafeInteger(rank) && rank >= 1
    ? 3 + rank
    : undefined;
}

export function readCapturedFactoryCapacity(root: unknown): number | undefined {
  const cityFactory = readProperty(readProperty(root, "city"), "factory");
  if (!isRecord(cityFactory)) return undefined;
  const cityOn = finiteNonNegative(cityFactory["on"]);
  if (cityOn === undefined || !Number.isSafeInteger(cityOn)) return undefined;
  const redOn = readRegionalFactoryOn(root, "space", "red_factory");
  const interstellarOn = readRegionalFactoryOn(
    root,
    "interstellar",
    "int_factory",
  );
  const portalOn = readRegionalFactoryOn(root, "portal", "hell_factory");
  const undergroundOn = readRegionalFactoryOn(
    root,
    "underground",
    "under_factory",
  );
  const surfaceOn = readRegionalFactoryOn(root, "surface", "crater_factory");
  const industrialOn = readRegionalFactoryOn(
    root,
    "space",
    "industrial_complex",
  );
  const tauOn = readRegionalFactoryOn(root, "tauceti", "tau_factory");
  const portalLines = readRankedFactoryLines(root, "portal", "hell_factory");
  const highPopulationScale = readHighPopulationScale(root);
  if (
    redOn === undefined ||
    interstellarOn === undefined ||
    portalOn === undefined ||
    undergroundOn === undefined ||
    surfaceOn === undefined ||
    industrialOn === undefined ||
    tauOn === undefined ||
    portalLines === undefined ||
    highPopulationScale === undefined
  ) {
    return undefined;
  }
  let craterLines = 0;
  if (surfaceOn > 0) {
    const craterWorker = readProperty(
      readProperty(readProperty(root, "civic"), "crater_worker"),
      "workers",
    );
    const workers = finiteNonNegative(craterWorker);
    if (workers === undefined) return undefined;
    craterLines = Math.floor((surfaceOn / 2) * (workers / highPopulationScale));
  }
  const isolation = Boolean(
    readProperty(readProperty(root, "tech"), "isolation"),
  );
  const maximum =
    cityOn +
    redOn +
    interstellarOn * 2 +
    portalOn * portalLines +
    undergroundOn * 2 +
    craterLines +
    industrialOn * 2 +
    tauOn * (isolation ? 5 : 3);
  return Number.isSafeInteger(maximum) && maximum >= 0 ? maximum : undefined;
}
