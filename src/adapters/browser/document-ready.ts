import { isRecord, readProperty } from "../validation.ts";

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Runs `start` once the document has been parsed, or immediately if it already has.
 *
 * The script installs its page capture at `document-start`, before the game's own scripts run.
 * Everything else it does still belongs after parsing, which is where it ran before the capture
 * existed; this keeps that timing rather than moving the whole runtime earlier.
 */
export function whenDocumentReady(
  browserGlobal: unknown,
  start: () => void,
): void {
  const document = readProperty(browserGlobal, "document");
  if (!isRecord(document)) {
    start();
    return;
  }
  if (readProperty(document, "readyState") !== "loading") {
    start();
    return;
  }
  const addEventListener = readProperty(document, "addEventListener");
  if (typeof addEventListener !== "function") {
    start();
    return;
  }
  Reflect.apply(addEventListener as AnyFunction, document, [
    "DOMContentLoaded",
    () => {
      start();
    },
    { once: true },
  ]);
}
