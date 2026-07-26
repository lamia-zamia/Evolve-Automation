# Development

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
