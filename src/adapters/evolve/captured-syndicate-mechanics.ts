/**
 * The running game's own Truepath Syndicate result, reached through the Space binding it draws.
 *
 * ## Why a display method rather than a copy of the formula
 *
 * `syndicate(region, true)` is a module-private export of a single esbuild IIFE — the shipped build
 * bundles every module into one file and has no runtime module graph, so it cannot be imported and
 * nothing can be added to the game to expose it. What the game *does* draw is a per-region Syndicate
 * readout, and one of its three methods closes over the real function:
 *
 * ```js
 * scan(r){
 *     if (global.space.hasOwnProperty('shipyard') && global.space.shipyard.hasOwnProperty('ships')){
 *         let synd = syndicate(r,true);
 *         return +((synd.s + 25) / 1.25).toFixed(1) + '%';
 *     }
 *     return loc('galaxy_piracy_none');
 * }
 * ```
 *
 * One call therefore performs the whole calculation, and two of its roundings expose exactly the two
 * numbers Outer Fleet needs — the private `p` and the private `s`:
 *
 * - `syndicate()` builds `p` as `1 - +(piracy / divisor).toFixed(4)`. The four-digit string is the
 *   game's own rounding of the ratio, and the game subtracts it from 1, so `p` is
 *   `1 - Number(that string)`. The receiver of the rounding is *not* the answer; using it would
 *   disagree with the game everywhere it rounds.
 * - `scan()` renders the sensor as `+((s + 25) / 1.25).toFixed(1) + '%'`. The receiver of that
 *   one-digit rounding is the pre-formatting value, so `s` is `receiver * 1.25 - 25`. Parsing the
 *   displayed percentage instead would throw away most of the game's precision.
 *
 * Nothing else on this path rounds to four or one decimal places, and the observations are counted:
 * one of each is required, and anything else is refused rather than guessed at.
 *
 * ## Reaching the binding
 *
 * The game binds `#<region>synd` while it renders a region's row, which only happens while that
 * region is on the Inner System or Outer System panel. A control the capture already holds is used
 * directly — a captured closure keeps working after its panel is torn down — so the common read
 * costs no draw at all, whether the player is looking at that panel or the binding survived an
 * earlier pass.
 *
 * ## Why a pass has to be proven, and what a failed one leaves behind
 *
 * `GameTabDiscovery` reports `rejected` or `stale` when a tab control could not be invoked, the
 * observer threw, the player's view could not be restored, or the workspace did not survive. Any of
 * those can happen *after* the draw bound the readout, and the registry keeps whatever a draw
 * captured — a captured closure outlives both the panel it came from and the pass that captured it.
 * A generation the registry merely holds is therefore not authority:
 *
 * - a first-use read runs one pass and reads `scan` only when that pass reported `succeeded` and the
 *   generation it left behind is one this adapter vouches for;
 * - a failed pass quarantines what it left, and the next read tries again rather than treating the
 *   presence of that handle as the control being established.
 *
 * The quarantine is one generation of one element id, never the id: the game rebinds a readout
 * whenever it redraws that region, so a later generation is ordinary authority again — the
 * player's own redraw, or another successful pass, without a synthetic one.
 *
 * ## Why the quarantine is panel-wide and still narrow
 *
 * `space(zone)` does not bind one readout, it binds one per region it renders: the function walks
 * `spaceProjects` in order and calls `vBind({el: '#${region}synd', ...})` for every region of that
 * zone it shows. One Inner System draw is therefore three bindings — Red, Moon and the Belt — and a
 * pass that then failed to restore the player's view left all three behind. Quarantining only the
 * region the caller asked about would hand two of them to the next cycle, which finds the control
 * already present and reads it on the cheap path.
 *
 * So a pass snapshots every readout its sub-tab can draw before it runs, and after a failure
 * quarantines each generation that appeared or changed. "Belongs to this panel" is not enough and is
 * not what is used: a generation the draw left alone was not that draw's output, and quarantining it
 * would refuse a binding the player has been relying on because some other control on the same panel
 * failed. Membership decides which readouts to compare; the comparison decides which to quarantine.
 */

import type { CapturedGameRead } from "../../ports/captured-game-mechanics.ts";
import type {
  GameSyndicateMechanics,
  GameSyndicateSample,
} from "../../ports/game-syndicate-mechanics.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
  GameControlResult,
} from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../ports/game-tab-discovery.ts";
import type { CapturedGameMechanics } from "../../ports/captured-game-mechanics.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "./captured-tab-discovery.ts";
import { finite, isRecord, readProperty } from "../validation.ts";

/** The captured method on `#<region>synd` whose one call performs the whole calculation. */
const SYNDICATE_SCAN_METHOD = "scan";

