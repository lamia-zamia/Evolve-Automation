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
 * Some game answers have no other reachable expression. Fuel adjustment, Truepath syndicate, and
 * structure effects can be read by observing native rounding rather than restating their rules.
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
  /** Whether this sample invoked the live native `support_condition` callback. */
  readonly conditionEvaluated: boolean;
}

/** One call-scoped sample of action/registry support metadata for a Power read. */
export interface CapturedSupportMechanicsSample {
  readonly support: CapturedGameRead<number>;
  readonly supportTypes: CapturedGameRead<readonly string[]>;
  readonly provider: CapturedGameRead<boolean>;
  readonly topology: CapturedGameRead<CapturedSupportTopology>;
  readonly supportValues: ReadonlyMap<string, CapturedGameRead<number>>;
}

export type CapturedSupportAnchorResolver = (
  region: string,
  struct: string,
) => CapturedGameRead<string | null>;

export interface CapturedPowerRequirement {
  readonly techId: string;
  readonly level: number;
}

/** Native structure identity without the game-owned readers attached to a full definition. */
export interface CapturedGameStructureIdentity {
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  readonly actionId: string;
}

export type CapturedFuelAdjustmentMode = "space" | "interstellar";

/** Identity metadata from the running page's private `actions.tech` registry. */
export interface CapturedTechDefinition {
  readonly registryKey: string;
  readonly actionId: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
}

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
  /** Whether this exact captured registry entry still owns its key and coordinates. */
  matchesCurrentIdentity(): boolean;
  /** Semantic offer qualification, independent of rendered panels. Invalid fails the whole cycle. */
  readAvailability(root: unknown): CapturedGameRead<boolean>;
  /** Whether the action row can be rendered by the named Civilization sub-tab right now. */
  readControlAvailabilityForTab(
    root: unknown,
    tabIndex: number,
  ): CapturedGameRead<boolean>;
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
  readSupportTopology(
    resolveAnchor?: CapturedSupportAnchorResolver,
  ): CapturedGameRead<CapturedSupportTopology>;
  /** Native support groups with live consumer order and current action output. */
  readNativeSupportGrids(
    root: unknown,
    sample?: CapturedSupportMechanicsSample,
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
  /**
   * Temporarily observes page-realm `Object.keys` during one controlled Research draw until the
   * native registry is captured. The callback remains synchronous and its result is untouched.
   */
  captureTechDefinitionsDuring<T>(draw: () => T): T;
  /** `undefined` means the retained private technology registry is absent or no longer valid. */
  readTechDefinitions(): readonly CapturedTechDefinition[] | undefined;
  /** Exact target switch using the action's cap and the game's deferred postPower queue. */
  adjustPower(
    root: unknown,
    entryKey: string,
    expectedStateOn: number,
    targetStateOn: number,
    isCurrent?: () => boolean,
    preflightOnly?: boolean,
    expectedStructure?: CapturedGameStructureDefinition,
  ): CapturedGameRead<boolean>;
  /** `undefined` means the private registry has not been captured or failed validation. */
  readStructures(): readonly CapturedGameStructureDefinition[] | undefined;
  /** Identity-only view for catalog guards that do not need native action readers. */
  readStructureIdentities():
    readonly CapturedGameStructureIdentity[] | undefined;
  /** Resolve the live root Power list; unknown/stale keys are skipped, never Map-ordered. */
  readPowerOrder(
    root: unknown,
    structuresByEntryKey?: ReadonlyMap<string, CapturedGameStructureDefinition>,
  ): CapturedGameRead<readonly CapturedGameStructureDefinition[]>;
  /** Resolve one live root support list with the same full-key ordering semantics. */
  readSupportOrder(
    root: unknown,
    type: string,
    structuresByEntryKey?: ReadonlyMap<string, CapturedGameStructureDefinition>,
  ): CapturedGameRead<readonly CapturedGameStructureDefinition[]>;
  /** `undefined` means the private production ledger has not been captured or validated. */
  readProductionBreakdown(): CapturedProductionBreakdown | undefined;
  /** Native `p_on` after the generator pass has applied support and fuel clamps. */
  readEffectivePowerCount(
    root: unknown,
    entryKey: string,
  ): CapturedGameRead<number>;
  /**
   * Native `support_on` after the support pass has clamped a consumer to the capacity actually
   * available. Configured `state.on` is the requested count; this is the effective one, and
   * configured above effective is a starved grid rather than an inconsistent model.
   */
  readEffectiveSupportCount(
    root: unknown,
    entryKey: string,
  ): CapturedGameRead<number>;
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
  /** Observe one captured structure action's own synchronous `effect()` without exposing the action. */
  readEffectRoundedValues(
    entryKey: string,
    isCurrent?: () => boolean,
  ): CapturedGameRead<readonly CapturedRoundedValue[]>;
  /** Numeric inputs in one uniquely identified native localization call. */
  readEffectLocalizedNumericInputs(
    entryKey: string,
    localizationKey: string,
    isCurrent?: () => boolean,
  ): CapturedGameRead<readonly number[]>;
  readMathRoundValues(
    read: () => unknown,
  ): CapturedGameRead<readonly CapturedMathRoundValue[]>;
  /** Numeric oracle in the current native portal guard-post effect. */
  readGuardPostRating(
    root: unknown,
    isCurrent: () => boolean,
  ): CapturedGameRead<number>;
}
