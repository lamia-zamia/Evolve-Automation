/** Captured power-warning shutdown over the game's rendered warning markers. */

import type { PowerWarnBuildingInput } from "../../../../domain/economy/production/power.ts";
import { planPowerWarningShutdown } from "../../../../domain/economy/production/power.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

interface WarningElement {
  readonly parentElement?: { readonly id?: unknown } | null;
}

interface WarningDocument {
  querySelectorAll(selector: string): ArrayLike<WarningElement>;
}

export interface CapturedPowerWarningDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
}

interface WarningSession {
  readonly root: unknown;
  readonly elementId: string;
  readonly region: string;
  readonly binding: string;
  readonly stateOn: number;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function warningDocument(value: unknown): WarningDocument | undefined {
  if (!isRecord(value) || typeof value["querySelectorAll"] !== "function") {
    return undefined;
  }
  return value as unknown as WarningDocument;
}

function elementParts(
  elementId: string,
): { readonly region: string; readonly binding: string } | undefined {
  const separator = elementId.indexOf("-");
  if (separator <= 0 || separator === elementId.length - 1) return undefined;
  return Object.freeze({
    region: elementId.slice(0, separator),
    binding: elementId.slice(separator + 1),
  });
}

function highPopulationScale(root: unknown): number | undefined {
  const value = readProperty(readProperty(root, "race"), "high_pop");
  if (value === undefined || value === false) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  switch (value) {
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

function readWarning(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  elementId: string,
): Readonly<PowerWarnBuildingInput> | undefined {
  const parts = elementParts(elementId);
  if (parts === undefined) return undefined;
  const structure = readProperty(
    readProperty(root, parts.region),
    parts.binding,
  );
  if (!isRecord(structure)) return undefined;
  const stateOn = finite(structure["on"]);
  const count = finite(structure["count"]);
  if (
    stateOn === undefined ||
    count === undefined ||
    stateOn < 0 ||
    count < 0 ||
    stateOn > count
  ) {
    return undefined;
  }

  const belt = ["elerium_ship", "iridium_ship", "iron_ship"].includes(
    parts.binding,
  );
  const lake = ["bireme", "transport"].includes(parts.binding);
  const tau = ["whaling_ship", "mining_ship"].includes(parts.binding);
  const warningKind = belt
    ? parts.binding === "elerium_ship"
      ? "belt-elerium"
      : parts.binding === "iridium_ship"
        ? "belt-iridium"
        : "belt-iron"
    : lake
      ? parts.binding === "bireme"
        ? "lake-bireme"
        : "lake-transport"
      : tau
        ? parts.binding === "whaling_ship"
          ? "tau-whaling"
          : "tau-mining"
        : "ordinary";
  const resources = readProperty(root, "resource");
  const support = readProperty(resources, "Belt_Support");
  const lakeSupport = readProperty(resources, "Lake_Support");
  const beltScale = highPopulationScale(root);
  const beltSupportNeeded =
    beltScale === undefined
      ? 0
      : (finite(
          readProperty(
            readProperty(readProperty(root, "space"), "elerium_ship"),
            "on",
          ),
        ) ?? 0) *
          2 *
          beltScale +
        (finite(
          readProperty(
            readProperty(readProperty(root, "space"), "iridium_ship"),
            "on",
          ),
        ) ?? 0) *
          beltScale +
        (finite(
          readProperty(
            readProperty(readProperty(root, "space"), "iron_ship"),
            "on",
          ),
        ) ?? 0) *
          beltScale;
  const lakeSupportNeeded =
    (finite(
      readProperty(readProperty(readProperty(root, "portal"), "bireme"), "on"),
    ) ?? 0) +
    (finite(
      readProperty(
        readProperty(readProperty(root, "portal"), "transport"),
        "on",
      ),
    ) ?? 0);
  const autoStateValue = settings[`bld_s_${parts.binding}`];
  return Object.freeze({
    domId: elementId,
    buildingId: elementId,
    binding: parts.binding,
    stateOn,
    autoStateEnabled: autoStateValue === undefined || autoStateValue === true,
    ship: belt || tau,
    warningKind,
    beltSupportNeeded,
    beltSupportMaximum: finite(readProperty(support, "max")) ?? 0,
    lakeSupportNeeded,
    lakeSupportMaximum: finite(readProperty(lakeSupport, "max")) ?? 0,
  });
}

function readWarnings(
  root: unknown,
  settingsValue: unknown,
  documentValue: unknown,
): readonly Readonly<PowerWarnBuildingInput>[] {
  const document = warningDocument(documentValue);
  if (document === undefined || root === undefined) return Object.freeze([]);
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const warnings: Readonly<PowerWarnBuildingInput>[] = [];
  for (const element of Array.from(document.querySelectorAll("span.on.warn"))) {
    const elementId = element?.parentElement?.id;
    if (typeof elementId !== "string" || elementId.length === 0) continue;
    const warning = readWarning(root, settings, elementId);
    if (warning !== undefined) warnings.push(warning);
  }
  return Object.freeze(warnings);
}

function currentStateOn(root: unknown, elementId: string): number | undefined {
  const parts = elementParts(elementId);
  if (parts === undefined) return undefined;
  return finite(
    readProperty(
      readProperty(readProperty(root, parts.region), parts.binding),
      "on",
    ),
  );
}

export function createCapturedPowerWarningAutomation({
  rootState,
  controls,
  getDocument,
  readSettings,
}: CapturedPowerWarningDependencies): {
  readonly run: () => CommandExecutionOutcome;
} {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const root = rootState.readRoot();
      const decision = planPowerWarningShutdown(
        readWarnings(root, readSettings(), getDocument()),
      );
      if (decision === null) return SUCCEEDED;
      const handle = controls.resolve(decision.domId);
      if (handle === undefined || !handle.methods.includes("power_off")) {
        return rejected(
          "captured-power-warning-control-missing",
          `no captured power-off control for ${decision.domId}`,
        );
      }
      const session: WarningSession = Object.freeze({
        root,
        elementId: decision.domId,
        region: elementParts(decision.domId)?.region ?? "",
        binding: decision.binding,
        stateOn: decision.expectedStateOn,
      });
      if (
        rootState.readRoot() !== session.root ||
        currentStateOn(session.root, session.elementId) !== session.stateOn
      ) {
        return stale(
          "captured-power-warning-state-changed",
          "captured warned building changed",
        );
      }
      const result = controls.invoke(handle, "power_off");
      if (!result.ok) {
        return rejected(
          "captured-power-warning-control-failed",
          result.detail ?? result.reason,
        );
      }
      return SUCCEEDED;
    },
  });
}
