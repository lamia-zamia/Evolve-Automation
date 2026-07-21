/** Immutable description of the Logging settings panel. */
export interface LoggingSettingsMessageType {
  readonly id: string;
  readonly label: string;
}

export type LoggingSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "string";
      settingName: string;
      label: string;
      hint: string;
    }>;

export interface LoggingSettingsReadModel {
  readonly sectionId: "logging";
  readonly sectionName: "Logging";
  readonly locale: string;
  readonly logFilter: string;
  readonly controls: readonly LoggingSettingsControl[];
}

export interface LoggingSettingsReadModelInput {
  readonly messageTypes: readonly LoggingSettingsMessageType[];
  readonly locale: string;
  readonly logFilter: string;
}

export type LoggingSettingsIntent =
  | Readonly<{
      type: "reset-logging-settings";
      secondaryPrefix: string;
    }>
  | Readonly<{
      type: "set-log-filter";
      value: string;
    }>;

function freezeMessageType(
  messageType: LoggingSettingsMessageType,
): LoggingSettingsMessageType {
  return Object.freeze({ ...messageType });
}

/** Build the panel read model from validated logger and settings data. */
export function createLoggingSettingsReadModel({
  messageTypes,
  locale,
  logFilter,
}: LoggingSettingsReadModelInput): LoggingSettingsReadModel {
  const frozenMessageTypes = Object.freeze(messageTypes.map(freezeMessageType));
  const controls: LoggingSettingsControl[] = [
    Object.freeze({ kind: "header", label: "Script Messages" }),
    Object.freeze({
      kind: "toggle",
      settingName: "logEnabled",
      label: "Enable logging",
      hint: "Master switch to enable logging of script actions in the game message queue",
    }),
  ];

  for (const { id, label } of frozenMessageTypes) {
    controls.push(
      Object.freeze({
        kind: "toggle",
        settingName: "log_" + id,
        label,
        hint: `If logging is enabled then logs ${label} actions`,
      }),
    );
  }

  controls.push(
    Object.freeze({
      kind: "string",
      settingName: "log_prestige_format",
      label: "Prestige Log Format",
      hint: "Available placeholders: {resetType}, {species}, {timestamp} (in game days). Use {eval: XXX } to log custom information",
    }),
    Object.freeze({ kind: "header", label: "Game Messages" }),
    Object.freeze({
      kind: "toggle",
      settingName: "hellTurnOffLogMessages",
      label: "Turn off patrol and surveyor log messages",
      hint: "Automatically turns off the hell patrol and surveyor log messages",
    }),
  );

  return Object.freeze({
    sectionId: "logging",
    sectionName: "Logging",
    locale,
    logFilter,
    controls: Object.freeze(controls),
  });
}
