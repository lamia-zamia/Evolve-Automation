import type { AuthorityPolicyView } from "../../domain/civic/authority.ts";

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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

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
    if (
      !isRecord(rawSettings) ||
      typeof rawSettings["authorityManage"] !== "boolean" ||
      !isFiniteNumber(rawSettings["generalMinimumAuthority"])
    ) {
      return unavailable("invalid-settings");
    }
    if (!isRecord(rawResources) || !isRecord(rawResources["Authority"])) {
      return unavailable("invalid-resource");
    }
    const authority = rawResources["Authority"];
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

    if (!isRecord(rawGame) || !isRecord(rawGame["global"])) {
      return unavailable("invalid-game-state");
    }
    const global = rawGame["global"];
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
        }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}
