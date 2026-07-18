import type { PsychicDecision, PsychicPower } from "../../domain/psychic.ts";
import type { PsychicControls } from "../../ports/psychic.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export interface PsychicControlsDependencies {
  // TRANSITIONAL: Psychic powers currently call Vue 2 views directly and use
  // a jQuery selector to change the boost radio. Replace both in the Vue 3
  // browser-adapter slice.
  readonly getVueById: (id: string) => unknown;
  readonly clickSelector: (selector: string) => void;
}

const CONTROL_BY_POWER: Readonly<
  Record<PsychicPower, { readonly id: string; readonly method: string }>
> = Object.freeze({
  murder: Object.freeze({ id: "psychicKill", method: "murder" }),
  mind_break: Object.freeze({
    id: "psychicMindBreak",
    method: "breakMind",
  }),
  stun: Object.freeze({ id: "psychicCapture", method: "stun" }),
  profit: Object.freeze({ id: "psychicFinance", method: "boostVal" }),
  boost: Object.freeze({ id: "psychicBoost", method: "boostVal" }),
  assault: Object.freeze({ id: "psychicAssault", method: "boostVal" }),
});

export function createPsychicControls(
  dependencies: PsychicControlsDependencies,
): PsychicControls {
  return Object.freeze({
    activate(decision: Readonly<PsychicDecision>): boolean {
      const control = CONTROL_BY_POWER[decision.power];
      const rawView = dependencies.getVueById(control.id);
      if (!rawView) return false;
      const view = requireRecord(rawView, `${control.id} Vue view`);
      if (typeof view[control.method] !== "function") return false;
      const method = requireFunction(
        view[control.method],
        `${control.id} Vue view.${control.method}`,
      );
      if (decision.power === "boost") {
        const resourceId = decision.boostedResourceId;
        if (resourceId === null) return false;
        dependencies.clickSelector(
          `#psychicBoost #psyhscrolltarget input[value="${resourceId}"]`,
        );
      }
      Reflect.apply(method, view, []);
      return true;
    },
  });
}
