/** Retired Building semantics over one captured catalog sample; no discovery or effects. */
import type { CapturedGameStructureDefinition } from "../../../../ports/captured-game-mechanics.ts";
import type { CapturedBuildingEntry } from "./captured-building-catalog.ts";
import { readProperty } from "../../../validation.ts";
import {
  readCapturedGrantAction,
  readCapturedGrantActionCount,
} from "./captured-grant-action.ts";

export interface CapturedBuildingState {
  readonly catalog: Readonly<CapturedBuildingEntry>;
  readonly structure: CapturedGameStructureDefinition | undefined;
  readonly available: boolean;
  readonly count: number;
  readonly hasState: boolean;
  readonly stateOn: number;
  readonly stateOff: number;
  readonly powered: number;
}

function capturedBuildingStateNumber(value: unknown): number | undefined {
  // Building fields are lazily absent; the retired wrapper coerced absence to zero.
  if (value === undefined || value === null) return 0;
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  } catch {
    return undefined;
  }
}

/** `Action.checkPowerRequirements`, shared by capability and numeric power reads. */
export function readCapturedBuildingPowerRequirements(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): boolean | undefined {
  const requirements = structure.readPowerRequirements();
  if (requirements.kind === "invalid") return undefined;
  if (requirements.kind === "absent") return true;
  const tech = readProperty(root, "tech");
  for (const requirement of requirements.value) {
    const rank = capturedBuildingStateNumber(
      readProperty(tech, requirement.techId),
    );
    if (rank === undefined) return undefined;
    if (!rank || rank < requirement.level) return false;
  }
  return true;
}

export function readCapturedBuildingPowered(
  root: unknown,
  structure: CapturedGameStructureDefinition,
  requirements = readCapturedBuildingPowerRequirements(root, structure),
): number | undefined {
  if (requirements === undefined) return undefined;
  if (!requirements || !structure.ownsPowered) return 0;
  const powered = structure.readPowered();
  return powered.kind === "value" ? powered.value : undefined;
}

export function readCapturedBuildingState(
  root: unknown,
  catalog: Readonly<CapturedBuildingEntry>,
  structure: CapturedGameStructureDefinition | undefined,
  available: boolean,
): Readonly<CapturedBuildingState> | undefined {
  const grant = readCapturedGrantAction(catalog.binding);
  const shellCount =
    grant !== undefined || !available
      ? 0
      : capturedBuildingStateNumber(readProperty(catalog.state, "count"));
  if (shellCount === undefined) return undefined;
  const count =
    grant !== undefined
      ? readCapturedGrantActionCount(root, grant)
      : !available
        ? 0
        : catalog.binding === "city-banquet" && shellCount
          ? capturedBuildingStateNumber(readProperty(catalog.state, "level"))
          : shellCount;
  if (count === undefined) return undefined;
  if (!available || structure === undefined)
    return Object.freeze({
      catalog,
      structure,
      available,
      count,
      hasState: false,
      stateOn: 0,
      stateOff: 0,
      powered: 0,
    });
  const requirements = readCapturedBuildingPowerRequirements(root, structure);
  const highTech = capturedBuildingStateNumber(
    readProperty(readProperty(root, "tech"), "high_tech"),
  );
  if (requirements === undefined || highTech === undefined) return undefined;
  const poweredCapability =
    structure.ownsPowered && highTech >= 2 && requirements;
  const switchable =
    available && !poweredCapability
      ? structure.readSwitchable()
      : { kind: "absent" as const };
  if (switchable.kind === "invalid") return undefined;
  const hasState =
    available &&
    (poweredCapability || (switchable.kind === "value" && switchable.value));
  const on =
    hasState && count >= 1
      ? capturedBuildingStateNumber(readProperty(catalog.state, "on"))
      : 0;
  const powered = readCapturedBuildingPowered(root, structure, requirements);
  if (on === undefined || powered === undefined) return undefined;
  // Missions use completion for Building count, but the retired state-off getter still used
  // the shell count. Banquet likewise has one shell despite its larger level count.
  const stateShellCount =
    grant !== undefined && hasState && count >= 1
      ? capturedBuildingStateNumber(readProperty(catalog.state, "count"))
      : shellCount;
  if (stateShellCount === undefined) return undefined;
  return Object.freeze({
    catalog,
    structure,
    available,
    count,
    hasState,
    stateOn: on,
    stateOff: hasState && count >= 1 ? stateShellCount - on : 0,
    powered,
  });
}
