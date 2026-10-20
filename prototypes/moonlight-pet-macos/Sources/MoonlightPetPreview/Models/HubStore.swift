import Foundation
import Combine

/// Keeps remote receipts separate from the original local notebook and tasks.
@MainActor
final class HubStore: ObservableObject {
    @Published private(set) var isEnabled: Bool
    @Published private(set) var isConnecting = false
    @Published private(set) var isRefreshing = false
    @Published private(set) var isCreatingTask = false
    @Published private(set) var savingTaskIDs: Set<UUID> = []
    @Published private(set) var deletingTaskIDs: Set<UUID> = []
    var isSavingTask: Bool { isCreatingTask || !savingTaskIDs.isEmpty || !deletingTaskIDs.isEmpty }
    @Published private(set) var isSavingMemo = false
    @Published private(set) var needsLogin = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var taskMessage: String? = "Hub에서 불러오는 중이에요."
    @Published private(set) var taskReceipt: String?
    @Published private(set) var calendarMessage: String? = "Hub에서 불러오는 중이에요."
    @Published private(set) var tasks: [HubTask] = []
    @Published private(set) var events: [HubCalendarEvent] = []
    @Published var selectedDate = Date()
    @Published private(set) var loadedCalendarWeek: Date?
    @Published private(set) var lastSyncedAt: Date?
    @Published private(set) var memoReceipt: String?
    @Published private(set) var taskReady = false
    @Published private(set) var calendarReady = false

    var canWriteTasks: Bool { !isEnabled || (taskReady && !needsLogin && (!isConnecting || api != nil)) }
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
    @Published private(set) var connectionGeneration = 0
    private var authenticationVersion = 0
    private var taskVersion = 0
    private var refreshRequested = false
    private var reconcileTasksAfterWrites = false
    private var storageKey: String?
    private var pending = HubPendingState()

    init(defaults: UserDefaults = .standard, makeAPI: @escaping (URL) throws -> any HubServing = { HubAPI(transport: try HubTransport(baseURL: $0, desktopSession: HubDesktopSessionBridge())) }) {
        self.defaults = defaults; self.makeAPI = makeAPI
        isEnabled = defaults.object(forKey: "petHub.enabled") as? Bool ?? true
    }

    @discardableResult
    func signIn(baseURL: String, username: String, password: String) async -> Bool {
        guard !isConnecting, !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.isEmpty else { return false }
        // connect can return an origin for an anonymous read. A login form must
        // only close after credentials have been accepted, never on that path.
        let origin = await connect(baseURL: baseURL, username: username, password: password)
        return origin != nil && !needsLogin
    }

