import {
  CAPTURED_SHAPESHIFT_CONTROL,
  createCapturedShapeshiftAutomation,
} from "../adapters/evolve/traits/captured-shapeshift.ts";
import {
  CAPTURED_PSYCHIC_CONTROL_IDS,
  createCapturedPsychicAutomation,
} from "../adapters/evolve/traits/captured-psychic.ts";
import {
  CAPTURED_OCULAR_POWER_CONTROL,
  createCapturedOcularPowerAutomation,
} from "../adapters/evolve/traits/captured-ocular-power.ts";
import {
  CAPTURED_WISH_CONTROLS,
  createCapturedWishAutomation,
} from "../adapters/evolve/traits/captured-wish.ts";
import { runShapeshiftAutomation } from "../application/shapeshift.ts";
import { runPsychicAutomation } from "../application/psychic.ts";
import { runOcularPowerAutomation } from "../application/ocular-power.ts";
import { runWishAutomation } from "../application/wish.ts";
import type { CapturedTraitAutomationDependencies } from "../adapters/evolve/traits/captured-trait-automation.ts";

export const CAPTURED_TRAIT_COMPANION_CONTROLS = Object.freeze({
  shapeshift: CAPTURED_SHAPESHIFT_CONTROL,
  psychic: CAPTURED_PSYCHIC_CONTROL_IDS,
  ocularPower: CAPTURED_OCULAR_POWER_CONTROL,
  wish: CAPTURED_WISH_CONTROLS,
});

export interface CapturedTraitCompanionControlDependencies extends Pick<
  CapturedTraitAutomationDependencies,
  "rootState" | "controls" | "readSettings"
> {
  readonly getDocument: () => unknown;
  readonly ensureShapeshiftControls: () => boolean;
  readonly ensurePsychicControls: () => boolean;
  readonly ensureOcularPowerControls: () => boolean;
  readonly ensureWishControls: (
    tier: "minor" | "major",
    wishId: string,
  ) => boolean;
}

export function createCapturedTraitCompanionControl(
  dependencies: CapturedTraitCompanionControlDependencies,
) {
  const shapeshift = createCapturedShapeshiftAutomation({
    rootState: dependencies.rootState,
    controls: dependencies.controls,
    readSettings: dependencies.readSettings,
    ensureControls: dependencies.ensureShapeshiftControls,
  });
  const psychic = createCapturedPsychicAutomation({
    rootState: dependencies.rootState,
    controls: dependencies.controls,
    getDocument: dependencies.getDocument,
    readSettings: dependencies.readSettings,
    ensureControls: dependencies.ensurePsychicControls,
  });
  const ocular = createCapturedOcularPowerAutomation({
    rootState: dependencies.rootState,
    controls: dependencies.controls,
    getDocument: dependencies.getDocument,
    readSettings: dependencies.readSettings,
    ensureControls: dependencies.ensureOcularPowerControls,
  });
  const wish = createCapturedWishAutomation({
    rootState: dependencies.rootState,
    controls: dependencies.controls,
    readSettings: dependencies.readSettings,
    ensureControls: dependencies.ensureWishControls,
  });
  return Object.freeze({
    autoShapeshift: () =>
      runShapeshiftAutomation({
        reader: shapeshift.reader,
        executor: shapeshift.executor,
      }),
    autoPsychic: () =>
      runPsychicAutomation({
        reader: psychic.reader,
        executor: psychic.executor,
      }),
    autoOcularPowers: () =>
      runOcularPowerAutomation({
        reader: ocular.reader,
        executor: ocular.executor,
        controls: ocular.controls,
      }),
    autoWish: () =>
      runWishAutomation({ reader: wish.reader, executor: wish.executor }),
  });
}
