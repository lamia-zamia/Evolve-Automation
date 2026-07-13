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

    if (numberSuffix[lastChar] !== undefined) {
      numericPortion *= numberSuffix[lastChar];
    }

    return numericPortion;
  }

  function getNumberString(amountValue: number) {
    const suffixes = Object.keys(numberSuffix);
    for (let i = suffixes.length - 1; i >= 0; i--) {
      if (amountValue > numberSuffix[suffixes[i]]) {
        return (
          (amountValue / numberSuffix[suffixes[i]]).toFixed(1) + suffixes[i]
        );
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
