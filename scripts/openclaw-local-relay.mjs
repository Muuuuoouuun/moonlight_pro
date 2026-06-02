#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";

const HOST = process.env.OPENCLAW_RELAY_HOST || "127.0.0.1";
const PORT = Number(process.env.OPENCLAW_RELAY_PORT || 4317);
const PATHNAME = process.env.OPENCLAW_RELAY_PATH || "/webhook/moonlight";
const AGENT_ID = process.env.OPENCLAW_RELAY_AGENT || "main";
const MODE = process.env.OPENCLAW_RELAY_MODE === "sync" ? "sync" : "async";
const MAX_BODY_BYTES = Number(process.env.OPENCLAW_RELAY_MAX_BODY_BYTES || 1_000_000);
const MAX_MESSAGE_CHARS = Number(process.env.OPENCLAW_RELAY_MAX_MESSAGE_CHARS || 8000);
const RELAY_SECRET = process.env.OPENCLAW_RELAY_SECRET || process.env.OPENCLAW_SYNC_SECRET || "";

function jsonResponse(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("payload-too-large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

function parsePayload(body) {
  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {
      type: "moonlight.openclaw.sync",
      message: body,
    };
  }
}

function trimForPrompt(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - 80)}\n...[truncated by Moonlight OpenClaw relay]`;
}

function summarizeOpenClawOutput(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const data = JSON.parse(trimmed);
    const text = data?.result?.payloads?.[0]?.text;

    return JSON.stringify(
      {
        runId: data?.runId,
        status: data?.status,
        summary: data?.summary,
        text: typeof text === "string" ? trimForPrompt(text, 400) : undefined,
      },
      null,
      2,
    );
  } catch {
    return trimForPrompt(trimmed, 1200);
  }
}

function projectLines(projects = []) {
  return projects
    .slice(0, 8)
    .map((project) => {
      const name = project?.name || project?.id || "untitled";
      const status = project?.status || "unknown";
      const nextAction = project?.next_action ? ` next=${project.next_action}` : "";
      return `- ${name} [${status}]${nextAction}`;
    })
    .join("\n");
}

function updateLines(updates = []) {
  return updates
    .slice(0, 6)
    .map((update) => {
      const title = update?.title || update?.event_type || "update";
      const source = update?.source ? ` from=${update.source}` : "";
      const status = update?.status ? ` status=${update.status}` : "";
      return `- ${title}${source}${status}`;
    })
    .join("\n");
}

function buildAgentMessage(payload) {
  const summary = payload?.summary || {};
  const snapshot = payload?.snapshot || {};
  const inboundRoute = payload?.inbound?.route || "/api/webhook/project/openclaw";
  const headerName = payload?.inbound?.authHeader || "x-com-moon-shared-secret";
  const projects = projectLines(snapshot.projects);
  const updates = updateLines(snapshot.updates);
  const fullPayload = trimForPrompt(JSON.stringify(payload, null, 2), 3000);

  const message = [
    "Moonlight -> OpenClaw sync",
    `generatedAt=${payload?.generatedAt || new Date().toISOString()}`,
    `message=${payload?.message || "Use this Moonlight snapshot as operating context."}`,
    `summary active=${summary.activeProjects ?? 0} blocked=${summary.blockedProjects ?? 0} open_tasks=${summary.openTasks ?? 0} updates=${summary.updateCount ?? 0}`,
    projects ? `projects:\n${projects}` : "projects: none",
    updates ? `recent updates:\n${updates}` : "recent updates: none",
    `Return project updates to Moonlight via POST ${inboundRoute} with ${headerName}.`,
    "payload excerpt:",
    fullPayload,
  ].join("\n\n");

  return trimForPrompt(message, MAX_MESSAGE_CHARS);
}

function openClawArgs(message) {
  return [
    "agent",
    "--agent",
    AGENT_ID,
    "--message",
    message,
    "--json",
    "--timeout",
    process.env.OPENCLAW_RELAY_TIMEOUT || "120",
  ];
}

function runOpenClawSync(message) {
  return new Promise((resolve) => {
    const child = spawn("openclaw", openClawArgs(message), {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout = trimForPrompt(stdout + chunk.toString(), 6000);
    });

    child.stderr.on("data", (chunk) => {
      stderr = trimForPrompt(stderr + chunk.toString(), 4000);
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        status: null,
        reason: error.message,
        stdout,
        stderr,
      });
    });

    child.on("close", (code, signal) => {
      resolve({
        ok: code === 0,
        status: code,
        signal,
        reason: code === 0 ? "sent" : `openclaw-exited-${code ?? signal}`,
        stdout,
        stderr,
      });
    });
  });
}

function queueOpenClaw(message) {
  return new Promise((resolve) => {
    const child = spawn("openclaw", openClawArgs(message), {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";

    function settle(result) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    }

    child.stdout.on("data", (chunk) => {
      stdout = trimForPrompt(stdout + chunk.toString(), 6000);
    });

    child.stderr.on("data", (chunk) => {
      stderr = trimForPrompt(stderr + chunk.toString(), 4000);
    });

    child.on("spawn", () => {
      settle({
        ok: true,
        pid: child.pid,
        reason: "queued",
      });
    });

    child.on("error", (error) => {
      settle({
        ok: false,
        status: null,
        reason: error.message,
      });
    });

    child.on("close", (code, signal) => {
      const level = code === 0 ? "log" : "error";
      const detail = code === 0 ? "completed" : `failed (${code ?? signal})`;
      console[level](`[openclaw-relay] async delivery ${detail}`);

      if (stdout.trim()) {
        console.log(summarizeOpenClawOutput(stdout));
      }

      if (stderr.trim()) {
        console.error(trimForPrompt(stderr.trim(), 1200));
      }
    });
  });
}

function verifySecret(request) {
  if (!RELAY_SECRET) {
    return true;
  }

  return request.headers["x-openclaw-sync-secret"] === RELAY_SECRET;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === PATHNAME)) {
    jsonResponse(response, 200, {
      status: "ok",
      relay: "moonlight-openclaw-local",
      path: PATHNAME,
      agent: AGENT_ID,
      mode: MODE,
    });
    return;
  }

  if (request.method !== "POST" || url.pathname !== PATHNAME) {
    jsonResponse(response, 404, {
      status: "not_found",
      path: PATHNAME,
    });
    return;
  }

  if (!verifySecret(request)) {
    jsonResponse(response, 401, {
      status: "unauthorized",
      reason: "invalid-openclaw-sync-secret",
    });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const payload = parsePayload(body);
    const message = buildAgentMessage(payload);
    const delivery = MODE === "sync" ? await runOpenClawSync(message) : await queueOpenClaw(message);

    jsonResponse(response, delivery.ok ? (MODE === "sync" ? 200 : 202) : 502, {
      status: delivery.ok ? "sent" : "error",
      relay: "moonlight-openclaw-local",
      transport: "local",
      mode: MODE,
      agent: AGENT_ID,
      delivery,
    });
  } catch (error) {
    jsonResponse(response, error?.message === "payload-too-large" ? 413 : 500, {
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
});

server.on("error", (error) => {
  console.error(`[openclaw-relay] failed to listen on ${HOST}:${PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[openclaw-relay] listening on http://${HOST}:${PORT}${PATHNAME}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
