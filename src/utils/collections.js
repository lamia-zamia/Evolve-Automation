// https://gist.github.com/axelpale/3118596
export function k_combinations(set, k) {
  if (k > set.length || k <= 0) {
    return [[]];
  }
  if (k == set.length) {
    return [set];
  }
  if (k == 1) {
    return set.map((i) => [i]);
  }
  let combs = [];
  let tailcombs = [];
  for (let i = 0; i < set.length - k + 1; i++) {
    tailcombs = k_combinations(set.slice(i + 1), k - 1);
    for (let j = 0; j < tailcombs.length; j++) {
      combs.push([set[i], ...tailcombs[j]]);
    }
  }
  return combs;
}

// https://stackoverflow.com/a/44012184
export function* cartesian(head, ...tail) {
  let remainder = tail.length > 0 ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}
