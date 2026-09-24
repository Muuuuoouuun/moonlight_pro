# Pet frontend quality implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The existing Edge Spine design and the user's request to apply improvements authorize this refinement.

**Goal:** Improve native pet glass controls, direct manipulation and layout continuity without changing the approved quick-bar / compact-widget workflow.

**Architecture:** Keep AppKit responsible for the window material, screen coordinates and window size. SwiftUI fills those bounds and owns persistent navigation, focus and thin controls. Business data remains in the existing AppModel.

**Tech Stack:** SwiftPM, AppKit, SwiftUI; macOS 14 fallback and macOS 26 NSGlassEffectView.

## Execution

- [x] Read the existing implementation, DESIGN.md and Apple Liquid Glass guidance. Baseline isolated SelfCheck passes.
- [x] Add `Support/PanelInteraction.swift`: a screen-space drag tracker with a threshold only before activation, plus top-right anchored screen clamping. Verify slow drags, reversal and negative-origin screens in `Support/SelfCheck.swift`.
- [x] Integrate first-mouse acceptance and the drag tracker into `Support/WindowCoordinator.swift`. Keep frame changes under AppKit; align the hidden pet with the resized widget. Reopening the bar increments a focus revision in `Models/AppModel.swift`.
- [x] Add `Views/GlassControls.swift`: thin neutral button and input treatment, pointer feedback, keyboard focus and a native screen-space drag handle. Respect increased contrast and reduced motion.
- [x] Refine `Views/CompactWidgetView.swift`: keep the segment row outside the replaced body, slide one selection highlight, fill the native window bounds, focus the selected editor, and support Command-1/2 and Command-S.
- [x] Refine `Views/QuickBarView.swift`: fill native bounds, focus on open/switch, share input and primary-action styling, improve row feedback. Avoid nested native glass controls.
- [x] Compare native material paths on the real desktop. Use a single AppKit regular glass on macOS 26, with automatic system accessibility adaptation; keep the behind-window fallback on older macOS. This updates the initial plan after visual comparison exposed excess gray haze in the dual-layer setup.
- [x] Build and run isolated SelfCheck. Review the diff; check real native UI if the Mac is unlocked. Record a qualitative audit and explicit verification limits in the prototype's `design/frontend-quality.md`.
- [ ] Commit only owned paths, merge into the original branch, rebuild/relaunch the actual app with `script/build_and_run.sh --verify`, run its SelfCheck, and remove the dedicated worktree.

## Acceptance

The first pet click acts immediately. Small drag events remain continuous after activation and never turn into a click. Tasks/memo have a persistent segmented control and keep drafts. Window resizing preserves the top edge when room is available, and clamps within the current visible display. Keyboard focus has a rounded 1px cue; buttons have hover/press/disabled feedback. Existing task/memo persistence checks pass in an isolated defaults suite. Quality scores are design judgments, not measured latency, FPS or optical benchmarks.
