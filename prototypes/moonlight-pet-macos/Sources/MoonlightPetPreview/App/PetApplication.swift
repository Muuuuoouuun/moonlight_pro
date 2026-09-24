import AppKit

@main
enum MoonlightPetPreviewMain {
    static func main() {
        if CommandLine.arguments.contains("--self-check") {
            let passed = SelfCheck.run()
            exit(passed ? 0 : 1)
        }
        let application = NSApplication.shared
        application.appearance = NSAppearance(named: .darkAqua)
        let delegate = PetAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        application.run()
        withExtendedLifetime(delegate) {}
    }
}

@MainActor
final class PetAppDelegate: NSObject, NSApplicationDelegate {
    private let model = AppModel()
    private var coordinator: WindowCoordinator?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let coordinator = WindowCoordinator(model: model)
        self.coordinator = coordinator
        coordinator.showPet()

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "☾"
        item.button?.toolTip = "Moonlight 빠른 기능"
        let menu = NSMenu()
        let openItem = NSMenuItem(title: "빠른 기능 열기", action: #selector(toggleBar), keyEquivalent: "m")
        openItem.keyEquivalentModifierMask = [.control, .option]
        openItem.target = self
        menu.addItem(openItem)
        let messageItem = NSMenuItem(title: "짧은 메시지 보기", action: #selector(togglePreview), keyEquivalent: "")
        messageItem.target = self
        menu.addItem(messageItem)
        let hubItem = NSMenuItem(title: "Hub 열기", action: #selector(openHub), keyEquivalent: "")
        hubItem.target = self
        menu.addItem(hubItem)
        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "목업 종료", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        item.menu = menu
        statusItem = item
    }

    @objc private func toggleBar() { coordinator?.toggleBar() }
    @objc private func togglePreview() { coordinator?.togglePreview() }
    @objc private func openHub() { model.openHub(.tasks) }
    @objc private func quit() {
        if model.isFocused { model.stopFocus() }
        NSApp.terminate(nil)
    }
}
