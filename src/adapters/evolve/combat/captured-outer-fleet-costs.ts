/**
 * The Dwarf Shipyard's own cost row, as the only price this script may quote.
 *
 * DeadSpace answers "what does this design cost, and can the yard pay it" in exactly one place.
 * `updateCosts()` calls the module-private `shipCosts(global.space.shipyard.blueprint)`, resolves the
 * paying pool with `actionPool(shipyardPayer())`, writes that pool as `data-pool` on `#shipYardCosts`,
 * and appends one `res-<resource>` span per cost carrying the exact amount as `data-<resource>`, the
 * game's own success class chosen by `poolHeld(resource, pool) >= cost`, and `data-ok` naming the
 * class that means "affordable". So the row already holds the authoritative `shipCosts()` answer
 * *and* the game's own current-stock verdict for the active regional supply pool. Restating either
 * half here would be a second, worse copy of a formula the game owns, and comparing a cost to
 * `global.resource[resource].amount` would lose the supply pool the row was priced against.
 *
 * **A row the game drew is read, and a design the game has not drawn is priced by the game.** Two
 * page states own a real `#shipYardCosts`: preload mode, where `loadTab('mTabCivic')` calls
 * `drawShipYard()` itself and every subsequent `setVal()` re-emits the row, and a yard the player is
 * looking at, refreshed by the same draws and by `buildTPShip()`. That row is proven to belong to the
 * yard by living inside the game's own `#shipPlans`, in the spirit of the rendered `shipReg*` proof:
 * a scratch capture's element is long gone, and a registry control cannot vouch for markup.
 *
 * Off-tab there is no row at all, and `CapturedFleetDemand` and the outer fleet both still need a
 * price. So an arbitrary design is priced *by the game*: the player's Civic panel is put beyond the
 * game's DOM reach with `GamePanelWorkspace` — which is what takes the real `#shipPlans` and
 * `#shipYardCosts` out of `$('#shipYardCosts')` — a single hidden `#shipYardCosts` the capture owns
 * is stood up instead, and the design is applied through the captured `shipPlans.setVal`, so the
 * game's own `updateCosts()` runs inside that call and writes its own answer into the capture's
 * element. Nothing is calculated here.
 *
 * **Nothing the probe borrows outlives it.** The live blueprint is snapshotted key for key
 * immediately before the first write and restored in `finally`, the scratch element is removed, the
 * workspace is released, and the restore is *proved* before any sample is returned — so a design that
 * cannot be put back is reported as no price at all rather than as a price for a yard left in a
 * state the player never chose. The forward path only ever writes through `setVal`; a raw assignment
 * appears nowhere.
 *
 * The design is applied in the same order a real build applies it, because upstream's class
 * transitions are order-sensitive (`captured-outer-fleet-blueprint.ts`). That is what makes a class
 * probe faithful: the explorer and freighter rewrites are the game's own, and the snapshot restores
 * exactly what they overwrote.
 *
 * The whole probe is one synchronous task and mounts nothing: `setVal` reaches
 * `vBind({el:'#shipPlans'},'update')`, which finds no element because the panel is aliased away, and
 * mounting stays suppressed regardless.
 */
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../../../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  GameShipyardCosts,
  ShipyardCostAmount,
  ShipyardCostSample,
} from "../../../ports/game-shipyard-costs.ts";
import { MAIN_TAB_INDEX, MAIN_TAB_PANELS } from "../captured-tab-discovery.ts";
import {
  isRecord,
  readProperty,
  type UnknownRecord,
} from "../../validation.ts";
import { outerFleetBlueprintWrites } from "./captured-outer-fleet-blueprint.ts";
import {
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID,
  hiddenHostElement,
  removeHiddenHostElement,
  renderedElementInside,
} from "./captured-outer-fleet-shipyard.ts";

/** The blueprint write the game-owned `updateCosts()` hang on, and the only method the probe uses. */
const SHIPYARD_SET_VAL_METHOD = "setVal";

/** The attribute `updateCosts()` names the paying pool with, when it names one at all. */
const SHIPYARD_POOL_ATTRIBUTE = "data-pool";

