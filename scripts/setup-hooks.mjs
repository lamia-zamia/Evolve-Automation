import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--show-toplevel"], { stdio: "ignore" });
  execFileSync(
    "git",
    ["config", "--local", "core.hooksPath", ".githooks"],
    { stdio: "ignore" },
  );
  console.log("Configured Git to use hooks from .githooks");
} catch {
  console.log("Skipped Git hook setup (not running in a Git worktree)");
}
