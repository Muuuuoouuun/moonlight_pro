# Mac Pet Task Editing and Bulk Deletion

**Goal:** Make the Today footer's Hub action icon-only, and let the operator select and delete multiple tasks in edit mode.

**Architecture:** Reuse native glass controls and the existing task-row confirmation. In edit mode, row clicks change selection rather than completion. A serialized Hub deletion batch uses existing single-ID DELETE requests, stops at the first error or connection change, and reports confirmed results without hiding failures.

**Tech Stack:** SwiftUI, existing HubStore/HubAPI, Foundation domain checks, packaged native self-check and real app inspection.

## Interaction

- Task and calendar footers show the same arrow icon with the existing accessible name/tooltip.
- The task list has `편집`. Editing exposes selection checkboxes, selected count, select all/clear, selected deletion and `완료` in the existing list heading.
- Confirmation names the selected tasks and deletion scope. Cancel preserves selection and all records.
- Confirmed deletions disappear. A partial failure stops further requests, preserves remaining records/selection and explains how many deletions were confirmed. Source changes invalidate the selection and confirmation.
- Existing right-click deletion remains. Editing adds no new permanent panel and does not change Windows behavior or the backend.

## Steps

- [x] Baseline and failing batch tests: complete success, duplicates, partial failure, write serialization, stale reads and connection changes.
- [x] Implement serialized deletion, model routing, shared Hub icon and edit selection.
- [x] Run focused checks, build and packaged native self-check with build-tree resources hidden.
- [x] Review, install and inspect the actual selection/confirmation/cancel flow without deleting operator records.
- [x] Integrate only these changes and remove the dedicated worktree.

## Verification

- Baseline passed the existing Hub domain/state checks and 16 API contract groups. New batch tests first failed because the batch operation did not exist, then passed after implementation.
- Batch checks cover one write lock across multiple acknowledgements, duplicate/unknown IDs, fail-stop partial results, stale reads and source changes. Existing single-delete recovery tests still pass.
- Native build and strict signature verification passed. Packaged `--self-check` passed while the build-tree resource bundle was temporarily hidden, including Hub/local single/bulk AppModel routing and local persistence.
- Independent code review found no actionable issue. The icon-only footer button retains the accessible name and tooltip.
- Installed at `~/Applications/MoonlightPetPreview.app`; the operator handled the macOS keychain prompt. The real task panel shows the arrow icon and edit button. In the persistent panel, selecting two rows showed `2개 선택` and the confirmation named both tasks. Cancel retained both selections and the input draft. Select all showed `8개 선택`; clear reset the count to zero and disabled deletion. Leaving edit mode retained the eight open tasks and their incomplete states. The verification only cancelled confirmation and sent no deletion command. The temporary persistent panel was folded back to the pet afterwards.
- Integrated as `e5f41835`. The domain/state/API checks pass again in the main checkout, and installed-build production sources match the integrated files. The dedicated worktree was archived and removed; the earlier resource fix and unrelated working changes remain preserved. No operator records were deleted during verification.
