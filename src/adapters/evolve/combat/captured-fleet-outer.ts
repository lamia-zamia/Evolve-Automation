/** Captured Truepath outer-fleet adapter over the game's root and shipyard controls. */

/**
 * Which hulls, components and specials the yard offers is the game's own answer, and nothing here
 * holds a second copy of it. Every question about a part — whether it can be selected, which design
 * field it fills, whether a built ship is that design — is asked either of the yard's captured
 * blueprint or of the part catalogue read out of the option markup `drawShipYard()` produced
 * (`captured-outer-fleet-parts`). What this module owns is the *policy* around those answers: which
 * fields are worth asking about, in what order to write them, and what counts as the design that was
 * built.
 *
 * **That catalogue is the authority, and it is not authoritative until it is whole.** A cycle samples
 * it once and holds it on the session, and every dimension question below is asked only over
 * dimensions that survived the yard's own live blueprint. An unreadable yard produces no dimensions
 * at all rather than a dimension list of nothing: each question here is a loop or a comparison over
 * dimensions, and an empty list would make availability true for every design, matching true for
 * every ship, and the build postcondition an empty record satisfying any hull the yard appended. The
 * same holds for a catalogue that parsed and is still incomplete, which no per-option reading can
 * see. The execution checks the same authority again before its first write rather than relying on
 * planning having filtered.
 */

import {
  assessAuthorityRemoval,
  type AuthorityPolicyView,
} from "../../../domain/civic/authority.ts";
import {
  planOuterFleetBlueprint,
  planOuterFleetBuild,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
  type OuterFleetAuthorityAssessment,
  type OuterFleetAutomaticPlan,
  type OuterFleetBlueprint,
  type OuterFleetBlueprintInput,
  type OuterFleetBuildReadinessInput,
  type OuterFleetBuildDecision,
  type OuterFleetCandidateInput,
  type OuterFleetCandidatePlan,
  type OuterFleetCycleInput,
  type OuterFleetDecision,
  type OuterFleetReadinessPlan,
  type OuterFleetRegionInput,
  type OuterFleetTargetInput,
  type OuterFleetTargetPlan,
} from "../../../domain/combat/fleet-outer.ts";
import type { GameActivitySink } from "../../../ports/game-message-log.ts";
import type { GameFleetControlsPort } from "../../../ports/game-fleet-controls.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { CapturedOuterFleetDispatchCapture } from "../../../ports/captured-outer-fleet-dispatch.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { GameShipyardCosts } from "../../../ports/game-shipyard-costs.ts";
import type { GameSyndicateMechanics } from "../../../ports/game-syndicate-mechanics.ts";
import type {
  GameShipyardPartCatalog,
  GameShipyardPartCatalogSource,
  GameShipyardPartDimensions,
} from "../../../ports/game-shipyard-parts.ts";
import type {
  OuterFleetExecutor,
  OuterFleetReader,
} from "../../../ports/fleet-outer.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { readCapturedHighPopulationPercent } from "../civic/captured-job-catalog.ts";
import { capturedShipCrewSize } from "./captured-ship-crew-compat.ts";
import {
  finite,
  isRecord,
  readProperty,
  type UnknownRecord,
} from "../../validation.ts";
import {
  outerFleetBlueprintWrites,
  OUTER_FLEET_BLUEPRINT_NAME_FIELD,
} from "./captured-outer-fleet-blueprint.ts";
import { CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL } from "./captured-outer-fleet-shipyard.ts";

interface CapturedOuterFleetAdapterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameFleetControlsPort;
  /** The yard's own `#shipYardCosts`, which is the only price this feature may quote. */
  readonly costs: GameShipyardCosts;
  /** The yard's own option markup, which is the only authority on what parts it offers. */
  readonly parts: GameShipyardPartCatalogSource;
  readonly dispatch: CapturedOuterFleetDispatchCapture;
  /** The running game's own Syndicate result; there is no local arithmetic for this question. */
  readonly syndicate: GameSyndicateMechanics;
  readonly readSettings: () => unknown;
  readonly onActivity?: GameActivitySink;
}

interface CapturedOuterFleetSession {
  readonly root: UnknownRecord;
  readonly sourceUnavailable: boolean;
  /**
   * The yard's own part catalogue, as this cycle found it and as the yard's live design proved it
   * whole, or `undefined` when there was no catalogue or it did not account for every dimension that
   * design names.
   *
   * Held here rather than re-asked per question so the plan and the execution that follows it are
   * judged by one authority: `shipParts` is the game's own module-level data and cannot change under
   * a page, and a plan whose postcondition was built from dimensions the execution can no longer see
   * is a plan nothing can be checked against.
   */
  readonly catalog: GameShipyardPartCatalog | undefined;
  readonly settings: UnknownRecord;
  readonly blueprints: Map<OuterFleetBlueprint, UnknownRecord>;
}

const CAPTURED_OUTER_FLEET_REGIONS = Object.freeze([
  "spc_moon",
  "spc_red",
  "spc_gas",
  "spc_gas_moon",
  "spc_belt",
  "spc_titan",
  "spc_enceladus",
  "spc_triton",
  "spc_makemake",
  "spc_eris",
]);
const CAPTURED_OUTER_FLEET_EXPLORER = Object.freeze({
  class: "explorer",
  armor: "neutronium",
  weapon: "railgun",
  engine: "emdrive",
  power: "elerium",
  sensor: "quantum",
});
function capturedOuterFleetRoot(
  rootState: GameRootStateSource,
): UnknownRecord | undefined {
  const root = rootState.readRoot();
  return isRecord(root) ? root : undefined;
}

