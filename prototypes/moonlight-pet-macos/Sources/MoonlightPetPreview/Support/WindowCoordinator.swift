import AppKit
import Carbon
import OSLog
import SwiftUI

private let interactionLog = Logger(subsystem: "app.moonlight.pet-preview", category: "interaction")

final class KeyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class PetClickView: NSView {
    private let model: AppModel
    private let interaction = PetInteraction()
    var onClick: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onMoved: (() -> Void)?
    private var lastScreenPoint: NSPoint?
    private var didDrag = false

    init(frame frameRect: NSRect, model: AppModel) {
        self.model = model
        super.init(frame: frameRect)
        let host = NSHostingView(rootView: PetVisual(model: model, interaction: interaction))
        host.frame = bounds
        host.autoresizingMask = [.width, .height]
        addSubview(host)
        addTrackingArea(NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
    }

    required init?(coder: NSCoder) { nil }

    override func hitTest(_ point: NSPoint) -> NSView? { self }

    override func mouseEntered(with event: NSEvent) { interaction.isHovered = true }
    override func mouseExited(with event: NSEvent) { interaction.isHovered = false }

    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu(title: "펫 캐릭터")
        for character in PetCharacter.allCases {
            let item = NSMenuItem(title: character.title, action: #selector(selectCharacter(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = character.rawValue
            item.state = model.selectedCharacter == character ? .on : .off
            if let artwork = character.artwork?.copy() as? NSImage {
                artwork.size = NSSize(width: 20, height: 20)
                item.image = artwork
            }
            menu.addItem(item)
        }
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }

    @objc private func selectCharacter(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let character = PetCharacter(rawValue: rawValue) else { return }
        withAnimation(PetMotion.petCharacter) { model.selectedCharacter = character }
    }

    override func mouseDown(with event: NSEvent) {
        interactionLog.info("pet mouseDown count=\(event.clickCount)")
        lastScreenPoint = NSEvent.mouseLocation
        didDrag = false
        interaction.isDragging = false
        interaction.isPressed = true
    }

    override func mouseUp(with event: NSEvent) {
        defer {
            lastScreenPoint = nil
            interaction.isPressed = false
            interaction.isDragging = false
        }
        if !didDrag && bounds.contains(convert(event.locationInWindow, from: nil)) {
            if event.clickCount == 1 { onClick?() }
            else if event.clickCount == 2 { onDoubleClick?() }
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard let previous = lastScreenPoint, let window else { return }
        let current = NSEvent.mouseLocation
        let distance = hypot(current.x - previous.x, current.y - previous.y)
        guard distance > 2 else { return }
        didDrag = true
        interaction.isPressed = false
        interaction.isDragging = true
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
    private let widgetWindow: KeyPanel
    private var shieldWindows: [ShieldWindow] = []
    private var previousPresentationOptions: NSApplication.PresentationOptions = []
    private var screenObserver: NSObjectProtocol?
    private var resignObserver: NSObjectProtocol?
    private var keyMonitor: Any?
    private var escapeTimer: Timer?
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var desiredVisibility: [ObjectIdentifier: Bool] = [:]
    private var transitionRevisions: [ObjectIdentifier: Int] = [:]

    init(model: AppModel) {
        self.model = model
        petWindow = Self.panel(size: NSSize(width: 56, height: 56))
        previewWindow = Self.panel(size: NSSize(width: 326, height: 130))
        barWindow = Self.panel(size: Self.barSize(for: model.mode))
        widgetWindow = Self.panel(size: Self.widgetSize(for: model.compactMode))
        super.init()

        let petClickView = PetClickView(frame: NSRect(origin: .zero, size: petWindow.frame.size), model: model)
        petClickView.onClick = { [weak self] in self?.toggleBar() }
        petClickView.onDoubleClick = { [weak self] in self?.showWidget() }
        petClickView.onMoved = { [weak self] in self?.placeTransientWindows() }
        petWindow.contentView = petClickView
        petWindow.hasShadow = false

        previewWindow.contentView = GlassPanel.host(PreviewView(model: model) { [weak self] in
            self?.showBar()
        }, cornerRadius: 14)
        barWindow.contentView = GlassPanel.host(QuickBarView(
            model: model,
            close: { [weak self] in self?.dismissBar() },
            modeChanged: { [weak self] in self?.resizeBar() },
            startFocus: { [weak self] in self?.startFocus() }
        ), cornerRadius: 16)
        widgetWindow.contentView = GlassPanel.host(CompactWidgetView(
            model: model,
            collapse: { [weak self] in self?.collapseWidget() },
            modeChanged: { [weak self] in self?.resizeWidget() },
            moveVertically: { [weak self] offset in self?.moveWidgetVertically(by: offset) }
        ), cornerRadius: 18)

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
                self.hideNow(self.previewWindow)
                self.hideNow(self.barWindow)
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
                if self.isRequestedVisible(self.widgetWindow) { self.collapseWidget() }
                else {
                    self.dismiss(self.previewWindow)
                    self.dismiss(self.barWindow)
                }
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
        if isRequestedVisible(previewWindow) { dismiss(previewWindow) }
        else {
            if isRequestedVisible(widgetWindow) { collapseWidget() }
            dismiss(barWindow)
            placeTransientWindows()
            present(previewWindow)
        }
    }

    func toggleBar() {
        guard !model.isFocused else { return }
        if isRequestedVisible(widgetWindow) { collapseWidget() }
        if isRequestedVisible(barWindow) { dismiss(barWindow) }
        else { showBar() }
    }

    func showBar() {
        interactionLog.info("show bar")
        guard !model.isFocused else { return }
        if isRequestedVisible(widgetWindow) { collapseWidget() }
        dismiss(previewWindow)
        placeTransientWindows()
        present(barWindow)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func dismissBar() { dismiss(barWindow) }

    func showWidget() {
        interactionLog.info("show dedicated widget")
        guard !model.isFocused else { return }
        if isRequestedVisible(widgetWindow) {
            widgetWindow.makeKeyAndOrderFront(nil)
            return
        }
        hideNow(previewWindow)
        hideNow(barWindow)
        model.compactMode = .tasks
        model.compactOpenRevision += 1
        widgetWindow.setContentSize(Self.widgetSize(for: .tasks))
        placeWidget()
        petWindow.orderOut(nil)
        present(widgetWindow)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func collapseWidget() {
        guard isRequestedVisible(widgetWindow) else { return }
        dismiss(widgetWindow) { [weak self] in
            guard let self, !self.model.isFocused else { return }
            self.petWindow.orderFrontRegardless()
        }
    }

    private func isRequestedVisible(_ window: KeyPanel) -> Bool {
        desiredVisibility[ObjectIdentifier(window)] == true
    }

    @discardableResult
    private func advanceRevision(for window: KeyPanel) -> Int {
        let key = ObjectIdentifier(window)
        let next = (transitionRevisions[key] ?? 0) + 1
        transitionRevisions[key] = next
        return next
    }

    private func present(_ window: KeyPanel) {
        advanceRevision(for: window)
        desiredVisibility[ObjectIdentifier(window)] = true
        let targetFrame = window.frame
        let wasVisible = window.isVisible
        if PetMotion.reduceMotion {
            window.alphaValue = 1
            window.makeKeyAndOrderFront(nil)
            return
        }
        if !wasVisible {
            window.alphaValue = 0
            var startFrame = targetFrame
            startFrame.origin.x += 4
            window.setFrame(startFrame, display: false)
        }
        window.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = PetMotion.overlayDuration
            context.timingFunction = PetMotion.timingFunction
            window.animator().alphaValue = 1
            if !wasVisible { window.animator().setFrame(targetFrame, display: true) }
        }
    }

    private func dismiss(_ window: KeyPanel, completion: (() -> Void)? = nil) {
        let key = ObjectIdentifier(window)
        let revision = advanceRevision(for: window)
        desiredVisibility[key] = false
        guard window.isVisible else {
            completion?()
            return
        }
        if PetMotion.reduceMotion {
            hideNow(window)
            completion?()
            return
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = PetMotion.hoverDuration
            context.timingFunction = PetMotion.timingFunction
            window.animator().alphaValue = 0
        } completionHandler: { [weak self, weak window] in
            Task { @MainActor in
                guard let self, let window,
                      self.transitionRevisions[key] == revision,
                      !self.isRequestedVisible(window) else { return }
                window.orderOut(nil)
                window.alphaValue = 1
                completion?()
            }
        }
    }

    private func hideNow(_ window: KeyPanel) {
        advanceRevision(for: window)
        desiredVisibility[ObjectIdentifier(window)] = false
        window.orderOut(nil)
        window.alphaValue = 1
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
        placeWidget()
    }

    private func placeWidget() {
        let pet = petWindow.frame
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? pet
        let size = widgetWindow.frame.size
        let x = min(max(pet.maxX - size.width, visible.minX + 8), visible.maxX - size.width - 8)
        let y = min(max(pet.maxY - size.height, visible.minY + 8), visible.maxY - size.height - 8)
        widgetWindow.setFrameOrigin(NSPoint(x: x, y: y))
    }

    private func resizeWidget() {
        let size = Self.widgetSize(for: model.compactMode)
        var frame = widgetWindow.frame
        let top = frame.maxY
        frame.size = size
        let visible = widgetWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? frame
        frame.origin.y = min(max(top - size.height, visible.minY + 8), visible.maxY - size.height - 8)
        if PetMotion.reduceMotion { widgetWindow.setFrame(frame, display: true) }
        else {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = PetMotion.panelDuration
                context.timingFunction = PetMotion.timingFunction
                widgetWindow.animator().setFrame(frame, display: true)
            }
        }
    }

    private func moveWidgetVertically(by offset: CGFloat) {
        let visible = widgetWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? widgetWindow.frame
        var origin = widgetWindow.frame.origin
        origin.y = min(max(origin.y + offset, visible.minY + 8), visible.maxY - widgetWindow.frame.height - 8)
        widgetWindow.setFrameOrigin(origin)
        var petOrigin = petWindow.frame.origin
        petOrigin.y = min(max(widgetWindow.frame.maxY - petWindow.frame.height, visible.minY + 8),
                          visible.maxY - petWindow.frame.height - 8)
        petWindow.setFrameOrigin(petOrigin)
        placeTransientWindows()
    }

    private static func widgetSize(for mode: CompactMode) -> NSSize {
        NSSize(width: 288, height: mode == .tasks ? 420 : 304)
    }

    private func resizeBar() {
        let size = Self.barSize(for: model.mode)
        var frame = barWindow.frame
        frame.size = size
        let pet = petWindow.frame
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? frame
        frame.origin.x = max(visible.minX + 8, pet.minX - size.width - 10)
        frame.origin.y = min(max(pet.midY - size.height / 2, visible.minY + 8), visible.maxY - size.height - 8)
        guard frame != barWindow.frame else { return }
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            barWindow.setFrame(frame, display: true)
        } else {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = PetMotion.panelDuration
                context.timingFunction = PetMotion.timingFunction
                barWindow.animator().setFrame(frame, display: true)
            }
        }
    }

    private static func barSize(for mode: QuickMode) -> NSSize {
        switch mode {
        case .tasks: return NSSize(width: 368, height: 416)
        case .calendar: return NSSize(width: 368, height: 416)
        case .memo: return NSSize(width: 440, height: 290)
        case .office, .council: return NSSize(width: 440, height: 250)
        case .focus: return NSSize(width: 440, height: 230)
        }
    }

    private func startFocus() {
        model.startFocus()
        guard model.isFocused else { return }
        petWindow.orderOut(nil)
        hideNow(previewWindow)
        hideNow(barWindow)
        hideNow(widgetWindow)
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
        panel.hasShadow = false
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
