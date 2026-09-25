import AppKit

/// Approved browser study: blur 12px, veil 10%, glyph shadow 73%, edge 66%.
/// AppKit owns the actual blur radius. The native material mix is a visual
/// approximation, not a claim that its kernel is the CSS 12px kernel.
enum GlassStudy {
    static let nativeDiffusionMix: CGFloat = 0.48
    static let centerVeil: CGFloat = 0.10
    static let glyphShadow = 0.73
    static let edgeReflection: Float = 0.66
    static let edgeFeather: CGFloat = 24
}

/// One softly masked backdrop under the clear glass. This layer never contains
/// text or controls; the foreground remains an unaffected sibling.
final class GlassCenterDiffusion: NSVisualEffectView {
    init(radius: CGFloat) {
        super.init(frame: .zero)
        material = .underWindowBackground
        blendingMode = .behindWindow
        state = .active
        appearance = NSAppearance(named: .darkAqua)
        isEmphasized = false
        alphaValue = GlassStudy.nativeDiffusionMix
        maskImage = ReadingMask.image(radius: radius, feather: GlassStudy.edgeFeather)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

/// Low-density shade fades toward the clear lip instead of boxing each label.
final class GlassCenterVeil: NSView {
    private let radius: CGFloat
    init(radius: CGFloat) {
        self.radius = radius
        super.init(frame: .zero)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { nil }
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func draw(_ dirtyRect: NSRect) {
        NSBezierPath(roundedRect: bounds, xRadius: radius, yRadius: radius).addClip()
        NSGradient(colorsAndLocations:
            (NSColor.black.withAlphaComponent(GlassStudy.centerVeil), 0),
            (NSColor.black.withAlphaComponent(GlassStudy.centerVeil), 0.35),
            (NSColor.black.withAlphaComponent(0), 1))?
            .draw(in: bounds, relativeCenterPosition: .zero)
    }
}
