import { NextResponse } from "next/server.js";

import {
  buildMetaThreadsAuthUrl,
  decodeMetaThreadsState,
  hasMetaThreadsOAuthStateSecret,
  resolveMetaThreadsConfig,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { resolveExpectedSocialAccountId, resolveSocialBrandKey } from "@/lib/social-account-connections";
import { registerSocialOAuthFlow } from "@/lib/social-oauth-flow";
import { resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveMetaThreadsConfig();
  const brandHandle = searchParams.get("brand") || config.brandHandle;
  const requestedReturnPath = searchParams.get("returnPath") || "";
  const returnPath = requestedReturnPath.startsWith("/") &&
    !requestedReturnPath.startsWith("//") && !requestedReturnPath.includes("\\")
    ? requestedReturnPath : "/dashboard/settings";
  let brandKey;
  try {
    brandKey = await resolveSocialBrandKey(workspaceId, searchParams.get("brandKey"));
  } catch {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "invalid-brand");
    return NextResponse.redirect(target);
  }

  if (!hasMetaThreadsOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const app = resolveMetaOAuthApp({ provider: "meta_threads", brandKey, brandHandle });
  if (!app?.configured) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-meta-config");
    return NextResponse.redirect(target);
  }

  let expectedAccountId;
  try {
    expectedAccountId = await resolveExpectedSocialAccountId({
      provider: "meta_threads", workspaceId, handle: brandHandle, brandKey,
      accountId: searchParams.get("accountId"),
      app,
    });
  } catch {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "account-mismatch");
    return NextResponse.redirect(target);
  }

  const authUrl = buildMetaThreadsAuthUrl({
    origin,
    workspaceId,
    brandHandle,
    brandKey,
    expectedAccountId,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-meta-config");
    return NextResponse.redirect(target);
  }

  const state = decodeMetaThreadsState(new URL(authUrl).searchParams.get("state"));
  if (state.invalid || !await registerSocialOAuthFlow(state)) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "connect-failed");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
