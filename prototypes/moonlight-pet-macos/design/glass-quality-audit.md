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

## Live desktop verification — initial permission failure

Launched the unchanged signed `32c6f619` worktree bundle with `--desktop-refraction`. The real widget's menu explicitly reported screen access denied; therefore the live surface was the native fallback, not the desktop refraction shader. System Settings simultaneously showed the old MoonlightPetPreview entry enabled. This is evidence that the existing grant was not usable by the current build, not evidence of optical shader failure.

Reset only `ScreenCapture` for `app.moonlight.pet-preview`, then used System Settings' Add action to re-register the current bundle. macOS opened its password authentication sheet. User handoff was requested; authentication was pending at that checkpoint. Do not type credentials, weaken TCC, reset other apps, or rebuild the bundle while refreshing its grant. The next step is to finish registration of this exact bundle and verify actual captured refraction before another material iteration. This live-path blocker has occurred on one goal continuation so far; the goal remains active and the visual score gate remains unmet.


## Permission resolved; isolated iteration — 2026-09-27

After the operator authenticated, registration of the exact worktree bundle and macOS Quit & Reopen completed. The actual widget menu now reports **배경 굴절 실험 중 · 영상 저장 안 함**. White/mixed/dark browser background changes were observed through the widget. Rechecked the live menu after further lab builds: capture remains active. This proves the current bundle's grant, not permanent grant stability across future ad-hoc builds.

Authorized actual bundle: `dist/MoonlightPetPreview.app`, executable SHA256 `b0c977361af11bf6e78803e079f37f3ea346882b569d8a00c5557be3ab4dfc99`, running process 17743 at inspection. It remains the 32c6f619 build. The latest optical changes have **not** replaced that executable yet.

`--glass-lab` now packages `dist/MoonlightGlassLab.app` with its own bundle identifier and executable. Lab startup returns before pet windows, Hub connection and capture setup. Rebuilding the lab leaves the authorized actual app hash and process unchanged. This avoids repeatedly invalidating its identity while tuning materials.

## Polished transmission and thin double return — partial review

- Production desktop renderer accepts both the blurred and original texture from the same captured frame. The curved lip regains sharper displaced detail; the content-bearing center still uses the blurred texture. Existing capture-frame retention covers both inputs until GPU completion.
- A faint secondary scene sample follows the lip's curved section. This is a screen-space approximation, not room-scale ray tracing. It adds no luminance to a uniform field and does not affect foreground glyphs.
- Outer glint width reduced 10%, from 0.60 to 0.54 pt before pixel-footprint filtering. The inner reflected line varies slowly along the rim; coherent spectral patches extend onto straight sides. Overall lip width remains 9 pt.
- Jolteon's interaction color changed from ochre to cream gold at unchanged opacity. Dark-background review confirms less yellow-brown saturation; depth still falls short of the target.
- Fresh full self-check passes: 5,558 displaced interior pixels, 968 polished lip detail pixels, 5,592 prismatic rim pixels, peak separation 139/255; no central reflection fill, no midtone/black drift, no accessibility regression, crisp glyph interiors at 1x/2x. These metrics prove selected rendering invariants, not aesthetic quality.
- Native lab inspected after rebuilding: neutral Glaceon plus pressed Eevee, Vaporeon, and Jolteon in all three columns. Latest cream-gold/reflected-scene build was inspected with Jolteon. The white specimen remains too uniformly gray; the rim change is subtle at normal scale. No new full-matrix score is awarded. Last complete provisional matrix remains average 80.70, minimum 76; **goal gate not met**.

Generated target 02: `/Users/bigmac_moon/.codex/generated_images/01a0ce32-7ac2-7453-b884-e62b822e9bc4/exec-04cb1e04-fee2-4d56-9989-0a424d73b399.png`. Mixed/dark targets clarify continuous reflections and transmission; white target still has excessive milkiness and glyph shadow. Concept only; it is not runtime proof.

Remaining: close the visual depth gap, inspect every theme at rest/press/release on the final material, deploy that final material to the actual capture app once, and verify white/mixed/black desktop scenes, tall/wide geometry and physical drag. Keep the goal active.

## Highlight contour preservation — 2026-09-27 resumed inspection

Mac unlock was verified via the native lab. No application restart or permission reset was needed for that verification.

Found a concrete transmission defect: subtracting a scaled smoothstep made the transfer derivative almost zero around input 0.75. Three different bright grayscale inputs (166, 191, 217) rendered as 148, 149, 151. A GPU regression check reproduced this failure before the fix. Replaced that transfer with a monotone rational shoulder, preserving its black/midtone behavior, continuous derivative at 0.5, and the original 0.67 white endpoint. Outputs are now 152, 160, 165. Opacity and glyph shadows were not changed.

