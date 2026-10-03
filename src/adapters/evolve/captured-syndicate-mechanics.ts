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
 * A failed protected discovery rejects all changed control generations at the capture layer.
 * Later game redraws produce usable generations automatically; unchanged controls retain authority.
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
import type {
  GameSpaceRegionMechanics,
  GameSpaceRegionState,
} from "../../ports/game-space-region-mechanics.ts";
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
import { isRecord, readProperty } from "../validation.ts";

/** The captured method on `#<region>synd` whose one call performs the whole calculation. */
const SYNDICATE_SCAN_METHOD = "scan";

/** `truepath.js:syndicate()` rounds the ratio to this many places, and only once per call. */
const SYNDICATE_RATIO_DIGITS = 4;

/** `space.js`'s scan display rounds the sensor percentage to this many places, and only once. */
const SYNDICATE_SCAN_DIGITS = 1;

/**
 * The element id the game binds the Syndicate readout to: `space.js` appends
 * `<div id="${region}synd">` inside the region's row and calls `vBind` on it.
 */
function syndicateReadoutControl(region: string): string {
  return `${region}synd`;
}

export interface CapturedSyndicateMechanicsDependencies {
  readonly regions: GameSpaceRegionMechanics;
  readonly document: unknown;
  readonly controls: GameControlRegistry;
  readonly discovery: GameTabDiscovery;
  /** The page-realm rounding observation; the only capability that reaches a private literal. */
  readonly mechanics: CapturedGameMechanics;
}

/**
 * What one protected draw left behind for a region's readout.
 *
 * `captured` carries only a generation the central registry still accepts as authority.
 */
type SyndicateReadoutCapture =
  | { readonly kind: "captured"; readonly handle: GameControlHandle }
  | { readonly kind: "inactive" }
  | { readonly kind: "refused" };

/** The pass ran and failed, so nothing it left behind is this read's authority. */
const READOUT_PASS_FAILED: SyndicateReadoutCapture = Object.freeze({
  kind: "refused",
});

export function createCapturedSyndicateMechanics(
  dependencies: CapturedSyndicateMechanicsDependencies,
): GameSyndicateMechanics {
  const { regions, document, controls, discovery, mechanics } = dependencies;
  // A successful draw can disprove a retained binding without replacing its generation.
  // Only that generation loses the cheap path; a later real binding restores it automatically.
  const refusedReadoutGenerations = new Map<string, number>();

  /**
   * One protected draw of the panel that renders this region, and nothing else.
   *
   * The main tab's own component is mounted for real because the region containers are that
   * component's render rather than markup, and the Civilization panel is the workspace's scratch, so
   * the draw is dropped again. At most one pass runs per read: the caller stands down and the next
   * cycle tries again.
   *
   * Discovery owns rejection of every changed generation when a protected pass fails.
   */
  function captureReadout(
    region: string,
    state: GameSpaceRegionState,
  ): SyndicateReadoutCapture {
    const control = syndicateReadoutControl(region);
    const subTab =
      state.zone === "inner" ? SPACE_TAB_INDEX.space : SPACE_TAB_INDEX.outerSol;
    const getElement = readProperty(document, "getElementById");
    if (typeof getElement !== "function") return READOUT_PASS_FAILED;
    const previousRow = Reflect.apply(getElement, document, [region]);
    const previousChild = Reflect.apply(getElement, document, [control]);
    const previousHandle = controls.resolve(control);
    let drawn: SyndicateReadoutCapture = READOUT_PASS_FAILED;
    let drawnGeneration: number | undefined;
    const panel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization];
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
      {
        forceDraw: true,
        ...(panel === undefined ? {} : { mount: Object.freeze([`#${panel}`]) }),
        whileDrawn: () => {
          const captured = controls.resolve(control);
          drawnGeneration = captured?.generation;
          const row = Reflect.apply(getElement, document, [region]);
          if (!isRecord(row) || row === previousRow) return;
          const child = Reflect.apply(getElement, document, [control]);
          if (child === null) {
            if (state.syndicateEnabled) drawn = { kind: "inactive" };
            return;
          }
          if (!isRecord(child) || child === previousChild) return;
          if (
            captured === undefined ||
            !captured.methods.includes(SYNDICATE_SCAN_METHOD) ||
            captured.generation === previousHandle?.generation
          )
            return;
          drawn = Object.freeze({ kind: "captured", handle: captured });
        },
      },
    );
    if (result.outcome.status !== "succeeded") {
      return READOUT_PASS_FAILED;
    }
    if (drawn.kind === "captured") refusedReadoutGenerations.delete(control);
    else if (drawnGeneration !== undefined)
      refusedReadoutGenerations.set(control, drawnGeneration);
    return drawn;
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
      const state = regions.read(region);
      if (state.kind !== "value") return { kind: state.kind };
      const control = syndicateReadoutControl(region);
      // The cheap read: a control the game bound outside a failed pass, at no cost and no draw.
      const held = controls.resolve(control);
      if (
        state.value.syndicateEnabled &&
        held !== undefined &&
        held.generation !== refusedReadoutGenerations.get(control) &&
        held.methods.includes(SYNDICATE_SCAN_METHOD)
      )
        return readSyndicateScan(region, held);
      let capture: SyndicateReadoutCapture;
      try {
        capture = captureReadout(region, state.value);
      } catch {
        return { kind: "invalid" };
      }
      if (capture.kind === "inactive")
        return { kind: "value", value: Object.freeze({ p: 1, s: 0 }) };
      if (capture.kind === "refused") return { kind: "invalid" };
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
