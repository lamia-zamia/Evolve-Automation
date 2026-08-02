import {
  type EvolutionSettingsControl,
  type EvolutionSettingsReadModel,
} from "../../domain/progression/evolution/evolution-settings.ts";
import type { EvolutionSettingsIntentHandler } from "../../ports/evolution-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";
interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  find(selector: string): JQueryNode;
  val(value?: unknown): JQueryNode | unknown;
  html(content?: unknown): JQueryNode | unknown;
  on(events: string, dataOrHandler: unknown, handler?: unknown): JQueryNode;
  sortable(
    option: string | Record<string, unknown>,
    value?: unknown,
  ): JQueryNode | string[];
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;
export interface EvolutionSettingsBrowserActions {
  readonly buildSettingsSection: (
    id: string,
    name: string,
    reset: Action,
    update: Action,
  ) => void;
  readonly addStandardHeading: (node: JQueryNode, label: string) => unknown;
  readonly addSettingsSelect: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
    options: readonly unknown[],
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
  ) => unknown;
  readonly sorterHelper: unknown;
}
interface EvolutionSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): EvolutionSettingsReadModel };
  readonly intents: EvolutionSettingsIntentHandler;
  readonly getActions: () => EvolutionSettingsBrowserActions;
}
export interface EvolutionSettingsBrowserAdapter {
  buildEvolutionSettings(): void;
  updateEvolutionSettingsContent(): void;
}
export function createEvolutionSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: EvolutionSettingsBrowserDependencies): EvolutionSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: EvolutionSettingsControl,
    actions: EvolutionSettingsBrowserActions,
  ): void {
    if (control.kind === "header")
      return void actions.addStandardHeading(node, control.label);
    if (control.kind === "toggle")
      return void actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    actions.addSettingsSelect(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.options,
    );
    if (control.settingName === "userEvolutionTarget")
      getJQuery()(`.script_${control.settingName}`)
        .find("select")
        .on("change", () =>
          intents.handle({
            type: "set-evolution-target",
            value: String(
              getJQuery()(`.script_${control.settingName}`)
                .find("select")
                .val(),
            ),
          }),
        );
  }
  function buildEvolutionSettings(): void {
    const model = reader.read();
    getActions().buildSettingsSection(
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-evolution-settings" }),
      updateEvolutionSettingsContent,
    );
  }
  function updateEvolutionSettingsContent(): void {
    const model = reader.read();
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: model.sectionId,
      },
      (node) => {
        renderEvolutionContent(node, model, actions);
      },
    );
  }

  function renderEvolutionContent(
    node: JQueryNode,
    model: EvolutionSettingsReadModel,
    actions: EvolutionSettingsBrowserActions,
  ): void {
    for (const control of model.controls) renderControl(node, control, actions);
    node.append('<div><span id="script_race_warning"></span></div>');
    if (model.raceWarning)
      getJQuery()("#script_race_warning").html(
        `<span class="${model.raceWarning.className}">${model.raceWarning.text}</span>`,
      );
    node.append(
      '<div style="margin-top:5px"><label for="script_evolution_prestige">Prestige for new evolutions:</label><select id="script_evolution_prestige" style="height:18px;width:150px;float:right"></select></div><div style="margin-top:10px"><button id="script_evlution_add" class="button">Add New Evolution</button></div>',
    );
    const prestige = getJQuery()("#script_evolution_prestige");
    prestige.append(
      model.prestigeOptions
        .map(
          (option) => `<option value="${option.val}">${option.label}</option>`,
        )
        .join(""),
    );
    getJQuery()("#script_evlution_add").on("click", () =>
      intents.handle({
        type: "add-evolution",
        prestigeType: String(prestige.val()),
      }),
    );
    node.append(
      '<table style="width:100%"><tbody id="script_evolutionQueueTable"></tbody></table>',
    );
    const body = getJQuery()("#script_evolutionQueueTable");
    body.append(
      model.queue
        .map(
          (item) =>
            `<tr id="script_evolution_${item.index}" value="${item.index}" class="script-draggable"><td><span class="${item.raceClass}">${item.raceLabel}</span> <span class="${item.prestigeClass}">${item.prestigeLabel}</span> ${item.starLevel - 1}*</td><td><textarea class="textarea">${item.json}</textarea></td><td><a class="button is-dark is-small"><span>X</span></a></td></tr>`,
        )
        .join(""),
    );
    for (const item of model.queue) {
      const row = getJQuery()(`#script_evolution_${item.index}`);
      row
        .find(".button")
        .on("click", () =>
          intents.handle({ type: "remove-evolution", index: item.index }),
        );
      row.find(".textarea").on("change", () =>
        intents.handle({
          type: "edit-evolution",
          index: item.index,
          json: String(row.find(".textarea").val()),
        }),
      );
    }
    body.sortable({
      items: "tr:not(.unsortable)",
      helper: actions.sorterHelper,
      update: () => {
        const ids = body.sortable("toArray", { attribute: "value" });
        if (Array.isArray(ids))
          intents.handle({
            type: "reorder-evolutions",
            indexes: ids.map((id) => Number(id)),
          });
      },
    });
  }
  return Object.freeze({
    buildEvolutionSettings,
    updateEvolutionSettingsContent,
  });
}
