import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface OptionsModalUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createOptionsModalUI({
  getDependency,
  getOverride,
}: OptionsModalUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const buildFleetSettings = liveFunction(() =>
    getDependency("buildFleetSettings"),
  );
  const buildGovernmentSettings = liveFunction(() =>
    getDependency("buildGovernmentSettings"),
  );
  const buildHellSettings = liveFunction(() =>
    getDependency("buildHellSettings"),
  );
  const buildWarSettings = liveFunction(() =>
    getDependency("buildWarSettings"),
  );
  const document = liveObject(() => getDependency("document"));
  const openOverrideModal = liveFunction(() =>
    getDependency("openOverrideModal"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );
  const window = liveObject(() => getDependency("window"));

  function createSettingToggleImpl(
    node,
    settingKey,
    title,
    enabledCallBack,
    disabledCallBack,
  ) {
    let toggle = $(`
          <label class="switch script_bg_${settingKey}" tabindex="0" title="${title}">
            <input class="script_${settingKey}" type="checkbox"${
              settingsRaw[settingKey] ? " checked" : ""
            }/>
            <span class="check"></span><span>${settingKey}</span>
          </label><br>`).toggleClass(
      "inactive-row",
      Boolean(settingsRaw.overrides[settingKey]),
    );

    if (settingsRaw[settingKey] && enabledCallBack) {
      enabledCallBack();
    }

    toggle.on("change", "input", function (this: Loose) {
      settingsRaw[settingKey] = this.checked;
      updateSettingsFromState();
      if (settingsRaw[settingKey] && enabledCallBack) {
        enabledCallBack();
      }
      if (!settingsRaw[settingKey] && disabledCallBack) {
        disabledCallBack();
      }
    });
    toggle.on(
      "click",
      { label: `Toggle (${settingKey})`, name: settingKey, type: "boolean" },
      openOverrideModal,
    );

    node.append(toggle);
  }

  function updateOptionsUIImpl() {
    // Build secondary options buttons if they don't currently exist
    addOptionUI(
      "s-government-options",
      "#government .tabs ul",
      "Government",
      buildGovernmentSettings,
    );
    addOptionUI(
      "s-foreign-options",
      "#garrison div h2",
      "Foreign Affairs",
      buildWarSettings,
    );
    addOptionUI(
      "s-foreign-options2",
      "#c_garrison div h2",
      "Foreign Affairs",
      buildWarSettings,
    );
    addOptionUI("s-hell-options", "#gFort div h3", "Hell", buildHellSettings);
    addOptionUI(
      "s-hell-options2",
      "#prtl_fortress div h3",
      "Hell",
      buildHellSettings,
    );
    addOptionUI("s-fleet-options", "#hfleet h3", "Fleet", buildFleetSettings);
  }

  function addOptionUIImpl(
    optionsId,
    querySelectorText,
    modalTitle,
    buildOptionsFunction,
  ) {
    if (document.getElementById(optionsId) !== null) {
      return;
    } // We've already built the options UI

    let sectionNode = $(querySelectorText);

    if (sectionNode.length === 0) {
      return;
    } // The node that we want to add it to doesn't exist yet

    let newOptionNode = $(
      `<span id="${optionsId}" class="s-options-button has-text-success" style="margin-right:0px">+</span>`,
    );
    sectionNode.prepend(newOptionNode);
    newOptionNode.on("click", function () {
      openOptionsModal(modalTitle, buildOptionsFunction);
    });
  }

  function openOptionsModalImpl(modalTitle, buildOptionsFunction) {
    // Build content
    let modalHeader = $("#scriptModalHeader");
    modalHeader.empty().off("*");
    modalHeader.append(`<span style="user-select: text">${modalTitle}</span>`);

    $(".script-modal-content").removeClass("custom-race-modal");
    let modalBody = $("#scriptModalBody");
    modalBody.empty().off("*").removeClass("celestialLab");
    buildOptionsFunction(modalBody, "c_");

    // Show modal
    let modal = document.getElementById("scriptModal");
    $("html").css("overflow", "hidden");
    modal.style.display = "block";
  }

  function createOptionsModalImpl() {
    if (document.getElementById("scriptModal") !== null) {
      return;
    }

    // Append the script modal to the document
    $(document.body).append(`
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

    // Add the script modal close button action
    $("#scriptModalClose").on("click", function () {
      $("#scriptModal").css("display", "none");
      $(".script-modal-content").removeClass(
        "override-modal custom-race-modal",
      );
      $("html").css("overflow-y", "scroll");
    });

    // If the user clicks outside the modal then close it
    $(window).on("click", function (event) {
      if (event.target.id === "scriptModal") {
        $("#scriptModal").css("display", "none");
        $(".script-modal-content").removeClass(
          "override-modal custom-race-modal",
        );
        $("html").css("overflow-y", "scroll");
      }
    });
  }

  function createSettingToggle(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createSettingToggle") ?? createSettingToggleImpl;
    return implementation.apply(this, args);
  }

  function updateOptionsUI(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateOptionsUI") ?? updateOptionsUIImpl;
    return implementation.apply(this, args);
  }

  function addOptionUI(this: Loose, ...args: Loose[]) {
    const implementation = getOverride("addOptionUI") ?? addOptionUIImpl;
    return implementation.apply(this, args);
  }

  function openOptionsModal(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("openOptionsModal") ?? openOptionsModalImpl;
    return implementation.apply(this, args);
  }

  function createOptionsModal(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createOptionsModal") ?? createOptionsModalImpl;
    return implementation.apply(this, args);
  }

  return {
    createSettingToggle,
    updateOptionsUI,
    addOptionUI,
    openOptionsModal,
    createOptionsModal,
  };
}
