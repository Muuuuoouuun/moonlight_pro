import AppKit
import Foundation
import Combine

enum QuickMode: String, CaseIterable, Identifiable {
    case tasks, memo, calendar, office, council, focus, notifications

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tasks: return "할 일"
        case .memo: return "메모"
        case .calendar: return "일정"
        case .office: return "Office"
        case .council: return "Council"
        case .focus: return "집중"
        case .notifications: return "알림"
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
        case .notifications: return "bell"
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
        case .notifications: return "7"
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
        case .notifications: return "/dashboard/revenue/inquiries?filter=unread"
        }
    }
}

typealias CompactMode = QuickMode

enum CompanionSurface { case quick, widget }

struct FocusClock: Equatable {
    let endsAt: Date

    func remaining(at date: Date) -> Int {
        max(0, Int(ceil(endsAt.timeIntervalSince(date))))
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var activeCompanion: CompanionSurface? {
        didSet { updateHubRefresh() }
    }
    @Published var mode: QuickMode = .tasks
    @Published var compactMode: CompactMode = .tasks
    @Published var compactOpenRevision = 0
    @Published var quickOpenRevision = 0
    @Published var tasks: [LocalTask] = []
    @Published var taskDraft = "" {
        didSet { defaults.set(taskDraft, forKey: "petPreview.taskDraft") }
    }
    @Published var savedMemo = ""
    @Published var memoDraft = "" {
        didSet { if memoDraft != oldValue { saveMemo() } }
    }
    @Published var focusMinutes = 25
    @Published var remainingSeconds = 0
    @Published private(set) var focusTotalSeconds = 0
    @Published var isFocused = false
    @Published var showStopConfirmation = false
    @Published var hubBaseURL = "http://127.0.0.1:3000"
    @Published var selectedCharacter: PetCharacter = .silver {
        didSet { defaults.set(selectedCharacter.rawValue, forKey: "petPreview.character") }
    }

    var onFocusFinished: (() -> Void)?
    let hub: HubStore
    let activity: PetActivityStore
    let council: CouncilDraftStore
    var onOpenMode: ((QuickMode) -> Void)?
    private var featureObservers: Set<AnyCancellable> = []
    private var hubObserver: AnyCancellable?
    private var refreshLoop: Task<Void, Never>?
    private let defaults: UserDefaults
    private var focusClock: FocusClock?
    private var timer: Timer?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        hub = HubStore(defaults: defaults)
        activity = PetActivityStore(defaults: defaults)
        council = CouncilDraftStore(defaults: defaults)
        if let data = defaults.data(forKey: "petPreview.tasks"),
           let decoded = try? JSONDecoder().decode([LocalTask].self, from: data) {
            tasks = decoded
        }
        savedMemo = defaults.string(forKey: "petPreview.memo") ?? ""
        memoDraft = savedMemo
        taskDraft = defaults.string(forKey: "petPreview.taskDraft") ?? ""
        hubBaseURL = defaults.string(forKey: "petPreview.hubURL") ?? "http://127.0.0.1:3000"
        selectedCharacter = PetCharacter(rawValue: defaults.string(forKey: "petPreview.character") ?? "") ?? .silver
    }

    var displayedTasks: [LocalTask] { hub.isEnabled ? hub.tasks.map(\.local) : tasks }
    var openTaskCount: Int { displayedTasks.filter { !$0.isDone }.count }
    var taskStatusLabel: String { hub.isEnabled ? (hub.isRefreshing ? "Hub 새로고침 중…" : hub.connectionLabel) : "이 Mac에 저장" }
    var memoStatusLabel: String {
        if hub.isSavingMemo { return "Mac에 보관 · Hub 저장 중…" }
        if hub.isEnabled, hub.savedMemoBody == memoDraft, !hub.hasPendingMemo { return "Hub에 저장됨 · Mac에 보관" }
        return memoDraft.isEmpty ? "이 Mac에 자동 저장" : "Mac에 자동 저장됨"
    }

