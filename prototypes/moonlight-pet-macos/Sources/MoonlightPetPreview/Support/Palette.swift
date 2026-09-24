import SwiftUI

// DESIGN.md Moonstone tokens, converted from OKLCH to sRGB for the native preview.
enum Palette {
    static let bg = color(0.155, 0.005, 250)
    static let surface = color(0.195, 0.006, 250)
    static let surface2 = color(0.225, 0.007, 250)
    static let surface3 = color(0.255, 0.008, 250)
    static let line = color(0.30, 0.008, 250)
    static let moon100 = color(0.92, 0.005, 250)
    static let moon300 = color(0.78, 0.008, 250)
    static let moon400 = color(0.68, 0.009, 250)
    static let moon500 = color(0.58, 0.010, 250)
    // All floating glass panels follow the effective macOS appearance.
    static let glassOnAccent = Color(nsColor: .textBackgroundColor)
    static let glassInk = Color.primary
    static let glassInkMuted = Color.primary.opacity(0.68)
    static let glassInkFaint = Color.primary.opacity(0.56)

    private static func color(_ lightness: Double, _ chroma: Double, _ degrees: Double) -> Color {
        let angle = degrees * .pi / 180
        let a = chroma * cos(angle)
        let b = chroma * sin(angle)
        let l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3)
        func gamma(_ value: Double) -> Double {
            let clamped = min(max(value, 0), 1)
            return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * pow(clamped, 1 / 2.4) - 0.055
        }
        return Color(
            .sRGB,
            red: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            green: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            blue: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
            opacity: 1
        )
    }
}