/**
 * The attribute `updateCosts()` writes naming the class that means "affordable right now". Its *value*
 * is the answer for each row, so the meaning is never restated here — only the attribute's name.
 */
const SHIPYARD_SUCCESS_ATTRIBUTE = "data-ok";

/** The class prefix `updateCosts()` gives each resource it prices. */
const SHIPYARD_RESOURCE_CLASS = "res-";

/** The slice of a rendered element this parser reads, and nothing else. */
interface ShipyardCostNode {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<ShipyardCostNode>;
}

export interface CapturedOuterFleetCostsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly panels: GamePanelWorkspace;
  readonly mountSuppression: GameMountSuppression;
  readonly getDocument: () => unknown;
  /** Reports a fault in the capture itself, never a game fault. */
  readonly onCaptureError?: (detail: string) => void;
}

/** The yard's blueprint exactly as it stood before a probe touched it. */
interface BlueprintSnapshot {
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
}

function shipyardCostNode(value: unknown): ShipyardCostNode | undefined {
  return isRecord(value) &&
    typeof value["getAttribute"] === "function" &&
    typeof value["querySelectorAll"] === "function"
    ? (value as unknown as ShipyardCostNode)
    : undefined;
}

function classTokens(node: ShipyardCostNode): readonly string[] {
  const value = node.getAttribute("class");
  return value === null
    ? []
    : value.split(/\s+/).filter((token) => token !== "");
}

/** The resource ids this element names, one per `res-*` class token, in the markup's own order. */
function namedResources(tokens: readonly string[]): readonly string[] {
  return tokens
    .filter(
      (token) =>
        token.startsWith(SHIPYARD_RESOURCE_CLASS) &&
        token.length > SHIPYARD_RESOURCE_CLASS.length,
    )
    .map((token) => token.slice(SHIPYARD_RESOURCE_CLASS.length));
}

/**
 * Whether the game currently calls this resource affordable, asked of the row itself.
 *
 * `data-ok` names the class that means it, and the answer is whether the resource element carries
 * that class. Reading the value rather than assuming `has-text-success` is what keeps this following
 * the game if its palette of "affordable" ever changes.
 */
function carriesSuccessClass(
  node: ShipyardCostNode,
  tokens: readonly string[],
): boolean {
  const success = node.getAttribute(SHIPYARD_SUCCESS_ATTRIBUTE);
  return success !== null && success !== "" && tokens.includes(success);
}

/**
 * One cost, read off the row the game emitted.
 *
 * The resource id comes from the `res-*` class and the amount from the `data-<resource>` attribute
 * upstream writes beside it — HTML lowercases attribute names, so the lookup is lowercased the way
 * the game wrote it. Zero is a real figure (`shipCosts()` raises an absent resource's entry to a
 * power, which yields zero), so only a non-finite or negative amount is malformed.
 */
function readCostAmount(
  node: ShipyardCostNode,
  resourceId: string,
): ShipyardCostAmount | undefined {
  const raw = node.getAttribute(`data-${resourceId.toLowerCase()}`);
  if (raw === null) return undefined;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Object.freeze({
    resourceId,
    amount,
    affordable: carriesSuccessClass(node, classTokens(node)),
  });
}

/**
 * The whole cost row, as the game wrote it.
 *
 * Refused rather than guessed at: markup naming no resource, a resource with no amount, a second
 * element for a resource already priced, an element naming two resources, or anything that is not a
 * readable node. Each of those is a shape the game does not emit, so a caller that received one would
 * be reading an answer to a different question.
 *
 * The list is ordered by resource id, so two samples of the same design compare directly no matter
 * what order the game's object keys happened to be iterated in.
 */
