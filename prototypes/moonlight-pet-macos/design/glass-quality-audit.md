# Glass quality gate — 2026-09-27

Operator goal: average >= 90/100, minimum >= 88 across all nine character themes on white, mixed and black backgrounds. Preserve white text, clear resting glass, transient character color and existing interaction semantics. No opaque label rectangles. Numerical rendering tests alone do not prove visual quality.

## Rubric (subjective visual review, not an objective benchmark)

Each of the 27 combinations receives: prism/edge depth 25, transmission/refraction 25, text clarity 30, character identity during interaction 10, overall integration 10. Resting and pressed states are both inspected; use the lower result when they disagree. Any blurred glyph, visible rectangular readability plate, broken spectrum, stuck tint or unverified background caps that case below 88. Record the actual view and build inspected; never copy a previous score to an uninspected theme.

## Baseline

The operator-provided white-background screenshot at f3d29f30 shows a thick gray softened lip, flat gray center, small rainbow flecks and outlined small text. Provisional white/default score: edge 14/25, material 12/25, text 19/30, integration 5/10; character interaction not visible, so full score is unverified. No theme currently has evidence for 88. Mixed/black and all interaction colors require controlled comparison.

## Review surface

Use the production GlassPanel, glyph renderer and theme wash over app-owned white, mixed and black optical test backgrounds. These are material specimens, not fake business records. Review at normal widget scale. A native app's isolated-window screenshot can omit the desktop behind it; use owned backgrounds for repeatable baseline and then verify real desktop capture separately. Do not confuse the developer specimen with proof that ScreenCaptureKit is authorized or running.

## Research

- Apple Materials: https://developer.apple.com/design/human-interface-guidelines/materials — clear glass does not automatically ensure text contrast; bright backgrounds need contrast management.
- https://github.com/rukkiecodes/liquid-glass — surface height -> normal -> refraction; reference architecture only, no copied code.
- https://github.com/ybouane/liquidglass/blob/main/src/shaders.ts — separates scene, blurred scene, refraction and specular lighting; reference architecture only, no copied code.

## Work sequence

1. Add repeatable three-background comparison with all nine actual character assets and resting/interaction toggles.
2. Diagnose stacked materials, glyph shadows and optical lip using that surface.
3. Improve production layers; preserve reduced transparency/contrast fallback and event-driven rendering.
4. Inspect all 27 combinations and record scores honestly; keep the goal active until the full gate is verified.
5. Verify actual desktop capture, readability, drag/tint reset and native text entry before completion.

## Round 1 — inspected in the native three-column window

Source state: first highlight-rolloff + stronger desktop dome + pastel uniform wash, before gradient tint/inner-bevel attenuation. All nine themes were selected via CUA; every screenshot displayed white, mixed and black together with the interaction override on. Resting state was checked on the shared neutral material, but per-theme release/reset and actual desktop capture remain unverified; these are **provisional specimen scores, not completion scores**.

| Theme | White | Mixed | Black | Main deduction |
|---|---:|---:|---:|---|
| 이브이 | 76 | 81 | 79 | Uniform brown wash resembles coated plastic on black |
| 샤미드 | 77 | 82 | 80 | Too close to Glaceon; white background still flat |
| 쥬피썬더 | 74 | 79 | 77 | Brass/ochre tint, insufficient optical depth |
| 부스터 | 76 | 80 | 78 | Red wash looks uniformly filled on black |
| 에브이 | 77 | 82 | 80 | Violet identity works; broad flat face remains |
| 블래키 | 78 | 82 | 79 | Good type contrast; small prism and flat dark face |
| 리피아 | 75 | 80 | 78 | Flat olive sheet; transmission needs more depth |
| 글레이시아 | 77 | 82 | 80 | Color too close to Vaporeon; white face lacks depth |
| 님피아 | 76 | 81 | 79 | Pink visible but too uniformly dusty on white |

All cases remain below the requested gate. Small text improved, but edge depth and material integration remain the principal deficits. Do not present these as measured accessibility or objective aesthetic scores.

## Round 2 changes awaiting full review

