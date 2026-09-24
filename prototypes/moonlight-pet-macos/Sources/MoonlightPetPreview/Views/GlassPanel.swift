import AppKit
import SwiftUI

/// AppKit owns the optical surface at the window boundary; SwiftUI owns only content.
@MainActor
final class GlassPanel: NSView {
    static func host<Content: View>(_ content: Content, cornerRadius: CGFloat) -> NSView {
        let host = FirstMouseHostingView(rootView: content)
        host.sizingOptions = []
        return GlassPanel(content: host, cornerRadius: cornerRadius)
    }

    private init(content: NSView, cornerRadius: CGFloat) {
        super.init(frame: .zero)

        if #available(macOS 26.0, *) {
            // Regular provides adaptive legibility and system accessibility handling.
            // A second visual-effect layer would wash out the native material.
            let glass = NSGlassEffectView()
            glass.style = .regular
            glass.cornerRadius = cornerRadius
            glass.contentView = content
            fillBounds(with: glass)
        } else {
            let backdrop = NSVisualEffectView()
            backdrop.material = .popover
            backdrop.blendingMode = .behindWindow
            backdrop.state = .active
            let diameter = cornerRadius * 2 + 1
            backdrop.maskImage = NSImage(size: NSSize(width: diameter, height: diameter), flipped: false) { rect in
                NSColor.white.setFill()
                NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius).fill()
                return true
            }
            backdrop.maskImage?.capInsets = NSEdgeInsets(top: cornerRadius, left: cornerRadius,
                                                        bottom: cornerRadius, right: cornerRadius)
            backdrop.maskImage?.resizingMode = .stretch
            fillBounds(with: backdrop)
            fillBounds(with: content)
        }
    }

    private func fillBounds(with view: NSView) {
        addSubview(view)
        view.frame = bounds
        view.autoresizingMask = [.width, .height]
    }

    required init?(coder: NSCoder) { nil }
}

/// Floating utility controls respond on the click that activates their window.
private final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
