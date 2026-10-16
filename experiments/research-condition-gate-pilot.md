# Research Condition Gate Pilot

## Purpose

This is a build-time opt-in pilot for the B2 Research condition gate. Ordinary production builds leave it compiled out. The pilot is not enabled by a runtime setting.

## Build and install

From the repository root, run:

```powershell
npm ci
npm run build -- --research-condition-gate
```

Install `test-artifacts/research-condition-gate/evolve_automation.user.js` in Tampermonkey. Its identity is **Evolve Automation (Research Gate Pilot)** with namespace `https://evolve-automation.local/research-gate-pilot`; it has no download or update URL.

Do not combine `--local` with `--research-condition-gate`; the build rejects that combination. The pilot targets the production game hosts.

## Manual Tampermonkey pilot checklist

1. Back up the current game save using the game's normal save/export flow, and save a copy of the existing Evolve Automation userscript.
2. Build the pilot with the command above and install `test-artifacts/research-condition-gate/evolve_automation.user.js` in Tampermonkey.
3. Disable the ordinary **Evolve Automation** userscript for the game.
4. Confirm Tampermonkey shows exactly one enabled Evolve Automation instance matching the game. Do not run both scripts together.
5. Load a late-game save and let the game run for several hundred normal game periods.
6. Open Research manually. Verify offered and granted rows render and that the visible controls are current and usable.
7. On a separate early or mid-game save, perform ordinary Research progression and verify offers and grants continue to work.
8. Check the bounded diagnostics for missing offers, stale controls, repeated capture failures, or callback restoration errors. If a diagnostic says reload is required, stop and reload before continuing.
9. Reload the page and confirm normal operation and Research behavior afterward.
10. If any Research problem persists, disable **Evolve Automation (Research Gate Pilot)**, re-enable the ordinary **Evolve Automation** script, and reload the game before resuming.

If the pilot fails, record the exact diagnostic text, date/time, browser and Tampermonkey versions, game day/reset count, installed script name/version, whether the page was reloaded, the steps immediately before the issue, and whether it recurred after reload. Keep console evidence to the diagnostic plus at most 20 surrounding lines. Do not include or send a save file, full save contents, or unrelated console output.

## Revert

Disable **Evolve Automation (Research Gate Pilot)** and re-enable the ordinary **Evolve Automation** script. If the pilot reported a reload-required condition, reload the game before resuming. The ordinary production build is restored with:

```powershell
npm run build
```

## Validation status

The repository's exact Chromium runner exercised the ordinary and opt-in bundles against the original pinned Evolve 1.5.0 snapshot and a recovered late-game save. This is exact Chromium validation, not a Tampermonkey installation test. Tampermonkey itself has not been tested; the manual checklist above remains outstanding.
