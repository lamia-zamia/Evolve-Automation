import { GAME_MESSAGE_LOG_ELEMENT_ID } from "../../ports/game-page-shell.ts";
import { isRecord, readProperty } from "../validation.ts";

type GameMessageLogFunction = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Writes activity to DeadSpace's rendered message log. The game's `messageQueue` function is a
 * module-private binding in the unmodified Vue 3 build, so the captured runtime cannot invoke it
 * directly; this adapter follows the same visible DOM contract as its success path.
 */
export function createGameMessageLog(
  documentValue: unknown,
): (message: string) => void {
  return (message: string): void => {
    if (!isRecord(documentValue)) return;

    const getElementById = readProperty(documentValue, "getElementById");
    if (typeof getElementById !== "function") return;
    const log = Reflect.apply(
      getElementById as GameMessageLogFunction,
      documentValue,
      [GAME_MESSAGE_LOG_ELEMENT_ID],
    );
    if (!isRecord(log)) return;

    const createElement = readProperty(documentValue, "createElement");
    if (typeof createElement !== "function") return;
    const entry = Reflect.apply(
      createElement as GameMessageLogFunction,
      documentValue,
      ["p"],
    );
    if (!isRecord(entry)) return;

    entry["className"] = "has-text-success";
    entry["textContent"] = message;
    const prepend = readProperty(log, "prepend");
    if (typeof prepend === "function") {
      Reflect.apply(prepend as GameMessageLogFunction, log, [entry]);
      return;
    }
    const append = readProperty(log, "append");
    if (typeof append === "function") {
      Reflect.apply(append as GameMessageLogFunction, log, [entry]);
    }
  };
}
