import AppKit
import SwiftUI

/// Legacy localized material for standalone preview surfaces. Companion panels
/// suppress it through glassReadingProtected and use glyph-local shadows instead.
struct GlassReadability: ViewModifier {
    var radius: CGFloat = 12
    var inset: CGFloat = 0
    var feather: CGFloat = 8
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.glassReadsWithinWindow) private var withinWindow
    @Environment(\.glassReadingProtected) private var alreadyProtected
    @Environment(\.glassReadingTone) private var readingTone

    @ViewBuilder
    func body(content: Content) -> some View {
        if alreadyProtected {
            content
        } else {
            content.environment(\.glassReadingProtected, true).background {
                readingBackground
                    .padding(-inset)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private var readingBackground: some View {
        if let readingTone {
            TintedReadingBackground(radius: radius, feather: edgeFeather, withinWindow: withinWindow, tone: readingTone)
        } else {
            ReadingBackground(radius: radius, feather: edgeFeather, withinWindow: withinWindow, state: .init())
        }
    }

    private var edgeFeather: CGFloat { reduceTransparency || contrast == .increased ? 0 : feather }
}

private struct TintedReadingBackground: View {
    let radius: CGFloat
    let feather: CGFloat
    let withinWindow: Bool
    @ObservedObject var tone: GlassReadingTone

    var body: some View {
        ReadingBackground(radius: radius, feather: feather, withinWindow: withinWindow, state: tone.state)
    }
}

private struct ReadingBackground: View {
    let radius: CGFloat
    let feather: CGFloat
    let withinWindow: Bool
    let state: GlassReadingTone.State

    var body: some View {
        ReadingMaterial(radius: radius, feather: feather, withinWindow: withinWindow)
            .overlay {
                ZStack {
                    Color(nsColor: PetGlassTheme.color(for: state.character))
                        .opacity(state.solidForAccessibility ? 1 : PetGlassTheme.opacity(for: state.character))
                        .opacity(state.opacity)
                        .animation(PetMotion.hover, value: state.opacity)
                    Palette.glassControlFill.opacity(state.solidForAccessibility ? 0.28 : 0.20)
                }
                .mask {
                    let cap = radius + feather
                    Image(nsImage: ReadingMask.image(radius: radius, feather: feather))
                        .resizable(capInsets: EdgeInsets(top: cap, leading: cap, bottom: cap, trailing: cap))
                }
            }
    }
}

private struct GlassReadingScope: EnvironmentKey {
    static let defaultValue = false
}
private struct GlassReadingProtection: EnvironmentKey {
    static let defaultValue = false
}
private struct GlassReadingToneKey: EnvironmentKey {
    static let defaultValue: GlassReadingTone? = nil
}

extension EnvironmentValues {
    // The material lab owns its backdrop; real panels read the desktop behind
    // their window through AppKit's compositor, with no screen capture.
    var glassReadsWithinWindow: Bool {
        get { self[GlassReadingScope.self] }
        set { self[GlassReadingScope.self] = newValue }
    }
    var glassReadingProtected: Bool {
        get { self[GlassReadingProtection.self] }
        set { self[GlassReadingProtection.self] = newValue }
    }
    var glassReadingTone: GlassReadingTone? {
        get { self[GlassReadingToneKey.self] }
        set { self[GlassReadingToneKey.self] = newValue }
    }
}

private struct ReadingMaterial: NSViewRepresentable {
    let radius: CGFloat
    let feather: CGFloat
    let withinWindow: Bool

    func makeNSView(context: Context) -> ReadingMaterialView { ReadingMaterialView() }
    func updateNSView(_ view: ReadingMaterialView, context: Context) {
        view.blendingMode = withinWindow ? .withinWindow : .behindWindow
        view.setMask(radius: radius, feather: feather)
    }
}

final class ReadingMaterialView: NSVisualEffectView {
    private var maskRadius: CGFloat = -1
    private var maskFeather: CGFloat = -1

    override init(frame: NSRect) {
        super.init(frame: frame)
        material = .hudWindow
        state = .active
        appearance = NSAppearance(named: .darkAqua)
        isEmphasized = false
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func setMask(radius: CGFloat, feather: CGFloat) {
        guard maskRadius != radius || maskFeather != feather else { return }
        maskRadius = radius; maskFeather = feather
        maskImage = ReadingMask.image(radius: radius, feather: feather)
    }
}

/// The same nine-slice alpha mask softens the native material and its color wash.
/// Only the backdrop is masked; text, focus rings and hit regions stay sharp.
private enum ReadingMask {
    private static let cache = NSCache<NSString, NSImage>()

    static func image(radius: CGFloat, feather: CGFloat) -> NSImage {
        let key = "\(radius):\(feather)" as NSString
        if let image = cache.object(forKey: key) { return image }
        let cap = radius + feather
        let diameter = cap * 2 + 1
        let mask = NSImage(size: NSSize(width: diameter, height: diameter), flipped: false) { rect in
            guard let context = NSGraphicsContext.current?.cgContext else { return false }
            context.setBlendMode(.copy)
            let steps = feather > 0 ? 32 : 1
            for step in 0...steps {
                let t = CGFloat(step) / CGFloat(steps)
                let distance = feather * t
                let alpha = feather > 0 ? t * t * (3 - 2 * t) : 1
                context.setFillColor(NSColor.white.withAlphaComponent(alpha).cgColor)
                context.addPath(CGPath(roundedRect: rect.insetBy(dx: distance, dy: distance),
                                       cornerWidth: max(0, radius - distance),
                                       cornerHeight: max(0, radius - distance), transform: nil))
                context.fillPath()
            }
            return true
        }
        mask.capInsets = NSEdgeInsets(top: cap, left: cap, bottom: cap, right: cap)
        mask.resizingMode = .stretch
        cache.setObject(mask, forKey: key)
        return mask
    }
}
