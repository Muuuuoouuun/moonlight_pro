import AppKit
import OSLog
import SwiftUI

/// Controls add shallow separation above the panel's clear optical material.
struct GlassActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorSchemeContrast) private var contrast
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        GlassActionBody(label: configuration.label, pressed: configuration.isPressed,
                        enabled: isEnabled, increasedContrast: contrast == .increased, compact: compact)
    }
}

private struct GlassActionBody<Label: View>: View {
    let label: Label
    let pressed: Bool
    let enabled: Bool
    let increasedContrast: Bool
    let compact: Bool
    @State private var hovered = false

    var body: some View {
        label
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Palette.glassInk)
            .padding(.horizontal, compact ? 0 : 16)
            .frame(minWidth: 32, minHeight: compact ? 32 : 38)
            .background(Palette.glassInk.opacity(pressed ? 0.12 : hovered ? 0.08 : 0.035),
                        in: RoundedRectangle(cornerRadius: compact ? 10 : 19, style: .continuous))
            .modifier(GlassReadability(radius: compact ? 10 : 19, feather: 0))
            .overlay {
                GlassRim(radius: compact ? 10 : 19, strength: increasedContrast ? 1 : 0.65)
            }
            .contentShape(RoundedRectangle(cornerRadius: compact ? 10 : 19, style: .continuous))
            .scaleEffect(pressed && !PetMotion.reduceMotion ? 0.97 : 1)
            .opacity(enabled ? 1 : 0.4)
            .onHover { hovered = $0 && enabled }
            .animation(PetMotion.hover, value: hovered)
            .animation(pressed ? PetMotion.petPress : PetMotion.petRelease, value: pressed)
    }
}

struct GlassInputSurface: ViewModifier {
    var focused: Bool
    var inkOverride: Color? = nil
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        content
            .background(Palette.glassControlFill.opacity(focused ? 0.075 : 0.045),
                        in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .modifier(GlassReadability(radius: 13, feather: 0))
            .overlay {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .strokeBorder((inkOverride ?? Palette.glassInk).opacity(contrast == .increased ? 0.65 : focused ? 0.32 : 0.12),
                                  lineWidth: 1)
                    .allowsHitTesting(false)
            }
            .animation(PetMotion.hover, value: focused)
    }
}

struct GlassRowSurface: ViewModifier {
    @State private var hovered = false

    func body(content: Content) -> some View {
        content
            .background(Palette.glassInk.opacity(hovered ? 0.05 : 0),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(Rectangle())
            .onHover { hovered = $0 }
            .animation(PetMotion.hover, value: hovered)
    }
}

struct PanelDragHandle: View {
    let move: (PanelMove) -> Void
    @State private var hovered = false

    var body: some View {
        Capsule()
            .fill(Palette.glassInk.opacity(hovered ? 0.30 : 0.16))
            .overlay { Capsule().strokeBorder(Palette.glassLight.opacity(0.22), lineWidth: 1) }
            .frame(width: 38, height: 4)
            .frame(maxWidth: .infinity, minHeight: 20)
            .overlay { ScreenDragSurface(move: move) }
            .onHover { hovered = $0 }
            .animation(PetMotion.hover, value: hovered)
            .help("드래그하여 다른 모니터로 이동")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("위젯 위치 이동")
            .accessibilityAction(named: Text("위로 이동")) { move(.nudge(CGPoint(x: 0, y: 24))) }
            .accessibilityAction(named: Text("아래로 이동")) { move(.nudge(CGPoint(x: 0, y: -24))) }
            .accessibilityAction(named: Text("왼쪽으로 이동")) { move(.nudge(CGPoint(x: -24, y: 0))) }
            .accessibilityAction(named: Text("오른쪽으로 이동")) { move(.nudge(CGPoint(x: 24, y: 0))) }
            .accessibilityAction(named: Text("다음 모니터로 이동")) { move(.nextDisplay) }
    }
}

/// Fine edge light stays on the contour and never paints a haze over the content.
struct GlassRim: View {
    var radius: CGFloat
    var strength: Double = 1
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .strokeBorder(LinearGradient(colors: [
                Palette.glassLight.opacity(0.62 * strength),
                Palette.glassLight.opacity(0.14 * strength),
                Palette.glassInk.opacity(contrast == .increased ? 0.6 : 0.10 * strength),
                Palette.glassLight.opacity(0.34 * strength)
            ], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

struct GlassQuietStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Palette.glassInkMuted)
            .modifier(GlassRowSurface())
            .opacity(configuration.isPressed ? 0.65 : 1)
            .scaleEffect(configuration.isPressed && !PetMotion.reduceMotion ? 0.98 : 1)
            .animation(configuration.isPressed ? PetMotion.petPress : PetMotion.petRelease,
                       value: configuration.isPressed)
    }
}

/// Used inside the opaque focus window; floating utility windows use GlassPanel.
struct GlassSurface: ViewModifier {
    var radius: CGFloat
    func body(content: Content) -> some View {
        Group {
            if #available(macOS 26.0, *) {
                content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            } else {
                content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            }
        }
        .overlay { OpticalGlassRim(radius: radius).allowsHitTesting(false).accessibilityHidden(true) }
        .shadow(color: Palette.glassShadow.opacity(0.18), radius: 12, y: 5)
    }
}

