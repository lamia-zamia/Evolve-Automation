/**
 * The running bundle's A.R.P.A. project mechanics, captured once and then reused.
 *
 * Deployed Evolve is an esbuild IIFE, so there is no module graph to import and no namespace that
 * exports anything: a second import of `src/arpa.js` would build a second copy with a different
 * private `global` and operate on nothing. The only real authority is the lexical scope the bundle
 * already closed over, and the one moment the page reaches this script inside it is the Physics draw.
 *
 * Pinned `src/arpa.js` does exactly two things a draw cannot hide:
 *
 *   - `physics()` enumerates the private `arpaProjects` registry with `Object.keys`, then binds each
 *     offered project through `vBind`;
 *   - that binding declares `build(pro,num)` and `arpaProjectSRCosts(id,project)`, whose bodies close
 *     over the bundle's own `buildArpa`, `arpaProjects`, `arpaAdjustCosts`, and `global`.
 *
 * So one controlled draw observes the registry on the page realm's `Object.keys` and takes the two
 * generic closures off the same draw's binding configuration. Afterwards, offer membership, exact
 * price, and purchase are answered by those closures: the panel is never drawn again, no popover is
 * hovered, and no displayed (rounded) figure is ever parsed.
 */

import type {
  CapturedArpaBuildPlan,
  CapturedArpaBuildResult,
  CapturedArpaCapture,
  CapturedArpaMechanics,
  CapturedArpaOffer,
} from "../../../../ports/captured-arpa-mechanics.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type { VueBindingObserver } from "../../vue-capture.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
} from "../../captured-tab-discovery.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";
import {
  arpaProjectIdFromElementId,
  isBuildableArpaProjectId,
} from "./arpa-project-identity.ts";

/**
 * The two generic methods pinned `addProject` declares on every project row. `build` runs the bundle's
 * own `buildArpa`, and `arpaProjectSRCosts` is the one place a binding calls `arpaAdjustCosts` on a
 * project's own cost record.
 */
const ARPA_BUILD_METHOD = "build";
const ARPA_NATIVE_COST_METHOD = "arpaProjectSRCosts";

/** The one controlled draw this adapter ever asks for. */
const ARPA_TAB_PATH = Object.freeze([
  Object.freeze({
    setting: MAIN_TAB_SETTING,
    control: MAIN_TAB_CONTROL,
    index: MAIN_TAB_INDEX.arpa,
  }),
]);

interface ArpaAuthority {
  /** The running bundle's private `arpaProjects` record. Never leaves this module. */
  readonly registry: Record<string, unknown>;
  /** `Object.keys(arpaProjects)`, in the display order `physics()` enumerates it in. */
  readonly order: readonly string[];
  readonly build: (...args: unknown[]) => unknown;
  readonly nativeCosts: (...args: unknown[]) => unknown;
}

type ArpaCaptureFailure = { readonly reason: string };

export interface CapturedArpaMechanicsDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  /** The page realm, for the `Object.keys` the draw is observed through. */
  readonly pageWindow: unknown;
  /** Every `vBind` configuration the capture records, with the game-owned closures it declared. */
  readonly bindings: VueBindingObserver;
  readonly onDiagnostic?: (message: string) => void;
}

/**
 * A page-realm `Object.keys` observation, installed for the length of one synchronous draw or one
 * synchronous probe and removed in a `finally`. The observer is handed the key list the page's own
 * call returned, so it never re-enters the hook.
 */
function observePageKeys(
  pageWindow: unknown,
  observe: (receiver: unknown, keys: readonly string[]) => void,
): (() => void) | undefined {
  const pageObject = readProperty(pageWindow, "Object");
  const nativeKeys = readProperty(pageObject, "keys");
  if (typeof pageObject !== "function" || typeof nativeKeys !== "function")
    return undefined;
  let active = true;
  const probe = function arpaPageKeysProbe(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const result = Reflect.apply(
      nativeKeys as (...rest: unknown[]) => unknown,
      this,
      args,
    );
    if (active && args.length === 1 && Array.isArray(result)) {
      try {
        observe(args[0], result);
      } catch {
        /* An observation must never disturb the page's own enumeration. */
      }
    }
    return result;
  };
  try {
    Reflect.set(pageObject, "keys", probe);
  } catch {
    return undefined;
  }
  return () => {
    active = false;
    if (readProperty(pageObject, "keys") === probe) {
      try {
        Reflect.set(pageObject, "keys", nativeKeys);
      } catch {
        /* A frozen constructor leaves the probe forwarding to the page's own call. */
      }
    }
  };
}

