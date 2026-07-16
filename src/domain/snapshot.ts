import { snapshotId, type SnapshotId } from "./identifiers.ts";

export interface SnapshotMetadata {
  readonly id: SnapshotId;
  readonly capturedAtMs: number;
}

/** The common header carried by every validated, feature-specific game snapshot. */
export interface GameSnapshot {
  readonly metadata: SnapshotMetadata;
}

export function createSnapshotMetadata(input: {
  readonly id: unknown;
  readonly capturedAtMs: unknown;
}): SnapshotMetadata {
  if (
    typeof input.capturedAtMs !== "number" ||
    !Number.isSafeInteger(input.capturedAtMs) ||
    input.capturedAtMs < 0
  ) {
    throw new TypeError("snapshot capture time must be a non-negative integer");
  }

  return Object.freeze({
    id: snapshotId(input.id),
    capturedAtMs: input.capturedAtMs,
  });
}
