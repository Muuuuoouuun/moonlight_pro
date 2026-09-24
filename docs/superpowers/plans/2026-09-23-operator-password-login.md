# Operator Password Login Implementation Plan

**Goal:** Replace the deployed Hub's secret-only login with a single operator username and password, then prepare a guarded production release.

**Architecture:** Validate a scrypt password hash in the login route and issue the existing signed session cookie. Reuse that cookie in the production write guard, which also requires a same-origin request. Keep the Vercel protection layer until the application, database configuration, and login rate limit are verified.

**Tech Stack:** Next.js App Router, Node crypto, Node test runner, Vercel.

---

### Task 1: Credential validation

- [x] Add failing tests for correct credentials, wrong username/password, missing or malformed configuration, and session-secret separation.
- [x] Implement fixed-format salted scrypt validation and a local password-hash generator.
- [x] Run focused tests.

### Task 2: Login API and browser form

- [x] Add failing route tests for login, generic rejection, oversized input, and logout.
- [x] Change the route from `secret` to `username` and `password`, preserving cookie attributes.
- [x] Replace the single-key field with labeled username and password fields, autofill hints, and visible feedback.
- [x] Verify the form through a local browser.
- [x] Add a logout control to the existing profile card.

### Task 3: Authenticated writes

- [x] Add failing tests for same-origin session writes, missing session, and foreign origin.
- [x] Permit only the authenticated same-origin browser path; keep server credentials unchanged.
- [x] Remove the production loopback write bypass and verify session changes are same-origin.
- [x] Run focused and full tests; build the Hub (2494 tests, 2483 pass, 0 fail, 11 skip).

### Task 4: Production setup and verification

- [x] Inspect the current Vercel production target and variable names without exposing values.
- [x] Publish a Vercel Firewall rule for POST `/api/operator/session`: 5 requests per 60 seconds per IP, then 429.
- [ ] Prepare operator credential and database environment configuration.
- [ ] Deploy the tested source, verify login, one read, one write, and logout.
- [ ] Change Deployment Protection only after the new authentication is working and the operator confirms the access change.
