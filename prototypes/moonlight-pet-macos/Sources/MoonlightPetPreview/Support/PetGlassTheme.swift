import AppKit

/// Operator-approved character identity colors, confined to the native pet panels.
/// Adds a dark reading surface behind white text while retaining the backdrop.
enum PetGlassTheme {
    static let opacity: CGFloat = 0.76
    static let primary: CGFloat = 0.98
    static let secondary: CGFloat = 0.92
    static let tertiary: CGFloat = 0.86

    static func color(for character: PetCharacter) -> NSColor {
        let rgb: (CGFloat, CGFloat, CGFloat)
        switch character {
        case .brown: rgb = (0.15, 0.115, 0.085)
        case .blue: rgb = (0.075, 0.135, 0.18)
        case .gold: rgb = (0.16, 0.14, 0.075)
        case .red: rgb = (0.18, 0.09, 0.065)
        case .lilac: rgb = (0.145, 0.105, 0.18)
        case .dark: rgb = (0.08, 0.085, 0.11)
        case .olive: rgb = (0.11, 0.145, 0.09)
        case .silver: rgb = (0.09, 0.145, 0.175)
        case .pink: rgb = (0.44, 0.28, 0.35)
        }
        return NSColor(srgbRed: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
    }
}

/// No blur/shadow on glyphs and no hit-testing surface above the text host.
final class PetGlassWash: NSView {
    var character: PetCharacter = .silver { didSet { updateColor() } }
    var solidForAccessibility = false { didSet { updateColor() } }

    init(radius: CGFloat) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = radius
        layer?.cornerCurve = .continuous
        updateColor()
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    private func updateColor() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer?.backgroundColor = PetGlassTheme.color(for: character)
            .withAlphaComponent(solidForAccessibility ? 1 : PetGlassTheme.opacity).cgColor
        CATransaction.commit()
    }
}
