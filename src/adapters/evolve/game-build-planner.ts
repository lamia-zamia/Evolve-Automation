import type { GameBuildPlannerPort } from "../../ports/game-build-planner.ts";
import {
  isFiniteNumber,
  requireFunction,
  requireRecord,
} from "../validation.ts";
import { readPlannerRun } from "./planner-analysis.ts";

export interface GameBuildPlannerEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getDocument: () => unknown;
  readonly getJQuery: () => unknown;
  readonly getPoly: () => unknown;
  readonly getNiceNumber: (value: number) => number;
}

function readDays(dependencies: GameBuildPlannerEvolveDependencies): number {
  // The run-day read is shared with planner-stats loading, which already
  // validated and normalized it. An unavailable run reads 0 and contributes no
  // sample to the planner stats because that path gates on a loaded run.
  const run = readPlannerRun(dependencies.getGame());
  return run.status === "ready" ? run.run.day : 0;
}

function isPageHidden(
  dependencies: GameBuildPlannerEvolveDependencies,
): boolean {
  const document = dependencies.getDocument();
  return (
    (typeof document === "object" &&
      document !== null &&
      (document as { hidden?: unknown })["hidden"]) === true
  );
}

/**
 * A jQuery selection, keeping the live instance so prototype methods like
 * `html` stay reachable. The array-like `length` is copied for stable reads.
 */
type JQueryCollection = {
  readonly length?: unknown;
  readonly [key: string]: unknown;
};

function readCollection(
  dependencies: GameBuildPlannerEvolveDependencies,
  selector: string,
): { length: number; collection: JQueryCollection } | null {
  const jquery = dependencies.getJQuery();
  if (typeof jquery !== "function") {
    return null;
  }
  const collection = jquery(selector);
  if (
    collection === null ||
    collection === undefined ||
    typeof collection !== "object"
  ) {
    return null;
  }
  const record = collection as JQueryCollection;
  return Object.freeze({
    length: Number(record["length"] ?? 0),
    collection: record,
  });
}

function writeCollectionHtml(
  dependencies: GameBuildPlannerEvolveDependencies,
  selector: string,
  html: string,
): void {
  const read = readCollection(dependencies, selector);
  if (read === null || read["length"] === 0) {
    return;
  }
  const collection = read["collection"];
  const render = requireFunction(collection["html"], `${selector}.html`);
  // jQuery's html() needs the live collection as `this` so it can walk the
  // matched elements; the planner writes into whichever element the selector
  // resolves.
  Reflect.apply(render, collection, [html]);
}

function formatPlannerTime(
  seconds: number,
  dependencies: GameBuildPlannerEvolveDependencies,
): string {
  if (!isFiniteNumber(seconds)) {
    return "";
  }
  const poly = requireRecord(dependencies.getPoly(), "game compatibility");
  const timeFormat = requireFunction(poly["timeFormat"], "poly.timeFormat");
  const formatted = Reflect.apply(timeFormat, poly, [seconds]);
  return typeof formatted === "string" ? formatted : "";
}

/** Evolve adapter for the reads and DOM writes behind the build-planner panel. */
export function createGameBuildPlannerEvolveAdapter(
  dependencies: GameBuildPlannerEvolveDependencies,
): GameBuildPlannerPort {
  return Object.freeze({
    isPageHidden(): boolean {
      return isPageHidden(dependencies);
    },
    readDay(): number {
      return readDays(dependencies);
    },
    plannerListPresent(): boolean {
      return (
        (readCollection(dependencies, "#script_planner-list")?.length ?? 0) > 0
      );
    },
    writePlannerList(html: string): void {
      writeCollectionHtml(dependencies, "#script_planner-list", html);
    },
    writePlannerStats(html: string): void {
      writeCollectionHtml(dependencies, "#script_planner-stats-text", html);
    },
    formatPlannerTime(seconds: number): string {
      return formatPlannerTime(seconds, dependencies);
    },
    formatPlannerNumber(value: number): number {
      return dependencies.getNiceNumber(value);
    },
  });
}
