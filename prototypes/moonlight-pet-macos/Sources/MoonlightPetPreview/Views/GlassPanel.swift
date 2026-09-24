import AppKit
import SwiftUI

private struct GlassBackdrop: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .darkAqua)
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {}
}

private struct GlassPanelStyle: ViewModifier {
    let cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius)
        if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular.tint(Palette.surface.opacity(0.85)), in: shape)
                .overlay(shape.strokeBorder(Palette.moon100.opacity(0.22), lineWidth: 1))
                .environment(\.colorScheme, .dark)
        } else {
            content
                .background {
                    GlassBackdrop()
                        .overlay(Palette.surface.opacity(0.68))
                        .allowsHitTesting(false)
                }
                .clipShape(shape)
                .overlay(shape.strokeBorder(Palette.moon100.opacity(0.22), lineWidth: 1))
                .environment(\.colorScheme, .dark)
        }
    }
}

extension View {
    func moonlightGlassPanel(cornerRadius: CGFloat) -> some View {
        modifier(GlassPanelStyle(cornerRadius: cornerRadius))
    }
}
