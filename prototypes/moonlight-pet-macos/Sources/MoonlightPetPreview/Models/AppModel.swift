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
        case .council: return "담당자에게 묻기"
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

enum OfficeCompanionTab: String, CaseIterable, Identifiable {
    case work, conversation, meeting
    var id: String { rawValue }
    var title: String { self == .work ? "작업" : self == .conversation ? "대화" : "회의" }
}

struct FocusClock: Equatable {
    let endsAt: Date

    func remaining(at date: Date) -> Int {
        max(0, Int(ceil(endsAt.timeIntervalSince(date))))
    }
}

@MainActor
final class AppModel: ObservableObject {
    static let defaultHubURL = "https://moonlight-pro-hub.vercel.app"
    @Published var activeCompanion: CompanionSurface? {
        didSet {
            if activeCompanion != oldValue { updateHubRefresh() }
            markCouncilRepliesRead()
        }
    }
    @Published var mode: QuickMode = .tasks { didSet { markCouncilRepliesRead() } }
    @Published var compactMode: CompactMode = .tasks { didSet { markCouncilRepliesRead() } }
    @Published var officeTab: OfficeCompanionTab = .work { didSet { markCouncilRepliesRead() } }
    @Published var connectionSurface: CompanionSurface? { didSet { markCouncilRepliesRead() } }
    var isConnectionVisible: Bool { activeCompanion != nil && activeCompanion == connectionSurface }
    private var isReadingCouncil: Bool {
        !isFocused && !isConnectionVisible && ((activeCompanion == .quick && readsConversation(mode))
            || (activeCompanion == .widget && readsConversation(compactMode)))
    }
    private func readsConversation(_ mode: QuickMode) -> Bool {
        mode == .council || (mode == .office && officeTab == .conversation)
    }
    @Published var compactOpenRevision = 0
    @Published var quickOpenRevision = 0
    @Published var tasks: [LocalTask] = []
    @Published var showsCompletedTasks = false
    let completionFeedback = TaskCompletionFeedback()
    @Published var taskDraft = "" {
        didSet { defaults.set(taskDraft, forKey: "petPreview.taskDraft") }
    }
    @Published var savedMemo = ""
    @Published var memoDraft = "" {
        didSet { if memoDraft != oldValue { memoEditRevision += 1; saveMemo() } }
    }
    @Published private(set) var capturedMemos: [String] = []
    private var memoEditRevision = 0
    @Published private(set) var isCapturingMemo = false
    @Published private(set) var memoCaptureReceipt: String?
    @Published var usesDesktopRefraction = false
    @Published var desktopRefractionStatus = "화면 기록 권한 필요 · 영상 저장 안 함"
    @Published var focusMinutes = 25
    @Published var remainingSeconds = 0
    @Published private(set) var focusTotalSeconds = 0
    @Published var isFocused = false
    @Published var showStopConfirmation = false
    @Published var hubBaseURL = AppModel.defaultHubURL
    @Published var selectedCharacter: PetCharacter = .silver {
        didSet {
            defaults.set(selectedCharacter.rawValue, forKey: "petPreview.character")
            if !chat.isSending { chat.agent = selectedCharacter.officeAgent }
            if !office.isSending, office.meeting == nil { office.agent = selectedCharacter.officeAgent }
        }
    }

    var presentationCharacter: PetCharacter {
        if let owner = activity.banner?.owner { return PetCharacter.forAgent(owner) }
        if isReadingCouncil { return PetCharacter.forAgent(chat.agent) }
        return selectedCharacter
    }
    private var memoTopicIDs: [String: String] = [:]

    var onFocusFinished: (() -> Void)?
    let hub: HubStore
    let activity: PetActivityStore
    let council: CouncilDraftStore
    let chat = OfficeChatStore()
    let officeRequests = OfficeRequestStore()
    let office = OfficeChatStore(durableMeetings: true)
    var onOpenMode: ((QuickMode) -> Void)?
    private var featureObservers: Set<AnyCancellable> = []
    private var hubObserver: AnyCancellable?
    private var connectionStarted = false
    private var refreshLoop: Task<Void, Never>?
    private let defaults: UserDefaults
    private var focusClock: FocusClock?
    private var timer: Timer?

