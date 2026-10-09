/**
 * Game-owned control methods captured as the game builds its own components.
 *
 * A captured method keeps working after its panel is unmounted, and keeps working after the panel
 * is redrawn — the superseded closure stays live and silently correct-looking. Handles therefore
 * carry the generation they were resolved at, and the registry refuses to invoke a superseded one.
 */
export interface GameControlHandle {
  /** The element id the game declared for the control, e.g. `city-basic_housing`. */
  readonly elementId: string;
  /** Incremented every time the game rebuilds the control. */
  readonly generation: number;
  readonly methods: readonly string[];
  /** Optional adapter-owned Vue binding data for readers that can validate it narrowly. */
  readonly data?: unknown;
}

export type GameControlFailure =
  "unknown-control" | "stale-control" | "unknown-method" | "threw";

export type GameControlResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly reason: GameControlFailure;
      readonly detail?: string;
    };

declare const controlCaptureCheckpointBrand: unique symbol;

/** Opaque snapshot owned by the capture that produced it. */
export interface ControlCaptureCheckpoint {
  readonly [controlCaptureCheckpointBrand]: true;
}

export interface GameControlRegistry {
  /** The current authoritative handle; absent and rejected generations answer `undefined`. */
  resolve(elementId: string): GameControlHandle | undefined;
  /** Allocation-free check for a captured generation and its rejection state. */
  isCurrent?(elementId: string, generation: number): boolean;
  /** Revision changes when a captured binding generation changes or is rejected. */
  readRevision?(): number;
  checkpoint(): ControlCaptureCheckpoint;
  /** Reject changed current generations, optionally bounded before a later legitimate redraw. */
  rejectChanges(
    checkpoint: ControlCaptureCheckpoint,
    through?: ControlCaptureCheckpoint,
  ): void;
  /**
   * Invoke one captured method. A missing or superseded control is an explicit failure with a
   * reason: it must never read as "the feature is locked".
   */
  invoke(
    handle: GameControlHandle,
    method: string,
    args?: readonly unknown[],
  ): GameControlResult;
  /** Every element id captured so far, in capture order. */
  capturedElementIds(): readonly string[];
}
