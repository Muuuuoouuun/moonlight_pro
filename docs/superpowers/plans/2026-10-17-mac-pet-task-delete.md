# Mac Pet Task Deletion Implementation Plan

**Goal:** Allow the operator to delete local and Hub tasks from the native Mac pet's existing task-row context menu.

**Architecture:** Keep the current flat task list and platform-specific SwiftUI controls. Ask for confirmation with the task title and explain that Hub deletion removes the original record. Reuse the guarded `DELETE /api/hub/tasks` route. Remove a remote row only after a `saved` response; preserve rows and explain failures, prevent simultaneous task writes, and discard responses after connection changes.

**Tech Stack:** SwiftUI/AppKit, Foundation async services, existing Foundation-only contract tests and native self-check.

## Design

- Add `삭제…` to the existing task context menu and an equivalent accessibility action. Keep Hub navigation and the existing Office actions.
- Use a native confirmation alert, with cancel as the default. Cancel must have no side effects. Validate the selected task and connection again on confirmation.
- Extend `HubServing`/`HubAPI` and `HubStore`; route `AppModel.removeTask` to the current source. Leave local tasks untouched when deleting a Hub task.
- Do not add task data, schema changes, Windows behavior, or a new always-visible control.

## Tasks

- [x] Establish the current Hub domain/API baseline.
- [x] Add failing API tests for DELETE identity, acknowledgements, preview/error/offline failure; state tests for delayed success, failed deletion, stale reads and connection changes.
- [x] Implement the service, state, model and confirmation UI.
- [x] Run the focused tests, native build and packaged self-check without build-tree resources.
- [ ] Install the verified native app and inspect the real context menu/confirmation without deleting an operator record.
- [ ] Integrate only the task changes, preserve the preceding resource fix, and remove the dedicated worktree after integration.

## Verification record

Baseline: `script/test_hub_domain.sh` passes address recovery (6), session-expiry ordering (8), Hub model/state checks and API contracts (14). The preceding launch repair remains an existing local change and is carried into the build.

Final automated checks: API contracts increased to 16; deletion state tests cover delayed acknowledgement, duplicate actions, timeout/offline/auth rejection, stale reads and connection changes. Review found a persisted create command could resurrect a deleted row. A failing regression reproduces that case, and the fix retires a matching recovered create before DELETE, including a committed delete with a lost response and application restart.

`apps/desktop/pet-runtime.test.js`: 6 passing checks, including automatic native launch and reuse. The native build and strict bundle signature passed. Packaged `--self-check` passed with the build-tree resource bundle temporarily hidden, including real AppModel Hub/local deletion routing and local persistence.

Installed the verified bundle at `~/Applications/MoonlightPetPreview.app`. The real pet and task panel render. After the new ad-hoc signature, automatic login is waiting with a macOS SecurityAgent process active; computer use refuses access to that security app. The operator was asked to handle any keychain prompt directly. Real-record deletion is not part of verification; menu/alert/cancel inspection is pending authentication.
