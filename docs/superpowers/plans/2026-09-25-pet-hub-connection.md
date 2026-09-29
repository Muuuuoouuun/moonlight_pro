# Pet Hub Connection Implementation Plan

> Execution: current session, independently owned transport/UI subtasks and root domain integration.

**Goal:** Show and operate real Hub tasks, save the current memo to the live journal, and read the selected week's calendar in the existing native pet.
**Architecture:** Private URLSession transport → typed Hub API → observable HubStore → existing AppModel and views. Local records stay separate. Existing authenticated Hub routes remain authoritative.
**Tech Stack:** SwiftPM, SwiftUI/AppKit, Foundation URLSession, Foundation-only executable checks (CLT test runtimes unavailable). No added package dependencies.

## Work

- [x] Add HubTransport and tests: safe origin, private cookies, session login, same-origin writes, redirect rejection, HTTP and application error envelopes.
- [x] Add HubAPI/HubModels and tests: task timestamp-preserving mapping, idempotent create, journal verified save, calendar timezone/date handling.
- [x] Add HubStore and tests: explicit state, scoped pending writes, late response guards, local draft preservation, partial/error states and refresh lifecycle.
- [x] Integrate AppModel without deleting legacy UserDefaults. Preserve local self-check by explicitly selecting local mode there.
- [x] Update existing task/memo/calendar surfaces and connection settings. Keep native glass styling. Replace live destructive action with Hub detail link.
- [x] Run Swift tests and existing self-check; read current Hub counts without test writes; build and inspect actual app UI.
- [x] Document observed verification and limitations, commit only owned paths, merge into original branch, build/run from main workspace, remove worktree.

## API contracts

Tasks: GET/POST/PATCH `/api/hub/tasks`; POST stable `{id,title,status:"todo",source:"desktop-pet"}`; PATCH `{id,status,expectedUpdatedAt}`.
Memo: POST `/api/hub/journal` `{action:"save",requestId,entryId,expectedRevision,body,title:"",occurredAt,noteMeta:{kind:"note",enhancement:""},contexts:[]}` then GET `?note=entryId`; `saved|duplicate` and matching read-back are required.
Calendar: GET `/api/calendar/google/event?timeMin=ISO&timeMax=ISO`; preserve `partial` and parse all-day local calendar dates with exclusive end.
Authentication: GET/POST `/api/operator/session`, session cookie kept in memory only. No shared server secrets.

## Verification — 2026-09-25

- Native build and exact running bundle verification passed.
- Transport: 15 checks, including private cookies, same-origin writes, rejected redirects, preview/error envelopes and typed conflicts. Redirect check uses two isolated localhost listeners; destination receives zero requests.
- Domain: 13 API contract groups plus model/state checks. Tested original timestamp preservation, task receipt mismatch, journal body/revision read-back, metadata preservation, canonical origin retry identity, recovery after a persisted task is edited before retry, empty draft retry, local draft retention, concurrent remote edit refusal, stale read after write, late responses after disconnect, all-day date boundaries.
- Actual read only from localhost Hub: 38 tasks and 6 events in the current week, both live and non-partial. No test business record was written.
- Native UI: actual Hub task list/count rendered, calendar tab/weekday selection surface rendered. Further click testing stopped while the user was typing in the widget; the draft was left intact.
- Existing self-check covers local persistence, memo recovery, focus, interaction, nine character assets and optical GPU output.

## Boundaries

- Calendar is read-only here; browser is the full editor. Existing Mac tasks are not auto-uploaded.
- Native operator session is memory-only, so a production Hub asks for login after an app restart. Current development loopback reads succeed without an operator login.
- Memo typing stays local; explicit Hub save is revision-aware. A post-write verification conflict retains its original pending command and local draft for inspection/retry.
- Real production create/update round trip was not exercised by generating disposable records. Protocol/state behavior is covered in isolated checks.
