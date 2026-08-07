import {
  getOptionsModalButtonDefinitions,
  type OptionsModalBuilderKey,
  type OptionsModalButtonDefinition,
} from "../../domain/options-modal.ts";
import type {
  OptionsModalSettingsReader,
  OptionsModalSettingsWriter,
} from "../../ports/options-modal.ts";

interface ModalElement {
  readonly id?: string;
  style: { display: string };
}

interface ModalDocument {
  readonly body: unknown;
  getElementById(id: string): ModalElement | null;
}

interface JQueryEvent {
  readonly target?: { readonly id?: string };
  readonly data?: {
    readonly label: string;
    readonly name: string;
    readonly type: "boolean";
  };
}

interface JQueryInput {
  checked: boolean;
}

interface JQueryNode {
  readonly length: number;
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  prepend(content: unknown): JQueryNode;
  toggleClass(className: string, value: boolean): JQueryNode;
  removeClass(className: string): JQueryNode;
  css(property: string, value: string): JQueryNode;
  prop(property: string, value: unknown): JQueryNode;
  on(events: string, handler: (event: JQueryEvent) => void): JQueryNode;
  on(
    events: string,
    selector: string,
    handler: (this: JQueryInput, event: JQueryEvent) => void,
  ): JQueryNode;
  on(
    events: string,
    data: unknown,
    handler: (event: JQueryEvent) => void,
  ): JQueryNode;
  appendTo(node: JQueryNode): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;
type Action = () => void;
type OptionsBuilder = (node: JQueryNode, prefix: string) => void;

/** Builders for every secondary-option button, keyed by the domain builder key. */
export type OptionsModalBrowserBuilders = Record<
  OptionsModalBuilderKey,
  OptionsBuilder
>;

interface OptionsModalBrowserDependencies {
  readonly getDocument: () => ModalDocument;
  readonly getJQuery: () => JQuery;
  readonly getWindow: () => unknown;
  readonly getSettingsReader: () => OptionsModalSettingsReader;
  readonly getSettingsWriter: () => OptionsModalSettingsWriter;
  readonly getBuilders: () => OptionsModalBrowserBuilders;
  readonly openOverrideModal: (event: JQueryEvent) => void;
}

export interface OptionsModalBrowserAdapter {
  createSettingToggle(
    node: JQueryNode,
    settingName: string,
    title: string,
    enabledCallback?: Action,
    disabledCallback?: Action,
  ): void;
  updateOptionsUI(): void;
  addOptionUI(
    optionsId: string,
    querySelectorText: string,
    modalTitle: string,
    buildOptionsFunction: OptionsBuilder,
  ): void;
  openOptionsModal(
    modalTitle: string,
    buildOptionsFunction: OptionsBuilder,
  ): void;
  createOptionsModal(): void;
}

function getBuilder(
  builders: OptionsModalBrowserBuilders,
  key: OptionsModalBuilderKey,
): OptionsBuilder {
  return builders[key];
}

/** Owns the shared browser modal and generic automation-toggle boundary. */
export function createOptionsModalBrowserAdapter({
  getDocument,
  getJQuery,
  getWindow,
  getSettingsReader,
  getSettingsWriter,
  getBuilders,
  openOverrideModal,
}: OptionsModalBrowserDependencies): OptionsModalBrowserAdapter {
  function createSettingToggle(
    node: JQueryNode,
    settingName: string,
    title: string,
    enabledCallback?: Action,
    disabledCallback?: Action,
  ): void {
    const state = getSettingsReader().readToggle(settingName);
    const toggle = getJQuery()(
      `
          <label class="switch script_bg_${settingName}" tabindex="0" title="${title}">
            <input class="script_${settingName}" type="checkbox"${
              state.checked ? " checked" : ""
            }/>
            <span class="check"></span><span>${settingName}</span>
          </label><br>`,
    ).toggleClass("inactive-row", state.inactive);

    if (state.checked && enabledCallback) enabledCallback();

    toggle.on("change", "input", function (this: JQueryInput) {
      const writer = getSettingsWriter();
      writer.setToggle(settingName, this.checked);
      writer.persist();
      if (this.checked && enabledCallback) enabledCallback();
      if (!this.checked && disabledCallback) disabledCallback();
    });
    toggle.on(
      "click",
      { label: `Toggle (${settingName})`, name: settingName, type: "boolean" },
      openOverrideModal,
    );
    node.append(toggle);
  }

  function updateOptionsUI(): void {
    const builders = getBuilders();
    for (const definition of getOptionsModalButtonDefinitions()) {
      addOptionDefinition(definition, getBuilder(builders, definition.builder));
    }
  }

  function addOptionUI(
    optionsId: string,
    querySelectorText: string,
    modalTitle: string,
    buildOptionsFunction: OptionsBuilder,
  ): void {
    addOptionDefinition(
      {
        id: optionsId,
        selector: querySelectorText,
        title: modalTitle,
        builder: "government",
      },
      buildOptionsFunction,
    );
  }

  function addOptionDefinition(
    definition: OptionsModalButtonDefinition,
    buildOptionsFunction: OptionsBuilder,
  ): void {
    const document = getDocument();
    if (document.getElementById(definition.id) !== null) return;
    const sectionNode = getJQuery()(definition.selector);
    if (sectionNode.length === 0) return;
    const newOptionNode = getJQuery()(
      `<span id="${definition.id}" class="s-options-button has-text-success" style="margin-right:0px">+</span>`,
    );
    sectionNode.prepend(newOptionNode);
    newOptionNode.on("click", () =>
      openOptionsModal(definition.title, buildOptionsFunction),
    );
  }

  function openOptionsModal(
    modalTitle: string,
    buildOptionsFunction: OptionsBuilder,
  ): void {
    const jquery = getJQuery();
    const modalHeader = jquery("#scriptModalHeader");
    modalHeader.empty().off("*");
    modalHeader.append(`<span style="user-select: text">${modalTitle}</span>`);
    jquery(".script-modal-content").removeClass("custom-race-modal");
    const modalBody = jquery("#scriptModalBody");
    modalBody.empty().off("*").removeClass("celestialLab");
    buildOptionsFunction(modalBody, "c_");
    const modal = getDocument().getElementById("scriptModal");
    if (!modal) return;
    jquery("html").css("overflow", "hidden");
    modal.style.display = "block";
  }

  function createOptionsModal(): void {
    const document = getDocument();
    if (document.getElementById("scriptModal") !== null) return;
    const jquery = getJQuery();
    jquery(document.body).append(`
          <div id="scriptModal" class="script-modal content">
            <span id="scriptModalClose" class="script-modal-close">&times;</span>
            <div class="script-modal-content">
              <div id="scriptModalHeader" class="script-modal-header has-text-warning">
                <p>You should never see this modal header...</p>
              </div>
              <div id="scriptModalBody" class="script-modal-body">
                <p>You should never see this modal body...</p>
              </div>
            </div>
          </div>`);
    jquery("#scriptModalClose").on("click", () => {
      jquery("#scriptModal").css("display", "none");
      jquery(".script-modal-content").removeClass(
        "override-modal custom-race-modal",
      );
      jquery("html").css("overflow-y", "scroll");
    });
    jquery(getWindow()).on("click", (event) => {
      if (event.target?.id !== "scriptModal") return;
      jquery("#scriptModal").css("display", "none");
      jquery(".script-modal-content").removeClass(
        "override-modal custom-race-modal",
      );
      jquery("html").css("overflow-y", "scroll");
    });
  }

  return Object.freeze({
    createSettingToggle,
    updateOptionsUI,
    addOptionUI,
    openOptionsModal,
    createOptionsModal,
  });
}
