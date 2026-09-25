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
    var onDragBegan: (() -> Void)?
    var onDragEnded: (() -> Void)?
    private var drag = ScreenDragTracker()

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
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

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
        drag.begin(at: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)
        interaction.isDragging = false
        interaction.isPressed = true
    }

    override func mouseUp(with event: NSEvent) {
        defer {
            onDragEnded?()
            drag.end()
            interaction.isPressed = false
            interaction.isDragging = false
        }
        if !drag.isDragging && bounds.contains(convert(event.locationInWindow, from: nil)) {
            if event.clickCount == 1 { onClick?() }
            else if event.clickCount == 2 { onDoubleClick?() }
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let wasDragging = drag.isDragging
        guard let window, let offset = drag.translation(to: window.convertPoint(toScreen: event.locationInWindow)) else { return }
        if !wasDragging { onDragBegan?() }
        interaction.isPressed = false
        interaction.isDragging = true
        var frame = window.frame
        frame.origin.y += offset
        let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? frame
        window.setFrameOrigin(PanelGeometry.fitted(frame, in: visible).origin)
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
        petClickView.onDragBegan = { [weak self] in
            guard let self else { return }
            for panel in [self.previewWindow, self.barWindow, self.widgetWindow] where self.isRequestedVisible(panel) {
                PetGlassDrag.begin(in: panel)
            }
        }
        petClickView.onMoved = { [weak self] in
            guard let self else { return }
            self.placeTransientWindows()
            for panel in [self.previewWindow, self.barWindow, self.widgetWindow] where self.isRequestedVisible(panel) {
                PetGlassDrag.update(in: panel)
            }
        }
        petClickView.onDragEnded = { [weak self] in
            guard let self else { return }
            for panel in [self.previewWindow, self.barWindow, self.widgetWindow] { PetGlassDrag.end(in: panel) }
        }
        petWindow.contentView = petClickView
        petWindow.hasShadow = false

        previewWindow.contentView = GlassPanel.host(PreviewView(model: model) { [weak self] in
            self?.showBar()
        }, cornerRadius: 14, model: model)
        barWindow.contentView = GlassPanel.host(QuickBarView(
            model: model,
            close: { [weak self] in self?.dismissBar() },
            modeChanged: { [weak self] in self?.resizeBar() },
            startFocus: { [weak self] in self?.startFocus() },
            pin: { [weak self] in
                guard let self else { return }
                self.showWidget(mode: self.model.mode)
            },
            moveVertically: { [weak self] offset in self?.moveBarVertically(by: offset) }
        ), cornerRadius: CompanionLayout.glassRadius,
           ornament: AnyView(PanelPetOrnament(model: model, close: { [weak self] in self?.dismissBar() })),
           model: model)
        widgetWindow.contentView = GlassPanel.host(CompactWidgetView(
            model: model,
            collapse: { [weak self] in self?.collapseWidget() },
            modeChanged: { [weak self] in self?.resizeWidget() },
            moveVertically: { [weak self] offset in self?.moveWidgetVertically(by: offset) },
            startFocus: { [weak self] in self?.startFocus() }
        ), cornerRadius: CompanionLayout.glassRadius,
           ornament: AnyView(PanelPetOrnament(model: model, close: { [weak self] in self?.collapseWidget() })),
           model: model)

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
                else {
                    let visible = self.petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
                    if let visible {
                        self.petWindow.setFrameOrigin(PanelGeometry.fitted(self.petWindow.frame, in: visible).origin)
                    }
                    self.placeTransientWindows()
                }
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
            // Other app windows (e.g. the material lab) own their keyboard input.
            // Focus mode retains its app-wide emergency Escape handling.
            if !self.model.isFocused {
                let source = event.window ?? NSApp.keyWindow
                guard [self.petWindow, self.previewWindow, self.barWindow, self.widgetWindow]
                    .contains(where: { $0 === source }) else { return event }
            }
            let widgetVisible = self.isRequestedVisible(self.widgetWindow)
            let utilityVisible = widgetVisible || self.isRequestedVisible(self.barWindow)
            if !self.model.isFocused, utilityVisible, event.type == .keyDown,
               event.modifierFlags.intersection([.command, .control, .option]) == .command {
                if let character = event.charactersIgnoringModifiers?.first,
                   let destination = QuickMode.allCases.first(where: { $0.shortcut == character }) {
                    withAnimation(PetMotion.panel) {
                        if widgetVisible { self.model.compactMode = destination }
                        else { self.model.mode = destination }
                    }
                    if widgetVisible {
                        self.model.compactOpenRevision += 1
                        self.resizeWidget()
                    } else {
                        self.model.quickOpenRevision += 1
                        self.resizeBar()
                    }
                    return nil
                }
                if event.charactersIgnoringModifiers == "s" {
                    self.model.saveMemo()
                    return nil
                }
            }
            if !self.model.isFocused,
               utilityVisible,
               event.type == .keyDown,
               event.keyCode == 36,
               event.modifierFlags.contains(.command) {
                let mode = widgetVisible ? self.model.compactMode : self.model.mode
                if mode == .memo { self.model.continueMemoInCouncil() }
                else { self.model.openHub(mode) }
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
        model.quickOpenRevision += 1
        NSApp.activate(ignoringOtherApps: true)
    }

    private func dismissBar() { dismiss(barWindow) }

    func showWidget(mode: QuickMode = .tasks) {
        interactionLog.info("show dedicated widget")
        guard !model.isFocused else { return }
        if isRequestedVisible(widgetWindow) {
            widgetWindow.makeKeyAndOrderFront(nil)
            return
        }
        hideNow(previewWindow)
        hideNow(barWindow)
        model.compactMode = mode
        widgetWindow.setContentSize(Self.widgetSize(for: mode))
        placeWidget()
        petWindow.orderOut(nil)
        present(widgetWindow)
        NSApp.activate(ignoringOtherApps: true)
        model.compactOpenRevision += 1
    }

    private func collapseWidget() {
        guard isRequestedVisible(widgetWindow) else { return }
        dismiss(widgetWindow) { [weak self] in
            guard let self, !self.model.isFocused else { return }
            self.syncCompanionPet()
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
        if window === barWindow { model.activeCompanion = .quick }
        else if window === widgetWindow { model.activeCompanion = .widget }
        advanceRevision(for: window)
        desiredVisibility[ObjectIdentifier(window)] = true
        syncCompanionPet()
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
        releaseCaptureFocus(for: window)
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
                self.syncCompanionPet()
                completion?()
            }
        }
    }

    private func releaseCaptureFocus(for window: KeyPanel) {
        if (window === barWindow && model.activeCompanion == .quick)
            || (window === widgetWindow && model.activeCompanion == .widget) {
            model.activeCompanion = nil
        }
    }

    private func hideNow(_ window: KeyPanel) {
        releaseCaptureFocus(for: window)
        advanceRevision(for: window)
        desiredVisibility[ObjectIdentifier(window)] = false
        window.orderOut(nil)
        window.alphaValue = 1
        syncCompanionPet()
    }

    private func placePetInitially() {
        guard let visible = NSScreen.main?.visibleFrame else { return }
        petWindow.setFrameOrigin(NSPoint(
            x: visible.maxX - petWindow.frame.width - 8,
            y: visible.minY + visible.height / 3
        ))
    }

    private func placeTransientWindows() {
        (barWindow.contentView as? GlassPanel)?.showsOrnament = model.mode == .memo
        let pet = petWindow.frame
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? pet
        for window in [previewWindow, barWindow] {
            let size = window === barWindow ? Self.barSize(for: model.mode) : NSSize(width: 326, height: 130)
            let frame = NSRect(x: pet.minX - size.width - 10, y: pet.midY - size.height / 2,
                               width: size.width, height: size.height)
            window.setFrame(PanelGeometry.fitted(frame, in: visible), display: true)
        }
        placeWidget()
    }

    private func placeWidget() {
        let pet = petWindow.frame
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? pet
        let size = widgetWindow.frame.size
        let frame = NSRect(x: pet.maxX - size.width, y: pet.maxY - size.height,
                           width: size.width, height: size.height)
        widgetWindow.setFrame(PanelGeometry.fitted(frame, in: visible), display: true)
    }

    private func resizeWidget() {
        let size = Self.widgetSize(for: model.compactMode)
        let visible = widgetWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? widgetWindow.frame
        let frame = PanelGeometry.resizedKeepingTopRight(widgetWindow.frame, size: size, in: visible)
        alignPet(to: frame, in: visible)
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
        var frame = widgetWindow.frame
        frame.origin.y += offset
        frame = PanelGeometry.fitted(frame, in: visible)
        widgetWindow.setFrame(frame, display: true)
        alignPet(to: frame, in: visible)
    }

    private func alignPet(to frame: NSRect, in visible: NSRect) {
        var pet = petWindow.frame
        pet.origin.y = frame.maxY - pet.height
        petWindow.setFrameOrigin(PanelGeometry.fitted(pet, in: visible).origin)
    }

    private static func widgetSize(for mode: CompactMode) -> NSSize {
        CompanionLayout.size(for: mode)
    }

    private func resizeBar() {
        syncCompanionPet()
        let size = Self.barSize(for: model.mode)
        let visible = petWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? barWindow.frame
        let frame = PanelGeometry.resizedKeepingTopRight(barWindow.frame, size: size, in: visible)
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
        CompanionLayout.size(for: mode, perched: mode == .memo)
    }

    private func syncCompanionPet() {
        (barWindow.contentView as? GlassPanel)?.showsOrnament = model.mode == .memo
        guard !model.isFocused else { return }
        let perched = isRequestedVisible(widgetWindow)
            || (isRequestedVisible(barWindow) && model.mode == .memo)
        if perched { petWindow.orderOut(nil) }
        else { petWindow.orderFrontRegardless() }
    }

    private func moveBarVertically(by offset: CGFloat) {
        let visible = barWindow.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? barWindow.frame
        let previous = barWindow.frame
        let frame = PanelGeometry.fitted(previous.offsetBy(dx: 0, dy: offset), in: visible)
        barWindow.setFrame(frame, display: true)
        let pet = petWindow.frame.offsetBy(dx: 0, dy: frame.minY - previous.minY)
        petWindow.setFrameOrigin(PanelGeometry.fitted(pet, in: visible).origin)
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
