import AppKit
import SwiftUI

private struct GlassBackdrop: NSViewRepresentable {
    let material: NSVisualEffectView.Material

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .darkAqua)
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.material = material
    }
}

private struct GlassPanelStyle: ViewModifier {
    let cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius)
        if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular, in: shape)
                .background {
                    GlassBackdrop(material: .popover)
                        .clipShape(shape)
                        .allowsHitTesting(false)
                }
                .overlay {
                    shape.strokeBorder(
                        LinearGradient(
                            colors: [
                                Palette.moon100.opacity(0.42),
                                Palette.moon100.opacity(0.14),
                                Palette.moon100.opacity(0.07),
                                Palette.moon100.opacity(0.20)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
                }
                .environment(\.colorScheme, .dark)
        } else {
            content
                .background {
                    GlassBackdrop(material: .hudWindow)
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
