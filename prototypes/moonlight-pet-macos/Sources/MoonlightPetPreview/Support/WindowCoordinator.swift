import AppKit
import Carbon
import OSLog
import SwiftUI

private let interactionLog = Logger(subsystem: "app.moonlight.pet-preview", category: "interaction")

final class KeyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class PetClickView: NSView {
    var onSingleClick: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onMoved: (() -> Void)?
    private var pendingSingle: DispatchWorkItem?
    private var lastScreenPoint: NSPoint?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        let host = NSHostingView(rootView: PetVisual())
        host.frame = bounds
        host.autoresizingMask = [.width, .height]
        addSubview(host)
    }

    required init?(coder: NSCoder) { nil }

    override func hitTest(_ point: NSPoint) -> NSView? { self }

    override func mouseDown(with event: NSEvent) {
        interactionLog.info("pet mouseDown count=\(event.clickCount)")
        lastScreenPoint = NSEvent.mouseLocation
        if event.clickCount >= 2 {
            pendingSingle?.cancel()
            pendingSingle = nil
            onDoubleClick?()
        } else {
            pendingSingle?.cancel()
            let action = DispatchWorkItem { [weak self] in self?.onSingleClick?() }
            pendingSingle = action
            DispatchQueue.main.asyncAfter(deadline: .now() + NSEvent.doubleClickInterval, execute: action)
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard let previous = lastScreenPoint, let window else { return }
        let current = NSEvent.mouseLocation
        let distance = hypot(current.x - previous.x, current.y - previous.y)
        guard distance > 2 else { return }
        pendingSingle?.cancel()
        pendingSingle = nil
        var origin = window.frame.origin
        origin.y += current.y - previous.y
        let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? window.frame
        origin.y = min(max(origin.y, visible.minY + 8), visible.maxY - window.frame.height - 8)
        window.setFrameOrigin(origin)
        lastScreenPoint = current
        onMoved?()
    }
}

final class ShieldWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class WindowCoordinator: NSObject {
    private let model: AppModel
    private let petWindow: KeyPanel
    private let previewWindow: KeyPanel
    private let barWindow: KeyPanel
    private var shieldWindows: [ShieldWindow] = []
    private var previousPresentationOptions: NSApplication.PresentationOptions = []
    private var screenObserver: NSObjectProtocol?
    private var resignObserver: NSObjectProtocol?
    private var keyMonitor: Any?
    private var escapeTimer: Timer?
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?

