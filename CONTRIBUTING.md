# Development

## Tests and checks

`npm run check` (`scripts/check.mjs`) runs the type checks, lint, format check,
and the test suite concurrently. Every step runs even if an earlier one fails, so
one run reports every problem. `npm run check:serial` is the old
one-after-another version if the interleaving ever gets in the way.

Passing steps print nothing. A clean run is a single summary line, and a failing
one prints only the failing steps' output, each block starting with
`=== <step>: FAILED`, as soon as that step finishes rather than at the end.
Everything goes to stdout and the exit code carries the verdict, so
`npm run check | grep FAILED` is a complete triage. Pass `--verbose`
(`node scripts/check.mjs --verbose`) to see the passing steps' output too.

`npm test` (`scripts/test.mjs`) runs the ~365 test files across a worker pool,
one process per file as before but `os.availableParallelism()` at a time. It
follows the same rule: only failing files print, under a `FAILED <file>` header,
and the run ends with a summary of which files failed.

- `npm test -- storage mech` runs only test files whose names contain `storage`
  or `mech`, which is the fast loop while working on one area.
- `npm test -- --jobs=1` forces sequential execution when a failure looks
  order- or contention-dependent.

Two things keep this fast, and both are worth knowing if timings ever regress:

- On Node 22.18+ the runner uses Node's built-in TypeScript stripping instead of
  loading `tsx` into all ~365 processes. It falls back to `tsx` automatically on
  older runtimes, so `src` must stay free of non-erasable TypeScript (`enum`,
  `namespace`, parameter properties). `verbatimModuleSyntax` already enforces the
  import side of that.
- `tsc` runs incrementally and ESLint and Prettier use their caches, all stored
  under `node_modules/.cache/`. Deleting that directory only costs one slow run.

## Pre-commit hook

`.githooks/pre-commit` runs `npm run build` and `npm run check`, then stages the
generated `evolve_automation.user.js` and `evolve_automation.meta.js`.

It skips that work when it cannot change the outcome:

- the staged build inputs and generated artifacts are byte-identical to `HEAD`,
  so nothing that feeds the build changed; or
- the exact same tree was already built and checked by a previous run. Successful
  runs record a fingerprint of the staged inputs plus the artifacts they produced
  in `.git/evolve-automation-verified` (last 50 entries), so amends, rebases, and
  commit splits reuse the earlier result.

Set `EVOLVE_SKIP_VERIFY=1` to force a skip, or commit with `--no-verify` to bypass
the hook entirely. The cache lives inside `.git`, so deleting that file forces a
full build and check on the next commit.

## Releases and versioning

The `package.json` version is the canonical release version. Use one of these
commands to bump it, synchronize `src/userscript.meta.js`, and rebuild both
generated userscript artifacts:

- `npm run release:patch`
- `npm run release:minor`
- `npm run release:major`

Keep versions numeric SemVer values such as `3.3.3`. Tampermonkey accepts
non-numeric version text, but its update comparison is custom and `@version`
must increase for every update. A reset to `TS 1.0.0` is not a safe migration
from an existing `3.3.2.1` installation because it may not compare as newer.
If a channel suffix is needed, keep a numeric prefix, for example
`3.3.3-ts.1`.
