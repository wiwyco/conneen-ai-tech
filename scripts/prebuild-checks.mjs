import { spawnSync } from "node:child_process";

function run(command, args) {
  const isWindows = process.platform === "win32";
  const executable = isWindows && command === "npm" ? "npm.cmd" : command;
  const result = isWindows
    ? spawnSync([executable, ...args].join(" "), { stdio: "inherit", shell: true })
    : spawnSync(executable, args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

function isProductionBuild() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

run("npm", ["run", "check:supabase-freeze"]);
run("npm", ["run", "test:portal-integrations"]);

if (isProductionBuild()) {
  run("npm", ["run", "validate:prod-env"]);
} else {
  console.log("Skipping production environment validation outside production build.");
}