/** `truepath.js:syndicate()` rounds the ratio to this many places, and only once per call. */
const SYNDICATE_RATIO_DIGITS = 4;

/** `space.js`'s scan display rounds the sensor percentage to this many places, and only once. */
const SYNDICATE_SCAN_DIGITS = 1;

/**
 * Which Civilization space sub-tab draws each region, from `spaceProjects[region].info.zone` at the
 * pinned commit: `zone: 'inner'` on Moon, Red and the Belt, `zone: 'outer'` on Gas, Gas Moon, Titan,
 * Enceladus, Triton, Makemake and Eris. UI topology, not gameplay arithmetic — the game's own
 * `zone` decides this, and only the tab that renders a region can bind its Syndicate readout.
 *
 * One owner: a caller that named its own tab map would be able to disagree with this one about
 * where a region's readout is drawn.
 */
const SYNDICATE_REGION_TABS: Readonly<Record<string, number>> = Object.freeze({
  spc_moon: SPACE_TAB_INDEX.space,
  spc_red: SPACE_TAB_INDEX.space,
  spc_belt: SPACE_TAB_INDEX.space,
  spc_gas: SPACE_TAB_INDEX.outerSol,
  spc_gas_moon: SPACE_TAB_INDEX.outerSol,
  spc_titan: SPACE_TAB_INDEX.outerSol,
  spc_enceladus: SPACE_TAB_INDEX.outerSol,
  spc_triton: SPACE_TAB_INDEX.outerSol,
  spc_makemake: SPACE_TAB_INDEX.outerSol,
  spc_eris: SPACE_TAB_INDEX.outerSol,
});

/**
 * The element id the game binds the Syndicate readout to: `space.js` appends
 * `<div id="${region}synd">` inside the region's row and calls `vBind` on it.
 */
function syndicateReadoutControl(region: string): string {
  return `${region}synd`;
}

/**
 * Every `#<region>synd` a draw of this Space sub-tab can bind, as element ids.
 *
 * `SYNDICATE_REGION_TABS` is the whole of the topology: it says which sub-tab renders which region,
 * and `space(zone)` renders every region of the zone it was asked for, so filtering the same map by
 * one sub-tab names every binding a pass over that sub-tab could have written. One map for both
 * halves of that, so there is no second list to drift and no Inner/Outer case of any rule below.
 */
function syndicateReadoutsFor(subTab: number): readonly string[] {
  return Object.entries(SYNDICATE_REGION_TABS)
    .filter(([, tab]) => tab === subTab)
    .map(([region]) => syndicateReadoutControl(region));
}

/**
 * `truepath.js:syndicateActive()`, in the game's own truthiness and no further:
 *
 * ```js
 * if (global.tech['shadow'] && global.tech['shadow'] >= 5) { return false; }
 * return !global.tech['isolation'] && global.tech['syndicate']
 *     && global.race['truepath'] && global.space['syndicate'] ? true : false;
 * ```
 *
 * Every clause is a bare truthiness test upstream, and each one is one here. `true` is a valid
 * `race.truepath` but not the only value the game writes: `truepath.js` assigns
 * `global.race['truepath'] = 1` when the path is chosen, so a gate demanding the boolean would
 * report every real True Path save as having no Syndicate at all.
 *
 * Used only to tell a page where no Syndicate readout can exist from a page whose readout could not
 * be captured. An inactive Syndicate has no `#<region>synd` element at all, because the game only
 * draws one behind `syndicateActive()`, so there is nothing to reach and the function's own default
 * answer is the answer. This is the whole of the gate, deliberately: nothing else about
 * `syndicate()` is restated here.
 *
 * `undefined` when a container the game reads as a bag is not one. Every field of a malformed
 * container reads as absent, which would report a page that cannot be read as a page whose Syndicate
 * is off, and a defended region and an unanswered one are opposite answers.
 */
function syndicateOperating(root: unknown): boolean | undefined {
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const space = readProperty(root, "space");
  for (const container of [tech, race, space]) {
    if (container === undefined) continue;
    if (!isRecord(container)) return undefined;
  }
  const shadow = readProperty(tech, "shadow");
  if (shadow && (finite(shadow) ?? 0) >= 5) return false;
  if (readProperty(tech, "isolation")) return false;
  if (!readProperty(tech, "syndicate")) return false;
  if (!readProperty(race, "truepath")) return false;
  if (!readProperty(space, "syndicate")) return false;
  return true;
}

export interface CapturedSyndicateMechanicsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly discovery: GameTabDiscovery;
  /** The page-realm rounding observation; the only capability that reaches a private literal. */
  readonly mechanics: CapturedGameMechanics;
}

/**
 * What one protected draw left behind for a region's readout.
 *
 * `captured` is the only answer a read may go through, and only once the generation it names is one
 * this adapter still vouches for.
 */
