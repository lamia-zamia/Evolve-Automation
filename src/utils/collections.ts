// https://gist.github.com/axelpale/3118596
export function k_combinations<T>(set: T[], k: number): T[][] {
  if (k > set.length || k <= 0) {
    return [[]];
  }
  if (k === set.length) {
    return [set];
  }
  if (k === 1) {
    return set.map((item) => [item]);
  }

  const combinations: T[][] = [];
  for (let i = 0; i < set.length - k + 1; i++) {
    const head = set.slice(i, i + 1);
    const tailCombinations = k_combinations(set.slice(i + 1), k - 1);
    for (const tail of tailCombinations) {
      combinations.push([...head, ...tail]);
    }
  }
  return combinations;
}
