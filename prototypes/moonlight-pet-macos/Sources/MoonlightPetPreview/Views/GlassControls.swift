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
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        content
            .background(Palette.glassControlFill.opacity(focused ? 0.075 : 0.045),
                        in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .modifier(GlassReadability(radius: 13, feather: 0))
            .overlay {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .strokeBorder(Palette.glassInk.opacity(contrast == .increased ? 0.65 : focused ? 0.32 : 0.12),
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
    let move: (CGFloat) -> Void
    @State private var hovered = false

    var body: some View {
        Capsule()
            .fill(Palette.glassInk.opacity(hovered ? 0.30 : 0.16))
            .overlay { Capsule().strokeBorder(Palette.glassLight.opacity(0.22), lineWidth: 1) }
            .frame(width: 38, height: 4)
            .frame(width: 56, height: 20)
            .overlay { ScreenDragSurface(move: move) }
            .onHover { hovered = $0 }
            .animation(PetMotion.hover, value: hovered)
            .help("위아래로 드래그하여 이동")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("위젯 위치 이동")
            .accessibilityAction(named: Text("위로 이동")) { move(24) }
            .accessibilityAction(named: Text("아래로 이동")) { move(-24) }
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

private struct ScreenDragSurface: NSViewRepresentable {
    let move: (CGFloat) -> Void

    func makeNSView(context: Context) -> DragView { DragView(move: move) }
    func updateNSView(_ view: DragView, context: Context) { view.move = move }

    final class DragView: NSView {
        private let log = Logger(subsystem: "app.moonlight.pet-preview", category: "interaction")
        var move: (CGFloat) -> Void
        private var drag = ScreenDragTracker()
        private weak var dragWindow: NSWindow?

        init(move: @escaping (CGFloat) -> Void) {
            self.move = move
            super.init(frame: .zero)
        }
        required init?(coder: NSCoder) { nil }
        override var intrinsicContentSize: NSSize { NSSize(width: 32, height: 32) }
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
        override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }
        override func mouseDown(with event: NSEvent) {
            log.info("widget drag began width=\(self.bounds.width) height=\(self.bounds.height)")
            dragWindow = window
            PetGlassDrag.begin(in: dragWindow)
            drag.begin(at: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)
            NSCursor.closedHand.set()
        }
        override func mouseDragged(with event: NSEvent) {
            if let offset = drag.translation(to: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation) {
                log.debug("widget drag delta=\(offset)")
                PetGlassDrag.update(in: dragWindow)
                move(offset)
            }
        }
        override func mouseUp(with event: NSEvent) {
            log.info("widget drag ended activated=\(self.drag.isDragging)")
            drag.end()
            PetGlassDrag.end(in: dragWindow)
            dragWindow = nil
            NSCursor.openHand.set()
        }

        override func viewWillMove(toWindow newWindow: NSWindow?) {
            if newWindow !== window {
                PetGlassDrag.end(in: dragWindow)
                dragWindow = nil
                drag.end()
            }
            super.viewWillMove(toWindow: newWindow)
        }
    }
}
