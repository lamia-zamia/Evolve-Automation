/**
 * Reading an exported script-settings blob, before anything is written.
 *
 * Imported settings are untrusted text: they can carry custom expressions that the script's own
 * evaluator later runs with full page access. This module answers two questions about a candidate
 * blob — is it a settings record at all, and which pieces of it would become executable code — so
 * the composition can put the second in front of the player before replacing anything.
 */

import { isNonArrayRecord, readProperty } from "../validation.ts";

export interface SettingsImportRejected {
  readonly ok: false;
  readonly reason: string;
}

export interface SettingsImportAccepted {
  readonly ok: true;
  readonly settings: Record<string, unknown>;
  /** Every imported string the custom-expression evaluator would run, in encounter order. */
  readonly evalSources: readonly string[];
}

export type SettingsImportInspection =
  SettingsImportRejected | SettingsImportAccepted;

/** The marker the log formatter uses to splice an expression into otherwise plain text. */
const EMBEDDED_EVAL_MARKER = "{eval:";

function collectOverrideEvalSources(
  overrides: unknown,
  collected: string[],
): void {
  if (!isNonArrayRecord(overrides)) return;
  for (const list of Object.values(overrides)) {
    if (!Array.isArray(list)) continue;
    for (const override of list) {
      // Either operand of an override condition can itself be an expression, and the replacement
      // value can embed one. Fields are read per override rather than per setting name: a blob that
      // carries an expression under an unexpected key still carries an expression.
      const type1 = readProperty(override, "type1");
      const type2 = readProperty(override, "type2");
      const arg1 = readProperty(override, "arg1");
      const arg2 = readProperty(override, "arg2");
      const ret = readProperty(override, "ret");
      if (type1 === "Eval" && typeof arg1 === "string") collected.push(arg1);
      if (type2 === "Eval" && typeof arg2 === "string") collected.push(arg2);
      if (typeof ret === "string" && ret.includes(EMBEDDED_EVAL_MARKER)) {
        collected.push(ret);
      }
    }
  }
}

function collectTriggerEvalSources(
  triggers: unknown,
  collected: string[],
): void {
  if (!Array.isArray(triggers)) return;
  for (const trigger of triggers) {
    if (readProperty(trigger, "requirementType") !== "Eval") continue;
    const requirementId = readProperty(trigger, "requirementId");
    if (typeof requirementId === "string") collected.push(requirementId);
  }
}

export function inspectImportedSettings(
  text: string,
): SettingsImportInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `not valid JSON (${String(error)})` };
  }
  if (!isNonArrayRecord(parsed)) {
    return { ok: false, reason: "not a settings object" };
  }
  if (Object.keys(parsed).length === 0) {
    return { ok: false, reason: "settings object is empty" };
  }
  const evalSources: string[] = [];
  collectOverrideEvalSources(readProperty(parsed, "overrides"), evalSources);
  collectTriggerEvalSources(readProperty(parsed, "triggers"), evalSources);
  const prestigeFormat = readProperty(parsed, "log_prestige_format");
  if (
    typeof prestigeFormat === "string" &&
    prestigeFormat.includes(EMBEDDED_EVAL_MARKER)
  ) {
    evalSources.push(prestigeFormat);
  }
  return { ok: true, settings: parsed, evalSources };
}
