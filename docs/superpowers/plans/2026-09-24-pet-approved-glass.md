# Approved pet glass implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved refinement inline. The user approved all three generated usage scenes and requested application to the desktop app.

**Goal:** Apply the approved vertical Today, horizontal Memo and opaque Focus scenes to the existing macOS pet app.

**Architecture:** AppKit owns one material and the animated window geometry. Shared SwiftUI content owns the compact hierarchy, keyboard focus and controls. Existing AppModel remains the only local data owner.

**Tech Stack:** SwiftPM, SwiftUI, AppKit; macOS 26 native glass with macOS 14 fallback.

## Execution

- [x] Create isolated `codex/pet-approved-glass` worktree; baseline `swift run MoonlightPetPreview --self-check` passes.
- [x] Inspect approved images, existing native views and Apple NSGlassEffectView documentation; prepare separate transparent character atlases while preserving originals.
- [x] Add meaningful SelfCheck coverage for restored task/memo drafts and tall↔wide window anchors. Run the draft check before implementation and observe the failure.
- [x] Update `AppModel.swift` for automatic local memo saving, task-draft recovery, and focus progress. Keep the browser action explicit; copy memo only on its named button.
- [x] Centralize native dimensions, glass chrome and thin controls. Reuse one `CompanionPanelView` from `QuickBarView` and `CompactWidgetView`; move mode navigation into the header menu while keeping task/calendar tabs.
- [x] Implement flat task rows, date/calendar connection view, wide memo editor, quiet Office/Council launch surfaces and focus setup. Preserve keyboard shortcuts and shared drafts.
- [x] Apply transparent character assets to all nine choices; display clean silhouettes and subtle press/hover feedback.
- [x] Refine the opaque `FocusShieldView` into the approved centered glass timer. Preserve stop confirmation and Escape handling.
- [x] Build and run SelfCheck; inspect actual app interactions and screenshots; fix observed defects. Record what is and is not verified.
- [x] Commit owned files, merge into the original branch, rebuild the real app and remove the worktree.

Integration verified: implementation `5092a740`, merge `0a74573c`; original-path app build, binary/process check and SelfCheck passed. The running app preserves the operator's selected Jolteon portrait. Review found and resolved the settings-reset issue; live typing verified the hidden-host focus race fix. The isolated worktree was removed.

## Acceptance

One click still opens quick functions. Double click opens a persistent Today panel. Task/calendar switch in a vertical panel; memo uses a wide shape with the same top-right anchor. Text stays readable without opaque nested cards. No invented schedule rows. Existing stored records survive. Focus shows only timer, stop controls and escape guidance over an opaque full-screen shield. Idle artwork uses the original portrait without a circular border. Expanded widgets and focus use the separate transparent hands-on-edge pose (operator correction on 2026-09-24).