type SyndicateReadoutCapture =
  | { readonly kind: "captured"; readonly handle: GameControlHandle }
  | { readonly kind: "absent" }
  | { readonly kind: "refused" };

/**
 * No draw could reach this readout: no Space sub-tab draws the region, or the pass ran and bound
 * nothing. Both are the game having no readout here, not a read this adapter failed to make.
 */
const READOUT_NOT_DRAWN: SyndicateReadoutCapture = Object.freeze({
  kind: "absent",
});

/** The pass ran and failed, so nothing it left behind is this read's authority. */
const READOUT_PASS_FAILED: SyndicateReadoutCapture = Object.freeze({
  kind: "refused",
});

export function createCapturedSyndicateMechanics(
  dependencies: CapturedSyndicateMechanicsDependencies,
): GameSyndicateMechanics {
  const { rootState, controls, discovery, mechanics } = dependencies;

  /**
   * The generation a failed discovery pass left behind, for each element id that pass wrote.
   *
   * The registry retains captured controls, so refusing only the read that ran the failed pass would
   * hand that pass's binding to the next cycle, which finds the control already present and skips
   * discovery entirely. Marking the generation instead of the element id keeps the quarantine as
   * narrow as the failure: the game rebinds a readout whenever it redraws that region, and any later
   * generation is a binding no failed pass produced.
   */
  const rejectedDiscoveryGenerations = new Map<string, number>();

  /**
   * The generation each of the panel's readouts carries right now, so a pass can be told apart from
   * the bindings that were already there.
   *
   * `TabDiscoveryResult.discovered` cannot answer this. It names the element ids that did not exist
   * before the pass, so it says nothing about a readout the draw *replaced* — which is what a redraw
   * does to every region it renders — and a replaced binding produced by a failing pass is exactly
   * the one that must not be read through.
   */
  function snapshotReadoutGenerations(
    readouts: readonly string[],
  ): Map<string, number> {
    const generations = new Map<string, number>();
    for (const control of readouts) {
      const handle = controls.resolve(control);
      if (handle !== undefined) generations.set(control, handle.generation);
    }
    return generations;
  }

  /**
   * Quarantine every generation this failed pass created or replaced on its own panel, and only
   * those.
   *
   * The pass drew the whole panel, so a failure on the region the caller asked about says nothing
   * about its neighbours' standing — but it says everything about the generations that same draw
   * wrote or replaced. A readout the draw left untouched keeps whatever standing it had: its
   * generation did not move, so it is not this pass's output, and an existing quarantine for it is
   * left standing rather than cleared.
   */
  function quarantineFailedDraw(
    readouts: readonly string[],
    before: ReadonlyMap<string, number>,
  ): void {
    for (const control of readouts) {
      const current = controls.resolve(control);
      if (current === undefined) continue;
      if (before.get(control) === current.generation) continue;
      rejectedDiscoveryGenerations.set(control, current.generation);
    }
  }

  /**
   * The handle for a readout, when the registry's current one is authority this adapter vouches for.
   *
   * `undefined` for no handle at all and for a quarantined generation alike, which is what keeps the
   * two cases apart from the caller's side: both spend one protected pass. A generation other than
   * the quarantined one is dropped from the record as it is read, because the game rebinds the
   * control on every redraw and a newer binding is not the one that failed.
   */
  function trustedReadout(
    control: string,
    handle: GameControlHandle | undefined,
  ): GameControlHandle | undefined {
    if (handle === undefined) return undefined;
    const quarantined = rejectedDiscoveryGenerations.get(control);
    if (quarantined === undefined) return handle;
    if (quarantined !== handle.generation) {
      rejectedDiscoveryGenerations.delete(control);
      return handle;
    }
    return undefined;
  }

  /**
   * One protected draw of the panel that renders this region, and nothing else.
   *
   * The main tab's own component is mounted for real because the region containers are that
   * component's render rather than markup, and the Civilization panel is the workspace's scratch, so
   * the draw is dropped again. At most one pass runs per read: the caller stands down and the next
   * cycle tries again.
   *
   * A failed pass reports the failure rather than a handle, and marks every generation that pass
   * wrote or replaced across the panel it drew. None of them is read through on the strength of it.
   */
  function captureReadout(region: string): SyndicateReadoutCapture {
    const control = syndicateReadoutControl(region);
    const subTab = SYNDICATE_REGION_TABS[region];
    if (subTab === undefined) return READOUT_NOT_DRAWN;
    const panel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization];
    const readouts = syndicateReadoutsFor(subTab);
    const before = snapshotReadoutGenerations(readouts);
    const result = discovery.discover(
      Object.freeze([
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civilization,
        }),
        Object.freeze({
          setting: SPACE_TABS_SETTING,
          control: SUB_TAB_CONTROLS[SPACE_TABS_SETTING] ?? "",
          index: subTab,
        }),
      ]),
      panel === undefined ? {} : { mount: Object.freeze([`#${panel}`]) },
    );
    if (result.outcome.status !== "succeeded") {
      quarantineFailedDraw(readouts, before);
      return READOUT_PASS_FAILED;
    }
    const captured = controls.resolve(control);
    return captured === undefined
      ? READOUT_NOT_DRAWN
      : Object.freeze({ kind: "captured", handle: captured });
  }

  /**
   * The game's own two roundings, read through one proven handle.
   *
   * The registry's own verdict is what makes the observations attributable. A superseded binding
   * still runs a live closure of an older draw, and that closure can round both values before the
   * registry reports the call as failed, so its roundings are not this region's answer.
   */
  function readSyndicateScan(
    region: string,
    handle: GameControlHandle,
  ): CapturedGameRead<GameSyndicateSample> {
    let invocation: GameControlResult | undefined;
    const scan = mechanics.readRoundedValues(() => {
      invocation = controls.invoke(handle, SYNDICATE_SCAN_METHOD, [region]);
    });
    if (scan.kind === "absent") return { kind: "absent" };
    if (scan.kind === "invalid") return { kind: "invalid" };
    if (invocation?.ok !== true) return { kind: "invalid" };
    return readSyndicateSample(scan.value);
  }

  return Object.freeze({
    read(region: string): CapturedGameRead<GameSyndicateSample> {
      const root = rootState.readRoot();
      if (!isRecord(root)) return { kind: "absent" };
      const operating = syndicateOperating(root);
      if (operating === undefined) return { kind: "absent" };
      // The native inactive answer, without a binding to read it through: `syndicate()` returns
      // `{p: 1, r: 0, s: 0, o: 0}` and draws no readout at all.
      if (!operating) {
        return {
          kind: "value",
          value: Object.freeze({ p: 1, s: 0 }),
        };
      }
      const control = syndicateReadoutControl(region);
      // The cheap read: a control the game bound outside a failed pass, at no cost and no draw.
      const held = trustedReadout(control, controls.resolve(control));
      if (held !== undefined) return readSyndicateScan(region, held);
      const capture = captureReadout(region);
      if (capture.kind === "absent") return { kind: "absent" };
      if (capture.kind === "refused") return { kind: "invalid" };
      // A successful pass is authority for what it itself left behind. A pass that rebound nothing
      // — the observed no-draw case — leaves the quarantined generation exactly where it was, and
      // that binding is still the failed pass's, so it is refused rather than read through.
      if (trustedReadout(control, capture.handle) === undefined) {
        return { kind: "invalid" };
      }
      return readSyndicateScan(region, capture.handle);
    },
  });
}

