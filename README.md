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

## Development

`evolve_automation.user.js` and `evolve_automation.meta.js` are generated files.
Edit the modules under `src/`; do not edit the generated files directly.

Run the one-time project setup after cloning or switching to the modular source:

```powershell
npm install
```

This installs the pinned, repository-local esbuild dependency and configures Git
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
npm run verify
```

`check` performs a syntax check and an initialization smoke test. `verify` also
rebuilds and fails if the committed generated artifacts are stale. GitHub Actions
runs `verify` on pushes to `master`/`split` and on pull requests; it has read-only
repository permission and never creates commits.
