import AppKit

/// Operator-approved character identity colors, confined to the native pet panels.
/// Character color belongs to transient interaction, not the resting glass.
enum PetGlassTheme {
    static func opacity(for character: PetCharacter) -> CGFloat {
        character == .pink ? 0.60 : 0.76
    }
    static let primary: CGFloat = 0.98
    static let secondary: CGFloat = 0.92
    static let tertiary: CGFloat = 0.86

    static func color(for character: PetCharacter) -> NSColor {
        let rgb: (CGFloat, CGFloat, CGFloat)
        switch character {
        case .brown: rgb = (0.15, 0.115, 0.085)
        case .blue: rgb = (0.075, 0.135, 0.18)
        case .gold: rgb = (0.16, 0.14, 0.075)
        case .red: rgb = (0.18, 0.09, 0.065)
        case .lilac: rgb = (0.145, 0.105, 0.18)
        case .dark: rgb = (0.08, 0.085, 0.11)
        case .olive: rgb = (0.11, 0.145, 0.09)
        case .silver: rgb = (0.09, 0.145, 0.175)
        case .pink: rgb = (0.44, 0.28, 0.35)
        }
        return NSColor(srgbRed: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
    }
}

/// No blur/shadow on glyphs and no hit-testing surface above the text host.
final class PetGlassWash: NSView {
    var character: PetCharacter = .silver { didSet { updateColor() } }
    var solidForAccessibility = false { didSet { updateColor(); updatePresentation() } }
    // Only the developer material lab uses this explicit preview override.
    var previewsTint = false { didSet { updatePresentation() } }
    private var interaction = GlassPressState()
    private var eventMonitor: Any?
    private var releaseTimer: Timer?

    init(radius: CGFloat) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = radius
        layer?.cornerCurve = .continuous
        layer?.opacity = 0
        updateColor()
        NotificationCenter.default.addObserver(self, selector: #selector(resetInteraction),
            name: NSApplication.didResignActiveNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(updateAccessibility),
            name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
        updateAccessibility()
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        eventMonitor = nil
        NotificationCenter.default.removeObserver(self, name: NSWindow.didResignKeyNotification, object: nil)
        resetInteraction()
        guard let window else { return }
        NotificationCenter.default.addObserver(self, selector: #selector(resetInteraction),
            name: NSWindow.didResignKeyNotification, object: window)
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp]) { [weak self] event in
            guard let self else { return event }
            if event.type == .leftMouseUp {
                self.resetInteraction()
            } else if event.window === self.window,
                      self.bounds.contains(self.convert(event.locationInWindow, from: nil)) {
                self.interaction.press()
                self.updatePresentation()
                self.watchForRelease()
            }
            return event
        }
    }

    // Some native controls consume mouse-up in a tracking loop. Poll only during
    // the press, including that loop, so the glass can never stay tinted afterward.
    private func watchForRelease() {
        releaseTimer?.invalidate()
        let timer = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            if NSEvent.pressedMouseButtons & 1 == 0 || self.window?.isVisible != true {
                self.resetInteraction()
            }
        }
        releaseTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    @objc private func resetInteraction() {
        releaseTimer?.invalidate()
        releaseTimer = nil
        interaction.release()
        updatePresentation()
    }

    @objc private func updateAccessibility() {
        solidForAccessibility = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
            || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
    }

    private func updatePresentation() {
        guard let layer else { return }
        let target: Float = previewsTint || interaction.showsTint(accessibilityRequiresSolid: solidForAccessibility) ? 1 : 0
        guard layer.opacity != target else { return }
        let current = layer.presentation()?.opacity ?? layer.opacity
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.opacity = target
        CATransaction.commit()
        if !PetMotion.reduceMotion {
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = current
            fade.toValue = target
            fade.duration = PetMotion.hoverDuration
            fade.timingFunction = PetMotion.timingFunction
            layer.add(fade, forKey: "glass-pressure")
        } else {
            layer.removeAnimation(forKey: "glass-pressure")
        }
    }

    deinit {
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        releaseTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    private func updateColor() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer?.backgroundColor = PetGlassTheme.color(for: character)
            .withAlphaComponent(solidForAccessibility ? 1 : PetGlassTheme.opacity(for: character)).cgColor
        CATransaction.commit()
    }
}
