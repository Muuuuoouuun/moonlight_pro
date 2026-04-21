#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function parseEnvFile(filepath) {
  if (!existsSync(filepath)) {
    return {};
  }

  const text = readFileSync(filepath, "utf8");
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnvForApp(appName) {
  const appDir = path.join(root, "apps", appName);
  const rootEnv = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
  };
  const appEnv = {
    ...parseEnvFile(path.join(appDir, ".env")),
    ...parseEnvFile(path.join(appDir, ".env.local")),
  };

  return {
    ...rootEnv,
    ...appEnv,
    ...process.env,
  };
}

function runCommand(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8000,
  }).trim();
}

function printSection(title) {
  console.log(`\n${title}`);
}

function printResult(level, label, detail) {
  console.log(`[${level}] ${label}: ${detail}`);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isOpaqueSupabaseApiKey(apiKey) {
  return apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
}

function makeSupabaseHeaders(apiKey) {
  const headers = {
    apikey: apiKey,
  };

  if (!isOpaqueSupabaseApiKey(apiKey)) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function resolveWorkspaceId(env) {
  return env.COM_MOON_DEFAULT_WORKSPACE_ID || env.DEFAULT_WORKSPACE_ID || "";
}

function resolveEngineUrl(env) {
  return (env.COM_MOON_ENGINE_URL || env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

async function checkSupabase(label, env, failures) {
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";
  const workspaceId = resolveWorkspaceId(env);

  if (!url) {
    printResult("FAIL", `${label} SUPABASE_URL`, "missing");
    failures.push(`${label}:SUPABASE_URL`);
    return;
  }

  if (!apiKey) {
    printResult("FAIL", `${label} Supabase key`, "missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
    failures.push(`${label}:SUPABASE_KEY`);
    return;
  }

  if (!workspaceId) {
    printResult("WARN", `${label} Workspace`, "missing COM_MOON_DEFAULT_WORKSPACE_ID / DEFAULT_WORKSPACE_ID");
  } else {
    printResult("PASS", `${label} Workspace`, workspaceId);
  }

  const result = await fetchJson(`${url}/rest/v1/projects?select=id&limit=1`, {
    headers: makeSupabaseHeaders(apiKey),
  });

  if (result.ok) {
    printResult("PASS", `${label} Supabase`, `REST reachable (${url})`);
  } else {
    printResult("FAIL", `${label} Supabase`, `REST check failed (${result.status || "no-status"})`);
    failures.push(`${label}:SUPABASE_REST`);
  }
}

async function checkEngine(label, env, failures) {
  const engineUrl = resolveEngineUrl(env);

  if (!engineUrl) {
    printResult("FAIL", `${label} Engine URL`, "missing COM_MOON_ENGINE_URL or NEXT_PUBLIC_APP_URL");
    failures.push(`${label}:ENGINE_URL`);
    return;
  }

  const result = await fetchJson(`${engineUrl}/api/health`);

  if (result.ok) {
    const routes = Array.isArray(result.data?.routes) ? result.data.routes.length : 0;
    printResult("PASS", `${label} Engine`, `/api/health reachable with ${routes} routes`);
  } else {
    printResult("FAIL", `${label} Engine`, `health check failed (${result.status || "no-status"})`);
    failures.push(`${label}:ENGINE_HEALTH`);
  }
}

async function main() {
  const failures = [];
  const hubEnv = loadEnvForApp("hub");
  const engineEnv = loadEnvForApp("engine");

  printSection("GitHub");
  try {
    const remote = runCommand("git", ["remote", "get-url", "origin"]);
    const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    printResult("PASS", "Git remote", remote);
    printResult("PASS", "Git branch", branch);

    try {
      runCommand("git", ["ls-remote", "--heads", "origin"]);
      printResult("PASS", "GitHub read", "origin reachable");
    } catch (error) {
      printResult("FAIL", "GitHub read", error instanceof Error ? error.message : String(error));
      failures.push("github:read");
    }
  } catch (error) {
    printResult("FAIL", "Git", error instanceof Error ? error.message : String(error));
    failures.push("git");
  }

  try {
    const ghVersion = runCommand("gh", ["--version"]).split("\n")[0];
    printResult("PASS", "GitHub CLI", ghVersion);
  } catch {
    printResult("WARN", "GitHub CLI", "gh not installed");
  }

  printSection("Hub");
  await checkSupabase("Hub", hubEnv, failures);
  await checkEngine("Hub", hubEnv, failures);

  printSection("Engine");
  await checkSupabase("Engine", engineEnv, failures);

  printSection("Examples");
  printResult(
    "PASS",
    "Hub template",
    existsSync(path.join(root, "apps/hub/.env.example")) ? "apps/hub/.env.example present" : "missing",
  );
  printResult(
    "PASS",
    "Engine template",
    existsSync(path.join(root, "apps/engine/.env.example")) ? "apps/engine/.env.example present" : "missing",
  );

  printSection("Summary");
  if (failures.length) {
    printResult("FAIL", "Connectivity", `${failures.length} critical checks failed`);
    process.exitCode = 1;
    return;
  }

  printResult("PASS", "Connectivity", "all critical checks passed");
}

await main();
