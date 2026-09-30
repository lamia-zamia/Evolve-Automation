/** Immutable views of the live game mechanics that the page capture can safely reach. */

export interface CapturedGameFuelInput {
  readonly resourceId: string;
  readonly amount: number;
}

export type CapturedPowerBalanceRule =
  | {
      readonly kind: "resource";
      readonly resourceId: string;
      readonly stateField: string;
    }
  | { readonly kind: "support"; readonly amount: number };

export interface CapturedGameStructureDefinition {
  /** DeadSpace's full grid key; short `struct` names are not unique identities. */
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  /** The current Vue control id declared by the game action definition. */
  readonly actionId: string;
  readPowered(): number | undefined;
  readFuel(): readonly CapturedGameFuelInput[] | undefined;
  readFuelAdjustmentRequested(): boolean | undefined;
  readSupport(): number | undefined;
  readSupportFuel(): readonly CapturedGameFuelInput[] | undefined;
  readSupportFuelAdjustmentDisabled(): boolean | undefined;
  readPowerLimit(): number | undefined;
  readPowerBalancer(): readonly CapturedPowerBalanceRule[] | false | undefined;
}

export type CapturedProductionCell = number | string;
export type CapturedProductionLedger = Readonly<
  Record<string, Readonly<Record<string, CapturedProductionCell>>>
>;

export interface CapturedProductionBreakdown {
  /** Source-specific values recorded by the game, grouped by resource then source label. */
  readonly production: CapturedProductionLedger;
  readonly consumption: CapturedProductionLedger;
}

/**
 * Read-only game-owned structure definitions and the current production ledger.
 * No action, pay-cost, increment, or power-post callback crosses this boundary.
 */
export interface CapturedGameMechanics {
  /** `undefined` means the private registry has not been captured or failed validation. */
  readStructures(): readonly CapturedGameStructureDefinition[] | undefined;
  /** `undefined` means the private production ledger has not been captured or validated. */
  readProductionBreakdown(): CapturedProductionBreakdown | undefined;
}
