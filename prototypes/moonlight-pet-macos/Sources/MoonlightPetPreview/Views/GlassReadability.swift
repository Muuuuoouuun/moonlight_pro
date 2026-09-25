import AppKit
import SwiftUI

/// Protect only the reading area. The surrounding clear glass and its optical
/// edge remain transparent; glyphs are never blurred or shadowed.
struct GlassReadability: ViewModifier {
    var radius: CGFloat = 12
    var inset: CGFloat = 0
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
            TintedReadingBackground(radius: radius, withinWindow: withinWindow, tone: readingTone)
        } else {
            ReadingBackground(radius: radius, withinWindow: withinWindow, state: .init())
        }
    }
}

private struct TintedReadingBackground: View {
    let radius: CGFloat
    let withinWindow: Bool
    @ObservedObject var tone: GlassReadingTone

    var body: some View {
        ReadingBackground(radius: radius, withinWindow: withinWindow, state: tone.state)
    }
}

private struct ReadingBackground: View {
    let radius: CGFloat
    let withinWindow: Bool
    let state: GlassReadingTone.State

    var body: some View {
        ReadingMaterial(radius: radius, withinWindow: withinWindow)
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color(nsColor: PetGlassTheme.color(for: state.character)))
                    .opacity(state.solidForAccessibility ? 1 : PetGlassTheme.opacity(for: state.character))
                    .opacity(state.opacity)
                    .animation(PetMotion.hover, value: state.opacity)
            }
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Palette.glassControlFill.opacity(0.28))
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
    let withinWindow: Bool

    func makeNSView(context: Context) -> ReadingMaterialView { ReadingMaterialView() }
    func updateNSView(_ view: ReadingMaterialView, context: Context) {
        view.blendingMode = withinWindow ? .withinWindow : .behindWindow
        view.setRadius(radius)
    }
}

private final class ReadingMaterialView: NSVisualEffectView {
    private var maskRadius: CGFloat = -1

    override init(frame: NSRect) {
        super.init(frame: frame)
        material = .hudWindow
        state = .active
        appearance = NSAppearance(named: .darkAqua)
        isEmphasized = false
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func setRadius(_ radius: CGFloat) {
        guard maskRadius != radius else { return }
        maskRadius = radius
        let diameter = radius * 2 + 1
        let mask = NSImage(size: NSSize(width: diameter, height: diameter), flipped: false) { rect in
            NSColor.white.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        mask.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        mask.resizingMode = .stretch
        maskImage = mask
    }
}
