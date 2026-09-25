import AppKit

enum SelfCheck {
    @MainActor
    static func run() -> Bool {
        guard GlassOpticsCheck.run(), GlassTextCheck.run(), checkPanelInteraction(), checkReadingTone() else { return false }
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
        defaults.set(false, forKey: "petHub.enabled")
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
        recovered.activity.addAgentReply(id: "visibility-check", agentID: recovered.chat.agent.rawValue,
            scope: recovered.chat.scope.rawValue, title: "표시 상태 검증", detail: "")
        recovered.markCouncilRepliesRead()
        guard recovered.activity.unreadCount == 1 else {
            fputs("Hidden Council views must not consume unread replies\n", stderr)
            return false
        }
        recovered.mode = .council
        recovered.activeCompanion = .quick
        guard recovered.activity.unreadCount == 0 else {
            fputs("Reopening Council must acknowledge the visible conversation\n", stderr)
            return false
        }
        recovered.connectionSurface = .quick
        recovered.activity.addAgentReply(id: "settings-check", agentID: recovered.chat.agent.rawValue,
            scope: recovered.chat.scope.rawValue, title: "설정 표시 검증", detail: "")
        recovered.markCouncilRepliesRead()
        guard recovered.activity.unreadCount == 1, recovered.isConnectionVisible else { return false }
        recovered.connectionSurface = nil
        guard recovered.activity.unreadCount == 0 else { return false }
        recovered.activeCompanion = nil
        print("PASS: press/drag tint reset, shared reading tint callback, continuous drag, tall/wide anchors, focus clock/progress, nine original portraits and nine alpha poses, local records, automatic memo save, draft recovery and visible-only Council acknowledgments")
        return true
    }

    @MainActor
    private static func checkReadingTone() -> Bool {
        let wash = PetGlassWash(radius: 12)
        // Isolate this view from the operator's current accessibility settings.
        // These overrides do not change NSWorkspace or any saved preference.
        wash.solidForAccessibility = false
        wash.previewsTint = false
        let tone = GlassReadingTone()
        var updates = 0
        wash.onPresentationChange = { character, opacity, solid in
            updates += 1
            tone.update(character: character, opacity: opacity, solidForAccessibility: solid)
        }
        guard updates == 1, tone.state.opacity == 0, !tone.state.solidForAccessibility else {
            fputs("Reading tint initial callback must be clear\n", stderr)
            return false
        }
        wash.previewsTint = true
        guard tone.state.opacity == 1 else {
            fputs("Reading tint must follow the visible wash\n", stderr)
            return false
        }
        for character in [PetCharacter.pink, .blue] {
            wash.character = character
            guard tone.state.character == character, tone.state.opacity == 1 else {
                fputs("Reading tint character must update even when opacity stays unchanged\n", stderr)
                return false
            }
        }
        wash.previewsTint = false
        guard tone.state.opacity == 0 else {
            fputs("Reading tint must clear when preview ends\n", stderr)
            return false
        }
        wash.solidForAccessibility = true
        guard tone.state.opacity == 1, tone.state.solidForAccessibility else {
            fputs("Reading tint must follow the accessibility solid wash\n", stderr)
            return false
        }
        wash.solidForAccessibility = false
        guard tone.state.opacity == 0, !tone.state.solidForAccessibility else {
            fputs("Reading tint must clear when the accessibility override ends\n", stderr)
            return false
        }
        return true
    }

    private static func checkPanelInteraction() -> Bool {
        var glass = GlassPressState()
        guard !glass.showsTint(accessibilityRequiresSolid: false) else { return false }
        glass.press()
        guard glass.showsTint(accessibilityRequiresSolid: false) else { return false }
        glass.release()
        guard !glass.showsTint(accessibilityRequiresSolid: false),
              glass.showsTint(accessibilityRequiresSolid: true) else {
            fputs("Glass must return to clear after release; accessibility stays solid\n", stderr)
            return false
        }
        // Dragging from the pet window must work without the panel receiving
        // mouse-down. Repeated drag updates must remain active until release.
        for _ in 0..<3 {
            glass.drag()
            guard glass.showsTint(accessibilityRequiresSolid: false) else {
                fputs("Glass drag without a local press check failed\n", stderr)
                return false
            }
        }
        glass.release()
        guard !glass.showsTint(accessibilityRequiresSolid: false) else {
            fputs("Glass drag release must restore clear glass\n", stderr)
            return false
        }
        glass.press()
        glass.drag()
        glass.release()
        guard !glass.showsTint(accessibilityRequiresSolid: false) else { return false }
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
