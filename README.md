# Evolve Automation fork notes

Short factual differences from Vollch's script:

- Evil/Authority support: morale-aware tax handling, Hell garrison stationing, and Authority-cap building weighting.
- Reduced autoPower and autoStorage bouncing.
- Achievement guards for Pacifist, Dreaded, Cult of Personality, Anarchist, Energetic, Red Dead, Second Evolution, and Banana Republic.
- Script Planner panel, active-target details, state logging/export.
- Challenge/scenario helpers for Inflation Wheelbarrow, Banana Republic objectives, and Magic Fullmetal.
- Expanded weighting rules for Authority, Banana objectives, Inflation Money helpers.
- Settings UI is split into focused sections for interface, state log, achievement guards, and challenge helpers.
- Improved stability for performance hack

The userscript is organized into tested TypeScript automation factories. Extracted
controllers currently cover Hell, government, battle, tax, smelter, alchemy, pylon, quarry, mine,
extractor, factory, mining-droid, Graphene-plant, shapeshift, wish, and genetics automation.
Mercenary, psychic, ocular-power, minor-trait, and trigger controllers are also extracted.
Consumption, replicator, market, galaxy-market, and manual resource-gathering controllers are
extracted as well.
Evolution, universe selection, crafting, spying, and prestige controllers are also modularized.
Planet selection, jobs, building purchases, research, and mutable-trait automation are modularized.
Power, storage, outer/galaxy fleets, and mech automation complete the controller extraction: no
`auto*` implementation remains in the transitional `src/legacy-runtime.js`. Shared achievement and challenge run-eligibility
evaluation is extracted into the typed `createRunGuards` factory; prestige permission and
reset-readiness evaluation is extracted into `createPrestigeEligibility`.

Controller sources are grouped by responsibility under `src/automation/`: `civic`, `economy`,
`progression`, `combat`, and `traits`. Cross-controller policy modules live separately under
`src/policies/`; filenames stay concise because the containing folders already provide context.
Shared compact-number parsing and display formatting lives under `src/formatting/`.
Settings migration, trigger synchronization, and persistence primitives live under `src/settings/`.
Small game-state query boundaries that are shared across controllers live under `src/game/`.
Cross-controller resource and target planning boundaries live under `src/planning/`.
Runtime diagnostics and compact state sampling live under `src/observability/` and `src/validation/`.
Browser integration and reusable settings-interface calculations live under `src/browser/` and `src/ui/`.
These shared boundaries are independently characterized against the generated bundle and have focused
TypeScript module regressions.

## Development

`evolve_automation.user.js` and `evolve_automation.meta.js` are generated files.
Edit the modules under `src/`; do not edit the generated files directly.

Run the one-time project setup after cloning or switching to the modular source:

```powershell
npm install
```

This installs the pinned, repository-local esbuild, TypeScript, and tsx dependencies and configures Git
to use `.githooks`. Nothing is installed globally.

The pre-commit hook automatically builds, checks, and stages both generated files
into the same commit as their source. It refuses to build if relevant source files
are unstaged or untracked, preventing a bundle from containing source absent from
the commit.

For testing changes before committing, either build once or leave watch mode
running during the editing session:

```powershell
npm run build
npm run dev
```

Useful checks:

```powershell
npm run check
npm run typecheck
npm run lint
npm run format:check
npm run verify
```

`check` type-checks every extracted TypeScript source, runs ESLint, verifies Prettier formatting,
then runs `scripts/test.mjs`, which checks generated-bundle syntax and automatically discovers every
`scripts/*-test.mjs` file. New tests do not need to be added to `package.json`. `verify` also rebuilds
and fails if the committed generated artifacts are stale. GitHub Actions runs `verify` on pushes to
`master`/`split` and on pull requests; it has read-only repository permission and never creates
commits.

Run `npm run format` to format all hand-edited project files. The repository-local Prettier version
and `.prettierrc.json` are also used by compatible editor extensions, avoiding editor/CLI formatting
differences. Generated userscript artifacts and the local game bundle are explicitly excluded.
