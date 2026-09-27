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

## Reviewable bright-background alternative (lab only)

Added an off-by-default `흰 배경 시안 · 짙은 글자 + 밝은 투과` toggle to Glass Lab. It affects only the known white calibration column: uses the existing neutral `Palette.surface3` ink, disables glyph shadows, adjusts input/selection foreground, and bypasses highlight compression in the desktop shader's explicit study mode. Mixed/black columns retain the approved white-ink rendering. This is a static design specimen, **not automatic backdrop detection**, and the UI says so.

The real widget still has the authorized executable SHA256 `c13a1d0820cce0f3eba211cfa6766a88f1fc5cf0cf4da88451e1b090beb0302a`; it has not been rebuilt or switched to dark ink. Live capture passes study mode zero. Shared control overrides default to nil and preserve existing production colors. The specimen keeps its input model while toggling. Verified native preview with the dark caret, selected tab, all existing calibration inputs and the three background columns; the formerly gray white face now transmits a bright field with visible displaced background contours and readable dark glyphs. This makes the approval choice concrete; it does not change the production score or fulfill the unapproved exception.

Build/signature verification and the full default-renderer self-check pass. The developer preview remains open with the alternative enabled, ready for review. Operator answer to the earlier foreground question is still required before any real-widget adaptive-ink work. The full goal remains active and unmet.

## Shared curved section and convex transmission — 2026-09-28

The foreground-choice question remains unanswered, but it does not block independent optical corrections. On resumed inspection, the desktop displacement pointed outward through the face (shrinking the rear image), whereas the requested convex lens should sample inward. A new grayscale-ramp GPU probe failed on the previous shader: left -8 / right +8 intensity displacement. The existing displaced-pixel-count check could not distinguish these directions.

Corrected the face to magnify inward and taper before the lip. The desktop lip now uses Snell refraction through the same rounded-section normal used by the rim lighting, instead of an independent exponential displacement. Red/blue background rays use their respective refractive indices; the foreground is untouched. This remains a screen-space approximation, not a physically complete ray tracer. No opacity, highlight compression, theme tint, glyph shadow or rim width was changed.

Full self-check passes, including the new magnification probe: 5,808 displaced interior pixels, 880 polished-detail lip pixels, no polished detail in the diffuse face, unchanged highlight steps [152, 160, 165], 6,417 prismatic rim pixels / peak 118, crisp 1x/2x foreground and existing interaction checks. Lab bundle builds and passes strict signature verification.

Native lab inspected with neutral Glaceon, pressed Eevee/Vaporeon/Sylveon and Sylveon's return to neutral, each in white/mixed/black columns. Rear boundaries now bow inward and foreground stays sharp. White remains visibly gray; dark pressed themes retain the coating/haze limitation. This is a directional correction, not evidence that the requested quality gate has been reached. No new full nine-theme score is awarded; the prior provisional 82.70 / 79 matrix remains the last complete evaluation and is not a score for this revision.

Actual app remains process 63880 and the same authorized executable hash above. Latest optical code is lab-only. All three ephemeral input strings were restored after rebuild. Lab is left on Sylveon with tint and dark-ink study both off. Remaining work includes closing the material-depth gap and final nine-theme/live-desktop verification; the pending bright-background foreground decision applies only to adaptive-ink implementation, not all optical work.

Latest generated concept: `/Users/bigmac_moon/.codex/generated_images/01a0ce32-7ac2-7453-b884-e62b822e9bc4/exec-5f86bfed-0849-40d7-ae84-f9aea821ca27.png`. The mixed/dark panes illustrate the target rim, but the intended pure-white comparison was not faithfully rendered and pane 02 is too milky. Do not score the native implementation from that image.

## Complete theme reinspection and deployment checkpoint — 2026-09-28

Inspected all nine pressed themes again through the native Lab on revision `39055d38`, with all three background columns and dark-ink study off. The material change corrects the convex direction, but at normal widget scale it does not warrant a higher aesthetic score. The provisional nine-theme matrix remains unchanged: Eevee 79/85/83, Vaporeon 80/86/84, Jolteon 79/84/83, Flareon 79/84/83, Espeon 80/86/84, Umbreon 81/85/84, Leafeon 79/84/83, Glaceon 80/86/84, Sylveon 80/85/83 (white/mixed/black). Average **82.70**, minimum **79**. This reinspection now covers the latest revision; it still is not a complete live capture or physical interaction matrix. White grayness, shallow optical depth and the dark-background tint-coating impression remain the principal deductions. Foreground is sharp and theme identities remain separated.

