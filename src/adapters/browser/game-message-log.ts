import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
import { GAME_MESSAGE_LOG_ELEMENT_ID } from "../../ports/game-page-shell.ts";
import type { GameActivity } from "../../ports/game-message-log.ts";
import { isNonArrayRecord, isRecord, readProperty } from "../validation.ts";

type GameMessageLogFunction = (this: unknown, ...args: unknown[]) => unknown;

interface MessageLogState {
  readonly logs: Record<PropertyKey, unknown>;
  readonly filters: Record<PropertyKey, unknown> | undefined;
}

function readMessageLogState(
  controls: GameControlRegistry | undefined,
): MessageLogState | undefined {
  const data = controls?.resolve("msgQueue")?.data;
  const logs = readProperty(data, "m");
  if (!isNonArrayRecord(logs)) return undefined;
  const filters = readProperty(data, "s");
  return {
    logs,
    filters: isNonArrayRecord(filters) ? filters : undefined,
  };
}

function activityTags(activity: Readonly<GameActivity>): ReadonlySet<string> {
  return new Set(["all", ...activity.tags]);
}

function readMaximum(
  state: Readonly<MessageLogState>,
  tag: string,
): number | undefined {
  const filter = readProperty(state.filters, tag);
  const maximum = readProperty(filter, "max");
  return typeof maximum === "number" &&
    Number.isSafeInteger(maximum) &&
    maximum > 0
    ? maximum
    : undefined;
}

function rememberActivity(
  state: Readonly<MessageLogState>,
  activity: Readonly<GameActivity>,
): void {
  const tags = activityTags(activity);
  for (const tag of tags) {
    const log = readProperty(state.logs, tag);
    if (!Array.isArray(log)) continue;
    log.unshift({ msg: activity.message, color: activity.color });
    const maximum = readMaximum(state, tag);
    if (maximum !== undefined) log.splice(maximum);
  }
}

function isActivityVisibleInMessageLog(
  state: Readonly<MessageLogState> | undefined,
  activity: Readonly<GameActivity>,
): boolean {
  if (state === undefined) return true;
  const view = readProperty(state.logs, "view");
  return typeof view !== "string" || activityTags(activity).has(view);
}

function trimRenderedLog(
  log: Record<PropertyKey, unknown>,
  maximum: number,
): void {
  const children = readProperty(log, "children");
  if (!isRecord(children)) return;
  while (
    typeof children["length"] === "number" &&
    children["length"] > maximum
  ) {
    const last = children[children["length"] - 1];
    if (!isRecord(last)) return;
    const remove = readProperty(last, "remove");
    if (typeof remove !== "function") return;
    Reflect.apply(remove as GameMessageLogFunction, last, []);
  }
}

/**
 * Writes activity to DeadSpace's message-log state and rendered log. The game's `messageQueue`
 * function is module-private in the unmodified Vue 3 build, but the `#msgQueue` binding exposes the
 * same message-log store through the captured Vue data. Updating that store preserves filter
 * switches and the visible DOM path preserves the game's newest-first paragraph shape.
 */
export function createGameMessageLog(
  documentValue: unknown,
  controls?: GameControlRegistry,
): (activity: Readonly<GameActivity>) => void {
  return (activity: Readonly<GameActivity>): void => {
    const state = readMessageLogState(controls);
    if (state !== undefined) rememberActivity(state, activity);
    if (
      !isActivityVisibleInMessageLog(state, activity) ||
      !isRecord(documentValue)
    )
      return;

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

    entry["className"] = `has-text-${activity.color}`;
    entry["textContent"] = activity.message;
    const prepend = readProperty(log, "prepend");
    if (typeof prepend === "function") {
      Reflect.apply(prepend as GameMessageLogFunction, log, [entry]);
      const view =
        state === undefined ? undefined : readProperty(state.logs, "view");
      if (state !== undefined && typeof view === "string") {
        const maximum = readMaximum(state, view);
        if (maximum !== undefined) trimRenderedLog(log, maximum);
      }
      return;
    }
    const append = readProperty(log, "append");
    if (typeof append === "function") {
      Reflect.apply(append as GameMessageLogFunction, log, [entry]);
    }
  };
}
