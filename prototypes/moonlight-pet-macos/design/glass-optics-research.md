# Optical glass — source research and implementation

2026-09-24. Scope: the native macOS pet prototype. No web/Hub dependency was added.

## Primary references inspected

| Source | Revision / license check | Applicable technique |
| --- | --- | --- |
| [sohumsuthar/liquid-glass](https://github.com/sohumsuthar/liquid-glass/blob/fb0e2dd45c1c76f2385dabffbb448c1099cd19cc/lib/glass-optics.mjs) | `fb0e2dd45c1c76f2385dabffbb448c1099cd19cc`; MIT | Read the actual optics module: curved surface normal, Snell refraction, propagation through thickness, wavelength-dependent offsets. Its web SVG pipeline is not used. |
| [ybouane/liquidglass](https://github.com/ybouane/liquidglass/tree/00aafe50202e916951d6f30d49afa1197ca236a7) | `00aafe50202e916951d6f30d49afa1197ca236a7`; GitHub API reports no recognized license at inspection | README architecture: separate background, refraction, Fresnel/specular and foreground. No source copied or dependency installed. |
| [BarredEwe/LiquidGlass](https://github.com/BarredEwe/LiquidGlass/blob/81d921841b517c189dd63d6f9f455ef5f4318062/Sources/LiquidGlass/SwiftUI/MetalShaderView.swift) | `81d921841b517c189dd63d6f9f455ef5f4318062`; GitHub API reports no recognized license at inspection | Read its Metal view bridge. Its captured UIKit hierarchy supplies the background texture; it cannot capture unrelated macOS windows. Use redraw-on-change rather than copying its renderer or snapshot provider. |
| [Kube: Liquid Glass in the Browser](https://kube.io/blog/liquid-glass-css-svg/) | Author's technical explanation | Surface slope determines the normal; refractive displacement and specular highlight are different operations. Its SVG backdrop approach has browser limitations. |
| [Apple NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview) / [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | Public API and installed macOS SDK header checked | One native material, regular for content legibility. Installed API exposes style/tint/radius/content, not custom lens strength. |

Repository claims of physical accuracy or measured Apple matching are the authors' claims, not independently validated performance guarantees for this app.

## What is implemented

- Original Metal shader and AppKit integration; no vendored third-party code.
- Actual widgets: native clear background plus transparent optical edge. Rounded-rectangle distance, circular bevel normals, directional reflection, grazing-angle brightness and a one-pixel hairline. The central area of the custom edge has exactly zero alpha.
- Pointer changes the light direction slightly. Reduce Motion freezes it. Reduce Transparency / Increase Contrast disable decorative optics; native contrast behavior remains in charge of the desktop background.
- Focus card uses the same optical rim through one narrow NSViewRepresentable. Control/input borders stay thin; foreground text is not processed by the shader.
- Metal device, command queue and pipeline are cached. The shader is copied as a resource and compiled once on first use. MTKView is paused and invalidated by pointer, resize or accessibility changes. No capture permission, snapshot polling, network activity or continuous timer is added.
- If shader/device setup fails, the existing Core Animation edge remains available.

## Refraction comparison

`./script/build_and_run.sh --glass-lab` opens a developer comparison window with identical app-owned analytic silver folds or a calibration grid on both halves. The right side evaluates the background at ray-displaced positions, with a shallow blur and subtle RGB dispersion. The left side hosts the exact native + optical edge widget stack.

The lab's strength/bevel controls affect the right-hand custom material. They do not imply NSGlassEffectView exposes those settings. The comparison inputs are local ephemeral text fields, never saved as work records. The lab is not opened during a normal launch.

The right side is a stylized optical model (one curved entrance surface, background immediately behind the slab, approximate reflection/dispersion). It is not a full physical ray tracer or a reproduction of Apple's private compositor.

## Desktop limitation

Custom refraction needs a known background. The app-owned lab can supply that field; the floating panel cannot sample other apps with an ordinary SwiftUI layerEffect or Metal overlay. Native clear Liquid Glass performs desktop compositing, while this custom layer adds only edge reflection. A future desktop texture implementation would need an explicit ScreenCaptureKit design and permission, app exclusion to prevent feedback, latency/power checks and a privacy decision. This iteration adds none of that.

## Integration fixes found during verification

The optional lab exposed an app-wide key monitor: normal widget shortcuts are now limited to the coordinator's own windows. Focus mode retains its app-wide emergency Escape. The accessory app also now installs Cocoa's standard Edit menu so text fields receive paste/select-all commands; no new quit shortcut bypasses the focus flow.


## 2026-09-25 correction: preserve transparency

The operator rejected the white/foggy appearance. The earlier regular material decision is superseded for floating panels: `.clear` is now the default, `.regular` only when Reduce Transparency or Increase Contrast is enabled, updated through NSWorkspace notifications. macOS <26 retains its existing native material fallback. The opaque focus shield/card keeps its separate presentation.

The lab's `0.56 + background * 0.35` luminance compression was the direct source of the new milky fill. It is removed, and center blur is zero. Only edge refraction/reflection/softness remains. The initial one-point content-alpha halo was subsequently removed after the operator reported blurred text; see the text-composition correction below. Clear glass does not guarantee text contrast over every desktop image; the accessible material remains available through system settings.

Added a GPU regression check comparing corresponding foreground-center/background pixels: the old material failed with mean RGB deviation 75.42/255; the corrected shader measured 0.00/255 on this calibration scene. Native CUA inspection showed both clear panels transmitting the silver folds; the native input accepted Korean paste. No OS accessibility preferences were changed.

### Text composition correction — 2026-09-25

Removing the whole-content light shadow reduced small-text halos, but native lab headings still appeared distorted compared with the Metal panel's identical content. Moving the SwiftUI host out of `NSGlassEffectView.contentView` and above the material/rim made both headings sharp in the native comparison. This observed difference supports the composition change; the private native rendering mechanism is not assumed. The glass gets an empty content view; the shared parent owns the interactive host with the same frame and first-mouse behavior. Korean paste into the native lab field was also verified. No material tint, opacity, blur or shader change was needed for this correction.


### Prism and local reading contrast — 2026-09-25

The operator's bright-desktop screenshots exposed the clear material's central legibility limit. [Apple's Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) and [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) support local dimming where clear glass must carry white content. Reflection strength alone cannot suppress code behind the center.

The new reading regions use AppKit HUD material, masked to title/control/content bounds, plus a 28% neutral black layer. Real desktop regions use [behind-window blending](https://developer.apple.com/documentation/appkit/nsvisualeffectview/blendingmode-swift.enum/behindwindow); the owned lab uses within-window blending. Fixed white text remains a separate, unfiltered foreground. Nested controls inherit a protected scope instead of adding another material, and the opaque focus shield opts out. Regions share their parent glass's transient color state so the neutral reading material does not hide character identity during interaction.

The Metal edge now separates a fine outer lip, curved key light and weaker bounce light, with a restrained spectral reflection in the first 1–3pt. The default bevel is 10pt; the flat center is exactly transparent. In the owned lab only, red/green/blue rays use IOR 1.453/1.46/1.472. No public desktop refraction-index API is claimed and no screen capture is added.

Integrated GPU check: 2,356 prismatic pixels, peak channel separation 19/255, 560 displaced edge pixels in the calibrated refraction comparison, clear shader center drift 0.00/255. These validate the custom layer, not native desktop compositing or contrast across all possible wallpapers.
