/**
 * Tax automation over the captured DeadSpace root and the game's own tax controls.
 *
 * The existing tax planner remains the policy. This adapter translates the live root into its
 * immutable snapshot and invokes only the captured `tax_rates` methods; it never writes a
 * predicted tax rate into the reactive game state.
 */

import {
  planTax,
  type TaxSettings,
  type TaxSnapshot,
} from "../../../domain/civic/tax.ts";
import type { AdjustTaxRateCommand } from "../../../domain/commands.ts";
import { createSnapshotMetadata } from "../../../domain/snapshot.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameReader } from "../../../ports/game-reader.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";
import { readCapturedMorale } from "./captured-morale.ts";

const TAX_CONTROL = "tax_rates";

const DEFAULT_SETTINGS: Readonly<TaxSettings> = Object.freeze({
  requestedRate: -1,
  minimumRate: 20,
  minimumMorale: 105,
  maximumMorale: 500,
  manageAuthority: false,
  authorityTarget: 100,
});

export interface CapturedTaxDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly nowMs: () => number;
}

export interface CapturedTaxAutomation {
  readonly reader: GameReader<TaxSnapshot>;
  readonly executor: DecisionExecutor<AdjustTaxRateCommand>;
  readonly runCycle: () => void;
}

interface TaxSession {
  readonly root: unknown;
}

function capturedTaxFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function capturedTaxBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rateForNoble(rank: unknown): readonly [number, number] | undefined {
  switch (rank) {
    case 0.1:
      return [18, 20];
    case 0.25:
      return [15, 20];
    case 0.5:
      return [12, 20];
    case 1:
      return [10, 20];
    case 2:
      return [10, 24];
    case 3:
      return [10, 28];
    case 4:
      return [10, 30];
    default:
      return undefined;
  }
}

function readGovernorBackground(root: unknown): string | undefined {
  return typeof readProperty(
    readProperty(readProperty(root, "race"), "governor"),
    "g",
  ) === "object"
    ? (() => {
        const governor = readProperty(readProperty(root, "race"), "governor");
        const active = readProperty(governor, "g");
        const background = readProperty(active, "bg");
        return typeof background === "string" ? background : undefined;
      })()
    : undefined;
}

export function readCapturedTaxLimits(
  root: unknown,
): readonly [number, number] {
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const genes = readProperty(root, "genes");
  const government = readProperty(readProperty(root, "civic"), "govern");
  const highTech = capturedTaxFinite(readProperty(tech, "high_tech"), 0);
  const extreme = capturedTaxFinite(readProperty(tech, "currency"), 0) >= 5;
  const terrifying = Boolean(readProperty(race, "terrifying"));
  const noble = rateForNoble(readProperty(race, "noble"));
  const minimum =
    (extreme || terrifying) && noble === undefined ? 0 : (noble?.[0] ?? 10);

  let maximum = 30;
  if (extreme || terrifying) maximum += 20;

  const background = readGovernorBackground(root);
  if (background === "noble") maximum += 20;
  const wishStats = readProperty(race, "wishStats");
  maximum += capturedTaxFinite(readProperty(wishStats, "tax"), 0);
  if (noble !== undefined) maximum = noble[1];

  if (readProperty(government, "type") === "oligarchy") {
    const organizer = background === "bureaucrat";
    let oligarchyCap = organizer
      ? 25
      : highTech >= 12
        ? 0
        : highTech >= 2
          ? 2
          : 5;
    if (capturedTaxFinite(readProperty(genes, "governor"), 0) >= 3) {
      oligarchyCap += organizer ? 10 : 5;
    }
    maximum += oligarchyCap;
  }
  return [minimum, maximum];
}

function readCapturedTaxSettings(value: unknown): TaxSettings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  return Object.freeze({
    requestedRate: capturedTaxFinite(
      value["generalRequestedTaxRate"],
      DEFAULT_SETTINGS.requestedRate,
    ),
    minimumRate: capturedTaxFinite(
      value["generalMinimumTaxRate"],
      DEFAULT_SETTINGS.minimumRate,
    ),
    minimumMorale: capturedTaxFinite(
      value["generalMinimumMorale"],
      DEFAULT_SETTINGS.minimumMorale,
    ),
    maximumMorale: capturedTaxFinite(
      value["generalMaximumMorale"],
      DEFAULT_SETTINGS.maximumMorale,
    ),
    manageAuthority: capturedTaxBoolean(
      value["authorityManage"],
      DEFAULT_SETTINGS.manageAuthority,
    ),
    authorityTarget: capturedTaxFinite(
      value["generalMinimumAuthority"],
      DEFAULT_SETTINGS.authorityTarget,
    ),
  });
}

function capturedTaxResource(
  root: unknown,
  id: string,
): Record<PropertyKey, unknown> | undefined {
  const value = readProperty(readProperty(root, "resource"), id);
  return isRecord(value) ? value : undefined;
}

