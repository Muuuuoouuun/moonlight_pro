import AppKit

private final class LoginTestWindow: NSWindow {
    var testVisible = true
    var testKey = true
    override var isVisible: Bool { testVisible }
    override var isKeyWindow: Bool { testKey }
}

@main
enum LoginTabNavigationTests {
    @MainActor static func main() {
        _ = NSApplication.shared
        let window = LoginTestWindow(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
        let other = LoginTestWindow(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
        func event(_ flags: NSEvent.ModifierFlags = [], key: UInt16 = 48,
                   type: NSEvent.EventType = .keyDown, number: Int? = nil) -> NSEvent {
            NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags, timestamp: 0,
                windowNumber: number ?? window.windowNumber, context: nil,
                characters: flags.contains(.shift) ? "\u{19}" : "\t",
                charactersIgnoringModifiers: "\t", isARepeat: false, keyCode: key)!
        }
        precondition(LoginTabNavigation.backwards(for: event(), window: window) == false, "Forward Tab")
        precondition(LoginTabNavigation.backwards(for: event(.shift), window: window) == true, "Secure editor backtab")
        for flags: NSEvent.ModifierFlags in [.command, .control, .option, [.shift, .command]] {
            precondition(LoginTabNavigation.backwards(for: event(flags), window: window) == nil, "Modified shortcut")
        }
        precondition(LoginTabNavigation.backwards(for: event(key: 36), window: window) == nil, "Return belongs to submit")
        precondition(LoginTabNavigation.backwards(for: event(type: .keyUp), window: window) == nil, "Key-up passes through")
        precondition(LoginTabNavigation.backwards(for: event(number: other.windowNumber), window: window) == nil, "Other window")
        precondition(LoginTabNavigation.backwards(for: event(), window: nil) == nil, "Detached form")
        window.testVisible = false
        precondition(LoginTabNavigation.backwards(for: event(), window: window) == nil, "Hidden form")
        window.testVisible = true; window.testKey = false
        precondition(LoginTabNavigation.backwards(for: event(.shift), window: window) == true,
                     "A nonactivating panel can receive its own keyboard events without becoming key")
        let view = LoginTabNavigation.KeyView { _ in false }
        window.contentView = view
        view.stopMonitoring(); view.stopMonitoring()
        window.contentView = nil
        print("PASS: login Tab/backtab, shortcut and window isolation, idempotent monitor cleanup (13)")
    }
}
