# Content Workflow Release Continuation

상태: **통합 테스트 오류 해결 · 운영 인증 갱신 대기**. 2026-09-12 운영자의 “이어서”에 따라 앞선 Studio 구현의 통합 검증과 운영 적용 준비를 이어갔다. DB 변경·배포는 수행하지 않았다.

## Scope

- Keep the accepted Studio implementation and production migration `20260912_0026_content_workflow.sql` unchanged unless a concrete validation failure requires a correction.
- Fix the reproduced Node test-runner failure loading local JSX modules. Preserve the existing celebration implementation and its tests.
- Verify the integrated workspace, then apply the content schema and deploy the existing Hub/Engine targets only when authenticated target inspection succeeds. Never use the production database for test fixtures.
- Keep unrelated uncommitted work intact. Use `codex/content-release-20260912` in `/Users/bigmac_moon/dev/moonlight_pro-content-release` for the code changes and retain its history after local integration.

## Steps

- [x] Reproduce the JSX failure with a small executable component regression test.
- [x] Teach the existing Node test module hook to compile local JSX using the repository's installed TypeScript dependency; preserve normal module resolution and errors.
- [x] Run the regression test and the existing celebration tests, then the integrated full suite and required checks.
- [x] Inspect the existing Supabase and Vercel targets using read-only requests without logging credentials.
- [ ] Complete authenticated schema/deployment inspection, apply the reviewed migration, and deploy the identified targets.
- [x] Record exact results, remaining external requirements, and integration; clean up the dedicated worktree.

## Initial observations

- The celebration test imports a real `.jsx` module. Node's test runner only has the repository's `@/` resolution hook and fails with `ERR_UNKNOWN_FILE_EXTENSION` before assertions run. This is a loader gap; no celebration behavior change is needed.
- Existing Supabase Management API credentials returned HTTP 401 during a read-only schema query. The existing Vercel credentials returned HTTP 403 (`forbidden`) while listing the user's teams. No schema change or deployment was attempted.
- The referenced local gstack skills are not installed at their configured paths or in the repository. Existing superpowers debugging, verification, and worktree workflows provide the fallback.

## Verification results

- The new JSX regression reproduced `ERR_UNKNOWN_FILE_EXTENSION`, then passed after the loader correction. It renders actual React markup, including Korean text, a JSX attribute, builtin module resolution, and escaped content.
- The feature worktree suite passed: 762 tests total, 759 passed, 0 failed, 3 PostgreSQL tests skipped because the disposable database was not running. The SQL itself is unchanged from the previously passing dedicated PostgreSQL suite.
- Vercel CLI 59.16.0 also rejected the stored credential and explicitly requested a new login. The stored access token had expired. A normal CLI authentication check did not recover it.
- The configured Supabase service-role read returned HTTP 200 for an empty `content_items` query. This confirms the existing read connection works; it does not authorize DDL or replace the failing Management API credential.
- In the original working folder, `npm test` passed **817/817 executed tests**: 820 total, 817 passed, 0 failed, 3 optional PostgreSQL tests skipped. The original eight celebration tests remained unchanged and passed.
- With the previously CI-configured Node 20.19.0 runtime, the eight celebration tests and the new JSX regression passed **9/9**. The default local suite used Node 24.18.0.
- A subsequent reproduction of the full CI test command on Node 20.19.0 failed before tests ran: that runtime did not expand the quoted `**/*.test.mjs` patterns. CI is therefore updated to Node 24.18.0, matching the runtime that passed the complete test suite. The test scope stays unchanged.
- The exact Node 24.18.0 package was also used to rerun the full test command: **817 passed, 0 failed, 3 optional tests skipped**. This verifies the pinned CI runtime, rather than relying only on the host's default Node binary.
- The installed app code, migration SQL, and production configuration were not changed in this continuation. The previously successful app builds and PostgreSQL scenarios remain the relevant application verification.
- `npm run check:contracts` passed after local integration. Whitespace checks passed for this continuation's owned diff.
- Empty REST probes returned HTTP 200 for `content_items` and `content_variants`, and HTTP 404 for the three new content-workflow relations. Authenticated Management API inspection is still needed before applying the migration.
- GitHub deployment metadata showed the latest recorded Preview at `6538ba69a1a474d08400f96fa3627f5e0e3cf586` (2026-09-11) and the latest recorded Production at `64d354764ec04fcd272308c0398a30553ba022b2` (2026-06-20). These records do not identify current Vercel targets conclusively; authenticated project/alias inspection must precede deployment.

## Resume operating deployment

1. Renew `SUPABASE_ACCESS_TOKEN` in `apps/hub/.env.local` from the [Supabase access-token settings](https://supabase.com/dashboard/account/tokens), and complete `npx vercel login` locally. The existing service-role key does not need replacement merely because the Management token failed.
2. Re-run authenticated read-only schema and Vercel project inspection. Confirm the existing Hub and Engine projects, deployed source revisions, server workspace, shared secret, and Hub-to-Engine URL. Preserve unrelated remote changes when preparing the deployment source.
3. After the target/schema checks pass, apply only the reviewed content migration from the repository root:

   ```sh
   node scripts/apply-migrations.mjs 20260912_0026_content_workflow.sql
   ```

4. Verify the expected relations, RPC, and service-only grants; deploy the identified Engine and Hub targets in that order. Verify health, authenticated reads, and the Studio route. Keep test fixtures out of the production database.

The exact target inspection and rollout remain pending authentication. No new hosting project, environment variable, production data, or paid AI invocation was created by this continuation.

## Local integration

The JSX hook, regression fixture/test, and CI runtime update are reflected in the original working folder. The existing celebration source and test file, Content Studio implementation, and content migration were preserved byte-for-byte. Feature history is retained on `codex/content-release-20260912`; the dedicated worktree is removed after integration. The only unfinished release step is the authenticated production inspection and rollout described above.