/**
 * Observe the record whose `Object.keys(...).forEach(...)` loop encloses the native A.R.P.A.
 * display's `toFixed(0)`. Adjustment stages can replace resource ids, so the raw project record
 * cannot identify the final record. This hook exists only during one synchronous cost-closure call.
 */
function observeArpaFinalCostIteration(
  pageWindow: unknown,
  observe: (receiver: unknown) => void,
): (() => void) | undefined {
  const pageObject = readProperty(pageWindow, "Object");
  const nativeKeys = readProperty(pageObject, "keys");
  const numberConstructor = readProperty(pageWindow, "Number");
  const numberPrototype = readProperty(numberConstructor, "prototype");
  const nativeToFixed = readProperty(numberPrototype, "toFixed");
  if (
    typeof pageObject !== "function" ||
    typeof nativeKeys !== "function" ||
    !isNonArrayRecord(numberPrototype) ||
    typeof nativeToFixed !== "function"
  )
    return undefined;

  let active = true;
  let activeReceiver: unknown;
  const patchedArrays: object[] = [];
  const keysProbe = function arpaFinalCostKeysProbe(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const result = Reflect.apply(
      nativeKeys as (...rest: unknown[]) => unknown,
      this,
      args,
    );
    if (
      !active ||
      args.length !== 1 ||
      !isNonArrayRecord(args[0]) ||
      !Array.isArray(result)
    )
      return result;

    const receiver = args[0];
    const nativeForEach = readProperty(result, "forEach");
    if (typeof nativeForEach !== "function") return result;
    const forEachProbe = function arpaFinalCostForEachProbe(
      this: unknown,
      ...iterationArgs: unknown[]
    ): unknown {
      const callback = iterationArgs[0];
      if (this !== result || typeof callback !== "function")
        return Reflect.apply(nativeForEach, this, iterationArgs);
      const forwardingCallback = function arpaFinalCostIterationCallback(
        this: unknown,
        ...callbackArgs: unknown[]
      ): unknown {
        const previousReceiver = activeReceiver;
        activeReceiver = receiver;
        try {
          return Reflect.apply(callback, this, callbackArgs);
        } finally {
          activeReceiver = previousReceiver;
        }
      };
      return Reflect.apply(nativeForEach, this, [
        forwardingCallback,
        iterationArgs[1],
      ]);
    };
    if (
      Reflect.defineProperty(result, "forEach", {
        configurable: true,
        writable: true,
        value: forEachProbe,
      })
    )
      patchedArrays.push(result);
    return result;
  };
  const toFixedProbe = function arpaFinalCostToFixedProbe(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const result = Reflect.apply(
      nativeToFixed as (...rest: unknown[]) => unknown,
      this,
      args,
    );
    if (active && args[0] === 0 && activeReceiver !== undefined) {
      try {
        observe(activeReceiver);
      } catch {
        /* An observation must never change the game's native formatting result. */
      }
    }
    return result;
  };

  if (!Reflect.set(pageObject, "keys", keysProbe)) return undefined;
  if (!Reflect.set(numberPrototype, "toFixed", toFixedProbe)) {
    Reflect.set(pageObject, "keys", nativeKeys);
    return undefined;
  }
  return () => {
    if (!active) return;
    active = false;
    for (const array of patchedArrays) Reflect.deleteProperty(array, "forEach");
    if (readProperty(pageObject, "keys") === keysProbe)
      Reflect.set(pageObject, "keys", nativeKeys);
    if (readProperty(numberPrototype, "toFixed") === toFixedProbe)
      Reflect.set(numberPrototype, "toFixed", nativeToFixed);
  };
}

/**
 * Whether a record is shaped like one `arpaProjects` entry. This runs on every `Object.keys` receiver
 * a draw produces, so it has to be cheap and specific: `reqs` names required levels, `grant` names the
 * tech key the project grants, and `cost` is the resource bag of cost functions.
 */
function looksLikeArpaEntry(value: unknown): boolean {
  if (!isNonArrayRecord(value)) return false;
  return (
    isNonArrayRecord(value["reqs"]) &&
    isNonArrayRecord(value["cost"]) &&
    typeof value["grant"] === "string"
  );
}

function looksLikeArpaRegistry(value: unknown): boolean {
  if (!isNonArrayRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => looksLikeArpaEntry(value[key]));
}