function parseShipyardCostRow(
  element: unknown,
): ShipyardCostSample | undefined {
  const row = shipyardCostNode(element);
  if (row === undefined) return undefined;
  const named = new Map<string, ShipyardCostAmount>();
  const nodes: readonly unknown[] = [
    row,
    ...Array.from(row.querySelectorAll("*")),
  ];
  for (const node of nodes) {
    const costNode = shipyardCostNode(node);
    if (costNode === undefined) return undefined;
    const resourceIds = namedResources(classTokens(costNode));
    if (resourceIds.length === 0) continue;
    if (resourceIds.length > 1) return undefined;
    const [resourceId] = resourceIds;
    if (resourceId === undefined || named.has(resourceId)) return undefined;
    const amount = readCostAmount(costNode, resourceId);
    if (amount === undefined) return undefined;
    named.set(resourceId, amount);
  }
  if (named.size === 0) return undefined;
  const rawPool = row.getAttribute(SHIPYARD_POOL_ATTRIBUTE);
  return Object.freeze({
    pool: rawPool === null || rawPool === "" ? undefined : rawPool,
    amounts: Object.freeze(
      [...named.values()].sort((left, right) =>
        left.resourceId < right.resourceId
          ? -1
          : left.resourceId > right.resourceId
            ? 1
            : 0,
      ),
    ),
  });
}

/** Whether the page has a real cost row at all, and what it says when it has one. */
interface RenderedCostRow {
  readonly present: boolean;
  readonly sample: ShipyardCostSample | undefined;
}

const NO_RENDERED_ROW: RenderedCostRow = Object.freeze({
  present: false,
  sample: undefined,
});

/**
 * The cost row the game itself rendered, and only when it sits inside the yard the game owns.
 *
 * Silent when the page has simply not drawn one: that is the normal case everywhere but the shipyard,
 * and a fault on every off-tab price would say nothing. A row that is there and cannot be read is a
 * different thing — the yard drew a price this script cannot answer with — so it is reported, and
 * `present` keeps that from being mistaken for an absent row the game should be asked about instead.
 */
function renderedCostRow(
  dependencies: CapturedOuterFleetCostsDependencies,
): RenderedCostRow {
  const row = renderedElementInside(
    dependencies.getDocument(),
    CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
    CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID,
  );
  if (row === undefined) return NO_RENDERED_ROW;
  const sample = parseShipyardCostRow(row);
  if (sample === undefined) {
    dependencies.onCaptureError?.(
      `the rendered ${CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID} could not be read`,
    );
  }
  return Object.freeze({ present: true, sample });
}

/** The yard's live blueprint, or `undefined` for a save with no yard to price anything against. */
function liveBlueprint(
  dependencies: CapturedOuterFleetCostsDependencies,
): unknown {
  const yard = readProperty(
    readProperty(dependencies.rootState.readRoot(), "space"),
    "shipyard",
  );
  return readProperty(yard, "blueprint");
}

function blueprintSnapshot(blueprint: UnknownRecord): BlueprintSnapshot {
  const values: Record<string, unknown> = {};
  const keys: string[] = [];
  for (const key of Object.keys(blueprint)) {
    keys.push(key);
    values[key] = blueprint[key];
  }
  return Object.freeze({
    keys: Object.freeze(keys),
    values: Object.freeze(values),
  });
}

function restoreBlueprint(
  blueprint: UnknownRecord,
  snapshot: BlueprintSnapshot,
): void {
  for (const key of Object.keys(blueprint)) {
    if (!Object.hasOwn(snapshot.values, key)) delete blueprint[key];
  }
  for (const key of snapshot.keys) blueprint[key] = snapshot.values[key];
}

/** Key for key and in order, because a blueprint the yard would read differently is not restored. */
function blueprintRestored(
  blueprint: UnknownRecord,
  snapshot: BlueprintSnapshot,
): boolean {
  const keys = Object.keys(blueprint);
  if (keys.length !== snapshot.keys.length) return false;
  return snapshot.keys.every(
    (key, index) =>
      keys[index] === key && blueprint[key] === snapshot.values[key],
  );
}

/**
 * Whether the design is already the one the yard holds, so the game's rendered row is its price.
 *
 * A field the yard already has the candidate's value for needs no write, so asking the game's own
 * row is the honest answer and the cheapest one. Anything else has to be priced, because upstream's
 * `setVal('class', …)` rewrites fields the candidate does not even name.
 */
function designAlreadyHeld(
  candidate: Readonly<Record<PropertyKey, unknown>>,
  live: UnknownRecord,
): boolean {
  return outerFleetBlueprintWrites(candidate).every(
    (write) => live[write.type] === write.part,
  );
}