    init(defaults: UserDefaults = .standard, hub: HubStore? = nil) {
        self.defaults = defaults
        self.hub = hub ?? HubStore(defaults: defaults)
        activity = PetActivityStore(defaults: defaults)
        council = CouncilDraftStore(defaults: defaults)
        if let data = defaults.data(forKey: "petPreview.tasks"),
           let decoded = try? JSONDecoder().decode([LocalTask].self, from: data) {
            tasks = decoded
        }
        savedMemo = defaults.string(forKey: "petPreview.memo") ?? ""
        memoDraft = savedMemo
        capturedMemos = defaults.stringArray(forKey: "petPreview.capturedMemos") ?? []
        taskDraft = defaults.string(forKey: "petPreview.taskDraft") ?? ""
        hubBaseURL = defaults.string(forKey: "petPreview.hubURL") ?? Self.defaultHubURL
        selectedCharacter = PetCharacter(rawValue: defaults.string(forKey: "petPreview.character") ?? "") ?? .silver
        chat.agent = selectedCharacter.officeAgent
        office.agent = selectedCharacter.officeAgent
        completionFeedback.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }.store(in: &featureObservers)
    }

    private var sourceTasks: [LocalTask] { hub.isEnabled ? hub.tasks.map(\.local) : tasks }
    var displayedTasks: [LocalTask] {
        completionFeedback.visible(in: sourceTasks, includeCompleted: showsCompletedTasks)
    }
    var completedTaskCount: Int { sourceTasks.filter(\.isDone).count }
    var openTaskCount: Int { displayedTasks.filter { !$0.isDone }.count }
    var taskStatusLabel: String { hub.isEnabled ? (hub.isRefreshing ? "Hub 새로고침 중…" : hub.connectionLabel) : "이 Mac에 저장" }
    var memoStatusLabel: String {
        if hub.isSavingMemo { return "Mac에 보관 · Hub 저장 중…" }
        if hub.isEnabled, hub.savedMemoBody == memoDraft, !hub.hasPendingMemo { return "Hub에 저장됨 · Mac에 보관" }
        return memoDraft.isEmpty ? "이 Mac에 자동 저장" : "Mac에 자동 저장됨"
    }

    deinit { refreshLoop?.cancel(); timer?.invalidate() }

    func startHubConnection() {
        guard !connectionStarted else { return }
        connectionStarted = true
        hubObserver = hub.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        activity.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        council.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        chat.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        office.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        officeRequests.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &featureObservers)
        hub.onConnectionChanged = { [weak self] service, origin in
            self?.completionFeedback.reset()
            self?.activity.configure(service: service as? any HubActivityServing, origin: origin)
            self?.chat.configure(service: service as? any HubOfficeServing, origin: origin)
            self?.office.configure(service: service as? any HubOfficeServing, origin: origin)
            self?.officeRequests.configure(service: service as? any HubOfficeRequestsServing, origin: origin)
        }
        chat.onReply = { [weak self] turn in
            guard let self else { return }
            if !self.isReadingCouncil || self.chat.conversationKey != turn.conversation {
                self.activity.addAgentReply(id: turn.id.uuidString, agentID: turn.agent.rawValue,
                    conversation: turn.conversation, title: "\(turn.agent.title)의 답변이 왔어요",
                    detail: String(turn.reply.answer.prefix(80)), path: self.chat.topicSource?.path ?? "")
            }
        }
        guard hub.isEnabled else { activity.configure(service: nil, origin: nil); return }
        Task { await hub.connect(baseURL: hubBaseURL) }
    }

    func saveMemoToHub() { Task { await captureMemo() } }

    func saveMemoAsNewToHub() { Task { await captureMemo(asNew: true) } }

    /// Clear only the exact draft revision acknowledged by the storage layer.
    func captureMemo(asNew: Bool = false) async {
        guard !isCapturingMemo, hub.hasPendingMemo
            || !memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isCapturingMemo = true
        defer { isCapturingMemo = false }
        let body = memoDraft
        let revision = memoEditRevision
        saveMemo()
        if hub.isEnabled {
            let saved = asNew ? await hub.saveMemoAsNew(body: body) : await hub.saveMemo(body: body)
            guard let saved else { return }
            rememberCapture(saved.body)
            hub.finishMemoCapture(saved)
            guard saved.body == body, memoEditRevision == revision else { return }
            memoCaptureReceipt = "Hub에 저장했어요 · 새 메모를 적어보세요"
        } else {
            guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            rememberCapture(body)
            memoCaptureReceipt = "Mac에 저장했어요 · 더보기에서 다시 열 수 있어요"
        }
        memoDraft = ""
    }

    private func rememberCapture(_ body: String) {
        capturedMemos.insert(body, at: 0)
        defaults.set(capturedMemos, forKey: "petPreview.capturedMemos")
    }

    func restoreCapturedMemo(at index: Int) {
        guard memoDraft.isEmpty, !isCapturingMemo, !hub.hasPendingMemo,
              capturedMemos.indices.contains(index) else { return }
        memoDraft = capturedMemos[index]
        memoCaptureReceipt = nil
    }

    private func updateHubRefresh() {
        refreshLoop?.cancel()
        guard activeCompanion != nil else { return }
        refreshLoop = Task { [weak self] in
            while !Task.isCancelled {
                guard self != nil else { return }
                await self?.hub.refresh()
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
        let order = displayedTasks.map(\.id)
        if hub.isEnabled {
            Task {
                guard let saved = await hub.toggleTask(id) else { return }
                if saved.isDone { completionFeedback.retain(id, in: order) }
                else { completionFeedback.cancel(id) }
            }
            return
        }
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].isDone.toggle()
        if tasks[index].isDone { completionFeedback.retain(id, in: order) }
        else { completionFeedback.cancel(id) }
        persistTasks()
    }

    func removeTask(_ id: UUID) {
        guard !hub.isEnabled else { return }
        completionFeedback.cancel(id)
        tasks.removeAll { $0.id == id }
        persistTasks()
    }

    func saveMemo() {
        savedMemo = memoDraft
        defaults.set(savedMemo, forKey: "petPreview.memo")
    }

    /// Primary keyboard action stays in the current surface; navigation is explicit.
    func performPrimaryShortcut(for mode: QuickMode) {
        guard !isFocused, !isConnectionVisible else { return }
        switch mode {
        case .memo:
            saveMemoToHub()
        case .council: sendCouncilMessage()
        case .office:
            if officeTab == .meeting { office.sendDraft() }
            else if officeTab == .conversation { sendCouncilMessage() }
            else if officeRequests.detail != nil { copyOfficeResult() }
            else if canReadOfficeResult { Task { await officeRequests.readSelected() } }
        default: openHub(mode)
        }
    }

    func prepareOfficeFromMemo() {
        guard !office.isSending else { return }
        saveMemo()
        if office.meeting == nil { office.sourceTaskID = nil }
        office.draft = memoDraft; office.source = .memo
        officeTab = .meeting
        onOpenMode?(.office)
    }
    func prepareOfficeFromTask(_ task: LocalTask) {
        guard !office.isSending else { return }
        office.startNewMeeting()
        office.sourceTaskID = nil
        if hub.isEnabled, let remote = hub.tasks.first(where: { $0.id == task.id }),
           ["classin", "brand"].contains(remote.workspace ?? "") {
            office.scope = remote.workspace == "classin" ? .classin : .personal
            office.sourceTaskID = remote.id
        }
        office.draft = task.title; office.source = .task
        officeTab = .meeting
        onOpenMode?(.office)
    }
    func openOfficeMeetingInHub() {
        guard let meeting = office.meeting, let url = try? meeting.hubURL(baseURL: hubBaseURL) else { return }
        NSWorkspace.shared.open(url)
    }

    func continueMemoInCouncil() { prepareCouncilFromMemo() }

    func prepareCouncilFromMemo() {
        saveMemo()
        let text = memoDraft
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let id = memoTopicIDs[text] ?? "memo:" + UUID().uuidString
        memoTopicIDs[text] = id
        _ = chat.selectTopic(id, scope: .all, owner: selectedCharacter.officeAgent,
                             source: .init(title: "가져온 메모", detail: text, date: Date(), path: nil, isNoticeSummary: false),
                             draft: text, sourceKind: .memo)
        onOpenMode?(.council)
    }
    func prepareCouncilFromTask(_ task: LocalTask) {
        _ = chat.selectTopic("task:" + task.id.uuidString, scope: .all, owner: selectedCharacter.officeAgent,
                             source: .init(title: "가져온 할 일", detail: task.title, date: Date(), path: nil, isNoticeSummary: false),
                             draft: task.title, sourceKind: .task)
        onOpenMode?(.council)
    }
    var canSendCouncil: Bool {
        chat.hasConnection && !chat.isSending && chat.draft.utf16.count <= 6000
            && !chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    func sendCouncilMessage() {
        guard canSendCouncil else { return }
        chat.sendDraft()
    }
    var canOpenChatInCouncil: Bool {
        !chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chat.draft.utf16.count <= 4000
    }
    func openChatInCouncil() {
        guard canOpenChatInCouncil else { return }
        council.prepare(chat.draft, source: chat.source)
        openCouncilDraft()
    }
    func openCouncilDraft() {
        do {
            let url = try council.handoffURL(baseURL: hubBaseURL)
            council.handoffMessage = NSWorkspace.shared.open(url)
                ? "브라우저에서 안건을 검토해 주세요. 초안은 이 Mac에도 남아 있어요."
                : "브라우저를 열지 못했어요. 초안은 그대로 보관돼요."
        } catch { council.handoffMessage = "안건과 Hub 주소를 확인해 주세요. 초안은 그대로 보관돼요." }
    }
    func markCouncilRepliesRead() {
        guard isReadingCouncil else { return }
        activity.acknowledgeAgentReplies(conversation: chat.conversationKey)
    }
    var canReadOfficeResult: Bool {
        officeRequests.hasConnection && !officeRequests.needsLogin && !officeRequests.isStale
            && !officeRequests.isLoading && !officeRequests.isReading && officeRequests.errorMessage == nil
            && officeRequests.selected?.isReadable == true
    }
    func officeRequestURL(_ request: OfficeRequestSummary) -> URL? {
        guard let base = URL(string: hubBaseURL), let validated = try? HubTransport.validatedBaseURL(base),
              var components = URLComponents(url: validated, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/dashboard/agents/office-request"
        components.queryItems = [URLQueryItem(name: "request", value: request.id.uuidString.lowercased())]
        return components.url
    }
    func openOfficeRequest(_ request: OfficeRequestSummary) {
        if let url = officeRequestURL(request) { NSWorkspace.shared.open(url) }
    }
    @discardableResult func copyOfficeResult() -> Bool {
        guard !officeRequests.needsLogin, !officeRequests.isStale, let body = officeRequests.detail?.body else { return false }
        NSPasteboard.general.clearContents()
        return NSPasteboard.general.setString(body, forType: .string)
    }
    var canDiscussOfficeResult: Bool {
        officeRequests.detail?.body != nil && !officeRequests.needsLogin && !officeRequests.isStale
            && !chat.isSending && chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    func discussOfficeResult() {
        guard canDiscussOfficeResult, let detail = officeRequests.detail else { return }
        let scope: OfficeChatScope = detail.request.scope == .personal ? .personal : .classin
        let opened = chat.selectTopic("office-request:" + detail.request.id.uuidString.lowercased(), scope: scope,
            owner: detail.request.owner,
            source: .init(title: detail.request.title, detail: detail.body ?? "", date: detail.request.createdAt,
                          path: officeRequestURL(detail.request)?.path.appending("?request=" + detail.request.id.uuidString.lowercased()),
                          isNoticeSummary: false))
        if opened { officeTab = .conversation }
    }
    func showNotifications() { onOpenMode?(.notifications) }
    func openNotification(_ notice: PetNotice) {
        guard let owner = notice.owner, let key = notice.topicKey,
              key.origin == chat.conversationKey.origin else { return }
        let opened: Bool
        if notice.kind == .agent { opened = chat.restoreConversation(key) }
        else {
            opened = chat.selectTopic(key.topicID, scope: key.scope, owner: owner, source: notice.topicSource)
        }
        // A refused in-flight change explains itself beside the existing pending question.
        onOpenMode?(.council)
        guard opened else { return }
        activity.acknowledge(id: notice.id)
        activity.dismissBanner()
        markCouncilRepliesRead()
    }
    func originalURL(for notice: PetNotice) -> URL? {
        notice.originalURL(currentOrigin: chat.conversationKey.origin)
    }
    func openNotificationOriginal(_ notice: PetNotice) {
        guard let url = originalURL(for: notice), NSWorkspace.shared.open(url) else { return }
        activity.acknowledge(id: notice.id)
    }
    func openTopicOriginal() {
        guard let path = chat.topicSource?.path else { return }
        let origin = chat.conversationKey.origin
        let notice = PetNotice(id: "source", title: "", detail: "", kind: .agent, createdAt: Date(), path: path, origin: origin)
        if let url = notice.originalURL(currentOrigin: origin) { NSWorkspace.shared.open(url) }
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
        let remaining = focusClock.remaining(at: Date())
        if remainingSeconds != remaining { remainingSeconds = remaining }
        if remainingSeconds == 0 { stopFocus() }
    }

    private func persistTasks() {
        if let data = try? JSONEncoder().encode(tasks) {
            defaults.set(data, forKey: "petPreview.tasks")
        }
    }
}
