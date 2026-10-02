import type {
  CapturedEspionagePlan,
  CapturedEspionageInput,
} from "../domain/combat/captured-espionage.ts";
import type { DecisionExecutor } from "./decision-executor.ts";
import type { GameControlHandle } from "./game-control-registry.ts";

export interface CapturedEspionageReader {
  read(): CapturedEspionageInput;
  readAll(): readonly CapturedEspionageInput[];
}

export type CapturedEspionageExecutor = DecisionExecutor<CapturedEspionagePlan>;

/**
 * The game's own `#espModal` operation methods for one government.
 *
 * Captured on demand and never carried across cycles: the game builds a fresh set per government
 * because `annex()`'s availability check reads the government its own closure was built with, so a
 * control captured for one government is not correct for another. `undefined` means the capture
 * failed, and the caller must treat that as a closed door rather than act on its own.
 */
export interface CapturedEspionageOperationCapture {
  /**
   * True while a real `.modal.is-active` is on screen. The captured operation methods close
   * themselves with a global `.modal-background` click and a `clearPopper()`, so an operation must
   * not run beside a modal the player owns.
   */
  blockedByPlayerModal(): boolean;
  capture(governmentId: number): GameControlHandle | undefined;
}
