#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const defaultProjectsRoot =
  process.env.COM_MOON_PROJECTS_ROOT?.trim() || path.resolve(repoRoot, "..");

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".claude",
  ".local",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
  "test-results",
  "tmp_backup",
]);

const PROJECT_MARKERS = new Set([
  ".git",
  "AGENTS.md",
  "CLAUDE.md",
  "PLAN.md",
  "PROJECT_TODO.md",
  "README.md",
  "ROADMAP.md",
  "TODO.md",
  "package.json",
  "pyproject.toml",
]);

const NESTED_PROJECT_NAMES = new Set([
  "backend",
  "frontend",
  "marketing_auto",
  "web",
  "Wise_extract",
  "worker",
]);

const SCANNED_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const SCANNED_EXACT_FILES = new Set([
  ".env.example",
  ".env.local.example",
  "AGENTS.md",
  "CLAUDE.md",
  "DESIGN.md",
  "PLAN.md",
  "PROJECT_TODO.md",
  "README.md",
  "ROADMAP.md",
  "TASK.md",
  "TODO.md",
  "vercel.json",
]);

const IGNORED_EXACT_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const PLAN_PATTERN =
  /connect|connection|integration|integrat|webhook|relay|sync|oauth|calendar|mail|notion|slack|telegram|github|supabase|postgres|database|n8n|make|zapier|instagram|threads|meta|gemini|openai|claude|youtube|coingecko|yfinance|\uC5F0\uACB0|\uC5F0\uB3D9|\uD1B5\uD569|\uC790\uB3D9\uD654|\uC6F9\uD6C5/i;

const PROVIDERS = [
  {
    id: "supabase",
    label: "Supabase/Postgres",
    pattern: /supabase|postgres|database_url|rls/i,
    nextAction: "Fill Supabase env and run a REST or health smoke check.",
  },
  {
    id: "webhook",
    label: "Webhook/Automation",
    pattern: /webhook|n8n|make|zapier|channeltalk|channel talk|wecom|kakao|google sheet/i,
    nextAction: "Map the provider payload into the Moonlight project webhook contract.",
  },
  {
    id: "github",
    label: "GitHub",
    pattern: /github_token|github_repositories|github_project_map|pull request|\bpr\b|issue|milestone/i,
    nextAction: "Add the repo to GITHUB_REPOSITORIES and map it with GITHUB_PROJECT_MAP when needed.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    pattern: /google calendar|calendar_events|calendar event|google_client_id|google_calendar_id/i,
    nextAction: "Complete Google OAuth env and verify calendar read/write from Work OS.",
  },
  {
    id: "email",
    label: "Email/Gmail",
    pattern: /\bgmail\b|\bemail\b|email_webhook_url|resend|brevo|smtp|newsletter/i,
    nextAction: "Choose webhook send or direct provider send, then record sync_runs for delivery.",
  },
  {
    id: "notion",
    label: "Notion",
    pattern: /notion|notion_token|database id|projects db|tasks db/i,
    nextAction: "Define Projects/Tasks DB field mappings before any write-back.",
  },
  {
    id: "slack",
    label: "Slack",
    pattern: /slack|slack_bot_token|slack_signing_secret|slack_webhook/i,
    nextAction: "Start with one-way failure alerts before interactive commands.",
  },
  {
    id: "telegram",
    label: "Telegram",
    pattern: /telegram|telegram_bot_token|telegram_webhook_secret/i,
    nextAction: "Register the bot webhook with the Engine URL and shared secret.",
  },
  {
    id: "social",
    label: "Meta/Instagram/Threads",
    pattern: /instagram|threads|meta pixel|facebook pixel|facebook/i,
    nextAction: "Register OAuth redirect URLs and keep tokens in integration_connections.",
  },
  {
    id: "ai",
    label: "AI APIs",
    pattern: /gemini|openai|claude|anthropic|google_generative_ai|api key|api_key/i,
    nextAction: "Keep model/API keys server-side and add a dry-run health check.",
  },
  {
    id: "finance-data",
    label: "Finance Data",
    pattern: /yfinance|coingecko|fomc|economic calendar|exchange rate|\uD658\uC728|\uAE08\uB9AC/i,
    nextAction: "Separate live data fetch checks from UI preview fallback states.",
  },
  {
    id: "youtube",
    label: "YouTube",
    pattern: /youtube|yt-dlp|captions|transcript/i,
    nextAction: "Add transcript fallback handling for OAuth/rate-limit failures.",
  },
];