Packaged and launched the actual widget from `39055d38`. Strict bundle signature verification passes. Its executable SHA256 is now `59c2969f112780ea7dcb695eccd229b300a6402c3bb645af5f69effc45c0ffc5`, process 66212 at inspection. The existing draft `에서` survived restart. This supersedes earlier statements that the actual executable remains a8820000.

The new actual bundle reports **screen access denied** in its menu. Reset only `ScreenCapture` for `app.moonlight.pet-preview` and opened Settings' Add action to register the current path, following the previously successful repair. This time macOS requires password authentication before the file chooser. The authentication sheet is open; the operator was asked to authenticate locally. Do not fill credentials or count the native fallback as the new captured material. No other applications' permissions or firewall settings were changed. Current actual build is deployed but **live refraction verification is pending**. This authentication blocker is newly encountered on this turn; no completed-goal claim is made.

### Authentication and registration completed

On the next resumed inspection, Settings had advanced from the authentication sheet to the file chooser. Selected the exact worktree `dist/MoonlightPetPreview.app`; Settings now shows its ScreenCapture switch on. The same signed binary restarted as process 66992 without `--desktop-refraction`. The password blocker is resolved. Since `usesDesktopRefraction` defaults to false and macOS relaunch drops the argument, a successful permission registration alone does not prove active capture. Attempts to inspect its menu encountered repeated UI changes and a disappearing transient memo window; no live status or captured-background verification is claimed. Keep this binary unchanged while completing that activation check. Latest visual matrix and unmet quality gate remain unchanged.

### Live activation confirmed; operator checkpoint

Subsequent native UI inspection enabled `배경 굴절 실험` from the quick-memo menu and explicitly observed `배경 굴절 실험 중 · 영상 저장 안 함`. Pinned the wide memo using `위젯으로 고정`, so it can remain visible during background comparisons. This supersedes the activation-pending statement above. The observed wide memo showed the dark application and blue/purple desktop through the material, with sharp foreground text and a continuous thin rim. No new binary was installed for this activation.

The earlier disappearing window was a transient quick bar: the automated double-click produced a single native click (`pet mouseDown count=1`), and that surface closes when the app resigns active. Pinning through its menu resolved the inspection obstacle. This is not evidence that native double-click behavior itself is broken.

At the operator's commit-and-report checkpoint, the latest code remains `39055d38`, executable SHA256 `59c2969f112780ea7dcb695eccd229b300a6402c3bb645af5f69effc45c0ffc5`. Live capture activation is verified, but the latest actual build still needs the complete white/mixed/black background and physical interaction review. No new aesthetic score is assigned: the full nine-theme Lab evaluation remains **82.70 average / 79 minimum**, below the requested **90 / 88** gate. Principal gaps remain the flat gray bright-background face, shallow perceived optical depth, and coating-like tint on dark backgrounds. The bright-background dark-ink alternative remains Lab-only and unapproved for the actual widget. No Hub data was submitted and no push was performed.

## Live three-background review and reflected-source envelope — 2026-09-28

Confirmed the same actual executable/process remains running with live capture enabled. Opened the local calibration page in Chrome and explicitly raised its native window: changing an inactive browser tab alone does not establish the desktop background. Inspected pinned wide memo and tall tasks over white, mixed and black. The incoming scene changes are visible, including the bent light/dark boundary. White foreground remains crisp; white transmission still looks uniformly gray, and the dark frame has little perceived optical volume. Performed a physical header drag and observed the released neutral state. This verifies release, not an in-drag screenshot or every theme's physical interaction. Existing actual drafts were preserved, and no Hub writes were made.

The rendered rim still resembled an equally bright wire. Added a GPU regression for a broad neutral reflected-source footprint along a straight side; it failed on the existing shader with 141 versus 136 neutral intensity. The neutral outer, shoulder and secondary return now share a smooth long source envelope with the dispersed reflection. The primary lip width, 9pt section, center transmission, foreground and theme wash are unchanged. This varies the light image along the surface instead of uniformly brightening the frame.

