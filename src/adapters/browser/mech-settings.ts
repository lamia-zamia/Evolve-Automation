import type {
  MechSettingsControl,
  MechSettingsReadModel,
} from "../../domain/combat/mech-settings.ts";
import type { MechSettingsIntentHandler } from "../../ports/mech-settings.ts";
interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}
interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  on(events: string, handler: () => void): JQueryNode;
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;
export interface MechSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsSelect: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    options: readonly unknown[],
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addStandardHeading: (node: JQueryNode, label: string) => unknown;
  readonly calculateMechStats: () => void;
}
interface MechSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): MechSettingsReadModel };
  readonly intents: MechSettingsIntentHandler;
  readonly getActions: () => MechSettingsBrowserActions;
}
export interface MechSettingsBrowserAdapter {
  buildMechSettings(): void;
  updateMechSettingsContent(): void;
}

export function createMechSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: MechSettingsBrowserDependencies): MechSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: MechSettingsControl,
    actions: MechSettingsBrowserActions,
  ): void {
    if (control.kind === "header") {
      actions.addStandardHeading(node, control.label);
      return;
    }
    if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    if (control.kind === "toggle") {
      actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    actions.addSettingsSelect(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.options,
    );
  }
  function buildMechSettings(): void {
    const model = reader.read();
    getActions().buildSettingsSection(
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-mech-settings" }),
      updateMechSettingsContent,
    );
  }
  function updateMechSettingsContent(): void {
    const model = reader.read();
    const document = getDocument();
    const scroll =
      document.documentElement.scrollTop || document.body.scrollTop;
    const actions = getActions();
    const node = getJQuery()(`#script_${model.sectionId}Content`);
    node.empty().off("*");
    for (const control of model.controls) {
      renderControl(node, control, actions);
      if (control.kind === "header") {
        const statsControls = getJQuery()(
          `<div style="margin-top: 5px; display: inline-flex;"></div>`,
        );
        statsControls.append(
          `<label class="switch" title="This switch have no ingame effect, and used to configure calculator below"><input id="script_mechStatsCompact" type="checkbox" checked><span class="check"></span><span style="margin-left: 10px;">Compact</span></label>`,
        );
        statsControls.append(
          `<label class="switch" title="This switch have no ingame effect, and used to configure calculator below"><input id="script_mechStatsEfficient" type="checkbox" checked><span class="check"></span><span style="margin-left: 10px;">Efficient</span></label>`,
        );
        statsControls.append(
          `<label class="switch" title="This switch have no ingame effect, and used to configure calculator below"><input id="script_mechStatsSpecial" type="checkbox" checked><span class="check"></span><span style="margin-left: 10px;">Special</span></label>`,
        );
        statsControls.append(
          `<label class="switch" title="This switch have no ingame effect, and used to configure calculator below"><input id="script_mechStatsGravity" type="checkbox"><span class="check"></span><span style="margin-left: 10px;">Gravity</span></label>`,
        );
        statsControls.append(
          `<label class="switch" title="This input have no ingame effect, and used to configure calculator below"><input id="script_mechStatsScouts" class="input is-small" style="height: 25px; width: 50px" type="text" value="0"><span style="margin-left: 10px;">Scouts</span></label>`,
        );
        statsControls.on("input", actions.calculateMechStats);
        node.append(statsControls);
        node.append(
          `<table class="selectable"><tbody id="script_mechStatsTable"><tbody></table>`,
        );
        actions.calculateMechStats();
      }
    }
    document.documentElement.scrollTop = document.body.scrollTop = scroll;
  }
  return Object.freeze({ buildMechSettings, updateMechSettingsContent });
}
