import AppKit
import SwiftUI

/// SecureField's field editor can consume Tab before SwiftUI's key handlers.
/// This bridge only handles events delivered to its visible login window.
struct LoginTabNavigation: NSViewRepresentable {
    var move: (Bool) -> Bool

    func makeNSView(context: Context) -> KeyView { KeyView(move: move) }
    func updateNSView(_ view: KeyView, context: Context) { view.move = move }
    static func dismantleNSView(_ view: KeyView, coordinator: ()) { view.stopMonitoring() }

    static func backwards(for event: NSEvent, window: NSWindow?) -> Bool? {
        guard event.type == .keyDown, event.keyCode == 48,
              let window, window.isVisible,
              (event.window ?? NSApp.keyWindow) === window,
              event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return nil }
        return event.modifierFlags.contains(.shift)
    }

    final class KeyView: NSView {
        var move: (Bool) -> Bool
        private var monitor: Any?

        init(move: @escaping (Bool) -> Bool) {
            self.move = move
            super.init(frame: .zero)
        }
        required init?(coder: NSCoder) { nil }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, let backwards = LoginTabNavigation.backwards(for: event, window: self.window),
                      self.move(backwards) else { return event }
                return nil
            }
        }
        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
        deinit { if let monitor { NSEvent.removeMonitor(monitor) } }
    }
}
