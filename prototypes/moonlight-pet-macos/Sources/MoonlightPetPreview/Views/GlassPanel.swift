import AppKit
import Combine
import SwiftUI

/// One native optical surface, with a separate non-interactive hairline and shadow gutter.
@MainActor
final class GlassPanel: NSView {
    static func host<Content: View>(_ content: Content, cornerRadius: CGFloat, ornament: AnyView? = nil,
                                    model: AppModel? = nil, protectsText: Bool = false, captureSurface: CompanionSurface? = nil) -> GlassPanel {
        let readingTone = GlassReadingTone()
        let host = FirstMouseHostingView(rootView: content.environment(\.colorScheme, .dark)
            .environment(\.glassReadingTone, readingTone)
            .environment(\.glassReadingProtected, protectsText)
            .modifier(GlassTextProtection(enabled: protectsText)))
        host.sizingOptions = []
        host.focusRingType = .none
        let accessory = ornament.map { view -> NSView in
            let host = FirstMouseHostingView(rootView: view)
            host.sizingOptions = []
            host.focusRingType = .none
            return host
        }
        let panel = GlassPanel(content: host, cornerRadius: cornerRadius, ornament: accessory,
                               readingTone: readingTone, allowsCapture: captureSurface != nil)
        if let model {
            panel.setCharacter(model.presentationCharacter)
            panel.characterSubscription = model.objectWillChange.receive(on: RunLoop.main)
                .map { [weak model] _ in model?.presentationCharacter ?? .silver }
                .removeDuplicates().sink { [weak panel] character in panel?.setCharacter(character) }
        }
        if let model, let captureSurface {
            panel.desktopRefraction?.onStatus = { [weak model] status in model?.desktopRefractionStatus = status }
            panel.captureSubscription = model.$usesDesktopRefraction.combineLatest(model.$activeCompanion)
                .sink { [weak panel] enabled, active in
                    panel?.desktopRefraction?.setWanted(enabled && active == captureSurface)
                }
        }
        return panel
    }

    private let radius: CGFloat
    private let material: NSView
    private let centerDiffusion: GlassCenterDiffusion?
    private let centerVeil: GlassCenterVeil?
    private let desktopRefraction: DesktopRefractionView?
    private var captureSubscription: AnyCancellable?
    private let nativeEdgeMask = CALayer()
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

    private init(content: NSView, cornerRadius: CGFloat, ornament: NSView?, readingTone: GlassReadingTone, allowsCapture: Bool) {
        radius = cornerRadius
        self.readingTone = readingTone
        self.ornament = ornament
        desktopRefraction = allowsCapture ? GlassOpticsRenderer.shared.map { DesktopRefractionView(renderer: $0) } : nil
        foreground = content
        wash = PetGlassWash(radius: cornerRadius)
        rim = makeOpticalRim(radius: cornerRadius)
        if #available(macOS 26.0, *) {
            centerDiffusion = GlassCenterDiffusion(radius: cornerRadius)
            centerVeil = GlassCenterVeil(radius: cornerRadius)
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
            centerDiffusion = nil
            centerVeil = nil
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
        layer?.shadowOpacity = 0.12
        layer?.shadowRadius = 6
        layer?.shadowOffset = CGSize(width: 0, height: -2)
        // The under-window diffusion is the lowest native effect. It softens
        // the center while its mask leaves the clear glass lip exposed.
        if let centerDiffusion { addSubview(centerDiffusion) }
        addSubview(material)
        if let desktopRefraction { addSubview(desktopRefraction) }
        if let centerVeil { addSubview(centerVeil) }
        addSubview(wash)
        addSubview(rim)
        addSubview(foreground)
        if let ornament { addSubview(ornament) }
        // The optical layer owns the lip. Feather only the native material's
        // outer 8pt so its broad dark bevel does not bury the spectral reflection.
        if rim is OpticalGlassView {
            let feather: CGFloat = 8
            let cap = radius + feather
            let diameter = cap*2+1
            nativeEdgeMask.contents = ReadingMask.image(radius: radius, feather: feather)
                .cgImage(forProposedRect: nil, context: nil, hints: nil)
            nativeEdgeMask.contentsCenter = CGRect(x: cap/diameter,y: cap/diameter,
                                                   width: 1/diameter,height: 1/diameter)
            material.wantsLayer = true
        }
        updateMaterialAccessibility()
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(updateMaterialAccessibility),
            name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    }

    @objc private func updateMaterialAccessibility() {
        let accessible = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
            || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
        wash.solidForAccessibility = accessible
        centerDiffusion?.isHidden = accessible
        centerVeil?.isHidden = accessible
        material.layer?.mask = !accessible && rim is OpticalGlassView ? nativeEdgeMask : nil
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
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        nativeEdgeMask.frame = material.bounds
        CATransaction.commit()
        desktopRefraction?.frame = frame
        centerDiffusion?.frame = frame
        centerVeil?.frame = frame
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
