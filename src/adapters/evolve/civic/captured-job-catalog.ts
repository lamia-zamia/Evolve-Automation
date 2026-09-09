/**
 * Reads the ordinary job catalog that DeadSpace exposes through the captured Civics controls.
 *
 * The catalog is deliberately smaller than the full job planner input. Workers, caps, visibility,
 * default-job identity, and game-owned control methods are stable captured facts; breakpoints,
 * smart-job rules, storage floors, and special race behavior still need their own characterization.
 */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../validation.ts";

export interface CapturedJobCatalogEntry {
  readonly id: string;
  readonly controlId: string;
  readonly assigned: number;
  readonly workers: number;
  /** DeadSpace uses -1 for an uncapped ordinary job. */
  readonly maximum: number;
  readonly display: boolean;
  readonly unlocked: boolean;
  readonly managed: boolean;
  /** Raw `job_b1..3_<id>` settings; normalization belongs to the planner-input slice. */
  readonly configuredBreakpoints: readonly [number, number, number] | null;
  readonly isDefault: boolean;
}

export interface CapturedJobCatalog {
  readonly defaultJobId: string;
  readonly jobs: readonly Readonly<CapturedJobCatalogEntry>[];
}

export interface CapturedJobCatalogReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly onSkipped?: (controlId: string, reason: string) => void;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function finiteMaximum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= -1
    ? value
    : undefined;
}

function readConfiguredBreakpoints(
  settings: Record<PropertyKey, unknown> | undefined,
  id: string,
): readonly [number, number, number] | null {
  const values = [1, 2, 3].map((number) =>
    readProperty(settings, `job_b${number}_${id}`),
  );
  if (
    values.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    return null;
  }
  const breakpoints: [number, number, number] = [
    values[0] as number,
    values[1] as number,
    values[2] as number,
  ];
  return Object.freeze(breakpoints);
}

function readCatalog(
  root: unknown,
  controls: GameControlRegistry,
  settingsValue: unknown,
  onSkipped: (controlId: string, reason: string) => void,
): CapturedJobCatalog | undefined {
  const civic = readProperty(root, "civic");
  if (!isRecord(civic)) return undefined;
  const defaultJobId = readProperty(civic, "d_job");
  if (typeof defaultJobId !== "string" || defaultJobId.length === 0) {
    return undefined;
  }
  const settings = isRecord(settingsValue) ? settingsValue : undefined;

  const jobs: CapturedJobCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const controlId of controls.capturedElementIds()) {
    if (!controlId.startsWith("civ-") || controlId.length <= "civ-".length)
      continue;
    const id = controlId.slice("civ-".length);
    if (seen.has(id)) continue;
    seen.add(id);
    const handle = controls.resolve(controlId);
    if (
      handle === undefined ||
      !handle.methods.includes("add") ||
      !handle.methods.includes("sub") ||
      !handle.methods.includes("setDefault")
    ) {
      onSkipped(controlId, "ordinary job control is incomplete");
      continue;
    }
    const job = readProperty(civic, id);
    if (!isRecord(job)) {
      onSkipped(controlId, "ordinary job state is unavailable");
      continue;
    }
    if (readProperty(job, "job") !== id) {
      onSkipped(controlId, "ordinary job identity does not match control");
      continue;
    }
    const assigned = finiteNonNegative(readProperty(job, "assigned"));
    if (assigned === undefined) {
      onSkipped(controlId, "ordinary job assigned count is not finite");
      continue;
    }
    const workers = finiteNonNegative(readProperty(job, "workers"));
    if (workers === undefined) {
      onSkipped(controlId, "ordinary job worker count is not finite");
      continue;
    }
    const maximum = finiteMaximum(readProperty(job, "max"));
    if (maximum === undefined) {
      onSkipped(controlId, "ordinary job maximum is not finite");
      continue;
    }
    const display = readProperty(job, "display");
    if (typeof display !== "boolean") {
      onSkipped(controlId, "ordinary job visibility is not boolean");
      continue;
    }
    // DeadSpace's job surface defines unlocked from civic.display and the script's managed
    // setting is only effective for an unlocked job. Missing or malformed settings remain false.
    const unlocked = display;
    const managed = unlocked && readProperty(settings, `job_${id}`) === true;
    const configuredBreakpoints = readConfiguredBreakpoints(settings, id);
    jobs.push(
      Object.freeze({
        id,
        controlId,
        assigned,
        workers,
        maximum,
        display,
        unlocked,
        managed,
        configuredBreakpoints,
        isDefault: id === defaultJobId,
      }),
    );
  }

  return jobs.some((job) => job.id === defaultJobId)
    ? Object.freeze({
        defaultJobId,
        jobs: Object.freeze(jobs),
      })
    : undefined;
}

export function createCapturedJobCatalogReader({
  rootState,
  controls,
  readSettings,
  onSkipped,
}: CapturedJobCatalogReaderDependencies): () => CapturedJobCatalog | undefined {
  const reportSkipped = onSkipped ?? (() => {});
  return () =>
    readCatalog(rootState.readRoot(), controls, readSettings(), reportSkipped);
}
