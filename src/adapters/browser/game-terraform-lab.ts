/** Captured boundary for DeadSpace `terraformLab()` in `src/space.js` at fdda93b5. */

import type { CelestialLabSession } from "../../ports/game-celestial-lab.ts";
import {
  CELESTIAL_LAB_CONTROL_ID,
  CELESTIAL_LAB_PANEL_SELECTOR,
} from "../../ports/game-celestial-lab.ts";
import type {
  GameTerraformLabPort,
  TerraformLabMutationResult,
  TerraformLabSnapshot,
} from "../../ports/game-terraform-lab.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { finite, isRecord, readProperty } from "../validation.ts";

interface TerraformLabDocument {
  querySelector(selector: string): unknown;
}

interface MountedTerraformLab {
  readonly root: unknown;
  readonly handle: Readonly<GameControlHandle>;
  readonly session: CelestialLabSession;
}

function terraformLabDocument(
  value: unknown,
): TerraformLabDocument | undefined {
  if (
    !isRecord(value) ||
    typeof readProperty(value, "querySelector") !== "function"
  ) {
    return undefined;
  }
  return value as unknown as TerraformLabDocument;
}

function terraformLabRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isRecord(value) ? (value as Record<string, unknown>) : undefined;
}

export function createGameTerraformLab(dependencies: {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
}): GameTerraformLabPort {
  let mounted: MountedTerraformLab | undefined;

  function currentLab(): MountedTerraformLab | undefined {
    const root = dependencies.rootState.readRoot();
    if (root === undefined || dependencies.rootState.isReactivitySuppressed()) {
      return undefined;
    }
    const doc = terraformLabDocument(dependencies.getDocument());
    if (
      doc === undefined ||
      doc.querySelector(CELESTIAL_LAB_PANEL_SELECTOR) == null
    ) {
      return undefined;
    }
    const handle = dependencies.controls.resolve(CELESTIAL_LAB_CONTROL_ID);
    const data =
      handle === undefined ? undefined : terraformLabRecord(handle.data);
    if (
      handle === undefined ||
      data === undefined ||
      terraformLabRecord(readProperty(data, "p")) === undefined ||
      !handle.methods.includes("pEdit") ||
      !handle.methods.includes("setPlanet")
    ) {
      return undefined;
    }
    if (
      mounted === undefined ||
      mounted.root !== root ||
      mounted.handle.generation !== handle.generation
    ) {
      mounted = Object.freeze({
        root,
        handle,
        session: Object.freeze({ identity: Object.freeze({}) }),
      });
    } else {
      mounted = Object.freeze({ ...mounted, handle });
    }
    return mounted;
  }

  function read(): TerraformLabSnapshot | undefined {
    const current = currentLab();
    const doc = terraformLabDocument(dependencies.getDocument());
    if (current === undefined || doc === undefined) return undefined;
    return Object.freeze({
      session: current.session,
      canSubmit:
        current.handle.methods.includes("setPlanet") &&
        current.handle.methods.includes("pEdit") &&
        doc.querySelector(`${CELESTIAL_LAB_PANEL_SELECTOR} .create button`) !=
          null,
    });
  }

  function submit(session: CelestialLabSession): TerraformLabMutationResult {
    const current = currentLab();
    if (
      current === undefined ||
      current.session.identity !== session.identity
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Terraform lab session was replaced",
      });
    }
    const snapshot = read();
    if (
      snapshot === undefined ||
      snapshot.session.identity !== session.identity
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Terraform planet draft is unavailable",
      });
    }
    if (!snapshot.canSubmit) {
      return Object.freeze({
        status: "unavailable",
        reason: "native setPlanet control is unavailable",
      });
    }
    const handle = dependencies.controls.resolve(CELESTIAL_LAB_CONTROL_ID);
    if (
      handle === undefined ||
      handle.generation !== current.handle.generation
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Terraform lab changed before setPlanet",
      });
    }
    const price = dependencies.controls.invoke(handle, "pEdit");
    if (!price.ok) {
      return Object.freeze({
        status: "stale",
        reason: price.detail ?? price.reason,
      });
    }
    const repriced = currentLab();
    if (
      repriced === undefined ||
      repriced.session.identity !== session.identity
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Terraform lab changed during native pEdit",
      });
    }
    const repricedData = terraformLabRecord(repriced.handle.data);
    const repricedPlanet = terraformLabRecord(readProperty(repricedData, "p"));
    const score = finite(readProperty(repricedPlanet, "pts"));
    if (score === undefined || score < 0) {
      return Object.freeze({
        status: "unavailable",
        reason: "native pEdit reports that the current planet is not eligible",
      });
    }
    const currentHandle = dependencies.controls.resolve(
      CELESTIAL_LAB_CONTROL_ID,
    );
    if (
      currentHandle === undefined ||
      currentHandle.generation !== repriced.handle.generation
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Terraform lab changed before setPlanet",
      });
    }
    const result = dependencies.controls.invoke(currentHandle, "setPlanet");
    if (!result.ok) {
      return Object.freeze({
        status: "stale",
        reason: result.detail ?? result.reason,
      });
    }
    if (result.value === false) {
      return Object.freeze({
        status: "rejected",
        reason: "native setPlanet rejected the live planet",
      });
    }
    return Object.freeze({ status: "requested" });
  }

  return Object.freeze({ read, submit });
}