/** The one path label pinned `checkRequirements` derives, in its own order. */
function arpaContentPath(race: Readonly<Record<string, unknown>>): string {
  return race["iceage"] ? "iceage" : race["truepath"] ? "truepath" : "standard";
}

/** The reading every `game.arpa` record is compared by when one mutation has to be attributed. */
function describeArpaRecord(value: unknown): string {
  if (!isNonArrayRecord(value)) return JSON.stringify(value) ?? "undefined";
  return `${String(value["rank"])}/${String(value["complete"])}`;
}

/** Whether two amounts of one resource are the same figure, absorbing only the summation. */
function sameAmount(actual: number, expected: number): boolean {
  if (actual === expected) return true;
  return Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9;
}

function sameCosts(
  current: Readonly<Record<string, number>>,
  sampled: Readonly<Record<string, number>>,
): boolean {
  const keys = Object.keys(current);
  if (keys.length !== Object.keys(sampled).length) return false;
  return keys.every((key) => current[key] === sampled[key]);
}

export function createCapturedArpaMechanics(
  dependencies: CapturedArpaMechanicsDependencies,
): CapturedArpaMechanics {
  const { rootState, discovery, pageWindow, bindings } = dependencies;
  const reportDiagnostic = dependencies.onDiagnostic ?? (() => {});

  let authority: ArpaAuthority | undefined;
  /** The root the last bootstrap attempt failed against, so one failure is one draw. */
  let failedForRoot: unknown = undefined;
  /**
   * The final adjusted native cost record for one project, or `undefined` when the record consumed
   * by the native display loop could not be identified.
   *
   * The native closure enumerates this record for its final per-resource display loop and calls
   * `toFixed(0)` within each callback. Observing that semantic boundary identifies the adjusted
   * record even when an adjustment replaces resource ids. The captured functions are immediately
   * evaluated for this read only: adjustment wrappers are constructed from current game state each
   * time the native closure runs, so neither those wrappers nor their record can be cached.
   */
  const captureAdjustedCosts = (
    projectId: string,
  ): Readonly<Record<string, () => number>> | undefined => {
    const current = authority;
    if (current === undefined) return undefined;
    let adjustedReceiver: unknown;
    let conflictingReceivers = false;
    const restore = observeArpaFinalCostIteration(pageWindow, (receiver) => {
      if (adjustedReceiver === undefined) adjustedReceiver = receiver;
      else if (adjustedReceiver !== receiver) conflictingReceivers = true;
    });
    if (restore === undefined) return undefined;
    try {
      // `'1'` avoids the `'100'` branch, the only path that reads project progress first.
      Reflect.apply(current.nativeCosts, undefined, ["1", projectId]);
    } catch {
      return undefined;
    } finally {
      restore();
    }
    if (
      conflictingReceivers ||
      !isNonArrayRecord(adjustedReceiver) ||
      Object.keys(adjustedReceiver).length === 0
    )
      return undefined;
    const costs: Record<string, () => number> = {};
    for (const resource of Object.keys(adjustedReceiver)) {
      const cost = adjustedReceiver[resource];
      if (typeof cost !== "function") return undefined;
      costs[resource] = cost as () => number;
    }
    if (Object.keys(costs).length === 0) return undefined;
    return Object.freeze(costs);
  };

  const readPercentCosts = (
    projectId: string,
  ): Readonly<Record<string, number>> | undefined => {
    const functions = captureAdjustedCosts(projectId);
    if (functions === undefined) return undefined;
    const priced: Record<string, number> = {};
    for (const [resource, cost] of Object.entries(functions)) {
      let value: number;
      try {
        value = Number(cost());
      } catch {
        return undefined;
      }
      // `payArpaCosts` spends `cost() / 100`; the display path rounds that, and this is the price the
      // purchase actually pays.
      const perPercent = value / 100;
      if (!Number.isFinite(perPercent) || perPercent < 0) return undefined;
      if (perPercent > 0) priced[resource] = perPercent;
    }
    return Object.freeze(priced);
  };

  const readArpaRecords = (
    root: unknown,
  ): Record<string, unknown> | undefined => {
    const arpa = readProperty(root, "arpa");
    return isNonArrayRecord(arpa) ? arpa : undefined;
  };

  const readTechRecords = (
    root: unknown,
  ): Record<string, unknown> | undefined => {
    const tech = readProperty(root, "tech");
    return isNonArrayRecord(tech) ? tech : undefined;
  };

  const readResourceAmount = (root: unknown, resourceId: string): unknown =>
    readProperty(
      readProperty(readProperty(root, "resource"), resourceId),
      "amount",
    );

  /**
   * Pinned `addProject` initializes an offered project it has never seen as `{complete: 0, rank: 0}`
   * and then reads it. Reading must not mutate state, so an absent offered record is answered as rank
   * and progress zero here; the build path is the only place that writes it.
   */
  const readProjectState = (
    arpa: Readonly<Record<string, unknown>>,
    projectId: string,
  ): { rank: number; progress: number } | undefined => {
    const state = arpa[projectId];
    if (state === undefined) return { rank: 0, progress: 0 };
    if (!isNonArrayRecord(state)) return undefined;
    const rank = state["rank"];
    const progress = state["complete"];
    return typeof rank === "number" &&
      Number.isSafeInteger(rank) &&
      rank >= 0 &&
      typeof progress === "number" &&
      Number.isSafeInteger(progress) &&
      progress >= 0
      ? { rank, progress }
      : undefined;
  };

  const readOffers = (
    root: unknown,
  ): readonly Readonly<CapturedArpaOffer>[] | undefined => {
    const current = authority;
    if (current === undefined) return undefined;
    const arpa = readArpaRecords(root);
    const tech = readTechRecords(root);
    const race = readProperty(root, "race");
    if (arpa === undefined || tech === undefined || !isNonArrayRecord(race))
      return undefined;
    const offers: CapturedArpaOffer[] = [];
    for (const projectId of current.order) {
      const offered = isOffered(root, current.registry, projectId, tech, race);
      if (offered === undefined) return undefined;
      if (!offered) continue;
      const state = readProjectState(arpa, projectId);
      if (state === undefined) return undefined;
      const percentCosts = readPercentCosts(projectId);
      if (percentCosts === undefined) return undefined;
      offers.push(
        Object.freeze({
          projectId,
          rank: state.rank,
          progress: state.progress,
          percentCosts,
        }),
      );
    }
    return Object.freeze(offers);
  };

  /** Whether the draw left behind the registry and one A.R.P.A. project binding of that same draw. */
  const readDrawResult = (
    bound: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
    observed: readonly unknown[],
  ): ArpaAuthority | ArpaCaptureFailure => {
    const matching = observed
      .filter(looksLikeArpaRegistry)
      .filter((candidate) =>
        [...bound.keys()].every((projectId) =>
          Object.hasOwn(candidate as Record<string, unknown>, projectId),
        ),
      );
    if (matching.length !== 1)
      return {
        reason:
          matching.length === 0
            ? "the native project registry was not observed on the Physics draw"
            : "the Physics draw exposed more than one candidate project registry",
      };
    for (const [projectId, methods] of bound) {
      const build = methods[ARPA_BUILD_METHOD];
      const nativeCosts = methods[ARPA_NATIVE_COST_METHOD];
      if (typeof build !== "function" || typeof nativeCosts !== "function")
        return {
          reason: `the native binding for ${projectId} declares no project build or cost method`,
        };
      const registry = matching[0] as Record<string, unknown>;
      return Object.freeze({
        registry,
        order: Object.freeze(Object.keys(registry)),
        build: build as (...args: unknown[]) => unknown,
        nativeCosts: nativeCosts as (...args: unknown[]) => unknown,
      });
    }
    return { reason: "the Physics draw bound no A.R.P.A. project row" };
  };

  const attemptCapture = (): CapturedArpaCapture => {
    const bound = new Map<string, Readonly<Record<string, unknown>>>();
    const observed: unknown[] = [];
    let watching = true;
    const unobserve = bindings((elementId, methods) => {
      if (!watching) return;
      const projectId = arpaProjectIdFromElementId(elementId);
      if (
        projectId !== undefined &&
        isBuildableArpaProjectId(projectId) &&
        !bound.has(projectId)
      )
        bound.set(projectId, methods);
    });
    const restoreKeys = observePageKeys(pageWindow, (receiver) => {
      if (watching) observed.push(receiver);
    });
    try {
      if (restoreKeys === undefined)
        return {
          kind: "unavailable",
          reason: "the page realm exposes no Object.keys to observe",
        };
      const result = discovery.discover(ARPA_TAB_PATH, {
        // The capture is the point of this draw, so a panel the player already has open still has to
        // be rebuilt: only `physics()` enumerates the registry.
        forceDraw: true,
      });
      watching = false;
      if (result.outcome.status !== "succeeded")
        return {
          kind: "unavailable",
          reason: `the Physics draw failed: ${
            result.outcome.failure?.message ?? result.outcome.status
          }`,
        };
    } finally {
      watching = false;
      unobserve();
      restoreKeys?.();
    }
    const captured = readDrawResult(bound, observed);
    if ("reason" in captured) {
      reportDiagnostic(`ARPA native capture: ${captured.reason}`);
      return { kind: "unavailable", reason: captured.reason };
    }
    authority = captured;
    reportDiagnostic(`ARPA native capture: ${captured.order.length} projects`);
    return { kind: "captured" };
  };

  /**
   * Pinned `checkRequirements`, plus the rank cap pinned `addProject` applies after it. The native
   * `condition()` closure decides conditional availability; nothing here knows a project id.
   */
  function isOffered(
    root: unknown,
    registry: Readonly<Record<string, unknown>>,
    projectId: string,
    tech: Readonly<Record<string, unknown>>,
    race: Readonly<Record<string, unknown>>,
  ): boolean | undefined {
    const project = registry[projectId];
    if (!isNonArrayRecord(project)) return false;
    const condition = project["condition"];
    if (typeof condition === "function" && !condition()) return false;
    if (Object.hasOwn(project, "path")) {
      const paths = project["path"];
      if (!Array.isArray(paths) || !paths.includes(arpaContentPath(race)))
        return false;
    }
    const reqs = project["reqs"];
    if (!isNonArrayRecord(reqs)) return false;
    for (const requirement of Object.keys(reqs)) {
      const level = tech[requirement];
      if (!level || Number(level) < Number(reqs[requirement])) return false;
    }
    const arpa = readArpaRecords(root);
    const state =
      arpa === undefined ? undefined : readProjectState(arpa, projectId);
    if (state === undefined) return undefined;
    const cap = project["rank"];
    return !cap || state.rank < Number(cap);
  }

  return Object.freeze({
    ensureCaptured(): CapturedArpaCapture {
      if (authority !== undefined) return { kind: "captured" };
      const root = rootState.readRoot();
      if (root === undefined)
        return {
          kind: "unavailable",
          reason: "the game root has not been captured yet",
        };
      if (failedForRoot === root)
        return {
          kind: "unavailable",
          reason: "the native A.R.P.A. capture already failed for this root",
        };
      failedForRoot = root;
      return attemptCapture();
    },

    readOffers(root: unknown) {
      return readOffers(root);
    },

    buildPercent(
      root: unknown,
      plan: Readonly<CapturedArpaBuildPlan>,
    ): CapturedArpaBuildResult {
      const current = authority;
      if (current === undefined)
        return {
          kind: "unavailable",
          reason: "the native A.R.P.A. mechanics have not been captured",
        };
      if (rootState.readRoot() !== root)
        return { kind: "stale", reason: "the game root was replaced" };
      const arpa = readArpaRecords(root);
      const tech = readTechRecords(root);
      const race = readProperty(root, "race");
      if (
        arpa === undefined ||
        tech === undefined ||
        !isNonArrayRecord(race) ||
        !Object.hasOwn(current.registry, plan.projectId)
      )
        return {
          kind: "stale",
          reason: "the project left the native registry",
        };
      const offered = isOffered(
        root,
        current.registry,
        plan.projectId,
        tech,
        race,
      );
      if (offered === undefined)
        return {
          kind: "stale",
          reason: "the project offer state is unreadable",
        };
      if (!offered)
        return { kind: "stale", reason: "the project is no longer offered" };
      const state = readProjectState(arpa, plan.projectId);
      if (state === undefined)
        return { kind: "stale", reason: "the project state is unreadable" };
      if (state.rank !== plan.rank || state.progress !== plan.progress)
        return {
          kind: "stale",
          reason: `${plan.projectId} moved from ${plan.rank}:${plan.progress} to ${state.rank}:${state.progress} after sampling`,
        };
      if (
        !Number.isSafeInteger(plan.percent) ||
        plan.percent < 1 ||
        plan.percent > 100 - state.progress
      )
        return {
          kind: "stale",
          reason:
            "the requested step crosses the rank boundary it was priced for",
        };
      const percentCosts = readPercentCosts(plan.projectId);
      if (percentCosts === undefined)
        return {
          kind: "unavailable",
          reason: "the exact native cost record is unreadable",
        };
      if (!sameCosts(percentCosts, plan.percentCosts))
        return {
          kind: "stale",
          reason: "the exact native cost changed after it was sampled",
        };
      if (!isNonArrayRecord(readProperty(root, "resource")))
        return { kind: "stale", reason: "the resource ledger is unreadable" };
      const amounts: Record<string, number> = {};
      for (const [resourceId, perPercent] of Object.entries(percentCosts)) {
        const amount = readResourceAmount(root, resourceId);
        if (typeof amount !== "number" || !Number.isFinite(amount))
          return {
            kind: "stale",
            reason: `the ${resourceId} ledger is unreadable`,
          };
        if (amount < perPercent * plan.percent)
          return {
            kind: "stale",
            reason: `the project can no longer afford its ${resourceId} cost`,
          };
        amounts[resourceId] = amount;
      }
      if (arpa[plan.projectId] === undefined) {
        // Exactly the record pinned `addProject` writes before its first read of an offered project.
        arpa[plan.projectId] = { complete: 0, rank: 0 };
      }
      // `global.arpa` also holds native metadata such as Monument's `m_type`. Only ids in the
      // captured `arpaProjects` registry are project records whose mutation this bracket owns.
      const before = new Map<string, string>();
      for (const projectId of current.order) {
        if (projectId === plan.projectId) continue;
        before.set(
          projectId,
          Object.hasOwn(arpa, projectId)
            ? `present:${describeArpaRecord(arpa[projectId])}`
            : "absent",
        );
      }
      const beforeState = readProjectState(arpa, plan.projectId);
      if (beforeState === undefined)
        return { kind: "stale", reason: "the project state is unreadable" };
      let failure: string | undefined;
      try {
        Reflect.apply(current.build, undefined, [plan.projectId, plan.percent]);
      } catch (error) {
        failure = String(error);
      }
      const rootAfter = rootState.readRoot();
      const afterArpa = readArpaRecords(rootAfter);
      const afterState =
        afterArpa === undefined
          ? undefined
          : readProjectState(afterArpa, plan.projectId);
      if (failure !== undefined)
        return { kind: "stale", reason: `the native build threw: ${failure}` };
      if (afterState === undefined)
        return { kind: "stale", reason: "the project state vanished" };
      // Pinned `buildArpa` advances `complete` per percent and carries it into `rank` at 100, so the
      // two together are one monotonic total and the step count is their difference.
      const paidSteps =
        afterState.rank * 100 +
        afterState.progress -
        (beforeState.rank * 100 + beforeState.progress);
      // One decision buys exactly the percentage points it priced. A partial native purchase no
      // longer matches the sampled reservation, and an excess purchase exceeds that authority.
      if (paidSteps !== plan.percent)
        return {
          kind: "stale",
          reason: `the native build moved ${paidSteps} of ${plan.percent} points`,
        };
      if (afterState.progress >= 100)
        return {
          kind: "stale",
          reason: "the native build left an inconsistent project progress",
        };
      if (afterArpa !== undefined) {
        for (const [projectId, value] of before) {
          const afterValue = Object.hasOwn(afterArpa, projectId)
            ? `present:${describeArpaRecord(afterArpa[projectId])}`
            : "absent";
          if (value === "absent" && afterValue !== "absent")
            return {
              kind: "stale",
              reason: "the native build added an unrelated project record",
            };
          if (afterValue !== value)
            return {
              kind: "stale",
              reason: "the native build changed an unrelated project record",
            };
        }
      }
      const charged: Record<string, number> = {};
      if (afterState.rank !== beforeState.rank) {
        // The boundary point is paid before pinned `buildArpa` increments rank, so every requested
        // point still uses the sampled old-rank per-percent cost.
        const grant = readProperty(current.registry[plan.projectId], "grant");
        if (
          typeof grant !== "string" ||
          readProperty(tech, grant) !== afterState.rank
        )
          return {
            kind: "stale",
            reason: "the native build did not grant the completed rank",
          };
      }
      for (const [resourceId, perPercent] of Object.entries(percentCosts)) {
        const after = readResourceAmount(rootAfter, resourceId);
        const beforeAmount = amounts[resourceId];
        if (
          typeof after !== "number" ||
          typeof beforeAmount !== "number" ||
          !sameAmount(beforeAmount - after, perPercent * plan.percent)
        )
          return {
            kind: "stale",
            reason: `the native build spent an unexpected ${resourceId} amount`,
          };
        charged[resourceId] = beforeAmount - after;
      }
      return Object.freeze({
        kind: "built" as const,
        rank: afterState.rank,
        progress: afterState.progress,
        charged: Object.freeze(charged),
      });
    },
  });
}
