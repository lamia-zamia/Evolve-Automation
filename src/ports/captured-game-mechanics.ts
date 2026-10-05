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

/**
 * One `Number.prototype.toFixed` call the page made while a probe held it.
 *
 * Some game answers have no other reachable expression: the fuel-adjustment factor is only ever a
 * rounded literal, and the Truepath `syndicate()` result keeps its remaining-defense ratio solely as
 * the string that ratio is subtracted from. Both are read by observing the rounding rather than by
 * re-deriving what was rounded.
 */
export interface CapturedRoundedValue {
  /** The receiver as the page's own `Number` coercion of it, before rounding. */
  readonly receiver: number;
  /** The digit count the observed code asked for. */
  readonly digits: number;
  /** The string the page itself produced. */
  readonly text: string;
}

export interface CapturedMathRoundValue {
  readonly input: number;
  readonly result: number;
}

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

export interface CapturedNativeSupportGrid {
  readonly type: string;
  readonly contribution: number;
  readonly consumer: boolean;
  readonly provider: boolean;
  readonly topology: CapturedSupportTopology;
}

export interface CapturedGameStructureDefinition {
  /** DeadSpace's full grid key; short `struct` names are not unique identities. */
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  /** The current Vue control id declared by the game action definition. */
  readonly actionId: string;
  /** Semantic offer qualification, independent of rendered panels. Invalid fails the whole cycle. */
  readAvailability(root: unknown): CapturedGameRead<boolean>;
  /** The game-owned display key used by its source-specific production ledger. */
  readTitle(): CapturedGameRead<string>;
  /** The current game-owned action description, preserving the active locale. */
  readDescription(): CapturedGameRead<string>;
  /** A game-owned `val()` result when an action defines one. */
  readValue(): CapturedGameRead<number>;
  /** Game-owned workers() requirement, when the action defines it. */
  readWorkers(): CapturedGameRead<number>;
  /** Nested ship rating exposed by actions such as `galaxy-minelayer.ship.rating()`. */
  readShipRating(): CapturedGameRead<number>;
  /** Action capability ownership, independent of the current `powered()` result. */
  readonly ownsPowered: boolean;
  readPowered(): CapturedGameRead<number>;
  /** Current native Power role, checked against the live full-key order and root state. */
  readPowerGridRole(
    root: unknown,
    sampledPowered?: number,
  ): CapturedGameRead<"consumer" | "generator" | "none">;
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
  /** Raw game `supportGridValue()` (`support_for[type]` or `support()`); upstream can further scale effective provider output. */
  readSupportValue(type: string): CapturedGameRead<number>;
  /** Truthy `support_provider` marker; absence remains distinct and means no marker. */
  readSupportProvider(): CapturedGameRead<boolean>;
  /** Semantic subset of the group info, without exposing `info` or its callback. */
  readSupportTopology(): CapturedGameRead<CapturedSupportTopology>;
  /** Native support groups with live consumer order and current action output. */
  readNativeSupportGrids(
    root: unknown,
  ): CapturedGameRead<readonly CapturedNativeSupportGrid[]>;
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
 * Game-owned structure definitions, production ledger, and narrow semantic power switches.
 * Raw actions and callbacks never cross this boundary.
 */
export interface CapturedGameMechanics {
  /** Exact target switch using the action's cap and the game's deferred postPower queue. */
  adjustPower(
    root: unknown,
    entryKey: string,
    expectedStateOn: number,
    targetStateOn: number,
    isCurrent?: () => boolean,
    preflightOnly?: boolean,
  ): CapturedGameRead<boolean>;
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
  /**
   * Runs one synchronous read with the page's own `Number.prototype.toFixed` observed, and returns
   * what the game rounded. The value the game receives is untouched, the exact original property
   * descriptor is restored before this returns, and a probe already in flight is refused rather
   * than interleaved — so a truncated observation list is never reported as a complete one.
   */
  readRoundedValues(
    read: () => unknown,
  ): CapturedGameRead<readonly CapturedRoundedValue[]>;
  readMathRoundValues(
    read: () => unknown,
  ): CapturedGameRead<readonly CapturedMathRoundValue[]>;
  /** Numeric oracle in the current native portal guard-post effect. */
  readGuardPostRating(
    root: unknown,
    isCurrent: () => boolean,
  ): CapturedGameRead<number>;
}
