/**
 * Captured read/write adapter for the Trigger settings surface.
 *
 * Rows live in the raw settings record (`triggers`), so every mutation here edits that array
 * directly — no TriggerManager mirror, no compatibility object. The semantics mirror the
 * compatibility panel writer (`src/bootstrap/settings/trigger-settings-control.ts`), which is
 * the panel contract both runtimes share: adds append the same default row, edits reset the
 * dependent fields (`requirementId`/`requirementCount` on a type change, `actionId`/`actionCount`
 * on an action change) and clear completion, and remove/duplicate/reorder renumber
 * `seq`/`priority` by position. Reset restores the captured defaults — an empty list with the
 * toggle off — the same record `resetSection("trigger")` writes through the lifecycle.
 *
 * Persistence belongs to composition: the panel intent handler persists after each mutation.
 * The eval prompt is injected for the same reason — a panel-window effect, not settings state.
 */

import {
  createTriggerSettingsReadModel,
  type TriggerSettingsReadModel,
  type TriggerValue,
} from "../../../../domain/progression/build/trigger-settings.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedTriggerActionInputs,
  readCapturedTriggerBooleanChecks,
  readCapturedTriggerChecksCatalog,
  readCapturedTriggerRows,
} from "./captured-trigger-settings-catalog.ts";

export interface CapturedTriggerSettingsDependencies {
  readonly getSettingsRaw: () => unknown;
  /** Shows the Eval form of a condition for copying; the result is discarded. */
  readonly promptEval?: (message: string, value: string) => void;
}

export interface CapturedTriggerSettingsAdapter {
  readTriggerSettingsReadModel(): TriggerSettingsReadModel;
  addDefault(): void;
  update(
    seq: number,
    field:
      | "requirementType"
      | "requirementId"
      | "requirementCount"
      | "actionType"
      | "actionId"
      | "actionCount",
    value: TriggerValue,
  ): void;
  remove(seq: number): void;
  duplicate(seq: number): void;
  evalize(seq: number): void;
  reorder(seqs: readonly number[]): void;
}

type MutableTriggerRow = Record<string, unknown>;

function readTriggerList(raw: unknown): MutableTriggerRow[] | undefined {
  if (!isRecord(raw)) return undefined;
  return Array.isArray(raw["triggers"])
    ? (raw["triggers"] as MutableTriggerRow[])
    : undefined;
}

function findTriggerIndex(list: readonly unknown[], seq: number): number {
  return list.findIndex((entry, index) => {
    if (!isRecord(entry)) return false;
    const entrySeq = typeof entry["seq"] === "number" ? entry["seq"] : index;
    return entrySeq === seq;
  });
}

function renumberTriggers(list: MutableTriggerRow[]): void {
  list.forEach((entry, index) => {
    entry["seq"] = index;
    entry["priority"] = index;
  });
}

function readEvalText(entry: MutableTriggerRow): string | undefined {
  const requirementType = entry["requirementType"];
  if (typeof requirementType !== "string") return undefined;
  if (requirementType === "Eval") {
    return typeof entry["requirementId"] === "string"
      ? entry["requirementId"]
      : undefined;
  }
  return `_("${requirementType}",${JSON.stringify(entry["requirementId"])})`;
}

export function createCapturedTriggerSettingsAdapter({
  getSettingsRaw,
  promptEval = () => {},
}: CapturedTriggerSettingsDependencies): CapturedTriggerSettingsAdapter {
  const adapter: CapturedTriggerSettingsAdapter = {
    readTriggerSettingsReadModel(): TriggerSettingsReadModel {
      return createTriggerSettingsReadModel({
        rows: readCapturedTriggerRows(getSettingsRaw),
        checks: readCapturedTriggerChecksCatalog(),
        actionInputs: readCapturedTriggerActionInputs(),
        booleanResultChecks: readCapturedTriggerBooleanChecks(),
      });
    },
    addDefault() {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      const next = list.length;
      list.push({
        seq: next,
        priority: next,
        requirementType: "Boolean",
        requirementId: false,
        requirementCount: 1,
        actionType: "research",
        actionId: "tech-club",
        actionCount: 0,
        complete: false,
      });
    },
    update(seq, field, value) {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      const index = findTriggerIndex(list, seq);
      const entry = list[index];
      if (entry === undefined) return;
      entry[field] = value;
      entry["complete"] = false;
      if (field === "requirementType") {
        entry["requirementId"] = false;
        entry["requirementCount"] = 1;
      }
      if (field === "actionType") {
        entry["actionId"] = "";
        entry["actionCount"] = 0;
      }
    },
    remove(seq) {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      const index = findTriggerIndex(list, seq);
      if (index === -1) return;
      list.splice(index, 1);
      renumberTriggers(list);
    },
    duplicate(seq) {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      const index = findTriggerIndex(list, seq);
      const source = list[index];
      if (source === undefined) return;
      list.splice(index, 0, {
        seq: 0,
        priority: 0,
        requirementType: source["requirementType"],
        requirementId: source["requirementId"],
        requirementCount: source["requirementCount"],
        actionType: source["actionType"],
        actionId: source["actionId"],
        actionCount: source["actionCount"],
        complete: false,
      });
      renumberTriggers(list);
    },
    evalize(seq) {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      const entry = list[findTriggerIndex(list, seq)];
      if (entry === undefined) return;
      const text = readEvalText(entry);
      if (text === undefined) return;
      promptEval("Eval of this condition:", text);
    },
    reorder(seqs) {
      const list = readTriggerList(getSettingsRaw());
      if (list === undefined) return;
      seqs.forEach((seq, index) => {
        const entry = list[findTriggerIndex(list, seq)];
        if (entry !== undefined) entry["priority"] = index;
      });
    },
  };
  return Object.freeze(adapter);
}
