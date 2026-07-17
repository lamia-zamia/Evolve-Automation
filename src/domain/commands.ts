import type { CommandId, SnapshotId } from "./identifiers.ts";

export type TaxAdjustmentDirection = "increase" | "decrease";

export interface TaxAdjustmentOperation {
  readonly direction: TaxAdjustmentDirection;
  readonly count: number;
}

/** One legacy key-reset/click/marker group. Groups remain ordered. */
export interface TaxAdjustmentBatch {
  readonly operations: readonly TaxAdjustmentOperation[];
}

/** The first concrete mutation required by the tax pilot slice. */
export interface AdjustTaxRateCommand {
  readonly kind: "adjust-tax-rate";
  readonly expectedRate: number;
  readonly batches: readonly TaxAdjustmentBatch[];
}

export type StorageUnit = "crate" | "container";

/** One optimistic decrement/increment applied to the script resource model. */
export interface StorageResourceDelta {
  readonly resourceId: string;
  /** Subtracted from the resource's current quantity; may be negative. */
  readonly amount: number;
}

/** Build a batch of crates or containers and reconcile the resource model. */
export interface ConstructStorageCommand {
  readonly kind: "construct-storage";
  readonly unit: StorageUnit;
  /** May be non-positive; construction is a no-op in-game but the model still reconciles. */
  readonly count: number;
  /** Storage capacity one unit adds; used to decide whether anything was built. */
  readonly storagePerUnit: number;
  /** Resource whose current quantity increases by `count`. */
  readonly producedResourceId: string;
  /** Cost resources whose current quantity each decreases by its `amount`. */
  readonly spend: readonly StorageResourceDelta[];
}

/** Add variants only when another vertical slice is migrated. */
export type AutomationCommand = AdjustTaxRateCommand | ConstructStorageCommand;

export interface CommandEnvelope<
  TCommand extends AutomationCommand = AutomationCommand,
> {
  readonly id: CommandId;
  readonly expectedSnapshotId: SnapshotId;
  readonly command: TCommand;
}

export type CommandFailureContextValue = string | number | boolean | null;

export interface CommandFailure {
  readonly code: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, CommandFailureContextValue>>;
}

export type CommandExecutionOutcome =
  | { readonly status: "succeeded" }
  | { readonly status: "rejected"; readonly failure: CommandFailure }
  | { readonly status: "stale"; readonly failure: CommandFailure };

export type CommandResult<
  TCommand extends AutomationCommand = AutomationCommand,
> = CommandExecutionOutcome & {
  readonly envelope: CommandEnvelope<TCommand>;
  readonly completedAtMs: number;
};