function capturedOuterFleetSettings(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function capturedOuterFleetYard(
  root: UnknownRecord,
): UnknownRecord | undefined {
  const yard = readProperty(readProperty(root, "space"), "shipyard");
  return isRecord(yard) ? yard : undefined;
}

function capturedOuterFleetShips(root: UnknownRecord): readonly unknown[] {
  const ships = readProperty(capturedOuterFleetYard(root), "ships");
  return Array.isArray(ships) ? ships : [];
}

/**
 * The design the yard is holding right now, as the game's own captured control carries it.
 *
 * Not the root clone: that is the game's pre-period state and cannot see what a build or a class
 * change did to the yard. Undefined when there is no captured control to ask, and every "already
 * held" question below then answers no, because a yard nothing could be asked about is a yard whose
 * design is unknown rather than an empty one.
 */
function capturedOuterFleetLiveDesign(
  controls: GameFleetControlsPort,
): Readonly<Record<string, unknown>> | undefined {
  return controls.currentDesign(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
}

/**
 * The sampled catalogue, once the yard's own live design has proved it whole.
 *
 * Reading every option is not the same as reading every dimension. Markup that lost all of one
 * dimension's options still parses: what is left runs `0 … n-1` per dimension with no repeat and no
 * duplicate answers for anything, so the catalogue comes back non-empty and authoritative-looking,
 * and every question below is then answered over fewer dimensions than the yard actually has. The
 * failures are silent rather than loud — a preset naming a hull the catalogue never listed asks about
 * nothing at all and is treated as satisfied, and a build postcondition built without `class`
 * accepts every hull the yard could append, which is exactly what a wrong-hull build stub exploits.
 *
 * The yard's live blueprint is the check, and the game supplies it. `drawShipYard()` emits one
 * option per entry of every `shipParts` dimension into the same `#shipPlans`, and normalizes the
 * design it holds to one string entry per dimension plus the ship's `name`. So every string field of
 * that design other than `name` is a dimension the yard rendered options for, and one the catalogue
 * has to account for — which is what proves `class`, `power`, `weapon`, `armor`, `engine`, `sensor`
 * and `special` without a single one of those names being written here.
 *
 * Presence is all this proves, and it has to be: the live *value* is not required to be an option
 * the yard would offer fresh. A freighter holds `weapon: "none"`, a blueprint the game normalized can
 * hold values no selector offers, and Current Design deliberately builds an unchanged field without
 * asking `avail()` at all. Requiring the value too would refuse those designs over a part the yard
 * is itself wearing.
 *
 * Undefined — and therefore a cycle with no catalogue authority at all — when there is no live design
 * to check the catalogue against, or when the catalogue is absent, or when it does not account for
 * every dimension the design names.
 */
function provenCatalogForLiveYard(
  catalog: GameShipyardPartCatalog | undefined,
  live: Readonly<Record<string, unknown>> | undefined,
): GameShipyardPartCatalog | undefined {
  if (catalog === undefined || live === undefined) return undefined;
  for (const [type, part] of Object.entries(live)) {
    if (typeof part !== "string" || type === OUTER_FLEET_BLUEPRINT_NAME_FIELD) {
      continue;
    }
    if (!catalog.types.includes(type)) return undefined;
  }
  return catalog;
}

/**
 * A configured preset, built from the dimensions the yard itself offers.
 *
 * The dimensions come from the yard's catalogue and the values from `${prefix}${type}` in the
 * settings, so a dimension the settings configure and the yard offers both are included, and a
 * dimension the settings do not configure is simply absent — rather than this module deciding which
 * six of the game's dimensions count. That is why the settings prefix is combined with a discovered
 * dimension rather than searched: `fleet_outer_pr_*` and `fleet_outer_def_*` are region weightings
 * that share the prefix and are not blueprint fields at all.
 *
 * `dimensions` is a proven catalogue's, so it is never empty: this cannot construct a preset over no
 * dimensions at all, which would be a design that answers every question below about it with yes.
 */
function capturedOuterFleetPartBlueprint(
  settings: UnknownRecord,
  prefix: string,
  dimensions: GameShipyardPartDimensions,
): UnknownRecord {
  const blueprint: Record<string, unknown> = {};
  for (const type of dimensions) {
    const part = settings[`${prefix}${type}`];
    if (typeof part === "string") blueprint[type] = part;
  }
  return blueprint;
}

/**
 * Whether the yard can be asked for this design at all.
 *
 * A field the yard already holds needs no question asked of `avail()`: it is on the blueprint the
 * yard is wearing, and asking whether the yard offers it would be asking about the player's own
 * design. That is what makes Current Design work — the yard normalizes a `special` into every
 * modern blueprint whether or not the special-slot selector was ever unlocked, so a design that is
 * already on the blueprint can name a part the yard would not offer as a fresh choice. It is also
 * why this cannot answer for a yard whose catalogue is unreadable: without the dimensions, the design
 * on the blueprint cannot be described at all, so there is no authoritative postcondition to build
 * against and no design this may claim the yard can take.
 *
 * Every other named field is asked of the game's own answer, through the option index the yard's
 * markup gave it. A dimension the design does not name is left out rather than filled in: upstream
 * fills those in itself when a class change rewrites the fields its hull forces, and a value
 * invented here would be a design nobody asked for.
 *
 * A field the dimensions do not name is refused before any of that, and the refusal is not
 * redundant with the read above: the option index `avail()` needs comes out of the catalogue, so a
 * dimension it never catalogued is one the yard has said nothing about, and a design naming it would
 * otherwise have its field skipped rather than judged. The forced Explorer is where that matters most,
 * because its blueprint is written here rather than iterated out of the catalogue's dimensions.
 */
function capturedOuterFleetBlueprintAvailable(
  controls: GameFleetControlsPort,
  blueprint: UnknownRecord,
  dimensions: GameShipyardPartDimensions,
): boolean {
  if (typeof blueprint["class"] !== "string") return false;
  for (const { type } of outerFleetBlueprintWrites(blueprint)) {
    if (!dimensions.includes(type)) return false;
  }
  const live = capturedOuterFleetLiveDesign(controls);
  for (const type of dimensions) {
    const part = blueprint[type];
    if (typeof part !== "string") continue;
    if (live?.[type] === part) continue;
    if (
      !controls.isPartAvailable({
        elementId: CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
        type,
        part,
      })
    ) {
      return false;
    }
  }
  return true;
}

function capturedOuterFleetRegionEnabled(
  root: UnknownRecord,
  region: string,
): boolean {
  const tech = readProperty(root, "tech");
  const space = readProperty(root, "space");
  if (
    readProperty(readProperty(root, "race"), "orbit_decayed") &&
    region === "spc_moon"
  ) {
    return false;
  }
  if (readProperty(tech, "resettle")) return false;
  const syndicate = readProperty(space, "syndicate");
  if (!isRecord(syndicate) || !Object.hasOwn(syndicate, region)) return false;
  switch (region) {
    case "spc_moon":
    case "spc_red":
    case "spc_gas":
    case "spc_gas_moon":
    case "spc_belt":
      return true;
    case "spc_titan":
    case "spc_enceladus":
      return (
        (finite(readProperty(tech, "titan")) ?? 0) >= 3 &&
        (finite(readProperty(tech, "enceladus")) ?? 0) >= 2
      );
    case "spc_triton":
      return (finite(readProperty(tech, "triton")) ?? 0) >= 2;
    case "spc_makemake":
      return (finite(readProperty(tech, "makemake")) ?? 0) >= 1;
    case "spc_eris":
      return (finite(readProperty(tech, "eris")) ?? 0) >= 1;
    default:
      return false;
  }
}

function capturedOuterFleetLocationName(region: string): string {
  return region === "tauceti" ? "tech_era_tauceti" : region;
}

function capturedOuterFleetShipName(blueprint: UnknownRecord): string {
  return `outer_shipyard_class_${String(blueprint["class"] ?? "")}`;
}

function capturedOuterFleetCurrentGarrison(root: UnknownRecord): number {
  const civic = readProperty(root, "civic");
  const garrison = readProperty(civic, "garrison");
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  const fob = readProperty(readProperty(root, "space"), "fob");
  return (
    (finite(readProperty(garrison, "workers")) ?? 0) -
    (finite(readProperty(garrison, "crew")) ?? 0) -
    (finite(readProperty(fortress, "garrison")) ?? 0) -
    (finite(readProperty(fob, "troops")) ?? 0)
  );
}

function capturedOuterFleetAuthorityView(
  root: UnknownRecord,
  settings: UnknownRecord,
): Readonly<AuthorityPolicyView> | undefined {
  const manage = settings["authorityManage"];
  const configuredTarget = finite(settings["generalMinimumAuthority"]);
  const authority = readProperty(readProperty(root, "resource"), "Authority");
  const current = finite(readProperty(authority, "amount"));
  const maximum = finite(readProperty(authority, "max"));
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const civic = readProperty(root, "civic");
  const government = readProperty(civic, "govern");
  const rawEvilTechLevel = readProperty(tech, "evil");
  const evilTechLevel =
    rawEvilTechLevel === undefined ? 0 : finite(rawEvilTechLevel);
  const highPopulationPercent = finite(readCapturedHighPopulationPercent(root));
  const governmentType = readProperty(government, "type");
  if (
    typeof manage !== "boolean" ||
    configuredTarget === undefined ||
    current === undefined ||
    current < 0 ||
    maximum === undefined ||
    maximum < 0 ||
    !isRecord(tech) ||
    !isRecord(race) ||
    !isRecord(civic) ||
    typeof governmentType !== "string" ||
    evilTechLevel === undefined ||
    evilTechLevel < 0 ||
    highPopulationPercent === undefined ||
    highPopulationPercent < 0
  ) {
    return undefined;
  }
  return Object.freeze({
    target: Object.freeze({
      manage,
      configuredTarget,
      maximum,
    }),
    current,
    modifiers: Object.freeze({
      evilTechLevel,
      highPopulationPercent,
      grenadier: readProperty(race, "grenadier") === true,
      governmentType,
    }),
  });
}

function capturedOuterFleetAuthorityAssessment(
  root: UnknownRecord,
  settings: UnknownRecord,
  removedSoldiers: number,
): OuterFleetAuthorityAssessment {
  const view = capturedOuterFleetAuthorityView(root, settings);
  return view === undefined
    ? { status: "unavailable" }
    : assessAuthorityRemoval(view, removedSoldiers);
}

/**
 * Whether one record is the design another record names.
 *
 * Only the dimensions the *naming* blueprint actually carries are compared. A preset that
 * configures six of the game's dimensions says nothing about the rest, and comparing them would make
 * every ship in the yard differ from it over a field it never claimed. A design the yard or the game
 * normalized itself carries all of them, and is compared in full.
 *
 * Over a proven catalogue's dimensions, so the comparison is never vacuous: there is no collection of
 * zero dimensions to return true over. Where the catalogue is unavailable the caller counts nothing
 * rather than asking this.
 */
function capturedOuterFleetBlueprintMatches(
  left: UnknownRecord,
  right: UnknownRecord,
  dimensions: GameShipyardPartDimensions,
): boolean {
  return dimensions.every((type) => {
    const part = right[type];
    return typeof part !== "string" || left[type] === part;
  });
}

/**
 * The design the yard will build once every requested write has been made, over the dimensions the
 * yard itself offers.
 *
 * The fields the request names are the ones being written; the fields it does not name are whatever
 * the game's own `setVal` left behind, which is where a class change's rewrites end up. Reading the
 * postcondition out of the yard rather than out of the request is what keeps a freighter's forced
 * weapon and special in the answer without this module restating a single one of those rules — and
 * it is the same design the price probe walked into the yard, so what was priced, what was built and
 * what is judged to have been built are one design rather than three.
 *
 * A dimension neither the request nor the yard holds is a design this cannot describe, and the caller
 * refuses rather than building something it cannot then verify. The answer is never an empty design:
 * the dimensions are a proven catalogue's, so the first one read either names a field or refuses the
 * whole postcondition. An empty record would satisfy every hull the yard could append.
 */
function capturedOuterFleetExpectedBlueprint(
  requested: UnknownRecord,
  live: Readonly<Record<string, unknown>>,
  dimensions: GameShipyardPartDimensions,
): Readonly<Record<string, string>> | undefined {
  const expected: Record<string, string> = {};
  for (const type of dimensions) {
    const part =
      typeof requested[type] === "string" ? requested[type] : live[type];
    if (typeof part !== "string") return undefined;
    expected[type] = part;
  }
  return Object.freeze(expected);
}

/** How many of the yard's ships at this region are the design another record names. */
function capturedOuterFleetShipCount(
  root: UnknownRecord,
  region: string,
  blueprint: UnknownRecord,
  dimensions: GameShipyardPartDimensions,
): number {
  return capturedOuterFleetShips(root).filter((ship) => {
    if (!isRecord(ship) || ship["location"] !== region) return false;
    return capturedOuterFleetBlueprintMatches(ship, blueprint, dimensions);
  }).length;
}

function capturedOuterFleetDecisionMatches(
  expected: Readonly<OuterFleetDecision>,
  actual: Readonly<OuterFleetDecision>,
): boolean {
  if (
    expected.kind !== actual.kind ||
    expected.blueprint !== actual.blueprint
  ) {
    return false;
  }
  if (
    expected.kind === "outer-fleet-status" &&
    actual.kind === "outer-fleet-status"
  ) {
    return (
      expected.nextShipName === actual.nextShipName &&
      expected.messageBeforeUpdate === actual.messageBeforeUpdate &&
      expected.messageAfterUpdate === actual.messageAfterUpdate
    );
  }
  return (
    expected.kind === "build-outer-fleet" &&
    actual.kind === "build-outer-fleet" &&
    expected.targetRegion === actual.targetRegion &&
    expected.targetLocationName === actual.targetLocationName &&
    expected.shipName === actual.shipName &&
    expected.shipCrew === actual.shipCrew &&
    expected.nextShipName === actual.nextShipName
  );
}

export function createCapturedOuterFleetAdapter(
  dependencies: CapturedOuterFleetAdapterDependencies,
): {
  readonly reader: OuterFleetReader;
  readonly executor: OuterFleetExecutor;
} {
  let session: CapturedOuterFleetSession | null = null;
  let expectedDecision: Readonly<OuterFleetDecision> | null = null;
  let shipTargetChanged = false;

  /**
   * The identity of the ship the yard will build next, as the yard itself prices it.
   *
   * Two questions are kept apart on purpose. What the design *costs* is the target: it moves when the
   * live blueprint moves, and when the built-ship count rescales `shipCosts()` for the design's cost
   * tier. Whether the yard can *pay* that cost right now is not: stock moves every period, and the
   * game's own `poolHeld` verdict is re-emitted with it, so folding affordability in here would have
   * `CapturedFleetDemand` re-sample forever. Only the paying pool and the priced resources take part.
   */
  function shipTargetFingerprint(): string | undefined {
    const sample = dependencies.costs.current();
    if (sample === undefined) return undefined;
    return JSON.stringify({
      pool: sample.pool ?? null,
      amounts: sample.amounts.map((entry) => [entry.resourceId, entry.amount]),
    });
  }

  function activeSession(): CapturedOuterFleetSession {
    if (session === null)
      throw new Error("captured outer fleet cycle has not been sampled");
    return session;
  }

  /**
   * The blueprint dimensions the yard's own markup named, or `undefined` while it cannot be read.
   *
   * Asking the catalogue rather than holding a list is what makes a part upstream added work: it is
   * dimension `special` and a hull or component this script has never heard of, and both are as
   * ordinary here as `railgun`. The absent case is not an empty list — it is a yard whose parts are
   * unknown, and no question below is answered at all rather than answered from a default that
   * compares nothing.
   */
  function provenDimensions(
    active: CapturedOuterFleetSession,
  ): GameShipyardPartDimensions | undefined {
    return active.catalog?.types;
  }

  function storeBlueprint(
    token: OuterFleetBlueprint,
    raw: unknown,
    path: string,
    blueprints: Map<OuterFleetBlueprint, UnknownRecord>,
  ): UnknownRecord {
    if (!isRecord(raw)) throw new TypeError(`${path} must be a record`);
    blueprints.set(token, raw);
    return raw;
  }

  const reader: OuterFleetReader = Object.freeze({
    readCycle(): OuterFleetCycleInput {
      session = null;
      expectedDecision = null;
      // One observation per cycle. Latching it would make every later cycle report a change and
      // clear a freshly sampled demand cache forever.
      shipTargetChanged = false;
      const blueprints = new Map<OuterFleetBlueprint, UnknownRecord>();
      // Sampled once for the whole cycle, and held on the session below. It is the only authority on
      // which dimensions a blueprint may be written, compared or judged over, so the plan this cycle
      // produces and the execution that follows it are held to the same one — and only once it has
      // accounted for every dimension the yard's own live design names.
      const catalog = provenCatalogForLiveYard(
        dependencies.parts.catalog(),
        capturedOuterFleetLiveDesign(dependencies.controls),
      );
      const root = capturedOuterFleetRoot(dependencies.rootState);
      const settings = capturedOuterFleetSettings(dependencies.readSettings());
      if (root === undefined) {
        session = Object.freeze({
          root: {},
          sourceUnavailable: true,
          catalog,
          settings,
          blueprints,
        });
        const input = Object.freeze({
          initialized: false,
          mode: "none",
          manualBlueprintAvailable: false,
          configuredMinimumCrew: 0,
        });
        const planned = planOuterFleetCycle(input);
        expectedDecision =
          planned.kind === "outer-fleet-status" ? planned : null;
        return input;
      }
      const yard = capturedOuterFleetYard(root);
      const initialized =
        (finite(readProperty(readProperty(root, "tech"), "syndicate")) ?? 0) >
          0 &&
        yard !== undefined &&
        Object.hasOwn(yard, "blueprint") &&
        dependencies.controls.isRendered(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
      let manualBlueprintAvailable = false;
      const dimensions = catalog?.types;
      // Without a catalogue the yard's own design cannot even be described, so there is nothing to
      // compare against and nothing to offer: Current Design reports no blueprint rather than every
      // blueprint.
      if (
        initialized &&
        dimensions !== undefined &&
        settings["fleetOuterShips"] === "manual"
      ) {
        manualBlueprintAvailable = capturedOuterFleetBlueprintAvailable(
          dependencies.controls,
          storeBlueprint(
            "yard",
            yard["blueprint"],
            "shipyard.blueprint",
            blueprints,
          ),
          dimensions,
        );
      }
      const input = Object.freeze({
        initialized,
        // A dispatch is one synchronous call now, so a built ship is never left waiting between
        // cycles. What can still be waiting is the player: the game's dispatch draw and its
        // destination closures reach outside the window they were given, so a pass stands down
        // entirely rather than build a ship it must not send.
        playerModalOpen: dependencies.dispatch.blockedByPlayerModal(),
        mode:
          typeof settings["fleetOuterShips"] === "string"
            ? settings["fleetOuterShips"]
            : "none",
        manualBlueprintAvailable,
        configuredMinimumCrew: finite(settings["fleetOuterCrew"]) ?? 0,
      });
      session = Object.freeze({
        root,
        sourceUnavailable: false,
        catalog,
        settings,
        blueprints,
      });
      const planned = planOuterFleetCycle(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readTargeting(cycle: Readonly<OuterFleetAutomaticPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const root = active.root;
      const tech = readProperty(root, "tech");
      const settings = active.settings;
      const exploreTau = settings["fleetExploreTau"] === true;
      const tauTechnology = finite(readProperty(tech, "tauceti")) ?? 0;
      let explorerAvailable = false;
      let explorerCount = 0;
      const dimensions = provenDimensions(active);
      // The Explorer is the one blueprint this script writes itself rather than configuring out of the
      // settings, so it is also the one that must never be written without the yard's own catalogue
      // saying its parts are offered: `setVal` has no availability gate, so an Explorer configured
      // against no catalogue would be a hull the player has not unlocked. Without a catalogue nothing
      // is asked about it and nothing is counted, which also means an unrelated ship parked at Tau
      // Ceti is never mistaken for one.
      if (exploreTau && tauTechnology === 1 && dimensions !== undefined) {
        const explorer = storeBlueprint(
          "explorer",
          CAPTURED_OUTER_FLEET_EXPLORER,
          "explorer blueprint",
          active.blueprints,
        );
        explorerAvailable = capturedOuterFleetBlueprintAvailable(
          dependencies.controls,
          explorer,
          dimensions,
        );
        if (explorerAvailable)
          explorerCount = capturedOuterFleetShipCount(
            root,
            "tauceti",
            explorer,
            dimensions,
          );
      }
      const erisTechnology = finite(readProperty(tech, "eris")) ?? 0;
      const erisWeighting = finite(settings["fleet_outer_pr_spc_eris"]) ?? 0;
      const erisGateLive = erisTechnology === 1 && erisWeighting > 0;
      // The game's own sensor reading at Eris, and only where the gate is live: an unweighted Eris
      // decides nothing, and asking would cost a protected draw for an answer nobody reads.
      const erisSample = erisGateLive
        ? dependencies.syndicate.read("spc_eris")
        : undefined;
      const erisSensor =
        erisSample === undefined || erisSample.kind !== "value"
          ? null
          : erisSample.value.s;
      const regions: OuterFleetRegionInput[] = [];
      const space = readProperty(root, "space");
      if (
        !(
          exploreTau &&
          tauTechnology === 1 &&
          explorerAvailable &&
          explorerCount < 1
        ) &&
        !(erisGateLive && erisSensor !== null && erisSensor < 50)
      ) {
        for (const id of CAPTURED_OUTER_FLEET_REGIONS) {
          const unlocked = capturedOuterFleetRegionEnabled(root, id);
          const weighting = unlocked
            ? (finite(settings[`fleet_outer_pr_${id}`]) ?? 0)
            : 0;
          // Sampled once per unlocked, weighted region. A zero-weight region is not a target this
          // pass can choose, so its defense is never a question worth a draw; the Eris gate above is
          // the one exception, because it is a gate rather than a target.
          let syndicateRatio: number | null = null;
          if (unlocked && weighting > 0) {
            const sample = dependencies.syndicate.read(id);
            syndicateRatio = sample.kind === "value" ? sample.value.p : null;
          }
          const maximumDefense = finite(settings[`fleet_outer_def_${id}`]) ?? 1;
          const digsite = readProperty(space, "digsite");
          const digsiteIncomplete =
            id === "spc_eris" &&
            isRecord(digsite) &&
            (finite(digsite["count"]) ?? 100) < 100;
          const troopers = digsiteIncomplete
            ? (finite(
                readProperty(readProperty(space, "shock_trooper"), "on"),
              ) ?? 0)
            : 0;
          const tanks = digsiteIncomplete
            ? (finite(readProperty(readProperty(space, "tank"), "on")) ?? 0)
            : 0;
          const support = readProperty(
            readProperty(root, "resource"),
            "Eris_Support",
          );
          const reportedSupport =
            digsiteIncomplete && isRecord(support)
              ? (finite(support["amount"]) ?? null)
              : null;
          regions.push(
            Object.freeze({
              id,
              unlocked,
              weighting,
              syndicateRatio,
              maximumDefense,
              digsiteIncomplete,
              requestedTroopers: troopers,
              requestedTanks: tanks,
              reportedSupport,
            }),
          );
        }
      }
      const input: OuterFleetTargetInput = Object.freeze({
        exploreTau,
        tauTechnology,
        explorerAvailable,
        explorerCount,
        erisTechnology,
        erisWeighting,
        erisSensor,
        regions: Object.freeze(regions),
      });
      const planned = planOuterFleetTarget(cycle, input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readBlueprint(target: Readonly<OuterFleetTargetPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const yard = capturedOuterFleetYard(active.root);
      let yardAvailable = false;
      let scoutAvailable = false;
      let scoutCount = 0;
      let maximumScouts = 0;
      let fighterAvailable = false;
      const dimensions = provenDimensions(active);
      // Nothing below is judged without the yard's own catalogue. All three flags stay false, which is
      // the planner's own "no blueprint" answer: no preset is constructed over an empty dimension set,
      // the yard's own design is not priced, and Current Design — whose unchanged fields need no
      // `avail()` call but whose build postcondition is still built over these dimensions — never
      // reaches the point of describing itself as the design to build.
      if (dimensions !== undefined) {
        const avail = (blueprint: UnknownRecord) =>
          capturedOuterFleetBlueprintAvailable(
            dependencies.controls,
            blueprint,
            dimensions,
          );
        if (target.forcedBlueprint !== "explorer" && target.mode === "user") {
          if (yard !== undefined) {
            yardAvailable = avail(
              storeBlueprint(
                "yard",
                yard["blueprint"],
                "shipyard.blueprint",
                active.blueprints,
              ),
            );
          }
        } else if (target.forcedBlueprint === null) {
          const scout = storeBlueprint(
            "scout",
            capturedOuterFleetPartBlueprint(
              active.settings,
              "fleet_scout_",
              dimensions,
            ),
            "scout blueprint",
            active.blueprints,
          );
          scoutAvailable = avail(scout);
          if (scoutAvailable) {
            scoutCount = capturedOuterFleetShipCount(
              active.root,
              target.targetRegion,
              scout,
              dimensions,
            );
            maximumScouts =
              finite(
                active.settings[`fleet_outer_sc_${target.targetRegion}`],
              ) ?? 0;
          }
          if (!scoutAvailable || scoutCount >= maximumScouts) {
            const fighter = storeBlueprint(
              "fighter",
              capturedOuterFleetPartBlueprint(
                active.settings,
                "fleet_outer_",
                dimensions,
              ),
              "fighter blueprint",
              active.blueprints,
            );
            fighterAvailable = avail(fighter);
          }
        }
      }
      const input: OuterFleetBlueprintInput = Object.freeze({
        target,
        targetLocationName: capturedOuterFleetLocationName(target.targetRegion),
        yardAvailable,
        scoutAvailable,
        scoutCount,
        maximumScouts,
        fighterAvailable,
      });
      const planned = planOuterFleetBlueprint(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readCandidate(candidate: Readonly<OuterFleetCandidatePlan>) {
      const active = activeSession();
      expectedDecision = null;
      const blueprint = active.blueprints.get(candidate.blueprint);
      if (blueprint === undefined)
        throw new Error(
          `captured outer fleet blueprint ${candidate.blueprint} is missing`,
        );
      const shipClass = blueprint["class"];
      if (typeof shipClass !== "string")
        throw new TypeError(
          `captured ${candidate.blueprint} blueprint.class must be a string`,
        );
      const shipName = capturedOuterFleetShipName(blueprint);
      // The game's own crew requirement for this hull, scaled by the game's own job stack. An
      // unreadable answer is `null` and stands the pass down rather than throwing: a hull upstream
      // has since added is an ordinary state, not a fault.
      const shipCrew = capturedShipCrewSize(active.root, shipClass) ?? null;
      let authority: OuterFleetAuthorityAssessment = { status: "not-required" };
      const authorityResource = readProperty(
        readProperty(active.root, "resource"),
        "Authority",
      );
      if (
        shipCrew !== null &&
        active.settings["authorityManage"] === true &&
        (finite(active.settings["generalMinimumAuthority"]) ?? 0) !== 0 &&
        readProperty(readProperty(active.root, "race"), "universe") ===
          "evil" &&
        readProperty(authorityResource, "display") !== false
      ) {
        authority = capturedOuterFleetAuthorityAssessment(
          active.root,
          active.settings,
          shipCrew,
        );
      }
      const input: OuterFleetCandidateInput = Object.freeze({
        candidate,
        shipName,
        shipCrew,
        authority,
      });
      const planned = planOuterFleetCandidate(input);
      expectedDecision = planned.kind === "outer-fleet-status" ? planned : null;
      return input;
    },

    readBuildReadiness(plan: Readonly<OuterFleetReadinessPlan>) {
      const active = activeSession();
      expectedDecision = null;
      const blueprint = active.blueprints.get(plan.blueprint);
      if (blueprint === undefined)
        throw new Error(
          `captured outer fleet blueprint ${plan.blueprint} is missing`,
        );
      // The yard's own price for this candidate, taken before it is applied: the game's cost row
      // answers both what it costs and whether the yard can pay it from the active supply pool, and
      // nothing here decides either.
      const sample = dependencies.costs.price(blueprint);
      let missingResourceName: string | null = null;
      if (sample !== undefined) {
        for (const entry of sample.amounts) {
          if (entry.affordable) continue;
          missingResourceName = entry.resourceId;
          break;
        }
      }
      const input: OuterFleetBuildReadinessInput = Object.freeze({
        plan,
        costKnown: sample !== undefined,
        missingResourceName,
        currentCityGarrison: capturedOuterFleetCurrentGarrison(active.root),
      });
      const planned = planOuterFleetBuild(input);
      expectedDecision = planned;
      return input;
    },

    readShipTargetChanged(): boolean {
      return shipTargetChanged;
    },
  });

  const executor: OuterFleetExecutor = Object.freeze({
    execute(decision: Readonly<OuterFleetDecision>) {
      const active = session;
      const expected = expectedDecision;
      if (active === null || expected === null)
        return stale(
          "captured-outer-fleet-session-missing",
          "captured outer fleet session is missing",
        );
      if (
        (!active.sourceUnavailable &&
          capturedOuterFleetRoot(dependencies.rootState) !== active.root) ||
        capturedOuterFleetSettings(dependencies.readSettings()) !==
          active.settings
      ) {
        return stale(
          "captured-outer-fleet-source-changed",
          "captured outer fleet source changed",
        );
      }
      if (!capturedOuterFleetDecisionMatches(expected, decision))
        return rejected(
          "invalid-captured-outer-fleet-decision",
          "captured outer fleet decision does not match the sampled plan",
        );
      expectedDecision = null;
      if (decision.kind === "outer-fleet-status") return SUCCEEDED;
      // Every exit from here on can have moved the shipyard's cost row, including the ones that
      // report a rejection or a stale outcome: `setPart` writes the live blueprint before the power
      // check, and `buildShip` can append a ship before the postcondition is judged. So the
      // observation brackets the whole mutation window rather than a single branch of it.
      const targetBefore = shipTargetFingerprint();
      const outcome = applyOuterFleetBuild(active, decision);
      const targetAfter = shipTargetFingerprint();
      if (
        shipTargetChanged === false &&
        targetBefore !== targetAfter &&
        (targetBefore !== undefined || targetAfter !== undefined)
      ) {
        shipTargetChanged = true;
      }
      return outcome;
    },
  });

  /**
   * The mutating half of a `build-outer-fleet` execution, with every failure path returning its own
   * outcome. Kept apart from `execute` so the ship-target observation above cannot miss an exit.
   */
  function applyOuterFleetBuild(
    active: CapturedOuterFleetSession,
    decision: Readonly<OuterFleetBuildDecision>,
  ): CommandExecutionOutcome {
    // Planning should already have refused every candidate without this authority, but the execution
    // defends itself rather than trusting that. Refused before the first write, and before any price,
    // power check or dispatch.
    const dimensions = provenDimensions(active);
    if (dimensions === undefined)
      return stale(
        "captured-outer-fleet-catalog-unavailable",
        "the shipyard's part catalogue could not be read in full",
      );
    const blueprint = active.blueprints.get(decision.blueprint);
    if (blueprint === undefined)
      return stale(
        "captured-outer-fleet-blueprint-changed",
        "captured outer fleet blueprint changed",
      );
    // The yard's design fields, in the blueprint's own order and through the game's own `setVal` — the
    // same list, in the same order, the cost probe walks before it prices a candidate, so what is priced
    // and what is built are the same ship.
    const writes = outerFleetBlueprintWrites(blueprint);
    // Every one of them is a dimension the sampled catalogue accounts for, checked before the first
    // write. `setPart()` cannot be the check: it invokes upstream `setVal(type, value)`, which has no
    // availability gate of its own, so a field the catalogue does not name would be written and only
    // then found out about. Planning refused the same design, and this does not trust that it did.
    if (writes.some(({ type }) => !dimensions.includes(type)))
      return stale(
        "captured-outer-fleet-blueprint-invalid",
        "the shipyard's catalogue does not name every requested part",
      );
    for (const { type, part } of writes) {
      // A field the yard already holds is not rewritten. Current Design is exactly this case: the
      // design being built is the yard's own blueprint, which `drawShipYard()` has already normalized
      // — including a `special` the special-slot selector may never have been unlocked for, and which
      // the yard therefore cannot be asked about through `avail()` at all. Rewriting it would ask the
      // yard for a selector the player never had, and each unnecessary `setVal` would redraw the cost
      // row the price probe and the fleet demand both read.
      if (
        capturedOuterFleetLiveDesign(dependencies.controls)?.[type] === part
      ) {
        continue;
      }
      if (
        !dependencies.controls.setPart({
          elementId: CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
          type,
          part,
        })
      ) {
        return rejected(
          "captured-outer-fleet-part-not-invoked",
          "outer fleet part control was not invoked",
        );
      }
    }
    // What the yard holds now, not what was asked of it: a class change has already rewritten the
    // fields its hull forces, and the design the build postcondition judges has to be that one.
    const liveDesign = capturedOuterFleetLiveDesign(dependencies.controls);
    if (liveDesign === undefined)
      return stale(
        "captured-outer-fleet-design-unavailable",
        "the captured yard holds no design",
      );
    const expectedBlueprint = capturedOuterFleetExpectedBlueprint(
      blueprint,
      liveDesign,
      dimensions,
    );
    if (expectedBlueprint === undefined)
      return stale(
        "captured-outer-fleet-blueprint-invalid",
        "captured outer fleet blueprint is incomplete",
      );
    if (
      !dependencies.controls.hasShipPower(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL)
    )
      return rejected(
        "captured-outer-fleet-power-unavailable",
        "outer fleet blueprint has insufficient power",
      );
    const build = dependencies.controls.buildShip({
      elementId: CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
      expectedBlueprint,
    });
    if (!build.actionable)
      return rejected(
        "captured-outer-fleet-build-not-invoked",
        "outer fleet build control was not invoked",
      );
    if (build.builtIndex === null)
      return stale(
        "captured-outer-fleet-build-postcondition-failed",
        "captured outer fleet build did not append the intended ship",
      );
    // One synchronous call, in the same task as the build that produced the ship. There is no
    // window to wait for and nothing to retry: whatever the game's own destination closure decides
    // is the answer, and it is judged from the yard's own report of the ship afterwards.
    const dispatched = dependencies.dispatch.dispatchShipyardShip({
      index: build.builtIndex,
      region: decision.targetRegion,
    });
    if (dispatched.kind !== "launched")
      return dispatched.kind === "unreachable"
        ? rejected(
            "captured-outer-fleet-dispatch-unavailable",
            "the shipyard dispatch could not be reached",
          )
        : rejected(
            "captured-outer-fleet-dispatch-declined",
            dispatched.kind === "no-destination"
              ? `the shipyard offered no route from ${String(decision.targetLocationName)}`
              : `the game declined to send this ship to ${String(decision.targetLocationName)}`,
          );
    dependencies.onActivity?.({
      message: `${decision.shipName} has been assembled, and dispatched to ${decision.targetLocationName}.`,
      color: "success",
      tags: ["combat"],
    });
    return SUCCEEDED;
  }

  return Object.freeze({ reader, executor });
}
