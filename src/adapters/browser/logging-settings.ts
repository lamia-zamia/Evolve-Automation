import {
  type LoggingSettingsControl,
  type LoggingSettingsReadModel,
} from "../../domain/logging-settings.ts";
import type { LoggingSettingsIntentHandler } from "../../ports/logging-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface FilterInput {
  value: string;
}

interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: string): JQueryNode;
  on(events: string, handler: (this: FilterInput) => void): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface LoggingSettingsBrowserActions {
  readonly buildSettingsSection2: (
    parentNode: JQueryNode,
    secondaryPrefix: string,
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: (secondaryPrefix: string) => void,
  ) => void;
  readonly addSettingsHeader1: (node: JQueryNode, headerText: string) => void;
  readonly addSettingsString: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}

interface LoggingSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => LoggingSettingsReadModel;
  readonly intents: LoggingSettingsIntentHandler;
  readonly getActions: () => LoggingSettingsBrowserActions;
}

export interface LoggingSettingsBrowserAdapter {
  buildLoggingSettings(parentNode: JQueryNode, secondaryPrefix: string): void;
  updateLoggingSettingsContent(secondaryPrefix: string): void;
}

export function createLoggingSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: LoggingSettingsBrowserDependencies): LoggingSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: LoggingSettingsControl,
    actions: LoggingSettingsBrowserActions,
  ): void {
    switch (control.kind) {
      case "header":
        actions.addSettingsHeader1(node, control.label);
        return;
      case "string":
        actions.addSettingsString(
          node,
          control.settingName,
          control.label,
          control.hint,
        );
        return;
      case "toggle":
        actions.addSettingsToggle(
          node,
          control.settingName,
          control.label,
          control.hint,
        );
        return;
    }
  }

  function buildLoggingSettings(
    parentNode: JQueryNode,
    secondaryPrefix: string,
  ): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({
          type: "reset-logging-settings",
          secondaryPrefix,
        });
      },
      updateLoggingSettingsContent,
    );
  }

  function updateLoggingSettingsContent(secondaryPrefix: string): void {
    const readModel = getReadModel();
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: `${secondaryPrefix}${readModel.sectionId}`,
      },
      (currentNode) => {
        renderLoggingContent(currentNode, readModel, actions);
      },
    );
  }

  function renderLoggingContent(
    currentNode: JQueryNode,
    readModel: LoggingSettingsReadModel,
    actions: LoggingSettingsBrowserActions,
  ): void {
    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    const stringsUrl = `strings/strings${
      readModel.locale === "en-US" ? "" : "." + readModel.locale
    }.json`;
    currentNode.append(`
          <div>
            <span>List of message IDs to filter, all game messages can be found <a href="${stringsUrl}" target="_blank">here</a>.</span><br>
            <textarea id="script_logFilter" class="textarea" style="margin-top: 4px;">${readModel.logFilter}</textarea>
          </div>`);

    getJQuery()("#script_logFilter").on("change", function (this: FilterInput) {
      intents.handle({ type: "set-log-filter", value: this.value });
      this.value = getReadModel().logFilter;
    });
  }

  return Object.freeze({
    buildLoggingSettings,
    updateLoggingSettingsContent,
  });
}
