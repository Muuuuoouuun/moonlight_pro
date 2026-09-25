import Foundation
import Combine

/// Keeps remote receipts separate from the original local notebook and tasks.
@MainActor
final class HubStore: ObservableObject {
    @Published private(set) var isEnabled: Bool
    @Published private(set) var isConnecting = false
    @Published private(set) var isRefreshing = false
    @Published private(set) var isSavingTask = false
    @Published private(set) var isSavingMemo = false
    @Published private(set) var needsLogin = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var taskMessage: String? = "Hub에서 불러오는 중이에요."
    @Published private(set) var calendarMessage: String? = "Hub에서 불러오는 중이에요."
    @Published private(set) var tasks: [HubTask] = []
    @Published private(set) var events: [HubCalendarEvent] = []
    @Published var selectedDate = Date()
    @Published private(set) var loadedCalendarWeek: Date?
    @Published private(set) var lastSyncedAt: Date?
    @Published private(set) var memoReceipt: String?
    @Published private(set) var taskReady = false
    @Published private(set) var calendarReady = false

    var canWriteTasks: Bool { !isEnabled || (taskReady && !needsLogin && !isConnecting && !isSavingTask) }
    var canSaveMemo: Bool { isEnabled && (taskReady || calendarReady) && !needsLogin && !isConnecting && !isSavingMemo }
    var connectionLabel: String {
        if !isEnabled { return "이 Mac에 저장" }
        if isConnecting { return "Hub 연결 중…" }
        if needsLogin { return "Hub 로그인 필요" }
        if taskReady || calendarReady { return "Hub 연결됨" }
        return "Hub 연결 확인 필요"
    }
    var canSaveMemoAsNew: Bool { canSaveMemo && pending.memo == nil }
    var savedMemoBody: String? { pending.memoConflict == true ? nil : pending.savedMemo?.body }
    var hasPendingTask: Bool { pending.task != nil }
    var hasPendingMemo: Bool { pending.memo != nil }
    var hasConnection: Bool { api != nil }

    var onConnectionChanged: (((any HubServing)?, String?) -> Void)?

    private let defaults: UserDefaults
    private let makeAPI: (URL) throws -> any HubServing
    private var api: (any HubServing)?
    private var connectedOrigin: String?
    private var generation = 0
    private var taskVersion = 0
    private var refreshRequested = false
    private var storageKey: String?
    private var pending = HubPendingState()

    init(defaults: UserDefaults = .standard, makeAPI: @escaping (URL) throws -> any HubServing = { HubAPI(transport: try HubTransport(baseURL: $0)) }) {
        self.defaults = defaults; self.makeAPI = makeAPI
        isEnabled = defaults.object(forKey: "petHub.enabled") as? Bool ?? true
    }

