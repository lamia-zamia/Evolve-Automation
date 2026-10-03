import type { AuthorityPolicyView } from "../../../domain/civic/authority.ts";
import { isFiniteNumber, isRecord } from "../../validation.ts";
import { readCapturedHighPopulationPercent } from "./captured-job-catalog.ts";

export type AuthorityUnavailableReason =
  | "inaccessible-data"
  | "invalid-game-state"
  | "invalid-input"
  | "invalid-resource"
  | "invalid-settings"
  | "invalid-trait-value";

export type AuthorityViewReadResult =
  | {
      readonly status: "ready";
      readonly view: Readonly<AuthorityPolicyView>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: AuthorityUnavailableReason;
    };

export type AuthorityQuantityReadResult =
  | { readonly status: "ready"; readonly value: number }
  | {
      readonly status: "unavailable";
      readonly reason: "invalid-input";
    };

function unavailable(
  reason: AuthorityUnavailableReason,
): AuthorityViewReadResult {
  return Object.freeze({ status: "unavailable", reason });
}

export function readAuthorityQuantity(
  rawQuantity: unknown,
): AuthorityQuantityReadResult {
  return isFiniteNumber(rawQuantity) && rawQuantity >= 0
    ? Object.freeze({ status: "ready", value: rawQuantity })
    : Object.freeze({ status: "unavailable", reason: "invalid-input" });
}

/** Samples and validates one immutable view for an Authority decision. */
export function readAuthorityPolicyView(
  rawGame: unknown,
  rawSettings: unknown,
  rawResources: unknown,
  readHighPopulationPercent: () => unknown,
): AuthorityViewReadResult {
  try {
    return buildValidatedAuthorityPolicyView(
      isRecord(rawGame) ? rawGame["global"] : undefined,
      rawSettings,
      isRecord(rawResources) ? rawResources["Authority"] : undefined,
      readHighPopulationPercent,
    );
  } catch {
    return unavailable("inaccessible-data");
  }
}

/** Maps the live root's quantities into the same contract as normalized resources. */
export function readCapturedAuthorityPolicyView(
  rawRoot: unknown,
  rawSettings: unknown,
): AuthorityViewReadResult {
  try {
    const resources = isRecord(rawRoot) ? rawRoot["resource"] : undefined;
    const authority = isRecord(resources) ? resources["Authority"] : undefined;
    return buildValidatedAuthorityPolicyView(
      rawRoot,
      rawSettings,
      isRecord(authority)
        ? {
            currentQuantity: authority["amount"],
            maxQuantity: authority["max"],
          }
        : undefined,
      () => readCapturedHighPopulationPercent(rawRoot),
    );
  } catch {
    return unavailable("inaccessible-data");
  }
}

function buildValidatedAuthorityPolicyView(
  rawRoot: unknown,
  rawSettings: unknown,
  rawAuthority: unknown,
  readHighPopulationPercent: () => unknown,
): AuthorityViewReadResult {
  try {
    if (
      !isRecord(rawSettings) ||
      typeof rawSettings["authorityManage"] !== "boolean" ||
      !isFiniteNumber(rawSettings["generalMinimumAuthority"])
    ) {
      return unavailable("invalid-settings");
    }
    if (!isRecord(rawAuthority)) {
      return unavailable("invalid-resource");
    }
    const authority = rawAuthority;
    const current = authority["currentQuantity"];
    const maximum = authority["maxQuantity"];
    if (
      !isFiniteNumber(current) ||
      current < 0 ||
      !isFiniteNumber(maximum) ||
      maximum < 0
    ) {
      return unavailable("invalid-resource");
    }

    if (!isRecord(rawRoot)) {
      return unavailable("invalid-game-state");
    }
    const global = rawRoot;
    if (
      !isRecord(global["tech"]) ||
      !isRecord(global["race"]) ||
      !isRecord(global["civic"])
    ) {
      return unavailable("invalid-game-state");
    }
    const civic = global["civic"];
    if (!isRecord(civic["govern"])) {
      return unavailable("invalid-game-state");
    }
    const governmentType = civic["govern"]["type"];
    if (typeof governmentType !== "string") {
      return unavailable("invalid-game-state");
    }
    const rawEvilTechLevel = global["tech"]["evil"];
    const evilTechLevel = rawEvilTechLevel ?? 0;
    if (!isFiniteNumber(evilTechLevel) || evilTechLevel < 0) {
      return unavailable("invalid-game-state");
    }
    const highPopulationPercent = readHighPopulationPercent();
    if (!isFiniteNumber(highPopulationPercent) || highPopulationPercent < 0) {
      return unavailable("invalid-trait-value");
    }
    const despotRank = global["race"]["despot"];
    // races.js syncGenes writes slot.r onto race.despot. Despot vars is [2*r];
    // geneVars halves it for a weak gene, so the bonded value bounds either case.
    // A lazily absent despot (or false/zero) is the game's no-gene state.
    if (
      despotRank !== undefined &&
      despotRank !== false &&
      (!isFiniteNumber(despotRank) || despotRank < 0)
    ) {
      return unavailable("invalid-trait-value");
    }
    const authorityLossMultiplier =
      typeof despotRank === "number" ? 1 + 0.02 * despotRank : 1;

    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        target: Object.freeze({
          manage: rawSettings["authorityManage"],
          configuredTarget: rawSettings["generalMinimumAuthority"],
          maximum,
        }),
        current,
        modifiers: Object.freeze({
          evilTechLevel,
          highPopulationPercent,
          grenadier: Boolean(global["race"]["grenadier"]),
          governmentType,
          authorityLossMultiplier,
        }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}
