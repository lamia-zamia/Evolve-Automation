import { createOverrideConditionControls } from "../ui/override-condition-controls.ts";
import { createOverrideEditorControls } from "../ui/override-editor.ts";
import { createSettingsControls } from "../ui/settings-controls.ts";
import { createSettingsInputs } from "../ui/settings-inputs.ts";
import { createOverrideEditor } from "../application/override-editing.ts";

type OverrideEditorDependencies = Parameters<typeof createOverrideEditor>[0];
type SettingsInputDependencies = Parameters<typeof createSettingsInputs>[0];
type ConditionDependencies = Parameters<
  typeof createOverrideConditionControls
>[0];
type OverrideControlDependencies = Parameters<
  typeof createOverrideEditorControls
>[0];
type SettingsControlDependencies = Parameters<typeof createSettingsControls>[0];

export interface SettingsEditorControlDependencies {
  readonly overrideEditor: OverrideEditorDependencies;
  readonly settingsInputs: SettingsInputDependencies;
  readonly conditionControls: Omit<
    ConditionDependencies,
    "overrideEditor" | "buildInputNode"
  >;
  readonly overrideControls: Omit<
    OverrideControlDependencies,
    "overrideEditor" | "conditionControls" | "buildInputNode"
  >;
  readonly settingsControls: Omit<
    SettingsControlDependencies,
    "openOverrideModal" | "buildSelectOptions"
  >;
}

export function createSettingsEditorControl({
  overrideEditor: overrideEditorDependencies,
  settingsInputs: settingsInputDependencies,
  conditionControls: conditionDependencies,
  overrideControls: overrideControlDependencies,
  settingsControls: settingsControlDependencies,
}: SettingsEditorControlDependencies) {
  const overrideEditor = createOverrideEditor(overrideEditorDependencies);
  const inputs = createSettingsInputs(settingsInputDependencies);
  const conditionControls = createOverrideConditionControls({
    ...conditionDependencies,
    overrideEditor,
    buildInputNode: inputs.buildInputNode,
  });
  const overrideControls = createOverrideEditorControls({
    ...overrideControlDependencies,
    overrideEditor,
    conditionControls,
    buildInputNode: inputs.buildInputNode,
  });
  const settingsControls = createSettingsControls({
    ...settingsControlDependencies,
    openOverrideModal: (event) => overrideControls.openOverrideModal(event),
    buildSelectOptions: inputs.buildSelectOptions,
  });

  return Object.freeze({
    ...inputs,
    ...conditionControls,
    ...overrideControls,
    ...settingsControls,
  });
}
