/**
 * Answers `BuildingClickable`'s last predicate through the game's own queue path.
 *
 * DeadSpace keeps `queue_complete()` in the module-lexical action definition. The captured Vue
 * action method still closes over it, however: when `settings.qKey` and the queue key are active,
 * `runAction` short-circuits the real action body and evaluates the queue admission branch. This
 * adapter temporarily makes that branch admissible, observes one queued unit, and restores the
 * queue, its inputs, the key state and the off-screen queue render synchronously.
 */

import type { GameBuildCapacity } from "../../ports/game-build-capacity.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../ports/game-control-registry.ts";
import type { GameKeyboardHandlersPort } from "../../ports/game-keyboard-handlers.ts";
import type { GameKeyStateReader } from "../../ports/game-key-state.ts";
import type { GameMountSuppression } from "../../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import {
  createCountTally,
  type PhaseTimingSink,
} from "../../utils/performance.ts";
import {
  finite,
  isRecord,
  readProperty,
  splitActionId,
} from "../validation.ts";

const BUILD_QUEUE_PANEL = "buildQueue";
const MESSAGE_QUEUE_PANEL = "msgQueue";
const QUEUE_KEY_SETTING = "q";
const CAPACITY_CACHE_AGE_MS = 1_000;

interface CapturedBuildCapacityDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly panels: GamePanelWorkspace;
  readonly mountSuppression: GameMountSuppression;
  readonly keyboard: GameKeyboardHandlersPort;
  readonly keyState: GameKeyStateReader;
  readonly readEpoch: () => string;
  readonly nowMs: () => number;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

interface RecordSnapshot {
  readonly target: Record<PropertyKey, unknown>;
  readonly values: ReadonlyMap<string, unknown>;
}

interface QueueEntrySnapshot {
  readonly target: Record<PropertyKey, unknown>;
  readonly values: ReadonlyMap<string, unknown>;
}

interface CapacityCacheEntry {
  readonly root: unknown;
  readonly epoch: string;
  readonly signal: string;
  readonly takenAtMs: number;
  readonly value: boolean;
}

function snapshotRecord(value: unknown): RecordSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  return {
    target: value,
    values: new Map(Object.keys(value).map((key) => [key, value[key]])),
  };
}

function restoreRecord(snapshot: RecordSnapshot): void {
  const currentKeys = Object.keys(snapshot.target);
  for (const key of currentKeys) {
    if (
      !snapshot.values.has(key) &&
      !Reflect.deleteProperty(snapshot.target, key)
    )
      throw new Error(`could not delete restored property: ${key}`);
  }
  for (const [key, value] of snapshot.values) {
    if (!Reflect.set(snapshot.target, key, value))
      throw new Error(`could not restore property: ${key}`);
  }
}

function snapshotQueueEntry(value: unknown): QueueEntrySnapshot | undefined {
  const snapshot = snapshotRecord(value);
  return snapshot === undefined
    ? undefined
    : { target: snapshot.target, values: snapshot.values };
}

function restoreQueueEntries(
  entries: unknown[],
  original: readonly unknown[],
  snapshots: readonly (QueueEntrySnapshot | undefined)[],
): void {
  entries.splice(0, entries.length, ...original);
  for (const snapshot of snapshots) {
    if (snapshot !== undefined) restoreRecord(snapshot);
  }
}

function scalarSignal(value: unknown): string {
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "number" && Number.isFinite(value)) return `n:${value}`;
  if (value === true) return "b:1";
  if (value === false) return "b:0";
  if (value === null) return "null";
  return "-";
}

/** Cheap action-local invalidation for count/progress fields that queue caps commonly read. */
function actionSignal(root: unknown, actionId: string): string {
  const parts = splitActionId(actionId);
  const structure =
    parts === undefined
      ? undefined
      : readProperty(readProperty(root, parts.region), parts.id);
  const structureSignal = isRecord(structure)
    ? Object.keys(structure)
        .sort()
        .map((key) => `${key}=${scalarSignal(readProperty(structure, key))}`)
        .join(",")
    : "-";
  const queue = readProperty(root, "queue");
  const entries = readProperty(queue, "queue");
  const queueSignal = Array.isArray(entries)
    ? entries
        .map(
          (entry) =>
            `${scalarSignal(readProperty(entry, "id"))}:${scalarSignal(
              readProperty(entry, "q"),
            )}:${scalarSignal(readProperty(entry, "qs"))}`,
        )
        .join(";")
    : "-";
  return `${structureSignal}|${queueSignal}|${scalarSignal(
    readProperty(queue, "max"),
  )}`;
}

