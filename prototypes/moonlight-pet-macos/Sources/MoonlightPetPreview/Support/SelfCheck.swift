import Foundation

enum SelfCheck {
    @MainActor
    static func run() -> Bool {
        let now = Date(timeIntervalSince1970: 1_000)
        let clock = FocusClock(endsAt: now.addingTimeInterval(90))
        guard clock.remaining(at: now) == 90,
              clock.remaining(at: now.addingTimeInterval(91)) == 0 else {
            fputs("Focus clock check failed\n", stderr)
            return false
        }

        let suite = "MoonlightPetPreview.SelfCheck.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { return false }
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = AppModel(defaults: defaults)
        guard model.selectedCharacter == .silver else {
            fputs("Default character check failed\n", stderr)
            return false
        }
        guard PetCharacter.allCases.count == 9,
              PetCharacter.allCases.allSatisfy({ $0.artwork?.size == NSSize(width: 1254, height: 1254) }) else {
            fputs("Character artwork check failed\n", stderr)
            return false
        }
        model.selectedCharacter = .pink
        model.taskDraft = "  테스트 할 일  "
        model.addTask()
        model.memoDraft = "사용자가 쓴 메모"
        model.saveMemo()
        let reopened = AppModel(defaults: defaults)
        guard reopened.tasks.first?.title == "테스트 할 일",
              reopened.savedMemo == "사용자가 쓴 메모",
              reopened.selectedCharacter == .pink,
              reopened.openTaskCount == 1,
              let id = reopened.tasks.first?.id else {
            fputs("Local persistence check failed\n", stderr)
            return false
        }
        reopened.toggleTask(id)
        guard reopened.openTaskCount == 0 else {
            fputs("Task completion check failed\n", stderr)
            return false
        }
        reopened.removeTask(id)
        guard AppModel(defaults: defaults).tasks.isEmpty else {
            fputs("Task removal check failed\n", stderr)
            return false
        }
        print("PASS: focus clock, local task, memo and character persistence, task removal")
        return true
    }
}
