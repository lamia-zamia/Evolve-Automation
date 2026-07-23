export interface PrestigeTopBarTypeOption {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
}

export interface PrestigeTopBarSelection {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
}

/** Selects the displayed catalog entry while preserving the legacy fallback for unknown values. */
export function selectPrestigeTopBarType(
  options: readonly PrestigeTopBarTypeOption[],
  selectedValue: string,
): PrestigeTopBarSelection {
  const selected = options.find((option) => option.value === selectedValue);
  return (
    selected ?? {
      value: selectedValue,
      label: selectedValue,
      hint: "",
    }
  );
}
