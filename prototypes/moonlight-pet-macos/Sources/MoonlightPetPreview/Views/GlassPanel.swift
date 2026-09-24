import AppKit
import SwiftUI

/// Keep the desktop sampler outside SwiftUI's clipping/compositing hierarchy.
@MainActor
final class GlassPanel: NSView {
    private let backdrop = NSVisualEffectView()
    private let foreground: NSView
    private var accessibilityObserver: NSObjectProtocol?

    static func host<Content: View>(_ content: Content, cornerRadius: CGFloat) -> NSView {
        let host = NSHostingView(rootView: content)
        host.sizingOptions = []
        return GlassPanel(content: host, cornerRadius: cornerRadius)
    }

    private init(content: NSView, cornerRadius: CGFloat) {
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView()
            glass.style = .clear
            glass.cornerRadius = cornerRadius
            glass.contentView = content
            foreground = glass
        } else {
            foreground = content
        }
        super.init(frame: .zero)

        backdrop.material = .popover
        backdrop.blendingMode = .behindWindow
        backdrop.state = .active
        updateAccessibility()
        let diameter = cornerRadius * 2 + 1
        backdrop.maskImage = NSImage(size: NSSize(width: diameter, height: diameter), flipped: false) { rect in
            NSColor.white.setFill()
            NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius).fill()
            return true
        }
        backdrop.maskImage?.capInsets = NSEdgeInsets(top: cornerRadius, left: cornerRadius,
                                                    bottom: cornerRadius, right: cornerRadius)
        backdrop.maskImage?.resizingMode = .stretch
        addSubview(backdrop)
        addSubview(foreground)
        for view in [backdrop, foreground] {
            view.frame = bounds
            view.autoresizingMask = [.width, .height]
        }
        accessibilityObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.updateAccessibility() }
        }
    }

    private func updateAccessibility() {
        let reduceTransparency = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
        // Only the material fades; text, input controls and character art stay at full opacity.
        backdrop.alphaValue = reduceTransparency ? 1 : 0.78
        if #available(macOS 26.0, *), let glass = foreground as? NSGlassEffectView {
            glass.style = reduceTransparency ? .regular : .clear
        }
    }

    deinit {
        if let accessibilityObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(accessibilityObserver)
        }
    }

    required init?(coder: NSCoder) { nil }
}