Strengthened the specimen background with fine calibration glyphs and a continuous sloping contour. The earlier low-contrast rulers underrepresented busy-window interference. The new scene exposed small colored background fragments at the polished lip. Added a four-sample optical footprint only to polished background sampling; the independently drawn geometric rim and foreground are unaffected. A single-pixel checker now differs from its mean by at most 3/255 through the tested lip region, while 931 coarse-detail pixels still differ by more than 8/255. This tests rejection of pixel noise and retention of larger optical detail together.

Full self-check passes after these changes: 5,646 displaced interior pixels; 5,592 prismatic edge pixels, peak separation 139/255; white glyph interiors preserved at 1x/2x; interaction reset and memo-save checks pass. The isolated lab builds and signs successfully. The live authorized app still runs the prior 32c6f619 bundle; these latest changes are not yet deployed to it.

### Revised specimen review (stronger background chart)

All nine pressed themes were visually inspected on all three backgrounds through CUA. Neutral resting Glaceon and Sylveon's preview-off return were inspected. This remains a **provisional material review**, not the final physical press/drag/release or live-desktop gate. The chart changed, so the average is not a controlled before/after improvement measurement.

| Theme | White | Mixed | Black | Remaining deduction |
|---|---:|---:|---:|---|
| 이브이 | 78 | 84 | 81 | Warm gray is still flat on white; brown coating impression on black |
| 샤미드 | 79 | 85 | 83 | Good blue separation; faint prism depth and visible blurred rear text |
| 쥬피썬더 | 78 | 83 | 82 | Cream gold is less ochre; the face remains shallow |
| 부스터 | 78 | 83 | 81 | Red identity is distinct; dark background still resembles tinted plastic |
| 에브이 | 79 | 85 | 83 | Clear lilac identity; white surface lacks dimensional return |
| 블래키 | 80 | 84 | 82 | Restrained white tint; dark material still lacks convincing reflected depth |
| 리피아 | 78 | 83 | 81 | Green recognizable; relatively strong color wash on black |
| 글레이시아 | 79 | 85 | 83 | Ice tint differs from cobalt; white face is uniformly gray |
| 님피아 | 79 | 84 | 82 | Pale pink and clear preview-off return; rear-text haze remains |

Average 81.56, minimum 78. No case reaches the completion gate. Foreground remains sharp, but a brighter, coherent curved lip and convincing center depth still need work. The improved transfer preserves information; it does not by itself make a featureless white background look dimensional. The next material change should address the optical cross-section and its reflected/transmitted light balance, rather than increasing whole-panel opacity or darkening text rectangles.

### Polished-section highlight transmission follow-up

The bright-scene compression was also applied identically to the polished lip, despite its sharper transmission path. A new regression probe reproduced white face/lip output of 171/171. The shoulder coefficient now follows the existing polished-section mask only inside 17 pt; it preserves the face's 0.67 endpoint and all foreground rendering. The probe requires the white lip to exceed the face by at least 12/255 while a black lip stays within 1/255 of the black face. Full self-check passes, including fine-detail rejection and preserved center midtone values; 938 coarse lip pixels retain displaced detail.

After rebuilding the isolated lab, neutral Glaceon was inspected on all three backgrounds. The white lip is brighter and more separated from the face, without a new central plate. The current input strings in the lab were entered externally during inspection and were left intact; their glyphs are visibly crisp on all three specimens. This last profile change has only neutral inspection, so do not treat the preceding nine-theme table as a verified score for it. Physical desktop deployment/release checks still remain.

## Full-scene boundary parity and layer-order comparison

The audit lens previously received a panel-sized crop. Its displaced samples outside that crop clamped to the border, unlike the live desktop's full-display texture. The audit now supplies its complete scene and uses `DesktopRefractionView.textureRegion` for the panel UV rectangle. Native inspection confirms the scene remains aligned; this corrects a verification limitation rather than proving a visual score increase.

Compared placing the native clear material above the refracted scene. On the same three specimens this introduced a gray floor on black and excessive broad diffusion in the mixed scene. Rejected that experiment and restored the existing ordering. No production layer-order change remains.

Broadened the optical rim's angular light response from a narrow fourth-power lobe to a wider second-power lobe with the same peak. This strengthens continuous side returns without widening the bevel or increasing corner saturation. Self-check: 6,169 prismatic pixels, peak 140/255; 5,646 desktop interior displacements, 938 polished lip detail pixels; foreground, contrast transfer and interaction checks all pass. Native neutral three-background inspection still shows readable foreground and no new central plate. Full theme/desktop scoring is pending for this revision.

## Current deployment and coherent reflection footprint — 2026-09-28

The actual app was replaced with the a8820000 build (executable SHA256 `c13a1d0820cce0f3eba211cfa6766a88f1fc5cf0cf4da88451e1b090beb0302a`). Its previous ad-hoc grant stopped working even though System Settings displayed the switch as enabled. A toggle and relaunch alone did not repair it. Reset only this app's ScreenCapture grant, used System Settings Add with the exact worktree bundle, and completed Quit & Reopen. No password request appeared this time. The actual menu now explicitly reports live background refraction. No firewall or other applications' grants were changed.