    init(model: AppModel) {
        self.model = model
        petWindow = Self.panel(size: NSSize(width: 58, height: 58))
        previewWindow = Self.panel(size: NSSize(width: 304, height: 130))
        barWindow = Self.panel(size: NSSize(width: 440, height: 250))
        super.init()

        let petClickView = PetClickView(frame: NSRect(origin: .zero, size: petWindow.frame.size))
        petClickView.onSingleClick = { [weak self] in self?.togglePreview() }
        petClickView.onDoubleClick = { [weak self] in self?.toggleBar() }
        petClickView.onMoved = { [weak self] in self?.placeTransientWindows() }
        petWindow.contentView = petClickView

        previewWindow.contentView = NSHostingView(rootView: PreviewView(model: model) { [weak self] in
            self?.showBar()
        })
        barWindow.contentView = NSHostingView(rootView: QuickBarView(
            model: model,
            close: { [weak self] in self?.barWindow.orderOut(nil) },
            modeChanged: { [weak self] in self?.resizeBar() },
            startFocus: { [weak self] in self?.startFocus() }
        ))

        model.onFocusFinished = { [weak self] in self?.endFocus() }
        placePetInitially()
        placeTransientWindows()
        registerHotKey()
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.model.isFocused { self.rebuildShields() }
                else { self.placeTransientWindows() }
            }
        }
        resignObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.model.isFocused else { return }
                self.previewWindow.orderOut(nil)
                self.barWindow.orderOut(nil)
            }
        }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
            guard let self else { return event }
            if !self.model.isFocused,
               event.type == .keyDown,
               event.keyCode == 36,
               event.modifierFlags.contains(.command) {
                self.model.openHub(self.model.mode)
                return nil
            }
            guard event.keyCode == 53 else { return event }
            if self.model.isFocused {
                if event.type == .keyDown && self.escapeTimer == nil {
                    self.escapeTimer = Timer.scheduledTimer(withTimeInterval: 1.3, repeats: false) { [weak self] _ in
                        Task { @MainActor in
                            self?.model.showStopConfirmation = true
                            self?.escapeTimer = nil
                        }
                    }
                } else if event.type == .keyUp {
                    self.escapeTimer?.invalidate()
                    self.escapeTimer = nil
                }
            } else if event.type == .keyDown {
                self.previewWindow.orderOut(nil)
                self.barWindow.orderOut(nil)
            }
            return nil
        }
    }

    deinit {
        if let screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        if let resignObserver { NotificationCenter.default.removeObserver(resignObserver) }
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        escapeTimer?.invalidate()
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let hotKeyHandler { RemoveEventHandler(hotKeyHandler) }
    }

    func showPet() { petWindow.orderFrontRegardless() }

    func togglePreview() {
        interactionLog.info("toggle preview")
        guard !model.isFocused else { return }
        if previewWindow.isVisible { previewWindow.orderOut(nil) }
        else {
            barWindow.orderOut(nil)
            placeTransientWindows()
            previewWindow.makeKeyAndOrderFront(nil)
        }
    }

    func toggleBar() {
        guard !model.isFocused else { return }
        if barWindow.isVisible { barWindow.orderOut(nil) }
        else { showBar() }
    }

    func showBar() {
        interactionLog.info("show bar")
        guard !model.isFocused else { return }
        previewWindow.orderOut(nil)
        placeTransientWindows()
        barWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func placePetInitially() {
        guard let visible = NSScreen.main?.visibleFrame else { return }
        petWindow.setFrameOrigin(NSPoint(
            x: visible.maxX - petWindow.frame.width - 8,
            y: visible.minY + visible.height / 3
        ))
    }

    private func placeTransientWindows() {
        let pet = petWindow.frame
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? pet
        for window in [previewWindow, barWindow] {
            let x = max(visible.minX + 8, pet.minX - window.frame.width - 10)
            let y = min(max(pet.midY - window.frame.height / 2, visible.minY + 8), visible.maxY - window.frame.height - 8)
            window.setFrameOrigin(NSPoint(x: x, y: y))
        }
    }

    private func resizeBar() {
        let height: CGFloat
        switch model.mode {
        case .tasks: height = 250
        case .memo: height = 290
        case .calendar, .office, .council: height = 250
        case .focus: height = 230
        }
        var frame = barWindow.frame
        frame.origin.y += frame.height - height
        frame.size.height = height
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? frame
        frame.origin.y = min(max(frame.origin.y, visible.minY + 8), visible.maxY - height - 8)
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            barWindow.setFrame(frame, display: true)
        } else {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.18
                context.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.3, 1)
                barWindow.animator().setFrame(frame, display: true)
            }
        }
    }

    private func startFocus() {
        model.startFocus()
        guard model.isFocused else { return }
        petWindow.orderOut(nil)
        previewWindow.orderOut(nil)
        barWindow.orderOut(nil)
        previousPresentationOptions = NSApp.presentationOptions
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching, .disableHideApplication]
        rebuildShields()
    }

    private func rebuildShields() {
        shieldWindows.forEach { $0.orderOut(nil) }
        shieldWindows.removeAll()
        let main = NSScreen.main
        for screen in NSScreen.screens {
            let window = ShieldWindow(
                contentRect: screen.frame,
                styleMask: [.borderless],
                backing: .buffered,
                defer: false,
                screen: screen
            )
            window.level = .screenSaver
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            window.isOpaque = true
            window.backgroundColor = NSColor(Palette.bg)
            window.ignoresMouseEvents = false
            window.contentView = NSHostingView(rootView: FocusShieldView(model: model, showsControls: screen == main))
            window.orderFrontRegardless()
            shieldWindows.append(window)
        }
        if let primary = shieldWindows.first(where: { $0.screen == main }) ?? shieldWindows.first {
            primary.makeKeyAndOrderFront(nil)
            primary.makeFirstResponder(primary)
        }
    }

    private func endFocus() {
        escapeTimer?.invalidate()
        escapeTimer = nil
        shieldWindows.forEach { $0.orderOut(nil) }
        shieldWindows.removeAll()
        NSApp.presentationOptions = previousPresentationOptions
        petWindow.orderFrontRegardless()
    }

    private static func panel(size: NSSize) -> KeyPanel {
        let panel = KeyPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenNone]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        return panel
    }

    private func registerHotKey() {
        let identifier = EventHotKeyID(signature: 0x4D4C5054, id: 1)
        let registration = RegisterEventHotKey(
            UInt32(kVK_ANSI_M), UInt32(controlKey | optionKey), identifier,
            GetApplicationEventTarget(), 0, &hotKeyRef
        )
        if registration != noErr { interactionLog.error("hot key registration failed: \(registration)") }
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                      eventKind: UInt32(kEventHotKeyPressed))
        let installation = InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return noErr }
            let owner = Unmanaged<WindowCoordinator>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { owner.toggleBar() }
            return noErr
        }, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &hotKeyHandler)
        if installation != noErr { interactionLog.error("hot key handler failed: \(installation)") }
    }
}
