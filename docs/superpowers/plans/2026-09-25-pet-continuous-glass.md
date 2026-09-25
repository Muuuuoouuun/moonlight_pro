# Continuous pet glass implementation plan

**Goal:** Remove fragmented dark backing from native companion panels while preserving sharp text and press-only character tint.

**Architecture:** Put one native reading material in `GlassPanel` beneath its wash and foreground. Opt quick/widget windows into this surface and propagate existing reading protection to suppress nested materials. Controls retain shallow fills; memo no longer measures text to size a backing.

**Tech stack:** SwiftUI, AppKit, SwiftPM.

## Steps

- [x] Inspect current panel/material hierarchy, latest spec, and screenshots; baseline `swift run -j 2 MoonlightPetPreview --self-check` passes.
- [x] In `Views/GlassPanel.swift`, add opt-in shared `ReadingMaterialView` and protected foreground. In `Support/WindowCoordinator.swift`, enable it for quick/widget windows.
- [x] In `Views/CompanionPanelView.swift`, `CaptureContent.swift`, and `CalendarCompanionContent.swift`, remove obsolete text backing/height measurements. In `GlassControls.swift`, keep shallow interactive fills and focus outline.
- [x] In `Support/PetGlassTheme.swift`, lower transient wash to .42/.52 without changing interaction state handling.
- [x] Build via `./script/build_and_run.sh --verify`, run existing self-check, and inspect tasks/calendar/memo with native UI tools. No new tests for visual constants.
- [x] Update README and verification record; commit explicit paths, merge into the working branch, relaunch from main workspace, remove worktree.

Native UI verification and its compositing/interaction limits are recorded in the corresponding design spec.

Integration: `a8065f9d` merged into the active branch. Main-workspace build/launch and self-check passed; the updated task widget was visible. Temporary worktree removed.
