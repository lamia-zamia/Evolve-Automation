import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { isRegionalSupply } from "../../captured-affordability.ts";

export type MarketBoardMode = "global" | "regional";

export interface MarketBoard {
  readonly root: unknown;
  readonly epoch: string;
  readonly mode: MarketBoardMode;
  readonly rows: readonly GameControlHandle[];
  readonly quantity?: GameControlHandle;
  readonly routeMultiplier?: GameControlHandle;
}

export interface MarketBoardSource {
  epoch(): string;
  current(): MarketBoard | undefined;
  isCurrent(board: MarketBoard): boolean;
  beginDraw(): boolean;
  observeDraw(): void;
  hasObservedRows(): boolean;
  completeDraw(succeeded: boolean): MarketBoard | undefined;
}

const MARKET_QUANTITY_ID = "market-qty";
const ROUTE_MULTIPLIER_ID = "marketRouteMultiplier";

function marketControl(id: string): boolean {
  return (
    id === MARKET_QUANTITY_ID ||
    id === ROUTE_MULTIPLIER_ID ||
    id.startsWith("market-") ||
    id.startsWith("bm-")
  );
}

/** Broad progression fingerprint; the game's draw, never this list, decides actual rows. */
export function marketDiscoveryEpoch(root: unknown): string {
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const displayed = isRecord(resources)
    ? Object.keys(resources).filter(
        (id) => readProperty(readProperty(resources, id), "display") === true,
      )
    : [];
  return JSON.stringify([
    isRegionalSupply(root) ? "regional" : "global",
    displayed,
    Boolean(readProperty(race, "no_trade")),
    Boolean(readProperty(race, "artifical")),
    Boolean(readProperty(race, "fasting")),
    Boolean(readProperty(race, "iceage")),
    Boolean(readProperty(race, "terrifying")),
    Boolean(readProperty(race, "banana")),
    Boolean(readProperty(tech, "trade")),
  ]);
}

export function createCapturedMarketBoard(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
): MarketBoardSource {
  let board: MarketBoard | undefined;
  let invalidations = 0;
  let pending:
    | {
        root: unknown;
        epoch: string;
        before: Map<string, number>;
        observed?: MarketBoard;
      }
    | undefined;

  const isCurrent = (candidate: MarketBoard): boolean =>
    board === candidate &&
    rootState.readRoot() === candidate.root &&
    marketDiscoveryEpoch(candidate.root) === candidate.epoch &&
    candidate.rows.every(
      (row) => controls.resolve(row.elementId)?.generation === row.generation,
    ) &&
    (candidate.quantity === undefined ||
      controls.resolve(MARKET_QUANTITY_ID)?.generation ===
        candidate.quantity.generation) &&
    (candidate.routeMultiplier === undefined ||
      controls.resolve(ROUTE_MULTIPLIER_ID)?.generation ===
        candidate.routeMultiplier.generation);

  function dropStaleBoard(): void {
    if (board !== undefined && !isCurrent(board)) {
      board = undefined;
      invalidations += 1;
    }
  }

  return Object.freeze({
    epoch(): string {
      return `${marketDiscoveryEpoch(rootState.readRoot())}:${invalidations}`;
    },
    current(): MarketBoard | undefined {
      dropStaleBoard();
      return board;
    },
    isCurrent,
    beginDraw(): boolean {
      dropStaleBoard();
      const root = rootState.readRoot();
      if (!isRecord(root)) {
        board = undefined;
        pending = undefined;
        return false;
      }
      const epoch = marketDiscoveryEpoch(root);
      if (board !== undefined && isCurrent(board)) return false;
      board = undefined;
      const before = new Map<string, number>();
      for (const id of controls.capturedElementIds()) {
        if (!marketControl(id)) continue;
        const generation = controls.resolve(id)?.generation;
        if (generation !== undefined) before.set(id, generation);
      }
      pending = { root, epoch, before };
      return true;
    },
    observeDraw(): void {
      if (pending === undefined) return;
      const { root, epoch, before } = pending;
      if (rootState.readRoot() !== root || marketDiscoveryEpoch(root) !== epoch)
        return;
      const mode: MarketBoardMode = isRegionalSupply(root)
        ? "regional"
        : "global";
      const changed: GameControlHandle[] = [];
      for (const id of controls.capturedElementIds()) {
        if (!marketControl(id)) continue;
        const handle = controls.resolve(id);
        if (handle !== undefined && before.get(id) !== handle.generation)
          changed.push(handle);
      }
      const prefix = mode === "regional" ? "bm-" : "market-";
      const rows = changed.filter(
        (handle) =>
          handle.elementId.startsWith(prefix) &&
          handle.elementId !== MARKET_QUANTITY_ID,
      );
      const quantity =
        mode === "global"
          ? changed.find((handle) => handle.elementId === MARKET_QUANTITY_ID)
          : undefined;
      const routeMultiplier = changed.find(
        (handle) => handle.elementId === ROUTE_MULTIPLIER_ID,
      );
      pending.observed = Object.freeze({
        root,
        epoch,
        mode,
        rows: Object.freeze(rows),
        ...(quantity === undefined ? {} : { quantity }),
        ...(routeMultiplier === undefined ? {} : { routeMultiplier }),
      });
    },
    hasObservedRows(): boolean {
      const observed = pending?.observed;
      return (
        observed !== undefined &&
        observed.rows.length > 0 &&
        (observed.mode === "regional" ||
          observed.quantity !== undefined ||
          Boolean(
            readProperty(readProperty(observed.root, "race"), "no_trade"),
          ))
      );
    },
    completeDraw(succeeded: boolean): MarketBoard | undefined {
      const observed = pending?.observed;
      pending = undefined;
      if (
        !succeeded ||
        observed === undefined ||
        observed.rows.length === 0 ||
        (observed.mode === "global" &&
          observed.quantity === undefined &&
          !readProperty(readProperty(observed.root, "race"), "no_trade"))
      )
        return undefined;
      board = observed;
      if (isCurrent(board)) return board;
      board = undefined;
      invalidations += 1;
      return undefined;
    },
  });
}
