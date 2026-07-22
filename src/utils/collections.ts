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
    const tailCombinations = k_combinations(set.slice(i + 1), k - 1);
    for (const tail of tailCombinations) {
      combinations.push([set[i], ...tail]);
    }
  }
  return combinations;
}

// https://stackoverflow.com/a/44012184
function* cartesianGroups<T>(groups: T[][]): Generator<T[]> {
  const [head, ...tail] = groups;
  if (!head) return;
  if (tail.length === 0) {
    for (const headItem of head) yield [headItem];
    return;
  }
  for (const remainderItem of cartesianGroups(tail)) {
    for (const headItem of head) {
      yield [headItem, ...remainderItem];
    }
  }
}

export function* cartesian<T>(head: T[], ...tail: T[][]): Generator<T[]> {
  yield* cartesianGroups([head, ...tail]);
}
