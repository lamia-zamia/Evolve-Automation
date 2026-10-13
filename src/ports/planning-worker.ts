export type PlanningCloneValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | readonly PlanningCloneValue[]
  | { readonly [key: string]: PlanningCloneValue };

export interface PlanningIdentity {
  readonly task: string;
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly offerIdentity: string;
  readonly snapshotVersion: number;
}

export interface PlanningRequest<TInput = PlanningCloneValue> {
  readonly requestId: number;
  readonly identity: PlanningIdentity;
  /** Immutable plain snapshot data only; native references and callbacks are excluded. */
  readonly input: TInput;
}

export type PlanningOutcome<TDecision = PlanningCloneValue> =
  | { readonly kind: "decision"; readonly value: TDecision }
  | {
      readonly kind: "diagnostic";
      readonly code: string;
      readonly message: string;
    };

export interface PlanningResponse<TDecision = PlanningCloneValue> {
  readonly requestId: number;
  readonly identity: PlanningIdentity;
  readonly outcome: PlanningOutcome<TDecision>;
  readonly workerValidationMs?: number;
  readonly workerComputeMs?: number;
}

export interface PlanningWorkerPort {
  postMessage(message: PlanningRequest<unknown>): void;
  subscribe(
    onMessage: (message: unknown) => void,
    onError: (error: unknown) => void,
  ): () => void;
  terminate(): void;
}
