import AppKit
import SwiftUI

private struct GlassBackdrop: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let forcesDarkAppearance: Bool

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = forcesDarkAppearance ? NSAppearance(named: .darkAqua) : nil
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.material = material
        view.appearance = forcesDarkAppearance ? NSAppearance(named: .darkAqua) : nil
    }
}

private struct GlassPanelStyle: ViewModifier {
    let cornerRadius: CGFloat
    let adaptsToSystemAppearance: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius)
        let rim = adaptsToSystemAppearance ? Palette.glassInk : Palette.moon100
        if #available(macOS 26.0, *) {
            let glass = content
                .glassEffect(.regular, in: shape)
                .background {
                    GlassBackdrop(
                        material: adaptsToSystemAppearance ? .underWindowBackground : .popover,
                        forcesDarkAppearance: !adaptsToSystemAppearance
                    )
                        .opacity(adaptsToSystemAppearance ? 0.55 : 1)
                        .clipShape(shape)
                        .allowsHitTesting(false)
                }
                .overlay {
                    shape.strokeBorder(
                        LinearGradient(
                            colors: [
                                rim.opacity(0.42),
                                rim.opacity(0.14),
                                rim.opacity(0.07),
                                rim.opacity(0.20)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
                }
            if adaptsToSystemAppearance { glass }
            else { glass.environment(\.colorScheme, .dark) }
        } else {
            let frost = content
                .background {
                    GlassBackdrop(material: adaptsToSystemAppearance ? .underWindowBackground : .hudWindow,
                                  forcesDarkAppearance: !adaptsToSystemAppearance)
                        .overlay(adaptsToSystemAppearance ? .clear : Palette.surface.opacity(0.68))
                        .allowsHitTesting(false)
                }
                .clipShape(shape)
                .overlay(shape.strokeBorder(rim.opacity(0.22), lineWidth: 1))
            if adaptsToSystemAppearance { frost }
            else { frost.environment(\.colorScheme, .dark) }
        }
    }
}

extension View {
    func moonlightGlassPanel(cornerRadius: CGFloat,
                             adaptsToSystemAppearance: Bool = false) -> some View {
        modifier(GlassPanelStyle(cornerRadius: cornerRadius,
                                 adaptsToSystemAppearance: adaptsToSystemAppearance))
    }
}
