import assert from "node:assert/strict";
import { test } from "node:test";

let status = null;

try {
  status = await import("./connection-status.mjs");
} catch {
  // Red phase: optional provider status reporting does not exist yet.
}

test("separates configured Google OAuth from disabled and misconfigured providers", () => {
  assert.ok(status, "connection-status.mjs must exist");
  assert.deepEqual(
    status.summarizeGoogleOAuthProviders({
      integrations: {
        googleOAuth: {
          calendar: { enabled: true, configured: true, reason: "ok" },
          gmail: { enabled: false, configured: false, reason: "provider-not-enabled" },
          sheets: { enabled: true, configured: false, reason: "missing-client" },
        },
      },
    }),
    [
      { provider: "Calendar", level: "PASS", detail: "enabled/configured" },
      { provider: "Gmail", level: "INFO", detail: "disabled (provider-not-enabled)" },
      { provider: "Sheets", level: "WARN", detail: "enabled/not-configured (missing-client)" },
    ],
  );
});