Verified the running a8820000 widget against white, mixed and black browser calibration backgrounds. Background transitions appear in the captured material after the incoming frame; an immediate screenshot can show the previous scene and must not be scored as the new background. White remains a flat gray face, mixed reveals displaced window boundaries, and black preserves white foreground clarity. A physical drag followed by release returned to neutral material. The current actual task draft `에서` was preserved. Hub is unavailable, so these observations use the genuine connection-error surface, not invented task records.

The image-generation comparison `exec-88b6cea0-501f-4713-a65e-db411fe65abb.png` is a concept only. Mixed and dark columns provide a useful continuous thin-rim target; the white column remains too milky with insufficient small-text contrast and is not a passed reference.

The latest **lab-only** shader replaces the repeated point-space sinusoid along the rim with one broad normalized area-light footprint per side. Reflection length now scales with tall/wide geometry instead of repeating short colored patches as the perimeter grows. This changes the spatial distribution of the return, not bevel thickness, center opacity, text shadow, or character tint. Neutral three-background lab inspection confirms continuity, but the overall material gap remains visible. Existing user-entered lab calibration strings were restored after rebuild.

Fresh full self-check passes: 6,484 prismatic pixels, peak 140/255; 541 calibration edge displacements; 5,646 desktop interior displacements; 938 polished lip pixels; unchanged highlight steps [152, 160, 165], crisp foreground at 1x/2x, accessibility bypass and interaction/memo checks. These are regression results, not a visual-quality score. The latest reflection-footprint change is not deployed to the capture app yet, intentionally preserving its freshly verified identity. No new nine-theme score is assigned. Last full provisional matrix remains 81.56 average / 78 minimum; goal remains unmet.

## Neutral return review and white-background constraint — 2026-09-28

Tested a smoothly varying convex highlight-transfer profile (`+1.25*dome` in the shoulder coefficient). GPU checks passed, but native screenshots still read as a gray face, merely slightly darker in the center. Rejected and removed this change. It does not appear in the final shader.

Strengthened the existing neutral inner reflection and reduced spectral gain from 1.05 to 0.85. The 9pt optical section and 0.54pt outer glint are unchanged. This favors a second reflected light image over a colored outline. Inspected all nine pressed themes in the native three-background lab, then returned Sylveon to the untinted resting state. Inputs remain ephemeral and preserved. Full self-check passes: 6,417 prismatic pixels, peak 118/255; 472 analytic edge displacements; production desktop 5,646 interior displacements / 938 polished lip pixels. Highlight transfer, text, accessibility and interaction tests remain unchanged and passing.

### Provisional visual matrix (lab, pressed theme)

Scores are subjective inspection, not measured perceptual accuracy. Same weighting as prior rounds: rim 25, material 25, foreground 30, identity/integration 20. The modest improvement is concentrated in the neutral rim return; the central material limitation remains.

| Theme | White | Mixed | Black | Remaining deduction |
|---|---:|---:|---:|---|
| 이브이 | 79 | 85 | 83 | White brown-gray looks flat; dark brown still resembles coating |
| 샤미드 | 80 | 86 | 84 | Clear cobalt distinction; bright face is gray-blue, rear-text haze |
| 쥬피썬더 | 79 | 84 | 83 | Cream color retained; dark material remains slightly muddy |
| 부스터 | 79 | 84 | 83 | Warm red clear; broad tinted face still feels shallow |
| 에브이 | 80 | 86 | 84 | Lilac distinct; pale face lacks transmitted depth |
| 블래키 | 81 | 85 | 84 | Neutral restraint helps white; black material lacks optical volume |
| 리피아 | 79 | 84 | 83 | Green distinct; coating impression remains on black |
| 글레이시아 | 80 | 86 | 84 | Ice-blue differs from cobalt; flat bright face persists |
| 님피아 | 80 | 85 | 83 | Pale pink and clear release preserved; dark pink haze remains |

Average **82.70**, minimum **79**. Goal is not met; this is not a full live-desktop or physical-release matrix. Actual capture app remains the authorized a8820000 bundle. Latest lab shader is not deployed yet.

Rechecked [Apple Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials): Clear glass over bright backgrounds needs contrast treatment; Apple suggests a dimming layer, while Regular adapts luminosity/foreground. Also reviewed the [anuero/LiquidGlass README](https://github.com/anuero/LiquidGlass) for coupled surface-height/refraction and adaptive luminance concepts; no source copied or package installed, and its claims about Apple's exact profile are not independently verified.

Asked the operator whether fixed white foreground may switch to dark gray **only on bright backgrounds**, because the present white-foreground constraint is what forces bright transmission toward gray. This is an exception to an explicit operator preference and is not implemented without an answer. The alternative is retaining white foreground with a visible brightness correction. The question remains pending at this checkpoint; no acceptance or changed requirement is inferred from silence.