function capturedTaxQuantity(value: unknown, key: string): number {
  return capturedTaxFinite(readProperty(value, key), 0);
}

function capturedTaxDemanded(
  money: Record<PropertyKey, unknown>,
  banana: boolean,
): boolean {
  if (banana) return false;
  const method = money["isDemanded"];
  return typeof method === "function"
    ? Boolean(Reflect.apply(method, money, []))
    : false;
}

function readCapturedTaxSnapshot(
  root: unknown,
  sequence: number,
  nowMs: number,
): TaxSnapshot {
  const metadata = createSnapshotMetadata({
    id: `captured-tax-${sequence}`,
    capturedAtMs: nowMs,
  });
  const civic = readProperty(root, "civic");
  const taxes = readProperty(civic, "taxes");
  const morale = readCapturedMorale(root);
  const money = capturedTaxResource(root, "Money");
  const authority = capturedTaxResource(root, "Authority");
  if (
    !isRecord(taxes) ||
    morale === undefined ||
    money === undefined ||
    authority === undefined
  ) {
    return Object.freeze({
      metadata,
      status: "unavailable",
      reason: "taxes-hidden",
    });
  }
  if (taxes["display"] !== true) {
    return Object.freeze({
      metadata,
      status: "unavailable",
      reason: "taxes-hidden",
    });
  }
  const race = readProperty(root, "race");
  const caps = readCapturedTaxLimits(root);
  const amount = capturedTaxQuantity(money, "amount");
  const maximum = capturedTaxQuantity(money, "max");
  return Object.freeze({
    metadata,
    status: "ready",
    tax: Object.freeze({
      currentRate: capturedTaxQuantity(taxes, "tax_rate"),
      minimumRate: caps[0],
      maximumRate: caps[1],
    }),
    morale: Object.freeze({
      current: morale.current,
      projected: morale.potential,
      maximum: morale.maximum,
    }),
    money: Object.freeze({
      storageRatio: maximum > 0 ? amount / maximum : 0,
      demanded: capturedTaxDemanded(
        money,
        Boolean(readProperty(race, "banana")),
      ),
    }),
    authority: Object.freeze({
      current: capturedTaxQuantity(authority, "amount"),
      maximum: capturedTaxQuantity(authority, "max"),
      unlocked: Boolean(authority["display"]),
    }),
    banana: Boolean(readProperty(race, "banana")),
  });
}

export function createCapturedTaxAutomation({
  rootState,
  controls,
  readSettings: readStoredSettings,
  nowMs,
}: CapturedTaxDependencies): CapturedTaxAutomation {
  let sequence = 0;
  let session: TaxSession | undefined;
  const reader: GameReader<TaxSnapshot> = Object.freeze({
    readSnapshot(): TaxSnapshot {
      const root = rootState.readRoot();
      sequence += 1;
      if (!isRecord(root)) {
        session = undefined;
        return readCapturedTaxSnapshot({}, sequence, nowMs());
      }
      const snapshot = readCapturedTaxSnapshot(root, sequence, nowMs());
      session =
        snapshot.status === "ready" ? Object.freeze({ root }) : undefined;
      return snapshot;
    },
  });

  const executor: DecisionExecutor<AdjustTaxRateCommand> = Object.freeze({
    execute(command: AdjustTaxRateCommand) {
      const active = session;
      if (active === undefined)
        return stale("tax-session-missing", "tax read session is missing");
      if (rootState.readRoot() !== active.root)
        return stale("tax-root-changed", "captured game root changed");
      const taxes = readProperty(readProperty(active.root, "civic"), "taxes");
      if (
        !isRecord(taxes) ||
        capturedTaxQuantity(taxes, "tax_rate") !== command.expectedRate
      ) {
        return stale("stale-tax-rate", "tax rate changed");
      }
      const handle = controls.resolve(TAX_CONTROL);
      if (handle === undefined)
        return rejected(
          "tax-control-missing",
          "no captured control for tax_rates",
        );
      for (const batch of command.batches) {
        for (const operation of batch.operations) {
          const method = operation.direction === "increase" ? "add" : "sub";
          for (let index = 0; index < operation.count; index += 1) {
            const result = controls.invoke(handle, method);
            if (!result.ok) {
              return result.reason === "stale-control"
                ? stale("tax-control-stale", result.detail ?? result.reason)
                : rejected(
                    "tax-adjustment-failed",
                    result.detail ?? result.reason,
                  );
            }
          }
        }
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({
    reader,
    executor,
    runCycle() {
      const snapshot = reader.readSnapshot();
      const commands = planTax(
        snapshot,
        readCapturedTaxSettings(readStoredSettings),
      );
      if (commands.length > 0) executor.execute(commands[0]!);
    },
  });
}
