import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(
  new URL("../../.githooks/pre-commit", import.meta.url),
  "utf8",
);
const buildInputs = hook.match(/^build_inputs="([^"]+)"$/m)?.[1].split(" ");

assert.ok(buildInputs?.includes("tests"));
assert.match(hook, /git diff --quiet -- \$build_inputs/);
assert.match(
  hook,
  /git ls-files --others --exclude-standard -- \$build_inputs/,
);
assert.match(hook, /staged_inputs=\$\(staged_fingerprint \$build_inputs\)/);
assert.match(hook, /head_fingerprint \$build_inputs/);
assert.match(hook, /grep -qxF "\$staged_key" "\$cache_file"/);

console.log("pre-commit build/check inputs verified");
