import { NextResponse } from "next/server.js";

import {
  buildInstagramApiAuthUrl,
  decodeInstagramApiState,
  hasInstagramApiOAuthStateSecret,
  resolveInstagramApiConfig,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { resolveExpectedSocialAccountId, resolveSocialBrandKey } from "@/lib/social-account-connections";
import { registerSocialOAuthFlow } from "@/lib/social-oauth-flow";
import { resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveInstagramApiConfig();
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
    target.searchParams.set("instagram", "invalid-brand");
    return NextResponse.redirect(target);
  }

  if (!hasInstagramApiOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const app = resolveMetaOAuthApp({ provider: "instagram_api", brandKey, brandHandle });
  if (!app?.configured) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "missing-instagram-config");
    return NextResponse.redirect(target);
  }

  let expectedAccountId;
  try {
    expectedAccountId = await resolveExpectedSocialAccountId({
      provider: "instagram_api", workspaceId, handle: brandHandle, brandKey,
      accountId: searchParams.get("accountId"),
      app,
    });
  } catch {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "account-mismatch");
    return NextResponse.redirect(target);
  }

  const authUrl = buildInstagramApiAuthUrl({
    origin,
    workspaceId,
    brandHandle,
    brandKey,
    expectedAccountId,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "missing-instagram-config");
    return NextResponse.redirect(target);
  }

  const state = decodeInstagramApiState(new URL(authUrl).searchParams.get("state"));
  if (state.invalid || !await registerSocialOAuthFlow(state)) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "connect-failed");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