function parseArgs(argv) {
  const args = {
    format: "markdown",
    root: defaultProjectsRoot,
    output: "",
    jsonOutput: "",
    maxEvidence: 8,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];

    if (item === "--format" && next) {
      args.format = next;
      index += 1;
    } else if (item === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (item === "--output" && next) {
      args.output = next;
      index += 1;
    } else if (item === "--json-output" && next) {
      args.jsonOutput = next;
      index += 1;
    } else if (item === "--max-evidence" && next) {
      args.maxEvidence = Number.parseInt(next, 10) || args.maxEvidence;
      index += 1;
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/inventory-project-connections.mjs [options]",
    "",
    "Options:",
    "  --root <path>          Projects root. Defaults to COM_MOON_PROJECTS_ROOT or the parent of this repo.",
    "  --format <format>      markdown or json. Default: markdown.",
    "  --output <path>        Write the selected format to a file instead of stdout.",
    "  --json-output <path>   Also write the full JSON inventory to a file.",
    "  --max-evidence <n>     Evidence lines per project in Markdown. Default: 8.",
  ].join("\n");
}

async function safeReaddir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function pathExists(filepath) {
  try {
    await stat(filepath);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectMarker(dir) {
  const entries = await safeReaddir(dir);
  return entries.some((entry) => PROJECT_MARKERS.has(entry.name));
}

async function hasNestedProjectMarker(dir) {
  const entries = await safeReaddir(dir);
  return entries.some((entry) =>
    entry.name === ".git" ||
    entry.name === ".env.example" ||
    entry.name === ".env.local.example" ||
    entry.name === "package.json" ||
    entry.name === "pyproject.toml",
  );
}

async function collectProjectDirs(projectsRoot) {
  const discovered = new Map();
  const rootEntries = await safeReaddir(projectsRoot);

  for (const entry of rootEntries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const topLevelDir = path.join(projectsRoot, entry.name);
    const topLevelHasMarker = (await hasProjectMarker(topLevelDir)) || (await hasNestedProjectMarker(topLevelDir));
    if (topLevelHasMarker) {
      discovered.set(topLevelDir, topLevelDir);
    } else {
      const nested = await collectNestedProjectDirs(topLevelDir, 0, 2);
      if (nested.length) {
        for (const dir of nested) {
          discovered.set(dir, dir);
        }
      } else {
        discovered.set(topLevelDir, topLevelDir);
      }
    }
  }

  return [...discovered.values()].sort((a, b) => a.localeCompare(b));
}

async function collectNestedProjectDirs(dir, depth, maxDepth) {
  if (depth >= maxDepth) {
    return [];
  }

  const entries = await safeReaddir(dir);
  const dirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    if (entry.name.startsWith(".") && entry.name !== ".agents") {
      continue;
    }

    const nestedDir = path.join(dir, entry.name);
    if (NESTED_PROJECT_NAMES.has(entry.name) || (await hasNestedProjectMarker(nestedDir))) {
      dirs.push(nestedDir);
    }

    dirs.push(...(await collectNestedProjectDirs(nestedDir, depth + 1, maxDepth)));
  }

  return dirs;
}

function isEnvExample(filename) {
  return filename === ".env.example" || filename === ".env.local.example";
}

function shouldScanFile(filepath) {
  const filename = path.basename(filepath);
  const extension = path.extname(filepath).toLowerCase();

  if (IGNORED_EXACT_FILES.has(filename)) {
    return false;
  }

  if (filename.startsWith(".env") && !isEnvExample(filename)) {
    return false;
  }

  return SCANNED_EXACT_FILES.has(filename) || SCANNED_EXTENSIONS.has(extension);
}

async function collectFiles(dir, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await safeReaddir(dir);
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(filepath, depth + 1, maxDepth)));
      continue;
    }

    if (entry.isFile() && shouldScanFile(filepath)) {
      files.push(filepath);
    }
  }

  return files;
}

