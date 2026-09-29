# Pet glass — approved interactive study

## Decision

The operator selected the interactive HTML study with blur **12px**, central
shade **10%**, glyph shadow **73%**, and reflection **66%**, then requested
continuation into the app. This refines the clear-prism implementation: a clear
native sheet and glyph shadows alone transmit too much high-frequency desktop
content. Avoid returning to full-strength HUD material or separate text plates.

## Native mapping

- The native compositor owns blur radius; public AppKit has no CSS `blur(12px)`
  equivalent. Use an initial **48% under-window material mix**, feathered over
  24pt at the perimeter, as the native approximation to the approved mild blur.
- The backdrop material is below the clear glass. Foreground text is a separate
  sibling above all optical layers. No screen capture or private filters.
- A central radial shade peaks at 10%, fading to zero at the edge.
- Glyph contact shadow is 73%; the softer secondary shadow is half that value
  to avoid a broad black halo. Accessibility contrast/transparency fallback
  removes these decorative layers.
- Neutral rim reflection increases by 66/45 relative to the initial HTML
  reference. The 9pt bevel geometry and subtle spectral separation stay fixed.
- Character color remains controlled by the existing press/drag wash, with no
  new idle character tint.

The HTML percentages are design anchors, not interchangeable optical units
between CSS and AppKit. In particular the material mix must not be described as
an exact 12pt blur or a pixel-identical copy of the approved browser preview.

## Verification

- PASS: `swift run -j 2 MoonlightPetPreview --self-check`: premultiplied rim, prism separation 19/255, 1x/2x crisp glyphs, accessibility rendering, interaction/tint reset and local persistence.
- Packaged app launch verified at the isolated worktree path. UI opened the todo panel and exposed its controls; subsequent screenshot/action attempts encountered concurrent user changes. Actual backdrop matching and calendar/memo visual acceptance remain user-reviewed; the existing self-check does not establish visual parity.
- Integrate the isolated changes and relaunch from the normal app path after the checks.

## Sources

- [NSVisualEffectView](https://developer.apple.com/documentation/appkit/nsvisualeffectview)
- [Behind-window blending](https://developer.apple.com/documentation/appkit/nsvisualeffectview/blendingmode-swift.enum/behindwindow)
- [Under-window material](https://developer.apple.com/documentation/appkit/nsvisualeffectview/material-swift.enum/underwindowbackground)
