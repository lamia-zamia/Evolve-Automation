import {
  normalizeTriggerValue,
  type TriggerSettingsActionInput,
  type TriggerSettingsInput,
  type TriggerSettingsCheck,
  type TriggerSettingsIntent,
  type TriggerSettingsReadModel,
  type TriggerSettingsRow,
  type TriggerValue,
} from "../../domain/trigger-settings.ts";
import type { TriggerSettingsIntentHandler } from "../../ports/trigger-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}
interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  children(): JQueryNode;
  eq(index: number): JQueryNode;
  val(value?: unknown): JQueryNode | unknown;
  on(events: string, handler: (event?: unknown) => void): JQueryNode;
  sortable(
    option: string | Record<string, unknown>,
    value?: unknown,
  ): JQueryNode | string[];
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface TriggerSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly buildInputNode: (
    arg: string,
    options: unknown,
    value: TriggerValue,
    onChange: (value: unknown) => void,
  ) => unknown;
  readonly sorterHelper: unknown;
}

interface TriggerSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): TriggerSettingsReadModel };
  readonly intents: TriggerSettingsIntentHandler;
  readonly getActions: () => TriggerSettingsBrowserActions;
}

export interface TriggerSettingsBrowserAdapter {
  buildTriggerSettings(): void;
  updateTriggerSettingsContent(): void;
}

function optionsForChecks(
  model: TriggerSettingsReadModel,
): readonly [string, TriggerSettingsCheck][] {
  return Object.entries(model.checks);
}

function actionOptions(
  model: TriggerSettingsReadModel,
): readonly [string, TriggerSettingsActionInput][] {
  return Object.entries(model.actionInputs);
}

