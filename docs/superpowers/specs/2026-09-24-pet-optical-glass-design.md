# Pet optical glass refinement

Status: implementation approved by the operator ("오픈 소스… 찾아봐서, 구현 ㄱㄱ").
Relation: extends the approved pet glass design; preserves portrait/perched roles, capture flows and window geometry.

## Design
- Desktop utility/widget: one native regular glass surface, with a transparent Metal optical edge. A curved inward bevel, directional specular light, a one-pixel outer line and a soft inner reflection replace the uniform gradient stroke. Text stays above the material and is never refracted.
- Keep native regular contrast adaptation for arbitrary desktop backgrounds. Public NSGlassEffectView does not expose refraction amount. The custom rim does not claim to sample other apps.
- Add a developer-only `--glass-lab` comparison window. Both sides share the same app-owned calibration background; left is the actual native + optical rim stack, right samples that background through custom Metal refraction. Sliders expose lens strength and bevel; a grid reveals displacement. No task records are invented.
- Cache Metal pipeline/device. Redraw on geometry, settings or pointer events; no perpetual rendering loop. Overlay must not hit-test or enter accessibility navigation. Reduced motion disables pointer lighting, reduced transparency/high contrast use a solid readable material and a simple edge.
- Keep existing Core Animation rim as fallback when Metal initialization fails. No screen capture permission or remote dependency is required.

## Verification
Baseline and final native self-check; offscreen GPU output checks for transparent center, clipped corners, nonempty edge and actual edge displacement with refraction toggled. Native UI checks: first input, wide memo/tall task transitions, lab controls, and keyboard escape. Record evidence and limitations without numerical design scores.
