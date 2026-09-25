import AppKit
import Combine
import OSLog

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
        // Keep each portrait's hue readable through the neutral native glass.
        // Separation comes from color, not a denser interaction wash.
        switch character {
        case .brown: rgb = (0.41, 0.27, 0.18)
        case .blue: rgb = (0.17, 0.32, 0.48)
        case .gold: rgb = (0.49, 0.39, 0.17)
        case .red: rgb = (0.48, 0.22, 0.14)
        case .lilac: rgb = (0.35, 0.255, 0.47)
        case .dark: rgb = (0.21, 0.20, 0.225)
        case .olive: rgb = (0.30, 0.38, 0.19)
        case .silver: rgb = (0.29, 0.425, 0.50)
        case .pink: rgb = (0.44, 0.28, 0.35)
        }
        return NSColor(srgbRed: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
    }
}

/// One transient presentation source per glass panel. Reading materials use the
/// wash's actual state instead of installing their own pointer observers.
final class GlassReadingTone: ObservableObject {
    struct State: Equatable {
        var character: PetCharacter = .silver
        var opacity: CGFloat = 0
        var solidForAccessibility = false
    }

    @Published private(set) var state = State()

    func update(character: PetCharacter, opacity: CGFloat, solidForAccessibility: Bool) {
        let next = State(character: character, opacity: opacity, solidForAccessibility: solidForAccessibility)
        guard state != next else { return }
        state = next
    }
}

/// Routes physical dragging to the glass being moved, including panels that
/// follow the separate pet window. Never tied to focus or text-entry state.
enum PetGlassDrag {
    fileprivate static let didChange = Notification.Name("MoonlightPetGlassDragDidChange")

    static func begin(in window: NSWindow?) { send(active: true, in: window) }
    static func update(in window: NSWindow?) { send(active: true, in: window) }
    static func end(in window: NSWindow?) { send(active: false, in: window) }

    private static func send(active: Bool, in window: NSWindow?) {
        guard let window else { return }
        NotificationCenter.default.post(name: didChange, object: window, userInfo: ["active": active])
    }
}

/// No blur/shadow on glyphs and no hit-testing surface above the text host.
final class PetGlassWash: NSView {
    var character: PetCharacter = .silver { didSet { updateColor(); updatePresentation() } }
    var solidForAccessibility = false { didSet { updateColor(); updatePresentation() } }
    var onPresentationChange: ((PetCharacter, CGFloat, Bool) -> Void)? {
        didSet { updatePresentation() }
    }
    // Only the developer material lab uses this explicit preview override.
    var previewsTint = false { didSet { updatePresentation() } }
    private var interaction = GlassPressState()
    private var eventMonitor: Any?
    private var releaseTimer: Timer?
    private var dragIsActive = false
    private let log = Logger(subsystem: "app.moonlight.pet-preview", category: "glass-interaction")

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
        NotificationCenter.default.removeObserver(self, name: PetGlassDrag.didChange, object: nil)
        resetInteraction()
        guard let window else { return }
        NotificationCenter.default.addObserver(self, selector: #selector(resetInteraction),
            name: NSWindow.didResignKeyNotification, object: window)
        NotificationCenter.default.addObserver(self, selector: #selector(updateDrag(_:)),
            name: PetGlassDrag.didChange, object: window)
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
        guard releaseTimer == nil else { return }
        let timer = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            if NSEvent.pressedMouseButtons & 1 == 0 || self.window?.isVisible != true {
                self.resetInteraction()
            }
        }
        releaseTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    @objc private func updateDrag(_ notification: Notification) {
        guard notification.object as? NSWindow === window else { return }
        guard notification.userInfo?["active"] as? Bool == true else {
            resetInteraction()
            return
        }
        interaction.drag()
        updatePresentation()
        if !dragIsActive {
            dragIsActive = true
            log.info("drag tint began window=\(self.window?.windowNumber ?? -1) opacity=\(self.layer?.opacity ?? -1)")
        }
        watchForRelease()
    }

    @objc private func resetInteraction() {
        releaseTimer?.invalidate()
        releaseTimer = nil
        interaction.release()
        updatePresentation()
        if dragIsActive {
            dragIsActive = false
            log.info("drag tint ended window=\(self.window?.windowNumber ?? -1) opacity=\(self.layer?.opacity ?? -1)")
        }
    }

    @objc private func updateAccessibility() {
        solidForAccessibility = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
            || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
    }

    private func updatePresentation() {
        guard let layer else { return }
        let target: Float = previewsTint || interaction.showsTint(accessibilityRequiresSolid: solidForAccessibility) ? 1 : 0
        onPresentationChange?(character, CGFloat(target), solidForAccessibility)
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
