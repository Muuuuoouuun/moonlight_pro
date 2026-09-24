import AppKit
import OSLog
import SwiftUI

/// A thin control layer on the shared material, without another glass surface.
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
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Palette.glassInk)
            .padding(.horizontal, compact ? 0 : 12)
            .frame(minWidth: 32, minHeight: 32)
            .background(Palette.glassInk.opacity(pressed ? 0.20 : hovered ? 0.14 : 0.09),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Palette.glassInk.opacity(increasedContrast ? 0.6 : 0.10), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
            .background(Palette.glassInk.opacity(focused ? 0.035 : 0.055),
                        in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
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
        Image(systemName: "line.3.horizontal")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(hovered ? Palette.glassInk : Palette.glassInkFaint)
            .frame(width: 32, height: 32)
            .background(Palette.glassInk.opacity(hovered ? 0.07 : 0), in: RoundedRectangle(cornerRadius: 8))
            .overlay { ScreenDragSurface(move: move).frame(width: 32, height: 32) }
            .onHover { hovered = $0 }
            .animation(PetMotion.hover, value: hovered)
            .help("위아래로 드래그하여 이동")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("위젯 위치 이동")
            .accessibilityAction(named: Text("위로 이동")) { move(24) }
            .accessibilityAction(named: Text("아래로 이동")) { move(-24) }
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
            drag.begin(at: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation)
            NSCursor.closedHand.set()
        }
        override func mouseDragged(with event: NSEvent) {
            if let offset = drag.translation(to: window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation) {
                log.debug("widget drag delta=\(offset)")
                move(offset)
            }
        }
        override func mouseUp(with event: NSEvent) {
            log.info("widget drag ended activated=\(self.drag.isDragging)")
            drag.end()
            NSCursor.openHand.set()
        }
    }
}