function queueUnits(
  entries: readonly unknown[],
  actionId: string,
): number | undefined {
  let units = 0;
  for (const entry of entries) {
    if (readProperty(entry, "id") !== actionId) continue;
    const quantity = finite(readProperty(entry, "q"));
    if (quantity === undefined || quantity < 0) return undefined;
    units += quantity;
  }
  return units;
}

function queueWork(entries: readonly unknown[]): number | undefined {
  let used = 0;
  for (const entry of entries) {
    const quantity = finite(readProperty(entry, "q"));
    const batch = finite(readProperty(entry, "qs"));
    if (
      quantity === undefined ||
      batch === undefined ||
      quantity < 0 ||
      batch <= 0
    ) {
      return undefined;
    }
    used += Math.ceil(quantity / batch);
  }
  return used;
}

function queueKey(root: unknown): string | number | undefined {
  const settings = readProperty(root, "settings");
  const key = readProperty(readProperty(settings, "keyMap"), QUEUE_KEY_SETTING);
  if (typeof key === "string" && key.length > 0) return key;
  const number = finite(key);
  return number === undefined || number <= 0 ? undefined : number;
}

function keyEventInit(
  key: string | number,
): Readonly<Record<string, string | number>> {
  return typeof key === "number" ? { keyCode: key, which: key } : { key };
}

function canUseAction(
  handle: GameControlHandle | undefined,
): handle is GameControlHandle {
  return handle?.methods.includes("action") === true;
}

