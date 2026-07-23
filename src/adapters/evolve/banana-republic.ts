import type {
  BananaObjectiveId,
  BananaRepublicGuardInput,
  BananaRepublicProgress,
  BananaSmoothieInput,
} from "../../domain/civic/banana-republic.ts";
import {
  BANANA_OBJECTIVE_IDS,
  isBananaObjectiveId,
} from "../../domain/civic/banana-republic.ts";

type BananaRepublicUnavailableReason =
  | "inaccessible-data"
  | "invalid-achievement"
  | "invalid-game-state"
  | "invalid-settings"
  | "invalid-trade"
  | "invalid-universe";

type Unavailable = {
  readonly status: "unavailable";
  readonly reason: BananaRepublicUnavailableReason;
  readonly field?: string;
};

export type BananaObjectiveReadResult =
  { readonly status: "ready"; readonly complete: boolean } | Unavailable;

export type BananaSmoothieReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<BananaSmoothieInput>;
    }
  | Unavailable;

export type BananaProgressReadResult =
  | {
      readonly status: "ready";
      readonly progress: Readonly<BananaRepublicProgress>;
    }
  | Unavailable;

export type BananaGuardReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<BananaRepublicGuardInput>;
    }
  | { readonly status: "inactive" }
  | (Unavailable & { readonly fallbackActive: boolean });

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unavailable(
  reason: BananaRepublicUnavailableReason,
  field?: string,
): Unavailable {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function guardUnavailable(
  reason: BananaRepublicUnavailableReason,
  fallbackActive: boolean,
  field?: string,
): BananaGuardReadResult {
  return Object.freeze({ ...unavailable(reason, field), fallbackActive });
}

function readGlobal(
  rawGame: unknown,
): Record<PropertyKey, unknown> | undefined {
  if (!isRecord(rawGame)) return undefined;
  const global = rawGame["global"];
  return isRecord(global) ? global : undefined;
}

function readStats(rawGame: unknown): Record<PropertyKey, unknown> | undefined {
  const global = readGlobal(rawGame);
  const stats = global?.["stats"];
  return isRecord(stats) ? stats : undefined;
}

function copyUnavailable(result: Unavailable): Unavailable {
  return unavailable(result.reason, result.field);
}

export function readBananaRepublicObjective(
  rawGame: unknown,
  rawPoly: unknown,
  requestedObjective: string,
): BananaObjectiveReadResult {
  if (!isBananaObjectiveId(requestedObjective)) {
    return unavailable("invalid-achievement", requestedObjective);
  }
  try {
    const stats = readStats(rawGame);
    if (!stats) return unavailable("invalid-game-state");
    if (!isRecord(rawPoly)) return unavailable("invalid-universe");
    const universeAffix = rawPoly["universeAffix"];
    if (typeof universeAffix !== "function") {
      return unavailable("invalid-universe");
    }
    const universe = universeAffix.call(rawPoly);
    if (typeof universe !== "string") return unavailable("invalid-universe");

    const rawBanana = stats["banana"];
    if (!isRecord(rawBanana)) {
      return unavailable("invalid-achievement", "stats.banana");
    }
    const rawObjective = rawBanana[requestedObjective];
    if (!isRecord(rawObjective)) {
      return unavailable(
        "invalid-achievement",
        `stats.banana.${requestedObjective}`,
      );
    }
    const complete = rawObjective[universe];
    return typeof complete === "boolean"
      ? Object.freeze({ status: "ready", complete })
      : unavailable(
          "invalid-achievement",
          `stats.banana.${requestedObjective}.${universe}`,
        );
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readBananaRepublicSmoothieInput(
  rawGame: unknown,
): BananaSmoothieReadResult {
  try {
    const global = readGlobal(rawGame);
    const stats = readStats(rawGame);
    if (!global || !stats) return unavailable("invalid-game-state");

    let featStar = 0;
    const rawFeats = stats["feat"];
    if (rawFeats !== undefined) {
      if (!isRecord(rawFeats)) {
        return unavailable("invalid-achievement", "stats.feat");
      }
      const rawStar = rawFeats["banana"];
      if (rawStar !== undefined && rawStar !== null) {
        if (!finiteNonNegative(rawStar)) {
          return unavailable("invalid-achievement", "stats.feat.banana");
        }
        featStar = rawStar;
      }
    }

    const rawResources = global["resource"];
    if (!isRecord(rawResources)) return unavailable("invalid-game-state");
    const tradeRoutes: number[] = [];
    for (const [id, rawResource] of Object.entries(rawResources)) {
      if (!isRecord(rawResource)) {
        return unavailable("invalid-game-state", `resource.${id}`);
      }
      if (!Object.hasOwn(rawResource, "trade")) continue;
      const trade = rawResource["trade"];
      if (typeof trade !== "number" || !Number.isFinite(trade)) {
        return unavailable("invalid-trade", `resource.${id}.trade`);
      }
      tradeRoutes.push(trade);
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        featStar,
        tradeRoutes: Object.freeze(tradeRoutes),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readBananaRepublicProgress(
  rawGame: unknown,
  rawPoly: unknown,
): BananaProgressReadResult {
  const objectives = {} as Record<BananaObjectiveId, boolean>;
  for (const objective of BANANA_OBJECTIVE_IDS) {
    const result = readBananaRepublicObjective(rawGame, rawPoly, objective);
    if (result.status !== "ready") return copyUnavailable(result);
    objectives[objective] = result.complete;
  }
  const smoothie = readBananaRepublicSmoothieInput(rawGame);
  if (smoothie.status !== "ready") return copyUnavailable(smoothie);
  return Object.freeze({
    status: "ready",
    progress: Object.freeze({
      objectives: Object.freeze(objectives),
      smoothie: smoothie.input,
    }),
  });
}

export function readBananaRepublicGuardInput(
  rawSettings: unknown,
  rawGame: unknown,
  rawPoly: unknown,
): BananaGuardReadResult {
  const fallbackConfigured =
    !isRecord(rawSettings) ||
    (rawSettings["achievementGuards"] !== false &&
      rawSettings["guardBananaRepublic"] !== false);
  try {
    if (!isRecord(rawSettings)) {
      return guardUnavailable("invalid-settings", fallbackConfigured);
    }
    const master = rawSettings["achievementGuards"];
    const selected = rawSettings["guardBananaRepublic"];
    if (master === false || selected === false) {
      return Object.freeze({ status: "inactive" });
    }
    if (typeof master !== "boolean" || typeof selected !== "boolean") {
      return guardUnavailable("invalid-settings", fallbackConfigured);
    }

    const global = readGlobal(rawGame);
    const race = global?.["race"];
    const bananaRace = isRecord(race) ? race["banana"] : undefined;
    if (bananaRace === false || bananaRace === undefined) {
      return Object.freeze({ status: "inactive" });
    }
    if (bananaRace !== true) {
      return guardUnavailable("invalid-game-state", true, "race.banana");
    }

    const progress = readBananaRepublicProgress(rawGame, rawPoly);
    if (progress.status !== "ready") {
      return guardUnavailable(progress.reason, true, progress.field);
    }
    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        enabled: true,
        bananaRace: true,
        progress: progress.progress,
      }),
    });
  } catch {
    return guardUnavailable("inaccessible-data", fallbackConfigured);
  }
}
