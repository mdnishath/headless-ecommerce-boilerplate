// Builds the app with a throwaway probe client and asserts the probe's
// marker (not _default's) reaches the rendered output. Guards the entire
// white-label mechanism — see next.config.ts.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const probeName = "_alias_probe";
const probeDir = path.join(root, "src", "clients", probeName);
const defaultDir = path.join(root, "src", "clients", "_default");
const marker = "ALIAS_PROBE_STORE_8f3a";

try {
  fs.rmSync(probeDir, { recursive: true, force: true });
  fs.cpSync(defaultDir, probeDir, { recursive: true });
  const configPath = path.join(probeDir, "client.config.ts");
  const config = fs
    .readFileSync(configPath, "utf8")
    .replace(/name: ".*?"/, `name: "${marker}"`);
  if (!config.includes(marker)) {
    throw new Error(
      "marker injection failed — regex did not match client.config.ts",
    );
  }
  fs.writeFileSync(configPath, config);

  execSync("npx next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CLIENT: probeName },
  });

  const html = fs.readFileSync(
    path.join(root, ".next", "server", "app", "index.html"),
    "utf8",
  );
  // process.exit() inside try would bypass finally — use exitCode instead.
  if (!html.includes(marker)) {
    if (html.includes("Default Storefront")) {
      console.error(
        "FAIL: @client alias did not resolve to the CLIENT env var (got _default fallback)",
      );
    } else {
      console.error(
        "FAIL: marker not rendered — the home page does not render activeClient.identity.name (expected until Task 6)",
      );
    }
    process.exitCode = 1;
  } else {
    console.log("OK: @client alias resolves per CLIENT env var");
  }
} finally {
  fs.rmSync(probeDir, { recursive: true, force: true });
}
