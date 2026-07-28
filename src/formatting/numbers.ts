type NumberFormattingDependencies = {
  numberSuffix: Record<string, number>;
};

export function createNumberFormatting({
  numberSuffix,
}: NumberFormattingDependencies) {
  function getRealNumber(amountText: string) {
    if (amountText === "") {
      return 0;
    }

    let numericPortion = parseFloat(amountText);
    const lastChar = amountText[amountText.length - 1];
    const magnitude =
      lastChar === undefined ? undefined : numberSuffix[lastChar];

    if (magnitude !== undefined) {
      numericPortion *= magnitude;
    }

    return numericPortion;
  }

  function getNumberString(amountValue: number) {
    const suffixes = Object.entries(numberSuffix);
    for (let i = suffixes.length - 1; i >= 0; i--) {
      const entry = suffixes[i];
      if (entry === undefined) {
        continue;
      }
      const [suffix, magnitude] = entry;
      if (amountValue > magnitude) {
        return (amountValue / magnitude).toFixed(1) + suffix;
      }
    }
    return Math.ceil(amountValue);
  }

  function getNiceNumber(amountValue: number) {
    return parseFloat(
      amountValue < 1 ? amountValue.toPrecision(2) : amountValue.toFixed(2),
    );
  }

  return { getRealNumber, getNumberString, getNiceNumber };
}