struct ScreenDragSurface: NSViewRepresentable {
    let move: (PanelMove) -> Void
    var click: (() -> Void)? = nil
    var pressed: ((Bool) -> Void)? = nil
    var clickEvent: ((NSEvent) -> Void)? = nil

    func makeNSView(context: Context) -> DragView {
        DragView(move: move, click: click, pressed: pressed, clickEvent: clickEvent)
    }
    func updateNSView(_ view: DragView, context: Context) {
        view.move = move; view.click = click; view.pressed = pressed
        view.clickEvent = clickEvent
    }

    final class DragView: NSView {
        private let log = Logger(subsystem: "app.moonlight.pet-preview", category: "interaction")
        var move: (PanelMove) -> Void
        var click: (() -> Void)?
        var pressed: ((Bool) -> Void)?
        var clickEvent: ((NSEvent) -> Void)?
        private var drag = ScreenDragTracker()
        private weak var dragWindow: NSWindow?

        init(move: @escaping (PanelMove) -> Void, click: (() -> Void)?, pressed: ((Bool) -> Void)?,
             clickEvent: ((NSEvent) -> Void)? = nil) {
            self.move = move; self.click = click; self.pressed = pressed
            self.clickEvent = clickEvent
            super.init(frame: .zero)
        }
        required init?(coder: NSCoder) { nil }
        override var intrinsicContentSize: NSSize { NSSize(width: 32, height: 32) }
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
        override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }
        override func mouseDown(with event: NSEvent) {
            log.info("widget drag began width=\(self.bounds.width) height=\(self.bounds.height)")
            dragWindow = window
            pressed?(true)
            PetGlassDrag.begin(in: dragWindow)
            drag.begin(at: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)
            NSCursor.closedHand.set()
        }
        override func mouseDragged(with event: NSEvent) {
            let pointer = window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation
            if let offset = drag.translation(to: pointer) {
                PetGlassDrag.update(in: dragWindow)
                move(.drag(delta: offset, pointer: pointer))
            }
        }
        override func mouseUp(with event: NSEvent) {
            log.info("widget drag ended activated=\(self.drag.isDragging)")
            if drag.isDragging { move(.finish(pointer: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)) }
            else if bounds.contains(convert(event.locationInWindow, from: nil)) {
                if let clickEvent { clickEvent(event) } else { click?() }
            }
            pressed?(false)
            drag.end()
            PetGlassDrag.end(in: dragWindow)
            dragWindow = nil
            NSCursor.openHand.set()
        }

        override func viewWillMove(toWindow newWindow: NSWindow?) {
            if newWindow !== window {
                if drag.isDragging { move(.finish(pointer: NSEvent.mouseLocation)) }
                pressed?(false)
                PetGlassDrag.end(in: dragWindow)
                dragWindow = nil
                drag.end()
            }
            super.viewWillMove(toWindow: newWindow)
        }

        override func rightMouseDown(with event: NSEvent) {
            guard NSScreen.screens.count > 1 else { return }
            let menu = NSMenu()
            let item = NSMenuItem(title: "다음 모니터로 이동", action: #selector(nextDisplay), keyEquivalent: "")
            item.target = self
            menu.addItem(item)
            NSMenu.popUpContextMenu(menu, with: event, for: self)
        }

        @objc private func nextDisplay() { move(.nextDisplay) }
    }
}