- Narrow neutral inner-bevel attenuation within the existing optical lip; preserve strong white glint and broad, continuous spectral separation.
- Transient tint becomes a smooth diagonal depth gradient (stronger near opposing corners, lighter through the center). Default remains untinted.
- Separate Vaporeon's cobalt blue from Glaceon's pale ice blue.
- Pastel themes use darker opaque colors only for accessibility contrast; check all nine solid variants against white-text 4.5:1.
- Specimen perch moved clear of header controls.

Still required: complete Round 2 matrix, the unchanged default/release states, normal widget/memo geometry, and real screen-capture authorization/rendering on the final build. Goal is active.

## Image-generated target comparison — 2026-09-27

At the operator's suggestion, generated a WHITE / MIXED / DARK triptych with the built-in image tool. Preview-only output: `/Users/bigmac_moon/.codex/generated_images/01a0ce32-7ac2-7453-b884-e62b822e9bc4/exec-6031d04c-80d0-4087-9c5e-7228296c48f4.png`. This is an aspirational material study, not evidence of the app's rendering or a completion score.

Useful target features: a narrow white outer return, smoothly dispersed corner arcs, a visibly curved inner return, preserved background contours and crisp foreground glyphs. Reject its excessively milky white specimen and relatively strong text shadows. Do not chase the render by adding global opacity or readability rectangles.

Compared the actual three-column lab at normal scale with the image. The neutral and pressed Glaceon specimens now have continuous edges and readable text, but still look flatter than the target, especially on white. The gradient tint helps black-background depth but does not close the material-quality gap. No new numerical score awarded from this partial review.

Focused follow-up: keep opacity unchanged; move the spectral return deeper inside the existing 9pt lip, broaden the soft shoulder, vary the inner return with corner curvature, and move narrow attenuation behind that return. Native screenshot inspected after rebuild. GPU self-check passes with 5,904 prismatic pixels, peak channel separation 141/255 and transparent content area; this establishes continuity/composition, not aesthetic success. Full nine-theme matrix and live desktop verification remain outstanding.

## Round 2 specimen results

All nine interaction themes were inspected through CUA in the three-background native window, after the gradient wash and curved inner-return changes. This is a subjective design assessment; it is not a contrast-ratio measurement or proof of real desktop capture. Shared neutral rest was inspected separately; per-theme physical release remains pending.

| Theme | White | Mixed | Black | Observed deduction |
|---|---:|---:|---:|---|
| 이브이 | 77 | 83 | 81 | Brown is distinguishable; still flat and slightly muddy on white |
| 샤미드 | 78 | 84 | 83 | Cobalt now distinct from Glaceon; optical face remains shallow |
| 쥬피썬더 | 76 | 81 | 80 | Yellow still reads ochre on black; weakest color/material integration |
| 부스터 | 77 | 82 | 81 | Warm red identity works; red-black wash still resembles a colored panel |
| 에브이 | 78 | 84 | 83 | Clear violet identity and tie silhouette; white remains gray-lilac and flat |
| 블래키 | 79 | 83 | 81 | Best white-background restraint; black face lacks reflected depth |
| 리피아 | 77 | 82 | 81 | Olive recognizable but green tint dominates the material on black |
| 글레이시아 | 78 | 84 | 83 | Ice-blue now distinct from cobalt; white reflection lacks volume |
| 님피아 | 78 | 83 | 82 | Pale pink preserved; slightly dusty white-background result |

Scores cluster around an edge-depth contribution of 18–19/25, material 16–20/25, glyph clarity 27–29/30, with remaining points assigned to identity/integration. Average 80.70, minimum 76: **gate not met**. Scores are provisional because release and live capture are not fully audited.

## Round 3 work

- Add a low-energy curved shoulder return with compact support within 20pt of the outer edge; foreground and center remain unpainted.
- Double the central lens displacement multiplier from 3 to 6 without changing opacity, highlight rolloff, or character tint.
- Use the production explicit placeholder token in the specimen (the earlier default native placeholder underrepresented the app's configured color).
- Reduce the hard contact shadow and broaden the soft glyph-only shadow to avoid embossed/outlined small text. Crisp white glyph pixels and untouched accessibility strings pass at 1x and 2x.
- Fresh self-check: 5,558 displaced interior pixels; 5,936 prismatic edge pixels, peak separation 139/255; transparent center, smooth pointer response and existing interaction checks pass. These are renderer checks only. Do not carry Round 2's aesthetic score forward without inspection.
