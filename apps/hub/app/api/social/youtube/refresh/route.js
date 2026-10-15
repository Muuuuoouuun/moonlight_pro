import { NextResponse } from "next/server.js";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { getUsableYouTubeAccessToken, readYouTubeConnections, summarizeYouTubeConnection, getYouTubeConnectionStatus } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

/** User initiated only. GET/status/UI mount must never invoke this action. */
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req, { maxBytes: 2048 });
  if (parsed.error) return parsed.error;
  const { channelId, confirmRefresh } = parsed.data || {};
  if (confirmRefresh !== true || typeof channelId !== "string" || !/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    return NextResponse.json({ status: "invalid-input", error: "채널을 선택하고 접근 권한 갱신을 확인하세요." }, { status: 400, headers });
  }
  const workspaceId = resolveDefaultWorkspaceId();
  try {
    const result = await getUsableYouTubeAccessToken({ workspaceId, channelId });
    // Re-read metadata after CAS so a concurrent reconnect/disable stays visible.
    const latest = await readYouTubeConnections(workspaceId, channelId);
    const row = latest.connections[0];
    if (!latest.available || row?.status !== "connected" || row.workspace_id !== workspaceId ||
      row.provider !== "youtube" || row.account_key !== channelId || row.config?.channelId !== channelId) {
      return NextResponse.json({ status: "conflict", error: "연결 상태가 바뀌었습니다. 다시 확인하세요." }, { status: 409, headers });
    }
    const connection = summarizeYouTubeConnection(row);
    return NextResponse.json({ status: "saved", refreshed: result.refreshed,
      connection: { ...connection, tokenStatus: getYouTubeConnectionStatus(connection) },
      notice: "접근 토큰 갱신은 기존 갱신 권한의 만료를 연장하지 않습니다.",
    }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code.includes("reauthorization-required") ? "reauthorization-required"
      : code === "youtube-channel-mismatch" ? "account-mismatch"
      : code === "youtube-token-refresh-retryable" ? "retryable"
        : ["youtube-token-refresh-client-config-error", "youtube-client-not-configured"].includes(code) ? "missing-config"
          : code === "youtube-token-refresh-permission-required" ? "permission-required"
            : code === "youtube-connection-not-found" ? "not-found" : "failed";
    return NextResponse.json({ status, error: status === "reauthorization-required"
      ? "Google에서 이 채널을 다시 승인하세요."
      : status === "retryable" ? "일시적으로 갱신하지 못했습니다. 잠시 후 다시 시도하세요."
        : "갱신을 완료하지 못했습니다. 연결 상태와 설정을 확인하세요.",
    }, { status: status === "not-found" ? 404 : ["reauthorization-required", "account-mismatch"].includes(status) ? 409 : 503, headers });
  }
}
