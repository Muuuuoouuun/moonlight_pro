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
    var onNotifications: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onMove: ((PanelMove) -> Void)?
    var onDragBegan: (() -> Void)?
    var onDragEnded: (() -> Void)?
    private var drag = ScreenDragTracker()
    private var pendingClick: DispatchWorkItem?

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
        pendingClick?.cancel()
        pendingClick = nil
        let menu = NSMenu(title: "펫 캐릭터")
        let notices = NSMenuItem(title: "알림 보기", action: #selector(openNotifications), keyEquivalent: "")
        notices.target = self
        menu.addItem(notices)
        if NSScreen.screens.count > 1 {
            let move = NSMenuItem(title: "다음 모니터로 이동", action: #selector(moveToNextDisplay), keyEquivalent: "")
            move.target = self
            menu.addItem(move)
        }
        menu.addItem(.separator())
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

    @objc private func openNotifications() { onNotifications?() }
    @objc private func moveToNextDisplay() { onMove?(.nextDisplay) }

    @objc private func selectCharacter(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let character = PetCharacter(rawValue: rawValue) else { return }
        withAnimation(PetMotion.petCharacter) { model.selectedCharacter = character }
    }

    override func mouseDown(with event: NSEvent) {
        pendingClick?.cancel()
        pendingClick = nil
        interactionLog.info("pet mouseDown count=\(event.clickCount)")
        drag.begin(at: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)
        interaction.isDragging = false
        interaction.isPressed = true
    }

    override func mouseUp(with event: NSEvent) {
        if drag.isDragging { onMove?(.finish(pointer: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)) }
        defer {
            onDragEnded?()
            drag.end()
            interaction.isPressed = false
            interaction.isDragging = false
        }
        if !drag.isDragging && bounds.contains(convert(event.locationInWindow, from: nil)) {
            if event.clickCount == 1 {
                // Opening a perched memo hides this window. Wait for the system's
                // double-click interval so its first click cannot eat the second.
                let click = DispatchWorkItem { [weak self] in
                    self?.pendingClick = nil
                    self?.onClick?()
                }
                pendingClick = click
                DispatchQueue.main.asyncAfter(deadline: .now() + NSEvent.doubleClickInterval, execute: click)
            } else if event.clickCount == 2 { onDoubleClick?() }
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let wasDragging = drag.isDragging
        let pointer = window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation
        guard let offset = drag.translation(to: pointer) else { return }
        if !wasDragging { onDragBegan?() }
        interaction.isPressed = false
        interaction.isDragging = true
        onMove?(.drag(delta: offset, pointer: pointer))
    }
}

final class ShieldWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class WindowCoordinator: NSObject {
    private let model: AppModel
    private let defaults: UserDefaults
    private var savedPlacement: SavedPetPlacement?
    private var companionAnchor: CompanionAnchor?
    private static let placementKey = "petPreview.placement.v1"
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
    private var bannerTimer: Timer?
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var desiredVisibility: [ObjectIdentifier: Bool] = [:]
    private var transitionRevisions: [ObjectIdentifier: Int] = [:]

    init(model: AppModel, defaults: UserDefaults = .standard) {
        self.model = model
        self.defaults = defaults
        savedPlacement = defaults.data(forKey: Self.placementKey)
            .flatMap { try? JSONDecoder().decode(SavedPetPlacement.self, from: $0) }
        companionAnchor = savedPlacement?.companionAnchor
        petWindow = Self.panel(size: NSSize(width: 56, height: 56))
        previewWindow = Self.panel(size: NSSize(width: 326, height: 130))
        barWindow = Self.panel(size: Self.barSize(for: model.mode))
        widgetWindow = Self.panel(size: Self.widgetSize(for: model.compactMode))
        super.init()

        let petClickView = PetClickView(frame: NSRect(origin: .zero, size: petWindow.frame.size), model: model)
        petClickView.onClick = { [weak self] in self?.toggleBar() }
        petClickView.onNotifications = { [weak self] in self?.openMode(.notifications) }
        petClickView.onDoubleClick = { [weak self] in self?.showWidget() }
        petClickView.onDragBegan = { [weak self] in
            guard let self else { return }
            for panel in [self.previewWindow, self.barWindow, self.widgetWindow] where self.isRequestedVisible(panel) {
                PetGlassDrag.begin(in: panel)
            }
        }
        petClickView.onMove = { [weak self] movement in
            guard let self else { return }
            self.move(self.petWindow, movement)
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
            move: { [weak self] movement in
                guard let self else { return }; self.move(self.barWindow, movement)
            }
        ), cornerRadius: CompanionLayout.glassRadius,
           ornament: AnyView(PanelPetOrnament(model: model, close: { [weak self] in self?.dismissBar() },
                move: { [weak self] movement in
                    guard let self else { return }; self.move(self.barWindow, movement)
                })),
           model: model, protectsText: true, captureSurface: .quick)
        widgetWindow.contentView = GlassPanel.host(CompactWidgetView(
            model: model,
            collapse: { [weak self] in self?.collapseWidget() },
            modeChanged: { [weak self] in self?.resizeWidget() },
            move: { [weak self] movement in
                guard let self else { return }; self.move(self.widgetWindow, movement)
            },
            startFocus: { [weak self] in self?.startFocus() }
        ), cornerRadius: CompanionLayout.glassRadius,
           ornament: AnyView(PanelPetOrnament(model: model, close: { [weak self] in self?.collapseWidget() },
                move: { [weak self] movement in
                    guard let self else { return }; self.move(self.widgetWindow, movement)
                })),
           model: model, protectsText: true, captureSurface: .widget)

        model.onOpenMode = { [weak self] mode in self?.openMode(mode) }
        model.activity.onBanner = { [weak self] notice in self?.presentNotice(notice) ?? false }
        model.activity.onBannerDismissed = { [weak self] in
            guard let self else { return }
            self.bannerTimer?.invalidate()
            self.dismiss(self.previewWindow)
        }
        model.onFocusFinished = { [weak self] in self?.endFocus() }
        placePetInitially()
        placeTransientWindows()
        if savedPlacement == nil { savePlacement() }
        registerHotKey()
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.restorePlacement()
                if self.model.isFocused { self.rebuildShields() }
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
                if event.charactersIgnoringModifiers == "s", !self.model.isConnectionVisible {
                    let mode = widgetVisible ? self.model.compactMode : self.model.mode
                    if mode == .memo { self.model.saveMemoToHub() }
                    else { self.model.saveMemo() }
                    return nil
                }
            }
            if !self.model.isFocused, !self.model.isConnectionVisible,
               utilityVisible,
               event.type == .keyDown,
               MemoShortcut.matches(event, mode: widgetVisible ? self.model.compactMode : self.model.mode) {
                let mode = widgetVisible ? self.model.compactMode : self.model.mode
                self.model.performPrimaryShortcut(for: mode)
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
        bannerTimer?.invalidate()
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let hotKeyHandler { RemoveEventHandler(hotKeyHandler) }
    }

    func showPet() { petWindow.orderFrontRegardless() }

    func openMode(_ mode: QuickMode) {
        guard !model.isFocused else { return }
        model.activity.dismissBanner()
        if isRequestedVisible(widgetWindow) {
            model.compactMode = mode
            model.compactOpenRevision += 1
            resizeWidget()
            widgetWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } else {
            model.mode = mode
            resizeBar()
            showBar()
        }
    }

    private func presentNotice(_ notice: PetNotice) -> Bool {
        guard !model.isFocused, model.activeCompanion == nil,
              !isRequestedVisible(previewWindow) else { return false }
        placeTransientWindows()
        // Passive pet messages must never steal an editor's key window.
        present(previewWindow, activate: false)
        bannerTimer?.invalidate()
        bannerTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.model.activity.banner?.id == notice.id else { return }
                self.model.activity.dismissBanner()
            }
        }
        return true
    }

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
        model.activity.dismissBanner()
        if isRequestedVisible(widgetWindow) { collapseWidget() }
        dismiss(previewWindow)
        placeTransientWindows()
        if model.mode == .memo {
            alignPet(to: barWindow.frame, companion: barWindow, in: visibleFrame(for: barWindow))
            savePlacement()
        }
        present(barWindow)
        model.quickOpenRevision += 1
        NSApp.activate(ignoringOtherApps: true)
    }

    private func dismissBar() { dismiss(barWindow) }

    func showWidget(mode: QuickMode = .tasks) {
        interactionLog.info("show dedicated widget")
        guard !model.isFocused else { return }
        model.activity.dismissBanner()
        if isRequestedVisible(widgetWindow) {
            model.compactMode = mode
            model.compactOpenRevision += 1
            resizeWidget()
            widgetWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        hideNow(previewWindow)
        hideNow(barWindow)
        model.compactMode = mode
        widgetWindow.setContentSize(Self.widgetSize(for: mode))
        placeWidget()
        alignPet(to: widgetWindow.frame, companion: widgetWindow, in: visibleFrame(for: widgetWindow))
        savePlacement()
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

    private func present(_ window: KeyPanel, activate: Bool = true) {
        // Utility surfaces share one workflow. Finish any outgoing fade before
        // showing its replacement, including a panel already marked dismissed.
        for other in [previewWindow, barWindow, widgetWindow]
            where other !== window && (other.isVisible || isRequestedVisible(other)) {
            hideNow(other)
        }
        if window === barWindow { model.activeCompanion = .quick }
        else if window === widgetWindow { model.activeCompanion = .widget }
        advanceRevision(for: window)
        desiredVisibility[ObjectIdentifier(window)] = true
        syncCompanionPet()
        let targetFrame = window.frame
        let wasVisible = window.isVisible
        if PetMotion.reduceMotion {
            window.alphaValue = 1
            if activate { window.makeKeyAndOrderFront(nil) } else { window.orderFrontRegardless() }
            return
        }
        if !wasVisible {
            window.alphaValue = 0
            var startFrame = targetFrame
            startFrame.origin.x += 4
            window.setFrame(startFrame, display: false)
        }
        if activate { window.makeKeyAndOrderFront(nil) } else { window.orderFrontRegardless() }
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
                self.resumeNotices(after: window)
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
        resumeNotices(after: window)
    }

    private func resumeNotices(after window: KeyPanel) {
        guard window === barWindow || window === widgetWindow else { return }
        Task { @MainActor [weak self] in
            guard let self, self.model.activeCompanion == nil,
                  !self.isRequestedVisible(self.barWindow), !self.isRequestedVisible(self.widgetWindow) else { return }
            self.model.activity.presentNext()
        }
    }

    private func placePetInitially() {
        if let frame = savedPlacement?.restored(size: petWindow.frame.size, displays: displays) {
            petWindow.setFrameOrigin(frame.origin)
            return
        }
        guard let visible = NSScreen.main?.visibleFrame else { return }
        petWindow.setFrameOrigin(NSPoint(
            x: visible.maxX - petWindow.frame.width - 8,
            y: visible.minY + visible.height / 3
        ))
    }

    private func placeTransientWindows() {
        (barWindow.contentView as? GlassPanel)?.showsOrnament = model.mode == .memo
        let pet = petWindow.frame
        let visible = visibleFrame(for: petWindow)
        for window in [previewWindow, barWindow] {
            let size = window === barWindow ? Self.barSize(for: model.mode) : NSSize(width: 326, height: 130)
            let frame = PanelGeometry.companion(size: size, pet: pet,
                perched: window === barWindow && model.mode == .memo,
                anchor: window === barWindow ? companionAnchor : nil, in: visible)
            window.setFrame(frame, display: true)
        }
        placeWidget()
    }

    private func placeWidget() {
        let pet = petWindow.frame
        let visible = visibleFrame(for: petWindow)
        let size = Self.widgetSize(for: model.compactMode)
        widgetWindow.setFrame(PanelGeometry.companion(size: size, pet: pet, perched: true, in: visible), display: true)
    }

    private func resizeWidget() {
        let size = Self.widgetSize(for: model.compactMode)
        let visible = visibleFrame(for: widgetWindow)
        let frame = PanelGeometry.resizedKeepingTopRight(widgetWindow.frame, size: size, in: visible)
        alignPet(to: frame, companion: widgetWindow, in: visible)
        savePlacement()
        if PetMotion.reduceMotion { widgetWindow.setFrame(frame, display: true) }
        else {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = PetMotion.panelDuration
                context.timingFunction = PetMotion.timingFunction
                widgetWindow.animator().setFrame(frame, display: true)
            }
        }
    }

    private var displays: [PanelDisplay] {
        NSScreen.screens.compactMap { screen in
            guard let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
            return PanelDisplay(id: id.uint32Value, frame: screen.frame, visibleFrame: screen.visibleFrame)
        }
    }

    private func visibleFrame(for window: NSWindow) -> CGRect {
        PanelGeometry.display(for: window.frame, in: displays)?.visibleFrame
            ?? NSScreen.main?.visibleFrame ?? window.frame
    }

    /// All three surfaces use global pointer coordinates. Clamp only on release,
    /// so the old screen's edge cannot swallow motion toward another screen.
    private func move(_ window: KeyPanel, _ movement: PanelMove) {
        let frame: CGRect
        let destination: PanelDisplay?
        let finished: Bool
        switch movement {
        case let .drag(delta, pointer):
            frame = window.frame.offsetBy(dx: delta.x, dy: delta.y)
            destination = PanelGeometry.display(at: pointer, in: displays)
            finished = false
        case let .finish(pointer):
            frame = window.frame
            destination = PanelGeometry.display(at: pointer, in: displays)
            finished = true
        case let .nudge(delta):
            frame = window.frame.offsetBy(dx: delta.x, dy: delta.y)
            let leadingEdge = CGPoint(x: delta.x < 0 ? frame.minX : delta.x > 0 ? frame.maxX : frame.midX,
                                      y: delta.y < 0 ? frame.minY : delta.y > 0 ? frame.maxY : frame.midY)
            destination = PanelGeometry.display(at: leadingEdge, in: displays)
            finished = true
        case .nextDisplay:
            let screens = displays
            guard screens.count > 1,
                  let current = PanelGeometry.display(for: window.frame, in: screens),
                  let index = screens.firstIndex(where: { $0.id == current.id }) else { return }
            let next = screens[(index + 1) % screens.count]
            destination = next
            frame = SavedPetPlacement(frame: window.frame, display: current)
                .restored(size: window.frame.size, displays: [next]) ?? window.frame
            finished = true
        }
        guard let destination else { return }
        let visible = destination.visibleFrame
        let placed = finished ? PanelGeometry.fitted(frame, in: visible) : frame
        window.setFrame(placed, display: true)
        if window === petWindow {
            // Avoid resizing hidden glass/Metal surfaces for every pointer event.
            if finished || isRequestedVisible(barWindow) || isRequestedVisible(previewWindow) {
                placeTransientWindows()
            }
        } else {
            alignPet(to: placed, companion: window, in: visible)
        }
        if finished { savePlacement(userMoved: true) }
    }

    private func alignPet(to frame: NSRect, companion: KeyPanel, in visible: NSRect) {
        let perched = companion === widgetWindow || (companion === barWindow && model.mode == .memo)
        let pet = PanelGeometry.pet(size: petWindow.frame.size, companion: frame,
            perched: perched, in: visible)
        companionAnchor = perched ? nil : CompanionAnchor(companion: frame, pet: pet)
        petWindow.setFrameOrigin(pet.origin)
    }

    private func savePlacement(userMoved: Bool = false) {
        // Opening/resizing on a temporary fallback monitor is not an explicit
        // move away from the disconnected preferred display.
        if !userMoved, let savedPlacement, !displays.contains(where: { $0.id == savedPlacement.displayID }) { return }
        guard let display = PanelGeometry.display(for: petWindow.frame, in: displays) else { return }
        let placement = SavedPetPlacement(frame: petWindow.frame, display: display, companionAnchor: companionAnchor)
        guard let data = try? JSONEncoder().encode(placement) else { return }
        savedPlacement = placement
        defaults.set(data, forKey: Self.placementKey)
    }

    private func restorePlacement() {
        companionAnchor = savedPlacement?.companionAnchor
        placePetInitially()
        placeTransientWindows()
    }

    private static func widgetSize(for mode: CompactMode) -> NSSize {
        CompanionLayout.size(for: mode)
    }

    private func resizeBar() {
        syncCompanionPet()
        let size = Self.barSize(for: model.mode)
        guard isRequestedVisible(barWindow) else {
            // A hidden bar may still be on the previous monitor after moving a
            // pinned widget. It must inherit the pet's current anchor, not own it.
            barWindow.setContentSize(size)
            placeTransientWindows()
            return
        }
        let visible = visibleFrame(for: barWindow)
        let frame = PanelGeometry.resizedKeepingTopRight(barWindow.frame, size: size, in: visible)
        alignPet(to: frame, companion: barWindow, in: visible)
        savePlacement()
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

    private func startFocus() {
        model.activity.dismissBanner()
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
        model.activity.presentNext()
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

/// Control-Return is a memo-only alias; plain Return still inserts a newline.
enum MemoShortcut {
    static func matches(_ event: NSEvent, mode: QuickMode) -> Bool {
        guard event.keyCode == 36 || event.keyCode == 76 else { return false }
        let flags = event.modifierFlags.intersection([.command, .control, .option, .shift])
        return flags == .command || (mode == .memo && flags == .control)
    }
}