    func startHubConnection() {
        hubObserver = hub.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        activity.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        council.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        hub.onConnectionChanged = { [weak self] service, origin in self?.activity.configure(service: service, origin: origin) }
        guard hub.isEnabled else { activity.configure(service: nil, origin: nil); return }
        Task { await hub.connect(baseURL: hubBaseURL) }
    }

    func saveMemoToHub() {
        saveMemo()
        let body = memoDraft
        Task { await hub.saveMemo(body: body) }
    }

    func saveMemoAsNewToHub() {
        saveMemo()
        let body = memoDraft
        Task { await hub.saveMemoAsNew(body: body) }
    }

    private func updateHubRefresh() {
        refreshLoop?.cancel()
        guard activeCompanion != nil else { return }
        refreshLoop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if self.hub.isEnabled { await self.hub.refresh() }
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
            }
        }
    }

    var previewText: String {
        if hub.isEnabled && !hub.taskReady { return hub.connectionLabel + " · 펫에서 연결 상태를 확인해요." }
        if openTaskCount > 0 { return "할 일 \(openTaskCount)개가 남아 있어요." }
        if !savedMemo.isEmpty { return "저장한 메모가 있어요." }
        return "새 알림은 없어요. 펫을 눌러 빠른 기능을 열어요."
    }

    func addTask() {
        let value = taskDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty || (hub.isEnabled && hub.hasPendingTask) else { return }
        if hub.isEnabled {
            Task {
                if let saved = await hub.createTask(title: value), taskDraft.trimmingCharacters(in: .whitespacesAndNewlines) == saved { taskDraft = "" }
            }
            return
        }
        tasks.insert(LocalTask(id: UUID(), title: value, isDone: false), at: 0)
        taskDraft = ""
        persistTasks()
    }

    func toggleTask(_ id: UUID) {
        if hub.isEnabled { Task { await hub.toggleTask(id) }; return }
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].isDone.toggle()
        persistTasks()
    }

    func removeTask(_ id: UUID) {
        guard !hub.isEnabled else { return }
        tasks.removeAll { $0.id == id }
        persistTasks()
    }

    func saveMemo() {
        savedMemo = memoDraft
        defaults.set(savedMemo, forKey: "petPreview.memo")
    }

    func continueMemoInCouncil() { prepareCouncilFromMemo() }

    func prepareCouncilFromMemo() {
        saveMemo()
        council.prepare(memoDraft, source: .memo)
        onOpenMode?(.council)
    }
    func prepareCouncilFromTask(_ task: LocalTask) {
        council.prepare(task.title, source: .task)
        onOpenMode?(.council)
    }
    func openCouncilDraft() {
        do {
            let url = try council.handoffURL(baseURL: hubBaseURL)
            council.handoffMessage = NSWorkspace.shared.open(url)
                ? "브라우저에서 안건을 검토해 주세요. 초안은 이 Mac에도 남아 있어요."
                : "브라우저를 열지 못했어요. 초안은 그대로 보관돼요."
        } catch { council.handoffMessage = "안건과 Hub 주소를 확인해 주세요. 초안은 그대로 보관돼요." }
    }
    func showNotifications() { onOpenMode?(.notifications) }
    func openNotification(_ notice: PetNotice) {
        if notice.kind == .calendar {
            hub.selectedDate = notice.eventDate ?? Date()
            onOpenMode?(.calendar)
        } else {
            guard let base = URL(string: hubBaseURL), let origin = try? HubTransport.validatedBaseURL(base),
                  notice.path.hasPrefix("/dashboard/revenue/inquiries?"),
                  let url = URL(string: notice.path, relativeTo: origin)?.absoluteURL else { return }
            NSWorkspace.shared.open(url)
        }
        activity.dismissBanner()
    }

    func saveHubURL() {
        guard let url = URL(string: hubBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              let validated = try? HubTransport.validatedBaseURL(url) else { return }
        hubBaseURL = validated.absoluteString
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
        focusTotalSeconds = remainingSeconds
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

    var focusProgress: Double {
        guard focusTotalSeconds > 0 else { return 0 }
        return min(1, max(0, 1 - Double(remainingSeconds) / Double(focusTotalSeconds)))
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
