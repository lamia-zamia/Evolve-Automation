/**
 * The running game's own Truepath Syndicate result, reached through the Space binding it draws.
 *
 * ## Why a display method rather than a copy of the formula
 *
 * `syndicate(region, true)` is a module-private export of a single esbuild IIFE — the shipped build
 * has no runtime module graph, so it cannot be imported and nothing can be added to the game to
 * expose it (see `docs/feature-backlog.md`). What the game *does* draw is a per-region Syndicate
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
 * directly — a captured closure keeps working after its panel is torn down, so the protected
 * discovery pass runs at most once per region and never again.
 */

import type { CapturedGameRead } from "../../ports/captured-game-mechanics.ts";
import type {
  GameSyndicateMechanics,
  GameSyndicateSample,
} from "../../ports/game-syndicate-mechanics.ts";
import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
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
 * `truepath.js:syndicateActive()`, exactly as upstream writes it and no further.
 *
 * Used only to tell a page where no Syndicate readout can exist from a page whose readout could not
 * be captured. An inactive Syndicate has no `#<region>synd` element at all, because the game only
 * draws one behind `syndicateActive()`, so there is nothing to reach and the function's own default
 * answer is the answer. This is the whole of the gate, deliberately: nothing else about
 * `syndicate()` is restated here.
 */
function syndicateOperating(root: unknown): boolean {
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const space = readProperty(root, "space");
  const syndicate = readProperty(space, "syndicate");
  if ((finite(readProperty(tech, "shadow")) ?? 0) >= 5) return false;
  if (readProperty(tech, "isolation")) return false;
  if ((finite(readProperty(tech, "syndicate")) ?? 0) <= 0) return false;
  if (readProperty(race, "truepath") !== true) return false;
  return isRecord(syndicate);
}

export interface CapturedSyndicateMechanicsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly discovery: GameTabDiscovery;
  /** The page-realm rounding observation; the only capability that reaches a private literal. */
  readonly mechanics: CapturedGameMechanics;
}

export function createCapturedSyndicateMechanics(
  dependencies: CapturedSyndicateMechanicsDependencies,
): GameSyndicateMechanics {
  const { rootState, controls, discovery, mechanics } = dependencies;

  /**
   * One protected draw of the panel that renders this region, and nothing else.
   *
   * The main tab's own component is mounted for real because the region containers are that
   * component's render rather than markup, and the Civilization panel is the workspace's scratch, so
   * the draw is dropped again. A pass that fails is not retried inside one read: the caller stands
   * down and the next cycle tries again.
   */
  function captureReadout(region: string): void {
    const subTab = SYNDICATE_REGION_TABS[region];
    if (subTab === undefined) return;
    const panel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization];
    discovery.discover(
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
  }

  return Object.freeze({
    read(region: string): CapturedGameRead<GameSyndicateSample> {
      const root = rootState.readRoot();
      if (!isRecord(root)) return { kind: "absent" };
      // The native inactive answer, without a binding to read it through: `syndicate()` returns
      // `{p: 1, r: 0, s: 0, o: 0}` and draws no readout at all.
      if (!syndicateOperating(root)) {
        return {
          kind: "value",
          value: Object.freeze({ p: 1, s: 0 }),
        };
      }
      const control = syndicateReadoutControl(region);
      if (controls.resolve(control) === undefined) captureReadout(region);
      const handle = controls.resolve(control);
      if (handle === undefined) return { kind: "absent" };

      const scan = mechanics.readRoundedValues(() => {
        controls.invoke(handle, SYNDICATE_SCAN_METHOD, [region]);
      });
      if (scan.kind === "absent") return { kind: "absent" };
      if (scan.kind === "invalid") return { kind: "invalid" };
      return readSyndicateSample(scan.value);
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
