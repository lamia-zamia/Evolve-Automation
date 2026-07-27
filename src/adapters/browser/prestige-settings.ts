import {
  type PrestigeSettingsControl,
  type PrestigeSettingsReadModel,
} from "../../domain/progression/prestige/prestige-settings.ts";
import type { PrestigeSettingsIntentHandler } from "../../ports/prestige-settings.ts";
interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}
interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  find(selector: string): JQueryNode;
  val(value?: unknown): JQueryNode | unknown;
  toggleClass(name: string, value: boolean): JQueryNode;
  on(events: string, dataOrHandler: unknown, handler?: unknown): JQueryNode;
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;
export interface PrestigeSettingsBrowserActions {
  readonly buildSettingsSection2: (
    parent: JQueryNode,
    prefix: string,
    id: string,
    name: string,
    reset: Action,
    update: (prefix: string) => void,
  ) => void;
  readonly addSettingsHeader1: (node: JQueryNode, label: string) => unknown;
  readonly addSettingsNumber: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
  ) => unknown;
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
  readonly openOverrideModal: (event: unknown) => void;
  readonly openOptionsModal: (title: string, editor: unknown) => void;
  readonly buildCustomRacePresetEditor: unknown;
}
interface PrestigeSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): PrestigeSettingsReadModel };
  readonly intents: PrestigeSettingsIntentHandler;
  readonly getActions: () => PrestigeSettingsBrowserActions;
}
export interface PrestigeSettingsBrowserAdapter {
  buildPrestigeSettings(parent: JQueryNode, prefix: string): void;
  updatePrestigeSettingsContent(prefix: string): void;
}
export function createPrestigeSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: PrestigeSettingsBrowserDependencies): PrestigeSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    prefix: string,
    control: PrestigeSettingsControl,
    actions: PrestigeSettingsBrowserActions,
  ): void {
    if (control.kind === "header")
      return void actions.addSettingsHeader1(node, control.label);
    if (control.kind === "number")
      return void actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    if (control.kind === "toggle")
      return void actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    if (control.kind !== "select") return;
    actions.addSettingsSelect(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.options,
    );
    if (control.settingName === "prestigeCustomRaceMode") {
      const button = getJQuery()(
        '<button class="button" type="button" style="margin:6px 0;">Edit custom race presets…</button>',
      );
      button.on("click", () =>
        actions.openOptionsModal(
          "Custom Race Presets",
          actions.buildCustomRacePresetEditor,
        ),
      );
      node.append(button);
    }
    if (control.settingName === "prestigeType") {
      const select = getJQuery()(`.script_${control.settingName}`).find(
        "select",
      );
      select.on("change", () =>
        intents.handle({
          type: "set-prestige-type",
          value: String(select.val()),
        }),
      );
    }
  }
  function buildPrestigeSettings(parent: JQueryNode, prefix: string): void {
    const model = reader.read();
    getActions().buildSettingsSection2(
      parent,
      prefix,
      model.sectionId,
      model.sectionName,
      () =>
        intents.handle({
          type: "reset-prestige-settings",
          secondaryPrefix: prefix,
        }),
      updatePrestigeSettingsContent,
    );
  }
  function updatePrestigeSettingsContent(prefix: string): void {
    const model = reader.read();
    const document = getDocument();
    const scroll =
      document.documentElement.scrollTop || document.body.scrollTop;
    const actions = getActions();
    const node = getJQuery()(`#script_${prefix}${model.sectionId}Content`);
    node.empty().off("*");
    for (const control of model.controls)
      renderControl(node, prefix, control, actions);
    const prestigeRow = node.find(".script_bg_prestigeType");
    prestigeRow.toggleClass("inactive-row", false).on(
      "click",
      {
        label: "Prestige Type (prestigeType)",
        name: "prestigeType",
        type: "select",
        options: model.prestigeOptions,
      },
      actions.openOverrideModal,
    );
    document.documentElement.scrollTop = document.body.scrollTop = scroll;
  }
  return Object.freeze({
    buildPrestigeSettings,
    updatePrestigeSettingsContent,
  });
}
