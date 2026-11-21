#!/usr/bin/env node
/* premiere-mcp-bridge CLI.
 *   premiere-mcp-bridge               run the MCP server (what the client launches)
 *   premiere-mcp-bridge --install-cep enable CEP debug mode + link the panel into Premiere
 *   premiere-mcp-bridge --doctor      check the setup
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, lstatSync, unlinkSync, rmdirSync, copyFileSync, symlinkSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url)); // dist/
const pkgRoot = join(here, "..");
const cepSrc = join(pkgRoot, "cep");
const BUNDLE = "com.mcp.premiere.bridge";
const CSXS_VERSIONS = [9, 10, 11, 12]; // Premiere 2023+ uses CEP 11/12; older kept harmless.

function extensionsDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData/Roaming"), "Adobe/CEP/extensions");
  }
  // macOS (Premiere isn't on Linux)
  return join(homedir(), "Library/Application Support/Adobe/CEP/extensions");
}

function enableDebugMode(): void {
  for (const v of CSXS_VERSIONS) {
    try {
      if (process.platform === "win32") {
        execFileSync("reg", ["add", `HKCU\\Software\\Adobe\\CSXS.${v}`,
          "/v", "PlayerDebugMode", "/t", "REG_SZ", "/d", "1", "/f"], { stdio: "ignore" });
      } else {
        execFileSync("defaults", ["write", `com.adobe.CSXS.${v}`, "PlayerDebugMode", "1"], { stdio: "ignore" });
      }
    } catch {
      /* that CSXS version isn't present; fine */
    }
  }
  console.log("[ok] enabled CEP debug mode (unsigned extensions allowed)");
}

function linkPanel(): void {
  const extDir = extensionsDir();
  const linkPath = join(extDir, BUNDLE);
  mkdirSync(extDir, { recursive: true });

  if (existsSync(linkPath)) {
    // Remove only the link/junction, never recurse into its target (that IS the package).
    try { unlinkSync(linkPath); }
    catch {
      try { rmdirSync(linkPath); }
      catch {
        console.error(`[fail] ${linkPath} exists and isn't a link I can remove. Delete it by hand and re-run.`);
        return;
      }
    }
  }

  const type = process.platform === "win32" ? "junction" : "dir";
  try {
    symlinkSync(cepSrc, linkPath, type);
    console.log(`[ok] linked panel: ${linkPath} -> ${cepSrc}`);
  } catch (e) {
    console.error(`[fail] could not link panel: ${(e as Error).message}`);
  }
}

function ensureConfig(): void {
  const cfg = join(pkgRoot, "config.json");
  const example = join(pkgRoot, "config.example.json");
  if (!existsSync(cfg) && existsSync(example)) {
    try { copyFileSync(example, cfg); console.log("[ok] created config.json from example"); }
    catch { /* global dir may be read-only; env vars still work */ }
  }
}

function installCep(): void {
  console.log("=== premiere-mcp-bridge: installing CEP panel ===");
  enableDebugMode();
  linkPanel();
  ensureConfig();
  console.log("\nAdd this to your MCP client (Claude Desktop / Claude Code):");
  console.log(JSON.stringify({ mcpServers: { "premiere-pro": { command: "premiere-mcp-bridge" } } }, null, 2));
  console.log("\nNext: restart Premiere, open Window > Extensions > MCP Bridge, restart your client.");
  console.log("(Windows: make sure npm's global bin dir is on PATH so the client can find the command.)");
}

function doctor(): void {
  const linkPath = join(extensionsDir(), BUNDLE);
  const ok = (b: boolean) => (b ? "[ok]  " : "[fail]");
  const major = Number(process.versions.node.split(".")[0]);
  let linked = false;
  try { linked = lstatSync(linkPath) && existsSync(join(linkPath, "index.html")); } catch { /* not linked */ }

  console.log("=== premiere-mcp-bridge doctor ===");
  console.log(`${ok(major >= 18)} Node ${process.versions.node} (need >= 18)`);
  console.log(`${ok(existsSync(join(pkgRoot, "dist/server.js")))} server build present`);
  console.log(`${ok(existsSync(cepSrc))} panel files present`);
  console.log(`${ok(linked)} panel linked into Premiere (${linkPath})`);
  if (!linked) console.log("      -> run: premiere-mcp-bridge --install-cep");
}

const arg = process.argv[2];
if (arg === "--install-cep") installCep();
else if (arg === "--doctor") doctor();
else if (arg === "--help" || arg === "-h") {
  console.log("usage: premiere-mcp-bridge [--install-cep | --doctor]\n  (no args)      run the MCP server\n  --install-cep  enable CEP debug mode and link the panel into Premiere\n  --doctor       check the setup");
} else {
  // Default: run the server. Importing it starts stdio transport + the WS bridge.
  await import("./server.js");
}