    @discardableResult
    func connect(baseURL: String, username: String = "", password: String = "", forceReconnect: Bool = false) async -> String? {
        let normalizedURL: URL
        do {
            guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)) else { throw HubTransportError.rejectedURL }
            normalizedURL = try HubTransport.validatedBaseURL(url)
        } catch { record(error); return nil }
        // Connection checks reuse the private cookie jar and active conversations.
        // The form retains a username after login but deliberately clears its password.
        if !forceReconnect, isEnabled, api != nil, connectedOrigin == normalizedURL.absoluteString, password.isEmpty {
            errorMessage = nil
            await refresh()
            return connectedOrigin
        }
        connectionGeneration += 1
        onConnectionChanged?(nil, nil)
        let ticket = connectionGeneration
        isEnabled = true; defaults.set(true, forKey: "petHub.enabled")
        let previousService = api
        api = nil; connectedOrigin = nil; tasks = []; events = []; loadedCalendarWeek = nil; lastSyncedAt = nil
        taskReady = false; calendarReady = false; needsLogin = false
        errorMessage = nil; memoReceipt = nil; taskReceipt = nil; pending = HubPendingState(); storageKey = nil
        isRefreshing = false; refreshRequested = false; isCreatingTask = false; savingTaskIDs = []; deletingTaskIDs = []; reconcileTasksAfterWrites = false; isSavingMemo = false; isConnecting = true
        taskMessage = "Hub에서 불러오는 중이에요."; calendarMessage = taskMessage
        defer { if ticket == connectionGeneration { isConnecting = false } }
        await previousService?.disconnect()
        guard ticket == connectionGeneration else { return nil }
        do {
            let service = try makeAPI(normalizedURL)
            if !username.isEmpty || !password.isEmpty { try await service.login(username: username, password: password) }
            guard ticket == connectionGeneration else { return nil }
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
            return ticket == connectionGeneration ? origin : nil
        } catch {
            guard ticket == connectionGeneration else { return nil }
            record(error)
            taskMessage = "할 일을 불러오지 못했어요."
            calendarMessage = "일정을 불러오지 못했어요."
            return nil
        }
    }

    func useLocalStorage() {
        let previousService = api
        Task { await previousService?.disconnect() }
        onConnectionChanged?(nil, nil)
        connectionGeneration += 1; api = nil; connectedOrigin = nil; isEnabled = false; refreshRequested = false
        defaults.set(false, forKey: "petHub.enabled")
        isConnecting = false; isRefreshing = false; isCreatingTask = false; savingTaskIDs = []; deletingTaskIDs = []; reconcileTasksAfterWrites = false; isSavingMemo = false
        needsLogin = false; errorMessage = nil; taskMessage = nil; calendarMessage = nil
        tasks = []; events = []; loadedCalendarWeek = nil; taskReady = false; calendarReady = false; lastSyncedAt = nil; memoReceipt = nil; taskReceipt = nil
    }

    @discardableResult
    func signOut() async -> Bool {
        guard let service = api, !isConnecting else { return false }
        connectionGeneration += 1
        let ticket = connectionGeneration
        isConnecting = true
        defer { if ticket == connectionGeneration { isConnecting = false } }
        onConnectionChanged?(nil, nil)
        isRefreshing = false; refreshRequested = false; isCreatingTask = false; savingTaskIDs = []; deletingTaskIDs = []; reconcileTasksAfterWrites = false; isSavingMemo = false
        taskReady = false; calendarReady = false; needsLogin = true; memoReceipt = nil
        taskMessage = "Hub 로그인이 필요해요. 입력한 할 일은 그대로 보관합니다."
        calendarMessage = "Hub 로그인이 필요해요."
        do {
            try await service.clearSession()
            guard ticket == connectionGeneration else { return false }
            errorMessage = "자동 로그인을 해제했어요. 다시 사용하려면 로그인해 주세요."
            return true
        } catch {
            guard ticket == connectionGeneration else { return false }
            record(error); return false
        }
    }

    func refresh() async {
        guard isEnabled, let service = api else { return }
        if isRefreshing { refreshRequested = true; return }
        taskReceipt = nil
        let ticket = connectionGeneration
        let wasNeedingLogin = needsLogin
        let version = taskVersion
        let authentication = authenticationVersion
        let beganDuringTaskWrite = isSavingTask
        isRefreshing = true
        defer {
            if ticket == connectionGeneration {
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
        await withTaskGroup(of: RefreshResult.self) { group in
            group.addTask { .tasks(await Self.result { try await service.tasks() }) }
            group.addTask { .calendar(await Self.result { try await service.calendar(from: start, to: end) }) }
            var tasksSucceeded = false
            var calendarSucceeded = false
            for await result in group {
                guard ticket == connectionGeneration, isEnabled else { group.cancelAll(); return }
                switch result {
                case .tasks(let response):
                    if case .success = response { tasksSucceeded = true }
                    guard version == taskVersion, !beganDuringTaskWrite, !isSavingTask else { continue }
                    switch response {
                    case .success(let page):
                        tasks = page.tasks.filter { $0.status != "cancelled" }.sorted { !$0.isDone && $1.isDone }
                        reconcileTasksAfterWrites = false
                        taskReady = true
                        taskMessage = page.partial ? "일부 할 일만 불러왔어요. 전체 목록은 Hub에서 확인해 주세요." : nil
                    case .failure(let error):
                        taskReady = false; taskMessage = friendly(error)
                        if isAuthenticationError(error) { requireLogin(); errorMessage = friendly(error) }
                    }
                case .calendar(let response):
                    if case .success = response { calendarSucceeded = true }
                    let selectedWeek = calendar.dateInterval(of: .weekOfYear, for: selectedDate)!.start
                    guard selectedWeek == start else { refreshRequested = true; continue }
                    switch response {
                    case .success(let page):
                        events = page.events; loadedCalendarWeek = start; calendarReady = true
                        calendarMessage = page.partial ? "일부 일정만 불러왔어요. Hub에서 연결 상태를 확인해 주세요." : nil
                    case .failure(let error):
                        calendarReady = false; calendarMessage = friendly(error)
                        if isAuthenticationError(error) { requireLogin(); errorMessage = friendly(error) }
                    }
                }
                if taskReady || calendarReady { lastSyncedAt = Date() }
            }
            // A read begun before a rejected write cannot confirm the current session.
            if authentication == authenticationVersion, tasksSucceeded, calendarSucceeded {
                needsLogin = false
                if wasNeedingLogin { errorMessage = nil }
            }
        }
    }

    private enum RefreshResult: Sendable {
        case tasks(Result<HubTaskPage, Error>)
        case calendar(Result<HubCalendarPage, Error>)
    }

    /// Returns only the confirmed snapshot, so the caller never clears newer input.
    func createTask(title: String) async -> String? {
        guard isEnabled, canWriteTasks, !isCreatingTask, let service = api else { return nil }
        let normalized = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pending.task != nil || (!normalized.isEmpty && normalized.utf16.count <= 300) else { errorMessage = HubDataError.invalidTask.localizedDescription; return nil }
        let command = pending.task ?? HubTaskCommand(title: normalized)
        guard let commandID = UUID(uuidString: command.id), !isTaskBusy(commandID) else { return nil }
        let ticket = connectionGeneration
        isCreatingTask = true; errorMessage = nil; taskReceipt = nil; taskVersion += 1
        defer {
            if ticket == connectionGeneration { isCreatingTask = false; reconcileTaskWritesIfNeeded() }
        }
        pending.task = command; persistPending()
        do {
            let saved = try await service.createTask(command)
            guard ticket == connectionGeneration else { return nil }
            pending.task = nil; persistPending()
            upsert(saved)
            if command.title != normalized { errorMessage = "이전 할 일의 저장을 확인했어요. 현재 입력은 그대로 남겨 두었어요." }
            return command.title
        } catch {
            guard ticket == connectionGeneration else { return nil }
            if (error as? HubTransportError) == .conflict {
                // A create may have committed before a lost response, then been
                // edited in Hub. Confirm its stable ID without replaying old fields.
                if let page = try? await service.tasks(), ticket == connectionGeneration,
                   let existing = page.tasks.first(where: { $0.id.uuidString.lowercased() == command.id }) {
                    pending.task = nil; persistPending(); upsert(existing)
                    errorMessage = "이전 할 일은 이미 Hub에 있어요. 이후 변경한 내용도 유지했어요."
                    return command.title
                }
            }
            guard ticket == connectionGeneration else { return nil }
            record(error)
            return nil
        }
    }

    @discardableResult
    func toggleTask(_ id: UUID) async -> HubTask? {
        guard isEnabled, canWriteTasks, !isTaskBusy(id), let service = api,
              let task = tasks.first(where: { $0.id == id }) else { return nil }
        let ticket = connectionGeneration
        var ownsReservation = true
        taskVersion += 1; savingTaskIDs.insert(id); errorMessage = nil; taskReceipt = nil
        defer {
            if ticket == connectionGeneration {
                if ownsReservation { savingTaskIDs.remove(id) }
                reconcileTaskWritesIfNeeded()
            }
        }
        do {
            let saved = try await service.setTask(task, done: !task.isDone)
            guard ticket == connectionGeneration else { return nil }
            upsert(saved)
            return saved
        } catch {
            guard ticket == connectionGeneration else { return nil }
            record(error)
            // A fresh read must resolve an uncertain write before another toggle.
            taskVersion += 1; taskReady = false
            savingTaskIDs.remove(id)
            // Refresh can restore readiness before its calendar read finishes.
            // This invocation must not later release a newer same-ID reservation.
            ownsReservation = false
            // A read overlapping another write cannot settle an uncertain result.
            // Reconcile once more after the remaining receipts have arrived.
            if isSavingTask { reconcileTasksAfterWrites = true }
            await refresh()
            return nil
        }
    }

    func isTaskBusy(_ id: UUID) -> Bool {
        savingTaskIDs.contains(id) || deletingTaskIDs.contains(id)
            || (isCreatingTask && pending.task?.id == id.uuidString.lowercased())
    }

    private func reconcileTaskWritesIfNeeded() {
        guard reconcileTasksAfterWrites, !isSavingTask, isEnabled, !needsLogin else { return }
        reconcileTasksAfterWrites = false
        Task { await refresh() }
    }

    private var memoConflictMessage: String { "Hub에서 메모가 바뀌었어요. 로컬 입력을 새 항목으로 저장하려면 더보기를 이용해 주세요." }

    @discardableResult
    func deleteTask(_ id: UUID) async -> Bool {
        (await deleteTasks([id])).contains(id)
    }

    @discardableResult
    func deleteTasks(_ ids: [UUID]) async -> Set<UUID> {
        guard isEnabled, canWriteTasks, let service = api else { return [] }
        let available = Set(tasks.map(\.id))
        var seen: Set<UUID> = []
        let targets = ids.filter { available.contains($0) && seen.insert($0).inserted }
        guard !targets.isEmpty, targets.allSatisfy({ !isTaskBusy($0) }) else { return [] }
        let ticket = connectionGeneration
        var deleted: Set<UUID> = []
        var ownsReservation = true
        taskVersion += 1; deletingTaskIDs.formUnion(targets); errorMessage = nil; taskReceipt = nil
        defer {
            if ticket == connectionGeneration {
                if ownsReservation { deletingTaskIDs.subtract(targets) }
                reconcileTaskWritesIfNeeded()
            }
        }
        // Loaded targets confirm any older create whose receipt was lost. Retire
        // its command before the first await, including later items in the batch.
        if let pendingID = pending.task?.id, targets.contains(where: { $0.uuidString.lowercased() == pendingID }) {
            pending.task = nil; persistPending()
        }
        for id in targets {
            guard ticket == connectionGeneration else { return [] }
            do {
                try await service.deleteTask(id)
                guard ticket == connectionGeneration else { return [] }
                taskVersion += 1
                tasks.removeAll { $0.id == id }
                deleted.insert(id)
            } catch {
                guard ticket == connectionGeneration else { return [] }
                record(error)
                taskVersion += 1; taskReady = false; deletingTaskIDs.subtract(targets)
                // The released targets may be reserved again during refresh.
                ownsReservation = false
                if isSavingTask { reconcileTasksAfterWrites = true }
                // Stop the batch and resolve uncertainty with a read, never a retry.
                if !needsLogin { await refresh() }
                guard ticket == connectionGeneration else { return [] }
                if !deleted.isEmpty {
                    errorMessage = "\(deleted.count)개 삭제됨 · 나머지 삭제를 확인하지 못했어요. " + (errorMessage ?? friendly(error))
                }
                return deleted
            }
        }
        taskReceipt = deleted.count == 1 ? "할 일을 삭제했어요." : "\(deleted.count)개 할 일을 삭제했어요."
        return deleted
    }

    @discardableResult
    func saveMemo(body: String) async -> HubMemoEntry? {
        guard canSaveMemo, let service = api else { return nil }
        guard pending.memoConflict != true else { memoReceipt = memoConflictMessage; return nil }
        guard pending.memo != nil || (!body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && body.utf16.count <= 20_000) else { errorMessage = HubDataError.invalidMemo.localizedDescription; return nil }
        let ticket = connectionGeneration
        isSavingMemo = true; errorMessage = nil; memoReceipt = "Hub에 저장 중…"
        defer { if ticket == connectionGeneration { isSavingMemo = false } }
        do {
            // Resolve an uncertain older command before accepting any newer text.
            let command: HubMemoCommand
            if let previous = pending.memo { command = previous }
            else {
                var prior = pending.savedMemo
                if let saved = prior {
                    let remote = try await service.memo(id: saved.id)
                    guard ticket == connectionGeneration else { return nil }
                    guard remote.revision == saved.revision, remote.body == saved.body else { throw HubDataError.conflict }
                    prior = remote // preserve title, tags and contexts from full detail
                    if remote.body == body { memoReceipt = "Hub에 저장됨"; return remote }
                }
                command = HubMemoCommand(body: body, previous: prior)
                pending.memo = command; persistPending()
            }
            let saved = try await service.saveMemo(command)
            guard ticket == connectionGeneration else { return nil }
            pending.savedMemo = saved; pending.memo = nil; persistPending()
            memoReceipt = saved.body == body ? "Hub에 저장됨" : "이전 저장을 확인했어요. 변경한 내용은 다시 저장해 주세요."
            return saved
        } catch {
            guard ticket == connectionGeneration else { return nil }
            if (error as? HubTransportError) == .conflict || (error as? HubDataError) == .conflict {
                // Never replay known-conflicting commands or implicitly create duplicates.
                pending.memo = nil; pending.memoConflict = true; persistPending()
                memoReceipt = memoConflictMessage
            } else { memoReceipt = "Mac에 보관됨 · Hub 저장 확인 필요" }
            record(error)
            return nil
        }
    }

    @discardableResult
    func saveMemoAsNew(body: String) async -> HubMemoEntry? {
        guard canSaveMemoAsNew else { return nil }
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, body.utf16.count <= 20_000 else {
            errorMessage = HubDataError.invalidMemo.localizedDescription
            return nil
        }
        pending.savedMemo = nil; pending.memoConflict = nil; persistPending()
        return await saveMemo(body: body)
    }

    /// A confirmed quick capture ends this document. The next input gets a new ID.
    func finishMemoCapture(_ saved: HubMemoEntry) {
        guard pending.memo == nil, pending.savedMemo?.id == saved.id,
              pending.savedMemo?.revision == saved.revision else { return }
        pending.savedMemo = nil
        persistPending()
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
        if isAuthenticationError(error) { requireLogin() }
    }
    private func requireLogin() {
        authenticationVersion += 1
        needsLogin = true
    }
    private func isAuthenticationError(_ error: Error) -> Bool {
        guard let error = error as? HubTransportError else { return false }
        return error == .unauthorized || error == .credentialStorage
    }
    private func friendly(_ error: Error) -> String {
        if let error = error as? HubDataError { return error.localizedDescription }
        if let error = error as? HubTransportError { return error.localizedDescription }
        return "Hub 응답을 확인하지 못했어요. 입력은 이 Mac에 보관돼 있어요."
    }
    nonisolated private static func result<T: Sendable>(_ operation: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await operation()) } catch { return .failure(error) }
    }
}
