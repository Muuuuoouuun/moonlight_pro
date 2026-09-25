import AppKit

@main
enum MoonlightPetPreviewMain {
    static func main() {
        if CommandLine.arguments.contains("--self-check") {
            let passed = SelfCheck.run()
            exit(passed ? 0 : 1)
        }
        let application = NSApplication.shared
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
    private var glassLab: GlassLabWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installEditingMenu()
        let coordinator = WindowCoordinator(model: model)
        self.coordinator = coordinator
        coordinator.showPet()
        model.startHubConnection()
        if CommandLine.arguments.contains("--glass-lab") {
            let lab = GlassLabWindowController()
            glassLab = lab
            lab.present()
        }

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "☾"
        item.button?.toolTip = "Moonlight 빠른 기능"
        let menu = NSMenu()
        let openItem = NSMenuItem(title: "빠른 기능 열기", action: #selector(toggleBar), keyEquivalent: "m")
        openItem.keyEquivalentModifierMask = [.control, .option]
        openItem.target = self
        menu.addItem(openItem)
        let widgetItem = NSMenuItem(title: "할 일 위젯 열기", action: #selector(showWidget), keyEquivalent: "")
        widgetItem.target = self
        menu.addItem(widgetItem)
        let messageItem = NSMenuItem(title: "짧은 메시지 보기", action: #selector(togglePreview), keyEquivalent: "")
        messageItem.target = self
        menu.addItem(messageItem)
        let noticesItem = NSMenuItem(title: "알림 보기", action: #selector(showNotifications), keyEquivalent: "")
        noticesItem.target = self
        menu.addItem(noticesItem)
        let councilItem = NSMenuItem(title: "Council 안건 준비", action: #selector(showCouncil), keyEquivalent: "")
        councilItem.target = self
        menu.addItem(councilItem)
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

    // Accessory apps still need an Edit menu for Cocoa text-command routing.
    // Without it Cmd+V/Cmd+A never reach SwiftUI's native field editor.
    private func installEditingMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        appItem.submenu = NSMenu(title: "Moonlight")
        main.addItem(appItem)
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "편집")
        for (title, action, key) in [("실행 취소", "undo:", "z"), ("잘라내기", "cut:", "x"),
                                     ("복사", "copy:", "c"), ("붙여넣기", "paste:", "v"),
                                     ("전체 선택", "selectAll:", "a")] {
            edit.addItem(NSMenuItem(title: title, action: Selector(action), keyEquivalent: key))
        }
        let redo = NSMenuItem(title: "다시 실행", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.insertItem(redo, at: 1)
        editItem.submenu = edit
        main.addItem(editItem)
        NSApp.mainMenu = main
    }

    @objc private func toggleBar() { coordinator?.toggleBar() }
    @objc private func showWidget() { coordinator?.showWidget() }
    @objc private func togglePreview() { coordinator?.togglePreview() }
    @objc private func showNotifications() { coordinator?.openMode(.notifications) }
    @objc private func showCouncil() { coordinator?.openMode(.council) }
    @objc private func openHub() { model.openHub(.tasks) }
    @objc private func quit() {
        if model.isFocused { model.stopFocus() }
        NSApp.terminate(nil)
    }
}