Full self-check passes: 6,267 prismatic pixels / peak channel separation 117; 5,808 desktop interior displacements; 880 polished-detail lip pixels; preserved highlight steps [152, 160, 165], transparent center, pointer continuity, accessibility fallback and crisp 1x/2x glyphs. The isolated Lab builds and passes strict signature verification. Inspected neutral Glaceon and pressed Sylveon in all three Lab columns, restoring the ephemeral input strings. The reflection now has brighter and quieter regions, but the central material gap remains; no full nine-theme score increase is claimed. The last full matrix remains historical evidence for `39055d38`, not a newly scored matrix for this envelope change.

The latest reflected-source envelope is **Lab-only**; the actual capture bundle was intentionally kept unchanged to preserve its current grant. Further work must improve optical depth and the dark theme-wash impression before a final live nine-theme evaluation. The bright-background ink exception is still not applied. Goal remains unmet.

## Interaction color depth — 2026-09-28

The existing source-over theme gradient lifts a broad dark scene toward the character color. Added a smooth, stretchable rounded-section mask: full color at the perimeter, tapering over 48pt to 35% of the prior wash strength through the face. Original character hues and gradient values remain; this changes where their contribution is strongest. It is a compositing approximation, not spectral absorption or a new refraction model. The mask is prepared once per view and stretched on resize; no capture or per-frame bitmap generation is added. Accessibility's solid color bypasses this mask, and resting opacity is still zero.

Built the isolated Lab and visually inspected every pressed theme across the three columns with dark-ink study off. The center is less coated on black, while colored perimeter reflection remains recognizable. The pale themes are intentionally restrained; fixed-white text still requires the gray bright-scene transmission. Sylveon was returned to the neutral rest state after inspection. Ephemeral calibration inputs were restored after rebuilding. Full self-check and strict Lab bundle signature verification pass; existing crisp 1x/2x foreground, interaction reset and accessibility checks remain green.

| Theme | White | Mixed | Black | Remaining deduction |
|---|---:|---:|---:|---|
| 이브이 | 79 | 85 | 84 | Gray bright face; warm edge is clearer but optical volume remains shallow |
| 샤미드 | 80 | 86 | 85 | Cobalt rim separates from ice blue; center still lacks rich reflected depth |
| 쥬피썬더 | 79 | 84 | 84 | Cream edge is subtle; white field remains flat |
| 부스터 | 79 | 84 | 84 | Red edge retained, reduced center haze; colored band remains visible |
| 에브이 | 80 | 86 | 85 | Lilac perimeter restrained; gray face and blurred rear contours remain |
| 블래키 | 81 | 85 | 84 | Neutral tint had less coating to remove; no score increase |
| 리피아 | 79 | 84 | 84 | Green perimeter distinct; lacks polished transmitted depth |
| 글레이시아 | 80 | 86 | 85 | Ice rim differentiated from cobalt; gray bright face persists |
| 님피아 | 80 | 85 | 84 | Pale pink edges retained and center cleaner; depth remains modest |

Subjective Lab average **83.00**, minimum **79**, using the same rim/material/foreground/identity weighting. The one-point changes on eight dark specimens reflect reduced coating only, not a solution to the bright-background or optical-depth gap. This matrix includes the reflected-source envelope from `f01bda19`. It is not an actual-desktop nine-theme matrix. Both latest improvements remain in the Lab build; the authorized actual app is unchanged. The requested 90/88 gate is not achieved.

## Bright-scene decision and rejected optical experiments — 2026-09-28

Re-inspected the existing bright-ink Lab alternative against the latest accepted material. It removes the broad gray bright-scene compression while keeping dark foreground legible; mixed and black specimens retain white foreground. This is still a static white-column specimen, not runtime luminance detection. The actual widget remains unchanged. The operator was shown the native result and asked whether very bright backgrounds may use dark gray foreground, explicitly identifying the conflict with the earlier white-ink preference. No affirmative answer is inferred.

