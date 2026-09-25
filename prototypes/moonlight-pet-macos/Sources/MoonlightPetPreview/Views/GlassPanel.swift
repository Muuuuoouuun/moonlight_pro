import AppKit
import Combine
import SwiftUI

/// One native optical surface, with a separate non-interactive hairline and shadow gutter.
@MainActor
final class GlassPanel: NSView {
    static func host<Content: View>(_ content: Content, cornerRadius: CGFloat, ornament: AnyView? = nil,
                                    model: AppModel? = nil) -> GlassPanel {
        let readingTone = GlassReadingTone()
        let host = FirstMouseHostingView(rootView: content.environment(\.colorScheme, .dark)
            .environment(\.glassReadingTone, readingTone))
        host.sizingOptions = []
        host.focusRingType = .none
        let accessory = ornament.map { view -> NSView in
            let host = FirstMouseHostingView(rootView: view)
            host.sizingOptions = []
            host.focusRingType = .none
            return host
        }
        let panel = GlassPanel(content: host, cornerRadius: cornerRadius, ornament: accessory,
                               readingTone: readingTone)
        if let model {
            panel.characterSubscription = model.$selectedCharacter.removeDuplicates().sink { [weak panel] character in
                panel?.setCharacter(character)
            }
        }
        return panel
    }

    private let radius: CGFloat
    private let material: NSView
    private let rim: NSView
    private let foreground: NSView
    private let ornament: NSView?
    private let wash: PetGlassWash
    private let readingTone: GlassReadingTone
    private var characterSubscription: AnyCancellable?

    func setCharacter(_ character: PetCharacter) { wash.character = character }
    func previewCharacterTint(_ preview: Bool) { wash.previewsTint = preview }
    var showsOrnament = true {
        didSet {
            ornament?.isHidden = !showsOrnament
            needsLayout = true
        }
    }

    private init(content: NSView, cornerRadius: CGFloat, ornament: NSView?, readingTone: GlassReadingTone) {
        radius = cornerRadius
        self.readingTone = readingTone
        self.ornament = ornament
        foreground = content
        wash = PetGlassWash(radius: cornerRadius)
        rim = makeOpticalRim(radius: cornerRadius)
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView()
            // Clear is the requested default; regular is reserved for accessibility.
            glass.style = .clear
            glass.appearance = NSAppearance(named: .darkAqua)
            glass.cornerRadius = cornerRadius
            // Keep glyphs out of the glass content-compositing subtree. The native
            // effect handles only the backdrop; the sibling host draws sharp text.
            glass.contentView = NSView()
            material = glass
        } else {
            let backdrop = NSVisualEffectView()
            backdrop.material = .popover
            backdrop.blendingMode = .behindWindow
            backdrop.state = .active
            backdrop.appearance = NSAppearance(named: .darkAqua)
            let diameter = cornerRadius * 2 + 1
            backdrop.maskImage = NSImage(size: NSSize(width: diameter, height: diameter), flipped: false) { rect in
                NSColor.white.setFill()
                NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius).fill()
                return true
            }
            backdrop.maskImage?.capInsets = NSEdgeInsets(top: cornerRadius, left: cornerRadius,
                                                        bottom: cornerRadius, right: cornerRadius)
            backdrop.maskImage?.resizingMode = .stretch
            material = backdrop
        }
        super.init(frame: .zero)
        wash.onPresentationChange = { [weak readingTone] character, opacity, solid in
            readingTone?.update(character: character, opacity: opacity, solidForAccessibility: solid)
        }
        wantsLayer = true
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.18
        layer?.shadowRadius = 6
        layer?.shadowOffset = CGSize(width: 0, height: -2)
        addSubview(material)
        addSubview(wash)
        addSubview(rim)
        addSubview(foreground)
        if let ornament { addSubview(ornament) }
        updateMaterialAccessibility()
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(updateMaterialAccessibility),
            name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    }

    @objc private func updateMaterialAccessibility() {
        let accessible = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
            || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
        wash.solidForAccessibility = accessible
        if #available(macOS 26.0, *), let glass = material as? NSGlassEffectView {
            glass.style = accessible ? .regular : .clear
            glass.tintColor = nil
        }
    }

    deinit { NSWorkspace.shared.notificationCenter.removeObserver(self) }

    override func layout() {
        super.layout()
        var frame = bounds.insetBy(dx: CompanionLayout.gutter, dy: CompanionLayout.gutter)
        if let ornament, showsOrnament {
            frame.size.height -= CompanionLayout.perchRise
            ornament.frame = NSRect(x: frame.maxX - CompanionLayout.perchInset - CompanionLayout.perchSize,
                                    y: bounds.maxY - CompanionLayout.gutter - CompanionLayout.perchSize,
                                    width: CompanionLayout.perchSize, height: CompanionLayout.perchSize)
        }
        material.frame = frame
        wash.frame = frame
        foreground.frame = frame
        rim.frame = frame
        layer?.shadowPath = CGPath(roundedRect: frame, cornerWidth: radius, cornerHeight: radius, transform: nil)
    }

    required init?(coder: NSCoder) { nil }
}

final class GlassEdgeView: NSView {
    var radius: CGFloat = 26
    private let gradient = CAGradientLayer()
    private let outline = CAShapeLayer()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        gradient.colors = [NSColor.white.withAlphaComponent(0.60).cgColor,
                           NSColor.white.withAlphaComponent(0.10).cgColor,
                           NSColor.white.withAlphaComponent(0.12).cgColor,
                           NSColor.white.withAlphaComponent(0.36).cgColor]
        gradient.locations = [0, 0.38, 0.66, 1]
        gradient.startPoint = CGPoint(x: 0, y: 1)
        gradient.endPoint = CGPoint(x: 1, y: 0)
        outline.fillColor = NSColor.clear.cgColor
        outline.strokeColor = NSColor.white.cgColor
        outline.lineWidth = 1
        gradient.mask = outline
        layer?.addSublayer(gradient)
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = bounds
        outline.path = CGPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                              cornerWidth: radius, cornerHeight: radius, transform: nil)
        CATransaction.commit()
    }
}

private final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