    @discardableResult
    func connect(baseURL: String, username: String = "", password: String = "") async -> String? {
        let normalizedURL: URL
        do {
            guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)) else { throw HubTransportError.rejectedURL }
            normalizedURL = try HubTransport.validatedBaseURL(url)
        } catch { record(error); return nil }
        // Connection checks reuse the private cookie jar and active conversations.
        // The form retains a username after login but deliberately clears its password.
        if isEnabled, api != nil, connectedOrigin == normalizedURL.absoluteString, password.isEmpty {
            errorMessage = nil
            await refresh()
            return connectedOrigin
        }
        generation += 1
        onConnectionChanged?(nil, nil)
        let ticket = generation
        isEnabled = true; defaults.set(true, forKey: "petHub.enabled")
        api = nil; connectedOrigin = nil; tasks = []; events = []; loadedCalendarWeek = nil; lastSyncedAt = nil
        taskReady = false; calendarReady = false; needsLogin = false
        errorMessage = nil; memoReceipt = nil; pending = HubPendingState(); storageKey = nil
        isRefreshing = false; refreshRequested = false; isSavingTask = false; isSavingMemo = false; isConnecting = true
        taskMessage = "Hub에서 불러오는 중이에요."; calendarMessage = taskMessage
        defer { if ticket == generation { isConnecting = false } }
        do {
            let service = try makeAPI(normalizedURL)
            if !username.isEmpty || !password.isEmpty { try await service.login(username: username, password: password) }
            guard ticket == generation else { return nil }
            api = service
            let origin = normalizedURL.absoluteString
            connectedOrigin = origin
            onConnectionChanged?(service, origin)
            storageKey = "petHub.pending.v1." + origin
            if let data = defaults.data(forKey: storageKey!), let restored = try? JSONDecoder().decode(HubPendingState.self, from: data) { pending = restored }
            defaults.set(origin, forKey: "petPreview.hubURL")
            if pending.memoConflict == true { memoReceipt = memoConflictMessage }
            else if pending.memo != nil { memoReceipt = "이전 저장 결과 확인이 필요해요. 다시 저장을 눌러 주세요." }
            await refresh()
            return ticket == generation ? origin : nil
        } catch {
            guard ticket == generation else { return nil }
            record(error)
            taskMessage = "할 일을 불러오지 못했어요."
            calendarMessage = "일정을 불러오지 못했어요."
            return nil
        }
    }

    func useLocalStorage() {
        onConnectionChanged?(nil, nil)
        generation += 1; api = nil; connectedOrigin = nil; isEnabled = false; refreshRequested = false
        defaults.set(false, forKey: "petHub.enabled")
        isConnecting = false; isRefreshing = false; isSavingTask = false; isSavingMemo = false
        needsLogin = false; errorMessage = nil; taskMessage = nil; calendarMessage = nil
        tasks = []; events = []; loadedCalendarWeek = nil; taskReady = false; calendarReady = false; lastSyncedAt = nil; memoReceipt = nil
    }

    func refresh() async {
        guard isEnabled, let service = api else { return }
        if isRefreshing { refreshRequested = true; return }
        let ticket = generation
        let version = taskVersion
        let beganDuringTaskWrite = isSavingTask
        isRefreshing = true
        defer {
            if ticket == generation {
                isRefreshing = false
                if refreshRequested {
                    refreshRequested = false
                    Task { await refresh() }
                }
            }
        }
        var calendar = Calendar.current; calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: selectedDate)!.start
        let end = calendar.date(byAdding: .day, value: 7, to: start)!
        async let taskResult = Self.result { try await service.tasks() }
        async let eventResult = Self.result { try await service.calendar(from: start, to: end) }
        let (taskResponse, eventResponse) = await (taskResult, eventResult)
        guard ticket == generation, isEnabled else { return }
        if version == taskVersion && !beganDuringTaskWrite && !isSavingTask {
            switch taskResponse {
            case .success(let page):
                tasks = page.tasks.filter { $0.status != "cancelled" }.sorted { !$0.isDone && $1.isDone }
                taskReady = true
                taskMessage = page.partial ? "일부 할 일만 불러왔어요. 전체 목록은 Hub에서 확인해 주세요." : nil
            case .failure(let error):
                taskReady = false; taskMessage = friendly(error)
                if isUnauthorized(error) { needsLogin = true }
            }
        }
        let selectedWeek = calendar.dateInterval(of: .weekOfYear, for: selectedDate)!.start
        if selectedWeek != start { refreshRequested = true }
        else { switch eventResponse {
        case .success(let page):
            events = page.events; loadedCalendarWeek = start; calendarReady = true
            calendarMessage = page.partial ? "일부 일정만 불러왔어요. Hub에서 연결 상태를 확인해 주세요." : nil
        case .failure(let error):
            calendarReady = false; calendarMessage = friendly(error)
            if isUnauthorized(error) { needsLogin = true }
        }
        }
        if taskReady || calendarReady { lastSyncedAt = Date() }
        if case .success = taskResponse, case .success = eventResponse { needsLogin = false }
    }

    /// Returns only the confirmed snapshot, so the caller never clears newer input.
    func createTask(title: String) async -> String? {
        guard isEnabled, canWriteTasks, let service = api else { return nil }
        let normalized = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pending.task != nil || (!normalized.isEmpty && normalized.utf16.count <= 300) else { errorMessage = HubDataError.invalidTask.localizedDescription; return nil }
        let ticket = generation
        isSavingTask = true; errorMessage = nil; taskVersion += 1
        defer { if ticket == generation { isSavingTask = false } }
        let command = pending.task ?? HubTaskCommand(title: normalized)
        pending.task = command; persistPending()
        do {
            let saved = try await service.createTask(command)
            guard ticket == generation else { return nil }
            pending.task = nil; persistPending()
            upsert(saved)
            if command.title != normalized { errorMessage = "이전 할 일의 저장을 확인했어요. 현재 입력은 그대로 남겨 두었어요." }
            return command.title
        } catch {
            guard ticket == generation else { return nil }
            if (error as? HubTransportError) == .conflict {
                // A create may have committed before a lost response, then been
                // edited in Hub. Confirm its stable ID without replaying old fields.
                if let page = try? await service.tasks(), ticket == generation,
                   let existing = page.tasks.first(where: { $0.id.uuidString.lowercased() == command.id }) {
                    pending.task = nil; persistPending(); upsert(existing)
                    errorMessage = "이전 할 일은 이미 Hub에 있어요. 이후 변경한 내용도 유지했어요."
                    return command.title
                }
            }
            guard ticket == generation else { return nil }
            record(error)
            return nil
        }
    }

    @discardableResult
    func toggleTask(_ id: UUID) async -> HubTask? {
        guard isEnabled, canWriteTasks, let service = api, let task = tasks.first(where: { $0.id == id }) else { return nil }
        let ticket = generation
        taskVersion += 1; isSavingTask = true; errorMessage = nil
        defer { if ticket == generation { isSavingTask = false } }
        do {
            let saved = try await service.setTask(task, done: !task.isDone)
            guard ticket == generation else { return nil }
            upsert(saved)
            return saved
        } catch {
            guard ticket == generation else { return nil }
            record(error)
            // A fresh read must resolve an uncertain write before another toggle.
            taskVersion += 1; taskReady = false
            isSavingTask = false
            await refresh()
            return nil
        }
    }

    private var memoConflictMessage: String { "Hub에서 메모가 바뀌었어요. 로컬 입력을 새 항목으로 저장하려면 더보기를 이용해 주세요." }

    func saveMemo(body: String) async {
        guard canSaveMemo, let service = api else { return }
        guard pending.memoConflict != true else { memoReceipt = memoConflictMessage; return }
        guard pending.memo != nil || (!body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && body.utf16.count <= 20_000) else { errorMessage = HubDataError.invalidMemo.localizedDescription; return }
        let ticket = generation
        isSavingMemo = true; errorMessage = nil; memoReceipt = "Hub에 저장 중…"
        defer { if ticket == generation { isSavingMemo = false } }
        do {
            // Resolve an uncertain older command before accepting any newer text.
            let command: HubMemoCommand
            if let previous = pending.memo { command = previous }
            else {
                var prior = pending.savedMemo
                if let saved = prior {
                    let remote = try await service.memo(id: saved.id)
                    guard ticket == generation else { return }
                    guard remote.revision == saved.revision, remote.body == saved.body else { throw HubDataError.conflict }
                    prior = remote // preserve title, tags and contexts from full detail
                    if remote.body == body { memoReceipt = "Hub에 저장됨"; return }
                }
                command = HubMemoCommand(body: body, previous: prior)
                pending.memo = command; persistPending()
            }
            let saved = try await service.saveMemo(command)
            guard ticket == generation else { return }
            pending.savedMemo = saved; pending.memo = nil; persistPending()
            memoReceipt = saved.body == body ? "Hub에 저장됨" : "이전 저장을 확인했어요. 변경한 내용은 다시 저장해 주세요."
        } catch {
            guard ticket == generation else { return }
            if (error as? HubTransportError) == .conflict || (error as? HubDataError) == .conflict {
                // Never replay known-conflicting commands or implicitly create duplicates.
                pending.memo = nil; pending.memoConflict = true; persistPending()
                memoReceipt = memoConflictMessage
            } else { memoReceipt = "Mac에 보관됨 · Hub 저장 확인 필요" }
            record(error)
        }
    }

    func saveMemoAsNew(body: String) async {
        guard canSaveMemoAsNew else { return }
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, body.utf16.count <= 20_000 else {
            errorMessage = HubDataError.invalidMemo.localizedDescription
            return
        }
        pending.savedMemo = nil; pending.memoConflict = nil; persistPending()
        await saveMemo(body: body)
    }

    private func upsert(_ task: HubTask) {
        taskVersion += 1
        if let index = tasks.firstIndex(where: { $0.id == task.id }) { tasks[index] = task }
        else { tasks.insert(task, at: 0) }
        tasks.sort { !$0.isDone && $1.isDone }
    }
    private func persistPending() {
        if let key = storageKey, let data = try? JSONEncoder().encode(pending) { defaults.set(data, forKey: key) }
    }
    private func record(_ error: Error) {
        errorMessage = friendly(error)
        if isUnauthorized(error) { needsLogin = true }
    }
    private func isUnauthorized(_ error: Error) -> Bool { (error as? HubTransportError) == .unauthorized }
    private func friendly(_ error: Error) -> String {
        if let error = error as? HubDataError { return error.localizedDescription }
        if let error = error as? HubTransportError { return error.localizedDescription }
        return "Hub 응답을 확인하지 못했어요. 입력은 이 Mac에 보관돼 있어요."
    }
    nonisolated private static func result<T: Sendable>(_ operation: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await operation()) } catch { return .failure(error) }
    }
}