export function createCapturedBuildCapacity(
  dependencies: CapturedBuildCapacityDependencies,
): GameBuildCapacity {
  const {
    rootState,
    controls,
    panels,
    mountSuppression,
    keyboard,
    keyState,
    readEpoch,
    nowMs,
    diagnostics,
  } = dependencies;
  const cache = new Map<string, CapacityCacheEntry>();

  return Object.freeze({
    canBuildAnother(actionId: string): boolean | undefined {
      const tally = createCountTally(diagnostics);
      const unsupported = (): undefined => {
        tally.count("build-capacity.unsupported");
        cache.delete(actionId);
        return undefined;
      };
      let root: unknown;
      let epoch: string;
      let now: number;
      try {
        root = rootState.readRoot();
        epoch = readEpoch();
        now = nowMs();
      } catch {
        return unsupported();
      }
      let signal: string;
      try {
        signal = actionSignal(root, actionId);
      } catch {
        return unsupported();
      }
      const cached = cache.get(actionId);
      if (
        cached !== undefined &&
        cached.root === root &&
        cached.epoch === epoch &&
        cached.signal === signal &&
        now - cached.takenAtMs < CAPACITY_CACHE_AGE_MS
      ) {
        tally.count("build-capacity.cache-hit");
        return cached.value;
      }
      tally.count("build-capacity.probe");

      if (typeof actionId !== "string" || actionId.length === 0)
        return unsupported();
      let handle: GameControlHandle | undefined;
      try {
        handle = controls.resolve(actionId);
      } catch {
        return unsupported();
      }
      if (!canUseAction(handle)) return unsupported();
      const key = queueKey(root);
      if (key === undefined) return unsupported();
      let keyWasPressed: boolean | undefined;
      try {
        keyWasPressed = keyState.readPressed(key);
      } catch {
        return unsupported();
      }
      if (keyWasPressed === undefined) return unsupported();
      let gameHandlers;
      try {
        gameHandlers = keyboard.readGameKeyboardHandlers();
      } catch {
        return unsupported();
      }
      if (gameHandlers.keyDown === null || gameHandlers.keyUp === null) {
        return unsupported();
      }
      let settings: unknown;
      let tech: unknown;
      let queue: unknown;
      try {
        settings = readProperty(root, "settings");
        tech = readProperty(root, "tech");
        queue = readProperty(root, "queue");
      } catch {
        return unsupported();
      }
      if (!isRecord(settings) || !isRecord(tech) || !isRecord(queue)) {
        return unsupported();
      }
      let entries: unknown;
      try {
        entries = readProperty(queue, "queue");
      } catch {
        return unsupported();
      }
      if (!Array.isArray(entries)) return unsupported();
      let used: number | undefined;
      let beforeUnits: number | undefined;
      try {
        used = queueWork(entries);
        beforeUnits = queueUnits(entries, actionId);
      } catch {
        return unsupported();
      }
      if (used === undefined || beforeUnits === undefined) return unsupported();
      let settingsSnapshot: RecordSnapshot | undefined;
      let techSnapshot: RecordSnapshot | undefined;
      let queueSnapshot: RecordSnapshot | undefined;
      let originalEntries: unknown[];
      let entrySnapshots: Array<QueueEntrySnapshot | undefined>;
      try {
        settingsSnapshot = snapshotRecord(settings);
        techSnapshot = snapshotRecord(tech);
        queueSnapshot = snapshotRecord(queue);
        originalEntries = entries.slice();
        entrySnapshots = originalEntries.map(snapshotQueueEntry);
      } catch {
        return unsupported();
      }
      if (
        settingsSnapshot === undefined ||
        techSnapshot === undefined ||
        queueSnapshot === undefined ||
        entrySnapshots.some(
          (snapshot, index) =>
            snapshot === undefined && isRecord(originalEntries[index]),
        )
      ) {
        return unsupported();
      }
      if (!mountSuppression.available) return unsupported();

      let workspace;
      try {
        workspace = panels.open({
          keep: MESSAGE_QUEUE_PANEL,
          scratch: BUILD_QUEUE_PANEL,
        });
      } catch {
        return unsupported();
      }
      if (workspace === undefined) return unsupported();

      let answer: boolean | undefined;
      let restorationFailure = false;
      const restore = (operation: () => void): void => {
        try {
          operation();
        } catch {
          restorationFailure = true;
        }
      };
      try {
        if (!keyWasPressed) {
          gameHandlers.keyDown(keyEventInit(key));
          if (keyState.readPressed(key) !== true) return unsupported();
        }
        if (
          !Reflect.set(settings, "qKey", true) ||
          readProperty(settings, "qKey") !== true
        ) {
          return unsupported();
        }
        if (!Reflect.set(tech, "queue", true) || !readProperty(tech, "queue")) {
          return unsupported();
        }
        const forcedMax = used + 1;
        if (
          !Reflect.set(queue, "max", forcedMax) ||
          readProperty(queue, "max") !== forcedMax
        ) {
          return unsupported();
        }
        const result = mountSuppression.withoutMounting(
          () => controls.invoke(handle, "action"),
          { shouldMount: () => false },
        );
        if (!result.ok) return unsupported();
        const afterUnits = queueUnits(entries, actionId);
        if (afterUnits === undefined) return unsupported();
        answer = afterUnits > beforeUnits;
        tally.count(
          answer ? "build-capacity.accepted" : "build-capacity.rejected",
        );
      } catch {
        answer = undefined;
        tally.count("build-capacity.unsupported");
      } finally {
        restore(() => {
          const currentKeyState = keyState.readPressed(key);
          if (currentKeyState === keyWasPressed) return;
          if (!keyWasPressed && currentKeyState === true) {
            gameHandlers.keyUp!(keyEventInit(key));
            if (keyState.readPressed(key) !== false)
              throw new Error("queue key state was not restored");
            return;
          }
          throw new Error("queue key state changed during probe");
        });
        restore(() => restoreRecord(settingsSnapshot));
        restore(() => restoreRecord(techSnapshot));
        restore(() => restoreRecord(queueSnapshot));
        restore(() =>
          restoreQueueEntries(entries, originalEntries, entrySnapshots),
        );
        restore(() => workspace.release());
        restore(() => {
          if (!workspace.isIntact())
            throw new Error("queue workspace was not restored");
        });
        if (restorationFailure) {
          tally.count("build-capacity.restoration-failure");
          answer = undefined;
        }
      }
      if (answer === undefined) return undefined;
      cache.set(actionId, {
        root,
        epoch,
        signal,
        takenAtMs: now,
        value: answer,
      });
      return answer;
    },
  });
}
