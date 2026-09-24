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

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius)
        content
            .background {
                GlassBackdrop()
                    .overlay(Palette.surface.opacity(0.68))
                    .allowsHitTesting(false)
            }
            .clipShape(shape)
            .overlay(shape.stroke(Palette.moon100.opacity(0.18), lineWidth: 1))
    }
}

extension View {
    func moonlightGlassPanel(cornerRadius: CGFloat) -> some View {
        modifier(GlassPanelStyle(cornerRadius: cornerRadius))
    }
}
