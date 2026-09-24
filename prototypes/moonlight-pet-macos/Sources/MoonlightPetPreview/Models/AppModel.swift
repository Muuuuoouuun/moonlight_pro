import AppKit
import Foundation

enum QuickMode: String, CaseIterable, Identifiable {
    case tasks, memo, calendar, office, council, focus

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tasks: return "할 일"
        case .memo: return "메모"
        case .calendar: return "일정"
        case .office: return "Office"
        case .council: return "Council"
        case .focus: return "집중"
        }
    }

    var symbol: String {
        switch self {
        case .tasks: return "checklist"
        case .memo: return "square.and.pencil"
        case .calendar: return "calendar"
        case .office: return "person.2.fill"
        case .council: return "bubble.left.and.bubble.right.fill"
        case .focus: return "timer"
        }
    }

    var shortcut: Character {
        switch self {
        case .tasks: return "1"
        case .memo: return "2"
        case .calendar: return "3"
        case .office: return "4"
        case .council: return "5"
        case .focus: return "6"
        }
    }

    var hubPath: String? {
        switch self {
        case .tasks: return "/dashboard/work/my?view=todos"
        case .memo: return "/dashboard/work/memos"
        case .calendar: return "/dashboard/work/calendar"
        case .office: return "/dashboard/agents/office-council"
        case .council: return "/dashboard/agents/council"
        case .focus: return nil
        }
    }
}

enum CompactMode: String, CaseIterable, Identifiable {
    case tasks, memo

    var id: String { rawValue }
    var title: String { self == .tasks ? "할 일" : "메모" }
}

struct LocalTask: Codable, Identifiable, Equatable {
    var id: UUID
    var title: String
    var isDone: Bool
}

struct FocusClock: Equatable {
    let endsAt: Date

    func remaining(at date: Date) -> Int {
        max(0, Int(ceil(endsAt.timeIntervalSince(date))))
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var mode: QuickMode = .tasks
    @Published var compactMode: CompactMode = .tasks
    @Published var compactOpenRevision = 0
    @Published var tasks: [LocalTask] = []
    @Published var taskDraft = ""
    @Published var savedMemo = ""
    @Published var memoDraft = ""
    @Published var focusMinutes = 25
    @Published var remainingSeconds = 0
    @Published var isFocused = false
    @Published var showStopConfirmation = false
    @Published var hubBaseURL = "http://127.0.0.1:3000"
    @Published var selectedCharacter: PetCharacter = .silver {
        didSet { defaults.set(selectedCharacter.rawValue, forKey: "petPreview.character") }
    }

    var onFocusFinished: (() -> Void)?
    private let defaults: UserDefaults
    private var focusClock: FocusClock?
    private var timer: Timer?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: "petPreview.tasks"),
           let decoded = try? JSONDecoder().decode([LocalTask].self, from: data) {
            tasks = decoded
        }
        savedMemo = defaults.string(forKey: "petPreview.memo") ?? ""
        memoDraft = savedMemo
        hubBaseURL = defaults.string(forKey: "petPreview.hubURL") ?? "http://127.0.0.1:3000"
        selectedCharacter = PetCharacter(rawValue: defaults.string(forKey: "petPreview.character") ?? "") ?? .silver
    }

    var openTaskCount: Int { tasks.filter { !$0.isDone }.count }

    var previewText: String {
        if openTaskCount > 0 { return "할 일 \(openTaskCount)개가 남아 있어요." }
        if !savedMemo.isEmpty { return "저장한 메모가 있어요." }
        return "새 알림은 없어요. 펫을 눌러 빠른 기능을 열어요."
    }

    func addTask() {
        let value = taskDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        tasks.insert(LocalTask(id: UUID(), title: value, isDone: false), at: 0)
        taskDraft = ""
        persistTasks()
    }

    func toggleTask(_ id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].isDone.toggle()
        persistTasks()
    }

    func removeTask(_ id: UUID) {
        tasks.removeAll { $0.id == id }
        persistTasks()
    }

    func saveMemo() {
        savedMemo = memoDraft
        defaults.set(savedMemo, forKey: "petPreview.memo")
    }

    func saveHubURL() {
        hubBaseURL = hubBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        defaults.set(hubBaseURL, forKey: "petPreview.hubURL")
    }

    func openHub(_ mode: QuickMode) {
        guard let path = mode.hubPath,
              let base = URL(string: hubBaseURL),
              let url = URL(string: path, relativeTo: base)?.absoluteURL,
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return }
        NSWorkspace.shared.open(url)
    }

    func startFocus() {
        guard !isFocused else { return }
        let minutes = min(max(focusMinutes, 1), 120)
        focusClock = FocusClock(endsAt: Date().addingTimeInterval(TimeInterval(minutes * 60)))
        remainingSeconds = minutes * 60
        showStopConfirmation = false
        isFocused = true
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func stopFocus() {
        timer?.invalidate()
        timer = nil
        focusClock = nil
        remainingSeconds = 0
        isFocused = false
        showStopConfirmation = false
        onFocusFinished?()
    }

    var timerLabel: String {
        String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    private func tick() {
        guard let focusClock else { return }
        remainingSeconds = focusClock.remaining(at: Date())
        if remainingSeconds == 0 { stopFocus() }
    }

    private func persistTasks() {
        if let data = try? JSONEncoder().encode(tasks) {
            defaults.set(data, forKey: "petPreview.tasks")
        }
    }
}