export function createCapturedOuterFleetCosts(
  dependencies: CapturedOuterFleetCostsDependencies,
): GameShipyardCosts {
  const reportError = dependencies.onCaptureError ?? (() => {});
  // One probe at a time: a price must never be taken while another one holds the yard's blueprint.
  let probing = false;

  /**
   * The game's own price for a design that is not applied, taken by applying it for the length of
   * one synchronous call and reading what `updateCosts()` wrote about it.
   */
  function probe(
    blueprint: Readonly<Record<PropertyKey, unknown>>,
  ): ShipyardCostSample | undefined {
    if (probing || !dependencies.mountSuppression.available) return undefined;
    const control = dependencies.controls.resolve(
      CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
    );
    if (
      control === undefined ||
      !control.methods.includes(SHIPYARD_SET_VAL_METHOD)
    )
      return undefined;
    const live = liveBlueprint(dependencies);
    if (!isRecord(live)) return undefined;
    const civicPanel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civic];
    if (civicPanel === undefined) return undefined;
    // Refused rather than opened without protection: this is the only thing standing between the
    // game's `$('#shipYardCosts')` and the player's own cost row.
    const workspace = dependencies.panels.open({
      keep: civicPanel,
      scratch: civicPanel,
    });
    if (workspace === undefined) {
      reportError("the Civic panel could not be put beyond the game's reach");
      return undefined;
    }
    const host = hiddenHostElement(
      dependencies.getDocument(),
      CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID,
    );
    if (host === undefined) {
      workspace.release();
      reportError(
        `no scratch ${CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID} could be stood up`,
      );
      return undefined;
    }
    const snapshot = blueprintSnapshot(live);
    const writes = outerFleetBlueprintWrites(blueprint);
    let sample: ShipyardCostSample | undefined;
    probing = true;
    try {
      // One `setVal` per part, in the order a real build uses, so the game's own class transitions
      // decide the design and every one of them runs its own `updateCosts()`.
      const applied = dependencies.mountSuppression.withoutMounting(() => {
        for (const write of writes) {
          const result = dependencies.controls.invoke(
            control,
            SHIPYARD_SET_VAL_METHOD,
            [write.type, write.part],
          );
          if (!result.ok) return false;
        }
        // A write the game accepted without applying would leave a price for a design nobody asked
        // for, so the yard holding the design is part of the answer rather than an assumption.
        return writes.every((write) => live[write.type] === write.part);
      });
      // Only after the final part's own `updateCosts()` has run.
      sample = applied ? parseShipyardCostRow(host.element) : undefined;
      if (applied && sample === undefined) {
        reportError(
          `the scratch ${CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID} carried no readable cost`,
        );
      }
    } catch (error) {
      reportError(String(error));
      sample = undefined;
    } finally {
      restoreBlueprint(live, snapshot);
      probing = false;
      const costHostRemoved = removeHiddenHostElement(host);
      workspace.release();
      if (!blueprintRestored(live, snapshot)) {
        reportError(
          "the blueprint could not be put back the way the yard had it",
        );
        sample = undefined;
      }
      if (!costHostRemoved) {
        reportError("the scratch shipYardCosts could not be removed");
        sample = undefined;
      }
      if (!workspace.isIntact()) {
        reportError("the workspace could not put the panels back");
        sample = undefined;
      }
    }
    return sample;
  }

  function price(
    blueprint: Readonly<Record<PropertyKey, unknown>>,
  ): ShipyardCostSample | undefined {
    const live = liveBlueprint(dependencies);
    if (isRecord(live) && designAlreadyHeld(blueprint, live)) {
      const rendered = renderedCostRow(dependencies);
      // A row the yard drew and this cannot read is not an invitation to price off-tab: the yard is
      // already answering, just not in a shape this knows how to read.
      if (rendered.present) return rendered.sample;
    }
    return probe(blueprint);
  }

  return Object.freeze({
    current(): ShipyardCostSample | undefined {
      const rendered = renderedCostRow(dependencies);
      if (rendered.present) return rendered.sample;
      const live = liveBlueprint(dependencies);
      return isRecord(live) ? probe(live) : undefined;
    },
    price,
  });
}