Two independent optical experiments were built, self-checked and viewed at normal widget scale: (1) stronger neutral specular lobes driven by the existing shared surface normal; (2) a wider fourth-power rounded section with greater optical thickness, while retaining the thin silhouette. The latter increased the polished-detail probe from 880 to 956 pixels; foreground and regression checks passed. Neither delivered a convincing normal-scale material improvement, so both changes were **reverted**, and the Lab was rebuilt from the accepted `0ad7c3e0` state. No aesthetic score increase is assigned from these numerical changes.

Reviewed primary implementation sources: [ybouane/liquidglass shader](https://github.com/ybouane/liquidglass/blob/main/src/shaders.ts) separates curved-normal specular lighting and background refraction; [sohumsuthar/liquid-glass](https://github.com/sohumsuthar/liquid-glass) describes a fourth-power cross-section and adaptive material treatment. Their claims of matching Apple's exact rendering are not independently verified. No library, source implementation or dependency was imported. The native Lab remains open on the bright-background alternative for the operator's decision, with calibration inputs restored. Last accepted nine-theme score remains 83.00 / 79, and the full goal remains unmet.

## Controlled concept comparison and connected rim shoulder — 2026-09-28

The prior commit/report turn did not improve the renderer. Reopened the native Lab with the fixed-white foreground and the accepted material. A 7.5% broad diagonal virtual area-source reflection was tried through the face. At normal widget scale it read as faint haze/staining rather than useful optical volume, so it was removed before the accepted build. No central reflection, fill or typography change from that trial remains.

Generated one preview-only three-background target with the built-in image generator, using the original gray widget and the operator's earlier polished-glass concept as references. The brief locked white foreground, white/mixed/black surroundings, thin neutral glints with corner dispersion, and prohibited central shadow rectangles. Output: `/Users/bigmac_moon/.codex/generated_images/01a0ce32-7ac2-7453-b884-e62b822e9bc4/exec-85a23609-6178-43e9-adc8-6c37a383079b.png`. This is an image concept, not runtime evidence. The white specimen still uses a gray transmitted field and some embossed-looking text shadow, so it does not prove that the fixed-white tradeoff is solved. Its useful direction is the neutral light connecting the dispersed return, rather than detached colored contour lines.

Adjusted only the existing rim shoulder: broader neutral overlap and a softer, lower secondary peak inside the same 9pt section. The primary outer glint stays 0.54pt, dispersion hues/positions remain, and the center transmission, theme wash and glyph rendering are unchanged. At normal scale the internal lines connect more softly; the change is modest and does not justify a higher aesthetic score.

Inspected all nine pressed themes in white/mixed/black native Lab columns, then turned tint off while preserving the three ephemeral input strings. The matrix remains Eevee 79/85/84, Vaporeon 80/86/85, Jolteon 79/84/84, Flareon 79/84/84, Espeon 80/86/85, Umbreon 81/85/84, Leafeon 79/84/84, Glaceon 80/86/85, Sylveon 80/85/84: **83.00 average / 79 minimum**. White grayness and shallow face depth remain. This is a fresh Lab reinspection, not a live-desktop matrix. Native comparison screenshot: `/Users/bigmac_moon/.codex/visualizations/2026/09/23/01a0ce32-7ac2-7453-b884-e62b822e9bc4/glass-shoulder-review-2026-09-28.png`.

Build and strict Lab signature verification pass. Full self-check passes: 5,808 interior displacements, 880 polished-lip pixels, highlight steps [152, 160, 165], 6,023 prismatic rim pixels / peak separation 118, premultiplied clipping, accessibility, pointer continuity, crisp 1x/2x glyphs and interaction checks. The text check verifies glyph rasterization/local shadows plus the solid accessibility palette; it does **not** establish sufficient contrast on every clear captured scene. The lower analytic displaced-edge count (274) still passes its optical-direction check and is not itself a quality score.

Actual widget bundle hash reverified as `59c2969f112780ea7dcb695eccd229b300a6402c3bb645af5f69effc45c0ffc5`; it was not replaced. Latest rim/wash refinements are still Lab-only. The bright-background dark-ink decision remains unanswered, and actual white foreground is preserved. Goal remains unmet, with final actual-desktop deployment/review outstanding.
