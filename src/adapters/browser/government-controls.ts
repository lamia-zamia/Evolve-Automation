import type { GovernmentControls } from "../../ports/government-controls.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export function createGovernmentControls(
  getVueById: (id: string) => unknown,
): GovernmentControls {
  function candidateView() {
    const value = getVueById("candidates");
    return typeof value === "object" && value !== null
      ? requireRecord(value, "candidate controls")
      : null;
  }

  return Object.freeze({
    isCandidateAppointmentAvailable: () => {
      const view = candidateView();
      return view !== null && typeof view["appoint"] === "function";
    },
    appointCandidate: (index: number) => {
      const view = candidateView();
      if (view === null || typeof view["appoint"] !== "function") {
        return false;
      }
      const appoint = requireFunction(
        view["appoint"],
        "candidate controls.appoint",
      );
      Reflect.apply(appoint, view, [index]);
      return true;
    },
  });
}