/**
 * The two numbers, out of the roundings the game's own call performed.
 *
 * Both roundings must be unambiguous: the private ratio is rounded to four places exactly once per
 * `syndicate()` call and the scan display to one place exactly once per `scan()` call, so a repeat
 * of either means something else on this path also rounded and the answers cannot be attributed.
 */
function readSyndicateSample(
  observations: readonly Readonly<{
    readonly receiver: number;
    readonly digits: number;
    readonly text: string;
  }>[],
): CapturedGameRead<GameSyndicateSample> {
  const ratios = observations.filter(
    (value) => value.digits === SYNDICATE_RATIO_DIGITS,
  );
  const scans = observations.filter(
    (value) => value.digits === SYNDICATE_SCAN_DIGITS,
  );
  if (scans.length !== 1) return { kind: "invalid" };
  const sensor = scans[0]!.receiver * 1.25 - 25;
  if (!Number.isFinite(sensor) || sensor < 0) return { kind: "invalid" };
  if (ratios.length === 0) {
    // The inactive branch of `syndicate()`: no ratio was rounded because none was built, and the
    // sensor it hands the display is zero. Anything else at zero roundings is not that shape.
    return sensor === 0
      ? { kind: "value", value: Object.freeze({ p: 1, s: 0 }) }
      : { kind: "invalid" };
  }
  if (ratios.length !== 1) return { kind: "invalid" };
  const ratio = ratios[0]!;
  if (!Number.isFinite(ratio.receiver)) return { kind: "invalid" };
  const remaining = Number(ratio.text);
  if (!Number.isFinite(remaining)) return { kind: "invalid" };
  const p = 1 - remaining;
  // Piracy is a stored non-negative amount divided by a positive cap, so the ratio the game rounded
  // is in [0, 1] and `p` is at most 1. A value above it means the string was not a ratio.
  if (!Number.isFinite(p) || p > 1) return { kind: "invalid" };
  return { kind: "value", value: Object.freeze({ p, s: sensor }) };
}
