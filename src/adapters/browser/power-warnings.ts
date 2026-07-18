import type { PowerWarningSource } from "../../ports/power.ts";

export function createPowerWarningSource(
  getDocument: () => Document,
  getWindow: () => unknown,
): PowerWarningSource {
  return Object.freeze({
    readDebugEnabled(): boolean {
      const value = getWindow();
      return (
        typeof value === "object" &&
        value !== null &&
        Reflect.get(value, "powerDebug") === true
      );
    },

    readWarnedBuildingDomIds(): readonly string[] {
      return Object.freeze(
        Array.from(getDocument().querySelectorAll("span.on.warn")).map(
          (element) => element.parentElement?.id ?? "",
        ),
      );
    },
  });
}
