import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface LoggingSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createLoggingSettings({
  getDependency,
  getOverride,
}: LoggingSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const GameLog = liveFunction(() => getDependency("GameLog"));
  const addSettingsHeader1 = liveFunction(() =>
    getDependency("addSettingsHeader1"),
  );
  const addSettingsString = liveFunction(() =>
    getDependency("addSettingsString"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildFilterRegExp = liveFunction(() =>
    getDependency("buildFilterRegExp"),
  );
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const resetLoggingSettings = liveFunction(() =>
    getDependency("resetLoggingSettings"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildLoggingSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "logging";
    let sectionName = "Logging";

    let resetFunction = function () {
      resetLoggingSettings(true);
      updateSettingsFromState();
      updateLoggingSettingsContent(secondaryPrefix);
      buildFilterRegExp();
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateLoggingSettingsContent,
    );
  }

  function updateLoggingSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}loggingContent`);
    currentNode.empty().off("*");

    addSettingsHeader1(currentNode, "Script Messages");
    addSettingsToggle(
      currentNode,
      "logEnabled",
      "Enable logging",
      "Master switch to enable logging of script actions in the game message queue",
    );
    Object.entries(GameLog.Types).forEach(([id, label]) =>
      addSettingsToggle(
        currentNode,
        "log_" + id,
        label,
        `If logging is enabled then logs ${label} actions`,
      ),
    );
    addSettingsString(
      currentNode,
      "log_prestige_format",
      "Prestige Log Format",
      "Available placeholders: {resetType}, {species}, {timestamp} (in game days). Use {eval: XXX } to log custom information",
    );

    addSettingsHeader1(currentNode, "Game Messages");
    addSettingsToggle(
      currentNode,
      "hellTurnOffLogMessages",
      "Turn off patrol and surveyor log messages",
      "Automatically turns off the hell patrol and surveyor log messages",
    );
    let stringsUrl = `strings/strings${
      game.global.settings.locale === "en-US"
        ? ""
        : "." + game.global.settings.locale
    }.json`;
    currentNode.append(`
          <div>
            <span>List of message IDs to filter, all game messages can be found <a href="${stringsUrl}" target="_blank">here</a>.</span><br>
            <textarea id="script_logFilter" class="textarea" style="margin-top: 4px;">${settingsRaw.logFilter}</textarea>
          </div>`);

    // Settings textarea
    $("#script_logFilter").on("change", function (this: Loose) {
      settingsRaw.logFilter = this.value;
      buildFilterRegExp();
      this.value = settingsRaw.logFilter;
      updateSettingsFromState();
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildLoggingSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildLoggingSettings") ?? buildLoggingSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateLoggingSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateLoggingSettingsContent") ??
      updateLoggingSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildLoggingSettings, updateLoggingSettingsContent };
}
