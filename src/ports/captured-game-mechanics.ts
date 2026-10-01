/** Immutable views of the live game mechanics that the page capture can safely reach. */

export interface CapturedGameFuelInput {
  readonly resourceId: string;
  readonly amount: number;
}

/** A captured action read keeps absence distinct from a valid false result or bad output. */
export type CapturedGameRead<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" };

export type CapturedPowerBalanceRule =
  | {
      readonly kind: "resource";
      readonly resourceId: string;
      readonly stateField: string;
    }
  | { readonly kind: "support"; readonly amount: number };

export interface CapturedSupportTopology {
  /** Full registry key of the same-region anchor selected by DeadSpace, or null. */
  readonly anchorEntryKey: string | null;
  readonly unlimited: boolean;
  /** Absent support_condition means enabled, matching the normal support pass. */
  readonly enabled: CapturedGameRead<boolean>;
}

export interface CapturedPowerRequirement {
  readonly techId: string;
  readonly level: number;
}

export type CapturedFuelAdjustmentMode = "space" | "interstellar";

export interface CapturedGameStructureDefinition {
  /** DeadSpace's full grid key; short `struct` names are not unique identities. */
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  /** The current Vue control id declared by the game action definition. */
  readonly actionId: string;
  /** The game-owned display key used by its source-specific production ledger. */
  readTitle(): CapturedGameRead<string>;
  /** The current game-owned action description, preserving the active locale. */
  readDescription(): CapturedGameRead<string>;
  /** A game-owned `val()` result when an action defines one. */
  readValue(): CapturedGameRead<number>;
  /** Nested ship rating exposed by actions such as `galaxy-minelayer.ship.rating()`. */
  readShipRating(): CapturedGameRead<number>;
  /** Action capability ownership, independent of the current `powered()` result. */
  readonly ownsPowered: boolean;
  readPowered(): CapturedGameRead<number>;
  /** Game-owned state capability where the action defines `switchable()`. */
  readSwitchable(): CapturedGameRead<boolean>;
  /** `power_reqs`, normalized to the root tech levels checked by the retired wrapper. */
  readPowerRequirements(): CapturedGameRead<
    readonly CapturedPowerRequirement[]
  >;
  readFuel(): CapturedGameRead<readonly CapturedGameFuelInput[] | false>;
  /** DeadSpace applies generator fuel adjustment only when this positive flag is true. */
  readFuelAdjustmentRequested(): CapturedGameRead<boolean>;
  readSupport(): CapturedGameRead<number>;
  /** Game `s_type`, normalized to the string members it actually retains. */
  readSupportTypes(): CapturedGameRead<readonly string[]>;
  /** Game `support_for[type]` with the `support()` fallback already applied. */
  readSupportValue(type: string): CapturedGameRead<number>;
  /** Truthy `support_provider` marker; absence remains distinct and means no marker. */
  readSupportProvider(): CapturedGameRead<boolean>;
  /** Semantic subset of the group info, without exposing `info` or its callback. */
  readSupportTopology(): CapturedGameRead<CapturedSupportTopology>;
  readSupportFuel(): CapturedGameRead<readonly CapturedGameFuelInput[] | false>;
  readSupportFuelAdjustmentDisabled(): CapturedGameRead<boolean>;
  readPowerLimit(): CapturedGameRead<number | string | boolean>;
  readPowerBalancer(): CapturedGameRead<
    readonly CapturedPowerBalanceRule[] | false
  >;
}

export type CapturedProductionCell = number | string;
export type CapturedProductionLedger = Readonly<
  Record<string, Readonly<Record<string, CapturedProductionCell>>>
>;

export interface CapturedProductionBreakdown {
  /** Source-specific values recorded by the game, grouped by resource then source label. */
  readonly production: CapturedProductionLedger;
  readonly consumption: CapturedProductionLedger;
  /** Capacity rows from `breakdown.c`, when the page exposes that game-owned ledger. */
  readonly capacity?: CapturedProductionLedger;
}

/**
 * Read-only game-owned structure definitions and the current production ledger.
 * No action, pay-cost, increment, or power-post callback crosses this boundary.
 */
export interface CapturedGameMechanics {
  /** `undefined` means the private registry has not been captured or failed validation. */
  readStructures(): readonly CapturedGameStructureDefinition[] | undefined;
  /** Resolve the live root Power list; unknown/stale keys are skipped, never Map-ordered. */
  readPowerOrder(
    root: unknown,
  ): CapturedGameRead<readonly CapturedGameStructureDefinition[]>;
  /** Resolve one live root support list with the same full-key ordering semantics. */
  readSupportOrder(
    root: unknown,
    type: string,
  ): CapturedGameRead<readonly CapturedGameStructureDefinition[]>;
  /** `undefined` means the private production ledger has not been captured or validated. */
  readProductionBreakdown(): CapturedProductionBreakdown | undefined;
  /** Localize a game-owned key for matching its current production ledger label. */
  readLocalizedText(key: string): CapturedGameRead<string>;
  /** Factor observed by synchronously probing a game-owned action effect. */
  readAdjustedFuelFactor(
    mode: CapturedFuelAdjustmentMode,
    resourceId: string,
  ): CapturedGameRead<number>;
}
