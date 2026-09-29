# Pet prism edge and reading contrast

Status: operator requested implementation, 2026-09-25.

Relation: refines the clear/white foreground contract in `2026-09-25-pet-character-glass-design.md`. Original portraits, perched memo, drag tint lifetime and drafts are preserved.

## Problem and decision

The supplied screenshots show busy background code passing through the clear center and white foreground losing contrast on a bright desktop. Refraction at the perimeter cannot fix that central overlap. Use a localized native reading material below the header, controls, task rows, calendar text and memo editor. Empty space and the outer clear glass remain transmissive. Text stays in the sharp sibling host; no glyph blur, outline or halo is introduced.

The system clear glass continues to composite the desktop. A thin Metal prism reflection at the bevel separates warm/cool light and models thickness, without a colored fill in the center. Public NSGlassEffectView has no refractive-index control; custom desktop refraction is not claimed. The app-owned lab can measure true refraction against its known background.

Character color is still transient, only while pressing/dragging. Keep Sylveon's approved light blush and 60% interaction opacity. Lift and separate the other eight character colors instead of raising their existing 76% opacity. Reading protection is neutral at rest. A per-panel shared presentation source mirrors the existing wash into reading regions only during the same interaction; it adds no mouse monitors or timers and cannot latch a separate character state.

## Implementation and verification

- Reusable masked NSVisualEffectView reading regions with dark HUD appearance and behind-window blending on desktop panels; within-window blending in the owned lab.
- Avoid nested protection materials through a shared environment value. Preserve input hit testing and existing dimensions. The opaque focus shield opts out of behind-window reading effects. Memo protection follows written/insertion lines instead of covering the empty editor; overflowing text receives protection for the full viewport.
- Native inspection over the calibration grid and real quick panel; task/memo/calendar transitions, character previews and drag/release.
- GPU checks: center alpha remains zero, premultiplication, thin spectral edge, real lab displacement and stable clear center.
- No screen capture permission, user-record fixtures, network dependency or permanent character-color layer.

## Primary references

- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) and [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): clear glass may need localized dimming for text on bright backgrounds.
- [NSVisualEffectView behindWindow](https://developer.apple.com/documentation/appkit/nsvisualeffectview/blendingmode-swift.enum/behindwindow): native desktop backdrop processing, with system-defined material strength.
- [SwiftUI Material](https://developer.apple.com/documentation/swiftui/material): app-internal material alone does not blur windows behind the app.

Limit: preserving a transparent outer body and fixed white glyphs does not guarantee accessibility contrast over every possible desktop. This change reserves stronger protection for reading regions, with the existing system Reduce Transparency/Increase Contrast fallback.
