/**
 * How many copies of each switchable building are running, read live and drawn never.
 *
 * A building's power switch shows two numbers, and upstream computes them as `act.on` and
 * `on_cap() - act.on`. Neither needs a panel: `on` is an ordinary field of the game's own state
 * record, and `on_cap` is a method of the row component the capture already holds.
 *
 * `on_cap` is invoked rather than restated. Its default is the built count, but upstream overrides
 * it for a structure assembled out of segments — the descender, the Tau Ceti server farm, the
 * detector — which is a single machine and caps its switch at one. Those exceptions are exactly the
 * kind of upstream detail that rots when copied, and the component's own method answers all of them
 * and any future one for free. The captured receiver binds a control's sibling methods, which is
 * what `on_cap` needs; the closure itself reads the game's live `global` binding, so a root
 * replacement does not disturb it.
 *
 * Which buildings have a switch at all is not decided here. That comes from the catalog, where the
 * game answered it by drawing the two spans or not drawing them, and it is re-checked against the
 * state record's own `on` property before a count is reported: a building with no switch must stay
 * absent, never appear as fully switched off.
 *
 * Nothing in here can force a draw. A control that is missing, superseded or refuses to answer
 * leaves that one row unreported and is counted; it never invalidates the catalog.
 */

import type {
  BuildingSwitchState,
  BuildingUnlockCatalog,
  GameBuildingSwitchStateReader,
} from "../../../../ports/game-building-unlocks.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import {
  createCountTally,
  type PhaseTimingSink,
} from "../../../../utils/performance.ts";

/** The row component method holding the game's own ceiling for the switch. */
const ON_CAP_METHOD = "on_cap";

/** A switch count: whole, at or above zero, and small enough to stay exact. */
function switchCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export interface CapturedBuildingSwitchStatesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

export function createCapturedBuildingSwitchStates(
  dependencies: CapturedBuildingSwitchStatesDependencies,
): GameBuildingSwitchStateReader {
  const { rootState, controls, diagnostics } = dependencies;

  return Object.freeze({
    read(
      catalog: Readonly<BuildingUnlockCatalog>,
    ): ReadonlyMap<string, Readonly<BuildingSwitchState>> {
      const states = new Map<string, Readonly<BuildingSwitchState>>();
      if (catalog.switches.size === 0) return states;
      const tally = createCountTally(diagnostics);
      const root = rootState.readRoot();
      if (root === undefined) {
        tally.count("building-switch.no-root");
        return states;
      }
      for (const [elementId, address] of catalog.switches) {
        const record = readProperty(
          readProperty(root, address.region),
          address.type,
        );
        // The address was resolved against an earlier root. A region the current root does not
        // carry is a building that is no longer there, which is unreported rather than zero.
        if (!isRecord(record)) {
          tally.count("building-switch.unresolved-state");
          continue;
        }
        // `setAction` creates `on` for every powered structure it draws a switch onto, so its
        // absence is the game saying this record has no switch — the same distinction the drawn
        // spans made, checked again against live state so a stale catalog cannot invent one.
        if (!Object.hasOwn(record, "on")) {
          tally.count("building-switch.unswitchable");
          continue;
        }
        const on = switchCount(record["on"]);
        if (on === undefined) {
          tally.count("building-switch.unresolved-state");
          continue;
        }
        // Re-resolved every read. The game rebinds a row whenever it redraws the panel, and the
        // capture records that on its own, so the newest generation is always a lookup away and a
        // superseded one is never a reason to draw anything.
        const handle = controls.resolve(elementId);
        if (handle === undefined) {
          tally.count("building-switch.on-cap-unavailable");
          continue;
        }
        const result = controls.invoke(handle, ON_CAP_METHOD);
        const cap = result.ok ? switchCount(result.value) : undefined;
        if (cap === undefined) {
          tally.count("building-switch.on-cap-unavailable");
          continue;
        }
        // The game's own arithmetic, unadjusted. A cap below the switched-on count is not a
        // shape this can report — the rendered spans it replaces could not show one either — so
        // the pair goes unreported rather than being clamped into a plausible-looking answer.
        const off = cap - on;
        if (off < 0) {
          tally.count("building-switch.unresolved-state");
          continue;
        }
        tally.count("building-switch.read");
        states.set(elementId, Object.freeze({ on, off }));
      }
      return states;
    },
  });
}