export function createTriggerSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: TriggerSettingsBrowserDependencies): TriggerSettingsBrowserAdapter {
  function emitUpdate(
    seq: number,
    field: Extract<TriggerSettingsIntent, { type: "update-trigger" }>["field"],
    value: unknown,
  ): void {
    intents.handle({
      type: "update-trigger",
      seq,
      field,
      value: normalizeTriggerValue(value, `trigger ${seq}.${field}`),
    });
  }

  function buildInput(
    node: JQueryNode,
    check: TriggerSettingsInput | undefined,
    value: TriggerValue,
    onChange: (value: unknown) => void,
  ): void {
    if (check !== undefined) {
      node.append(
        getActions().buildInputNode(check.arg, check.options, value, onChange),
      );
    }
  }

  function buildRequirementType(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    const options = optionsForChecks(model)
      .map(
        ([id, check]) =>
          `<option value="${id}" title="${check.description}">${id.replace(/([A-Z])/g, " $1").trim()}</option>`,
      )
      .join("");
    const select = getJQuery()(
      `<select style="width: 100%"><option value="chain" title="This condition is met when above trigger is complete, always true for first trigger in list">Chain</option>${options}</select>`,
    );
    select.val(row.requirementType);
    node.append(select);
    select.on("change", () =>
      emitUpdate(row.seq, "requirementType", select.val()),
    );
  }

  function buildRequirementId(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    buildInput(
      node,
      model.checks[row.requirementType],
      row.requirementId,
      (value) => emitUpdate(row.seq, "requirementId", value),
    );
  }

  function buildRequirementCount(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    const check = model.checks[row.requirementType];
    if (row.requirementType !== "Boolean" && check !== undefined) {
      const arg = model.booleanResultChecks.includes(row.requirementType)
        ? "boolean"
        : "number";
      buildInput(node, { ...check, arg }, row.requirementCount, (value) =>
        emitUpdate(row.seq, "requirementCount", value),
      );
    }
  }

  function buildActionType(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    const select = getJQuery()(
      `<select style="width: 100%"><option value="research" title="Research technology">Research</option><option value="build" title="Build buildings up to 'count' amount">Build</option><option value="arpa" title="Build projects up to 'count' amount">A.R.P.A.</option></select>`,
    );
    select.val(row.actionType);
    node.append(select);
    select.on("change", () => emitUpdate(row.seq, "actionType", select.val()));
  }

  function buildActionId(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    const input =
      model.actionInputs[
        row.actionType === "research"
          ? "research"
          : row.actionType === "build"
            ? "building"
            : row.actionType === "arpa"
              ? "project"
              : ""
      ];
    buildInput(node, input, row.actionId, (value) =>
      emitUpdate(row.seq, "actionId", value),
    );
  }

  function buildActionCount(
    row: TriggerSettingsRow,
    node: JQueryNode,
    model: TriggerSettingsReadModel,
  ): void {
    node.empty().off("*");
    if (row.actionType === "build" || row.actionType === "arpa") {
      const input =
        model.actionInputs[row.actionType === "build" ? "building" : "project"];
      if (input !== undefined)
        buildInput(
          node,
          { ...input, arg: "number" },
          row.actionCount,
          (value) => emitUpdate(row.seq, "actionCount", value),
        );
    }
  }

  function buildActions(row: TriggerSettingsRow, node: JQueryNode): void {
    node.empty().off("*");
    const deleteButton = getJQuery()(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>X</span></a>',
    );
    const duplicateButton = getJQuery()(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>&#9282;</span></a>',
    );
    const evalizeButton = getJQuery()(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>E</span></a>',
    );
    deleteButton.on("click", () =>
      intents.handle({ type: "remove-trigger", seq: row.seq }),
    );
    duplicateButton.on("click", () =>
      intents.handle({ type: "duplicate-trigger", seq: row.seq }),
    );
    evalizeButton.on("click", () =>
      intents.handle({ type: "evalize-trigger", seq: row.seq }),
    );
    node.append(deleteButton).append(duplicateButton).append(evalizeButton);
  }

  function buildRow(
    row: TriggerSettingsRow,
    model: TriggerSettingsReadModel,
  ): void {
    const rowNode = getJQuery()(`#script_trigger_${row.seq}`);
    const cells = rowNode.children();
    buildRequirementType(row, cells.eq(0), model);
    buildRequirementId(row, cells.eq(1), model);
    buildRequirementCount(row, cells.eq(2), model);
    buildActionType(row, cells.eq(3), model);
    buildActionId(row, cells.eq(4), model);
    buildActionCount(row, cells.eq(5), model);
    buildActions(row, cells.eq(6));
  }

  function buildTriggerSettings(): void {
    const model = reader.read();
    getActions().buildSettingsSection(
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-trigger-settings" }),
      updateTriggerSettingsContent,
    );
  }

  function updateTriggerSettingsContent(): void {
    const model = reader.read();
    const document = getDocument();
    const scroll =
      document.documentElement.scrollTop || document.body.scrollTop;
    const node = getJQuery()(`#script_${model.sectionId}Content`);
    node.empty().off("*");
    node.append(
      '<div style="margin-top: 10px;"><button id="script_trigger_add" class="button">Add New Trigger</button></div>',
    );
    getJQuery()("#script_trigger_add").on("click", () =>
      intents.handle({ type: "add-trigger" }),
    );
    node.append(
      '<table style="width:100%"><tr><th class="has-text-warning" colspan="3">Requirement</th><th class="has-text-warning" colspan="5">Action</th></tr><tr><th class="has-text-warning" style="width:16%">Type</th><th class="has-text-warning" style="width:18%">Value</th><th class="has-text-warning" style="width:6%" title="Numerical variables compared to this value using &gt;=, boolean variables - using &gt;=. String variables not currently supported by triggers.">Result</th><th class="has-text-warning" style="width:16%">Type</th><th class="has-text-warning" style="width:18%">Id</th><th class="has-text-warning" style="width:6%">Count</th><th style="width:20%"></th></tr><tbody id="script_triggerTableBody"></tbody></table>',
    );
    const body = getJQuery()("#script_triggerTableBody");
    const rows = model.rows
      .map(
        (row) =>
          `<tr id="script_trigger_${row.seq}" value="${row.seq}" class="script-draggable"><td style="width:16%"></td><td style="width:18%"></td><td style="width:6%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:6%"></td><td style="width:20%"></td></tr>`,
      )
      .join("");
    body.append(getJQuery()(rows));
    for (const row of model.rows) buildRow(row, model);
    body.sortable({
      items: "tr:not(.unsortable)",
      helper: getActions().sorterHelper,
      update: () => {
        const ids = body.sortable("toArray", { attribute: "value" });
        if (Array.isArray(ids))
          intents.handle({
            type: "reorder-triggers",
            seqs: ids.map((id) => Number(id)),
          });
      },
    });
    document.documentElement.scrollTop = document.body.scrollTop = scroll;
  }

  return Object.freeze({ buildTriggerSettings, updateTriggerSettingsContent });
}