function projectSlug(projectDir) {
  return path.basename(projectDir).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function sanitizeSnippet(filepath, line) {
  const filename = path.basename(filepath);
  const trimmed = line.trim().replace(/\s+/g, " ");

  if (isEnvExample(filename)) {
    return trimmed.replace(/^([A-Z0-9_]+)\s*=.*$/, "$1=<value>");
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function extractEnvKey(filepath, line) {
  if (!isEnvExample(path.basename(filepath))) {
    return null;
  }

  const match = line.trim().match(/^#?\s*([A-Z][A-Z0-9_]+)\s*=/);
  return match?.[1] || null;
}

function classifyEvidence(filepath, line) {
  const providers = [];

  for (const provider of PROVIDERS) {
    if (provider.pattern.test(line)) {
      providers.push(provider.id);
    }
  }

  return providers;
}

function evidenceScore(item) {
  const filename = path.basename(item.file);

  if (item.kind === "env-example") {
    return 0;
  }

  if (["README.md", "PLAN.md", "PROJECT_TODO.md", "ROADMAP.md", "TASK.md", "TODO.md"].includes(filename)) {
    return 1;
  }

  if (item.file.startsWith("docs/") || item.file.includes("/docs/")) {
    return 2;
  }

  if (item.kind === "code-or-config") {
    return 3;
  }

  return 4;
}

function selectEvidence(evidence, limit = 60) {
  const seen = new Set();
  const sorted = [...evidence].sort((a, b) => {
    const scoreDelta = evidenceScore(a) - evidenceScore(b);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`);
  });

  const selected = [];
  for (const item of sorted) {
    const key = `${item.file}:${item.line}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(item);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

async function readUsefulLines(projectDir, filepath) {
  const fileStats = await stat(filepath).catch(() => null);
  if (!fileStats || fileStats.size > 700_000) {
    return [];
  }

  const text = await readFile(filepath, "utf8").catch(() => "");
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const evidence = [];

  lines.forEach((line, index) => {
    if (!PLAN_PATTERN.test(line) && !classifyEvidence(filepath, line).length) {
      return;
    }

    const relativeFile = path.relative(projectDir, filepath);
    evidence.push({
      file: relativeFile,
      line: index + 1,
      snippet: sanitizeSnippet(filepath, line),
      providers: classifyEvidence(filepath, line),
      envKey: extractEnvKey(filepath, line),
      kind: isEnvExample(path.basename(filepath))
        ? "env-example"
        : path.extname(filepath).toLowerCase() === ".md"
          ? "doc"
          : "code-or-config",
    });
  });

  return evidence;
}

function readinessForProject(project) {
  if (!project.providers.length) {
    return {
      status: "no-explicit-plan",
      progress: 10,
    };
  }

  const hasEnv = project.envKeys.length > 0;
  const hasCode = project.evidence.some((item) => item.kind === "code-or-config" || item.kind === "env-example");
  const hasDocs = project.evidence.some((item) => item.kind === "doc");

  if (hasCode && hasEnv) {
    return {
      status: "connectable-needs-config",
      progress: 70,
    };
  }

  if (hasCode) {
    return {
      status: "connectable-code-present",
      progress: 60,
    };
  }

  if (hasDocs) {
    return {
      status: "planned-docs-only",
      progress: 35,
    };
  }

  return {
    status: "needs-triage",
    progress: 20,
  };
}

function nextActionForProject(project) {
  if (!project.providers.length) {
    return "No explicit connection plan found; keep out of the first Moonlight wiring pass.";
  }

  if (project.envKeys.length) {
    const keys = project.envKeys.slice(0, 4).join(", ");
    return `Fill or map env keys first: ${keys}${project.envKeys.length > 4 ? ", ..." : ""}.`;
  }

  const provider = PROVIDERS.find((item) => project.providerIds.includes(item.id));
  return provider?.nextAction || "Map the planned integration into Moonlight project webhook payloads.";
}

function buildSmokePayload(project, workspaceIdPlaceholder = "${COM_MOON_DEFAULT_WORKSPACE_ID}") {
  const summaryProviders = project.providers.join(", ") || "No explicit provider";
  const evidence = project.evidence.slice(0, 5).map((item) => ({
    file: item.file,
    line: item.line,
    snippet: item.snippet,
  }));

  return {
    meta: {
      workspaceId: workspaceIdPlaceholder,
      provider: "projects-folder",
      source: "projects-connection-inventory",
    },
    project: {
      id: `projects-folder:${project.slug}`,
      title: project.name,
      status: project.readiness.status === "no-explicit-plan" ? "reported" : "active",
      progress: project.readiness.progress,
      milestone: "projects-folder-connection-readiness",
      nextAction: project.nextAction,
    },
    event: {
      type: "project.connection.inventory",
      summary: `${project.name}: ${project.readiness.status}; providers: ${summaryProviders}`,
      note: `Inventory path: ${project.path}`,
    },
    payload: {
      projectPath: project.path,
      readiness: project.readiness.status,
      providers: project.providers,
      envKeys: project.envKeys,
      evidence,
    },
  };
}

async function inspectProject(projectDir, projectsRoot) {
  const files = await collectFiles(projectDir);
  const allEvidence = [];

  for (const filepath of files) {
    allEvidence.push(...(await readUsefulLines(projectDir, filepath)));
  }

  const providerIds = [...new Set(allEvidence.flatMap((item) => item.providers))].sort();
  const providers = providerIds
    .map((id) => PROVIDERS.find((item) => item.id === id)?.label || id)
    .sort();
  const envKeys = [...new Set(allEvidence.map((item) => item.envKey).filter(Boolean))].sort();
  const project = {
    name: path.relative(projectsRoot, projectDir) || path.basename(projectDir),
    path: projectDir,
    slug: projectSlug(projectDir),
    providerIds,
    providers,
    envKeys,
    evidenceCount: allEvidence.length,
    evidence: selectEvidence(allEvidence),
  };

  project.readiness = readinessForProject(project);
  project.nextAction = nextActionForProject(project);
  project.smokePayload = buildSmokePayload(project);

  return project;
}

function renderMarkdown(inventory, maxEvidence) {
  const connectedProjects = inventory.projects.filter((project) => project.providers.length);
  const lines = [
    "# Projects Connection Inventory",
    "",
    `Generated by \`scripts/inventory-project-connections.mjs\` from \`${inventory.projectsRoot}\`.`,
    "",
    "This inventory turns connection plans found under the local Projects folder into Moonlight-ready webhook payloads. It records variable names only for env examples and never reads real `.env` files.",
    "",
    "## Summary",
    "",
    `- Projects scanned: ${inventory.projects.length}`,
    `- Projects with connection signals: ${connectedProjects.length}`,
    `- Moonlight intake route: \`POST /api/webhook/project\``,
    "",
    "| Project | Readiness | Providers | Env keys | Next action |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const project of connectedProjects) {
    const providers = project.providers.join(", ");
    const envKeys = project.envKeys.slice(0, 6).join(", ") || "-";
    lines.push(
      `| ${project.name} | ${project.readiness.status} | ${providers} | ${envKeys}${project.envKeys.length > 6 ? ", ..." : ""} | ${project.nextAction} |`,
    );
  }

  lines.push("", "## Evidence", "");

  for (const project of connectedProjects) {
    lines.push(`### ${project.name}`, "", `Path: \`${project.path}\``, "");

    for (const item of project.evidence.slice(0, maxEvidence)) {
      lines.push(`- \`${item.file}:${item.line}\` - ${item.snippet}`);
    }

    if (project.evidenceCount > maxEvidence) {
      lines.push(`- ...${project.evidenceCount - maxEvidence} more signal(s)`);
    }

    lines.push("");
  }

  lines.push(
    "## Smoke Test Payload Shape",
    "",
    "The full JSON output includes one `smokePayload` per project. Send a payload to the Engine project webhook after `COM_MOON_ENGINE_URL`, `COM_MOON_DEFAULT_WORKSPACE_ID`, and `COM_MOON_SHARED_WEBHOOK_SECRET` are configured.",
    "",
    "```bash",
    "npm run inventory:project-connections -- --format json --json-output docs/projects-connection-payloads.json",
    "```",
    "",
  );

  const sample = connectedProjects[0]?.smokePayload;
  if (sample) {
    lines.push("Example:", "", "```json", JSON.stringify(sample, null, 2), "```", "");
  }

  return lines.join("\n");
}

async function writeOutput(filepath, content) {
  const absolutePath = path.isAbsolute(filepath) ? filepath : path.join(repoRoot, filepath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!existsSync(args.root)) {
    throw new Error(`Projects root does not exist: ${args.root}`);
  }

  const projectDirs = await collectProjectDirs(args.root);
  const projects = [];

  for (const projectDir of projectDirs) {
    projects.push(await inspectProject(projectDir, args.root));
  }

  const inventory = {
    generatedAt: new Date().toISOString(),
    projectsRoot: args.root,
    projects,
  };

  const output =
    args.format === "json"
      ? JSON.stringify(inventory, null, 2)
      : renderMarkdown(inventory, args.maxEvidence);

  if (args.output) {
    const written = await writeOutput(args.output, output);
    console.log(`Wrote ${written}`);
  } else {
    console.log(output);
  }

  if (args.jsonOutput) {
    const written = await writeOutput(args.jsonOutput, JSON.stringify(inventory, null, 2));
    console.log(`Wrote ${written}`);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
