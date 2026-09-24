import AppKit

enum SelfCheck {
    @MainActor
    static func run() -> Bool {
        guard GlassOpticsCheck.run(), checkPanelInteraction() else { return false }
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
              PetCharacter.allCases.allSatisfy({ character in
                  guard let portrait = character.portraitArtwork, portrait.size.width > 0, portrait.size.height > 0,
                        let image = character.artwork, let data = image.tiffRepresentation,
                        let bitmap = NSBitmapImageRep(data: data) else { return false }
                  return image.size.width > 0 && image.size.height > 0 && bitmap.hasAlpha
              }) else {
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
        reopened.taskDraft = "작성 중인 할 일"
        reopened.memoDraft = "자동 저장 대기 중인 메모"
        let recovered = AppModel(defaults: defaults)
        guard recovered.taskDraft == reopened.taskDraft,
              recovered.memoDraft == reopened.memoDraft else {
            fputs("Draft recovery check failed\n", stderr)
            return false
        }
        recovered.focusMinutes = 1
        recovered.startFocus()
        recovered.focusMinutes = 50
        recovered.remainingSeconds = 30
        guard recovered.focusProgress == 0.5 else {
            fputs("Focus progress uses session duration check failed\n", stderr)
            return false
        }
        recovered.stopFocus()
        print("PASS: continuous drag, tall/wide anchors, focus clock/progress, nine original portraits and nine alpha poses, local records, automatic memo save and draft recovery")
        return true
    }

    private static func checkPanelInteraction() -> Bool {
        var drag = ScreenDragTracker()
        drag.begin(at: CGPoint(x: 100, y: 100))
        guard drag.translation(to: CGPoint(x: 101, y: 101)) == nil,
              !drag.isDragging,
              drag.translation(to: CGPoint(x: 100, y: 104)) == 4 else {
            fputs("Drag threshold check failed\n", stderr)
            return false
        }
        // Subpixel events must not be discarded after the gesture activates.
        for step in 1...12 {
            guard drag.translation(to: CGPoint(x: 100, y: 104 + Double(step) * 0.5)) == 0.5 else {
                fputs("Slow continuous drag check failed\n", stderr)
                return false
            }
        }
        guard drag.translation(to: CGPoint(x: 100, y: 109)) == -1 else { return false }
        drag.end()
        guard !drag.isDragging, drag.translation(to: .zero) == nil else { return false }

        let screen = CGRect(x: -1440, y: 24, width: 1440, height: 876)
        let task = CGRect(origin: CGPoint(x: -352, y: 250), size: CompanionLayout.size(for: .tasks))
        let memo = PanelGeometry.resizedKeepingTopRight(task, size: CompanionLayout.size(for: .memo), in: screen)
        guard memo.maxY == task.maxY, memo.maxX == task.maxX,
              PanelGeometry.resizedKeepingTopRight(memo, size: task.size, in: screen) == task else {
            fputs("Panel anchor check failed\n", stderr)
            return false
        }
        let nearBottom = CGRect(origin: CGPoint(x: -352, y: 32), size: CompanionLayout.size(for: .memo))
        let expanded = PanelGeometry.resizedKeepingTopRight(nearBottom, size: task.size, in: screen)
        let smallScreen = CGRect(x: 0, y: 0, width: 300, height: 360)
        let fitted = PanelGeometry.fitted(task, in: smallScreen)
        guard screen.insetBy(dx: 8, dy: 8).contains(expanded),
              expanded.minY == 32,
              smallScreen.insetBy(dx: 8, dy: 8).contains(fitted) else {
            fputs("Screen bounds check failed\n", stderr)
            return false
        }
        return true
    }
}
