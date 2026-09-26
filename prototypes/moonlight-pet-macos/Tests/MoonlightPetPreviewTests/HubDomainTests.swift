import Foundation

private enum CheckFailure: Error { case failed(String) }
private func check(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw CheckFailure.failed(message) }
}

private actor ControlledHub: HubServing {
    var failsRead = false
    var failToggle = false
    var holdToggle = false
    var startedToggle = false
    var releaseToggle: CheckedContinuation<Void, Never>?
    func configureToggle(fails: Bool = false, hold: Bool = false) { failToggle = fails; holdToggle = hold }
    func releaseTaskToggle() { holdToggle = false; releaseToggle?.resume(); releaseToggle = nil }
    var failCreateOnce = false
    var failMemoOnce = false
    var memoConflict = false
    func setMemoConflict(_ value: Bool) { memoConflict = value }
    var conflictCreateOnce = false
    var confirmedTask: HubTask?
    var holdRead = false
    var startedRead = false
    var releaseRead: CheckedContinuation<Void, Never>?
    var creates: [HubTaskCommand] = []
    var saves: [HubMemoCommand] = []
    var savedMemo: HubMemoEntry?
    var holdCreate = false
    var startedCreate = false
    var releaseCreate: CheckedContinuation<Void, Never>?
    var holdCalendar = false
    var startedCalendar = false
    var releaseCalendar: CheckedContinuation<Void, Never>?
    var partial = false
    let row = HubTask(id: UUID(), title: "계약 검증", status: "todo", updatedAt: "2026-09-25T00:00:00.123456+00:00")
    func configure(readError: Bool = false, createError: Bool = false, memoError: Bool = false, hold: Bool = false, partial: Bool = false) {
        failsRead = readError; failCreateOnce = createError; failMemoOnce = memoError; holdRead = hold; self.partial = partial
    }
    func holdWritesAndCalendar() { holdCreate = true; holdCalendar = true }
    func releaseWrite() { holdCreate = false; releaseCreate?.resume(); releaseCreate = nil }
    func releaseEvents() { holdCalendar = false; releaseCalendar?.resume(); releaseCalendar = nil }
    func login(username: String, password: String) async throws {}
    func tasks() async throws -> HubTaskPage {
        if holdRead { startedRead = true; await withCheckedContinuation { releaseRead = $0 } }
        if failsRead { throw HubTransportError.offline }
        return HubTaskPage(tasks: [row] + (confirmedTask.map { [$0] } ?? []), partial: partial)
    }
    func confirmCreatedElsewhere() {
        guard let command = creates.last else { return }
        confirmedTask = HubTask(id: UUID(uuidString: command.id)!, title: "Hub에서 바꾼 제목", status: "done", updatedAt: "2026-09-25T03:00:00Z")
        conflictCreateOnce = true
    }
    func release() { holdRead = false; releaseRead?.resume(); releaseRead = nil }
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage {
        if holdCalendar { startedCalendar = true; await withCheckedContinuation { releaseCalendar = $0 } }
        return HubCalendarPage(events: [], partial: partial)
    }
    func createTask(_ command: HubTaskCommand) async throws -> HubTask {
        creates.append(command)
        if holdCreate { startedCreate = true; await withCheckedContinuation { releaseCreate = $0 } }
        if conflictCreateOnce { conflictCreateOnce = false; throw HubTransportError.conflict }
        if failCreateOnce { failCreateOnce = false; throw HubTransportError.timeout }
        return HubTask(id: UUID(uuidString: command.id)!, title: command.title, status: "todo", updatedAt: "2026-09-25T01:00:00Z")
    }
    func setTask(_ task: HubTask, done: Bool) async throws -> HubTask {
        if holdToggle { startedToggle = true; await withCheckedContinuation { releaseToggle = $0 } }
        if failToggle { throw HubTransportError.conflict }
        return HubTask(id: task.id, title: task.title, status: done ? "done" : "todo", updatedAt: "2026-09-25T02:00:00Z")
    }
    func memo(id: UUID) async throws -> HubMemoEntry {
        guard let savedMemo else { throw HubDataError.invalidResponse }
        return savedMemo
    }
    func saveMemo(_ command: HubMemoCommand) async throws -> HubMemoEntry {
        saves.append(command)
        if memoConflict { throw HubDataError.conflict }
        if failMemoOnce { failMemoOnce = false; throw HubTransportError.timeout }
        let saved = HubMemoEntry(id: UUID(uuidString: command.entryId)!, body: command.body, title: command.title, occurredAt: command.occurredAt, revision: command.expectedRevision + 1, noteMeta: command.noteMeta, contexts: command.contexts)
        savedMemo = saved
        return saved
    }
    func changeMemoElsewhere() {
        guard let old = savedMemo else { return }
        savedMemo = HubMemoEntry(id: old.id, body: "Hub에서 수정", title: old.title, occurredAt: old.occurredAt, revision: old.revision + 1, noteMeta: old.noteMeta, contexts: old.contexts)
    }
}

@main
struct HubDomainTests {
    @MainActor static func main() async {
        do {
            try modelChecks()
            try await recoveryChecks()
            try await storeChecks()
            try await captureChecks()
            let apiChecks = try await runHubAPIContractTests()
            if CommandLine.arguments.contains("--live-read") { try await liveRead() }
            print("PASS: Hub model/state checks, API contract checks (\(apiChecks))")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor static func captureChecks() async throws {
        let suite = "pet-capture-contract-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "http://127.0.0.1:3000")
        await api.configure(memoError: true)
        let failed = await store.saveMemo(body: "이전 메모")
        try check(failed == nil && store.hasPendingMemo, "Unconfirmed save must not acknowledge clearing")
        let receipt = await store.saveMemo(body: "새로 작성한 메모")
        try check(receipt?.body == "이전 메모", "Retry must identify the older saved body, not acknowledge newer input")
        store.finishMemoCapture(receipt!)
        let next = await store.saveMemo(body: "새로 작성한 메모")
        try check(next != nil && next?.id != receipt?.id, "The next capture must not overwrite the completed memo")
        store.finishMemoCapture(next!)
        let reopened = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopened.connect(baseURL: "http://127.0.0.1:3000")
        let third = await reopened.saveMemo(body: "다음 실행에서 작성")
        try check(third?.id != next?.id, "Completed capture binding must stay detached across restart")
    }

    static func modelChecks() throws {
        let id = UUID().uuidString.lowercased()
        let stamp = "2026-09-25T01:02:03.123456+00:00"
        for key in ["updatedAt", "updated_at"] {
            let data = try JSONSerialization.data(withJSONObject: ["id": id, "title": "계약 검증", "status": "done", key: stamp])
            let task = try JSONDecoder().decode(HubTask.self, from: data)
            try check(task.updatedAt == stamp && task.isDone, "Task read/write timestamp fidelity")
        }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let event = try HubCalendarEvent(id: "x", title: "날짜 경계", startText: "2026-09-25T00:00:00", endText: "2026-09-27T00:00:00", allDay: true, location: nil, calendar: calendar)
        let first = calendar.date(from: DateComponents(year: 2026, month: 9, day: 25))!
        try check(event.occurs(on: first, calendar: calendar), "All-day starts in local calendar")
        try check(event.occurs(on: calendar.date(byAdding: .day, value: 1, to: first)!, calendar: calendar), "All-day includes interior day")
        try check(!event.occurs(on: calendar.date(byAdding: .day, value: 2, to: first)!, calendar: calendar), "All-day end exclusive")
        let entry = HubMemoEntry(id: UUID(), body: "처음", title: "제목", occurredAt: "2026-09-25T01:00:00Z", revision: 4, noteMeta: ["kind": .string("note"), "tags": .array([.string("검토")])], contexts: [.init(type: "project", id: UUID().uuidString.lowercased())])
        let command = HubMemoCommand(body: "수정", previous: entry)
        let restored = try JSONDecoder().decode(HubMemoCommand.self, from: JSONEncoder().encode(command))
        try check(command == restored && restored.expectedRevision == 4 && restored.noteMeta == entry.noteMeta && restored.contexts == entry.contexts && restored.entryId == entry.id.uuidString.lowercased(), "Memo immutable command identity and metadata")
    }

    @MainActor static func storeChecks() async throws {
        let suite = "MoonlightPetPreview.HubCheck.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("보존할 로컬 초안", forKey: "petPreview.memo")
        let api = ControlledHub()
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://hub.test")
        try check(store.taskReady && store.calendarReady && store.tasks.count == 1 && store.canWriteTasks, "Live read enables mutations")
        let taskID = store.tasks[0].id
        let completed = await store.toggleTask(taskID)
        try check(completed?.isDone == true && !store.isSavingTask, "Grace period requires a confirmed completion receipt")
        let undone = await store.toggleTask(taskID)
        try check(undone?.isDone == false, "Undo must confirm the source is open")
        await api.configureToggle(fails: true)
        let failed = await store.toggleTask(taskID)
        try check(failed == nil && store.tasks.first?.isDone == false && !store.isSavingTask, "A failed completion must not supply a grace-period receipt")
        await api.configureToggle()
        await api.configure(readError: true)
        await store.refresh()
        try check(!store.taskReady && !store.canWriteTasks && store.tasks.count == 1 && store.taskMessage != nil, "Read failure preserves rows and blocks writes")
        await api.configure(partial: true)
        await store.refresh()
        try check(store.taskReady && store.taskMessage != nil && store.calendarMessage != nil, "Partial read stays explicit")
        await api.configure(createError: true)
        _ = await store.createTask(title: "첫 입력")
        let reopened = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopened.connect(baseURL: "https://HUB.test:443/")
        let result = await reopened.createTask(title: "")
        let commands = await api.creates
        try check(commands.count == 2 && commands[0] == commands[1] && result == "첫 입력", "Uncertain create reuses persisted command across restart")
        await api.configure(memoError: true)
        await reopened.saveMemo(body: "첫 메모")
        await reopened.saveMemo(body: "")
        let saves = await api.saves
        try check(saves.count == 2 && saves[0] == saves[1] && reopened.savedMemoBody == "첫 메모", "New typing cannot overtake unresolved memo")
        await reopened.saveMemo(body: "더 새로운 메모")
        let updated = await api.saves
        try check(updated.count == 3 && updated[2].entryId == updated[1].entryId && updated[2].requestId != updated[1].requestId && updated[2].expectedRevision == 1, "Subsequent memo save uses new request and current revision")
        await api.changeMemoElsewhere()
        await reopened.saveMemo(body: "로컬 수정")
        let conflicted = await api.saves
        try check(conflicted.count == 3 && reopened.errorMessage != nil, "External edit is not overwritten")
        try check(defaults.string(forKey: "petPreview.memo") == "보존할 로컬 초안", "Hub operations preserve original local draft")
        let slow = ControlledHub(); await slow.configure(hold: true)
        let late = HubStore(defaults: defaults, makeAPI: { _ in slow })
        let loading = Task { await late.connect(baseURL: "https://late.test") }
        while !(await slow.startedRead) { await Task.yield() }
        late.useLocalStorage()
        await slow.release(); _ = await loading.value
        try check(!late.isEnabled && late.tasks.isEmpty && !late.isConnecting && !late.canSaveMemo, "Late responses cannot replace local state")

        let racingAPI = ControlledHub()
        let racing = HubStore(defaults: defaults, makeAPI: { _ in racingAPI })
        await racing.connect(baseURL: "https://race.test")
        await racingAPI.holdWritesAndCalendar()
        let writing = Task { await racing.createTask(title: "새로 저장") }
        while !(await racingAPI.startedCreate) { await Task.yield() }
        let refreshing = Task { await racing.refresh() }
        while !(await racingAPI.startedCalendar) { await Task.yield() }
        await racingAPI.releaseWrite(); _ = await writing.value
        await racingAPI.releaseEvents(); await refreshing.value
        try check(racing.tasks.contains { $0.title == "새로 저장" }, "Read begun during write cannot overwrite its receipt")

        let lateAPI = ControlledHub()
        let lateWrite = HubStore(defaults: defaults, makeAPI: { _ in lateAPI })
        await lateWrite.connect(baseURL: "https://write.test")
        await lateAPI.holdWritesAndCalendar()
        let pendingWrite = Task { await lateWrite.createTask(title: "늦은 저장") }
        while !(await lateAPI.startedCreate) { await Task.yield() }
        lateWrite.useLocalStorage()
        await lateAPI.releaseWrite(); _ = await pendingWrite.value
        try check(lateWrite.tasks.isEmpty && !lateWrite.isEnabled, "Late save receipt cannot restore disconnected state")

        let togglingAPI = ControlledHub()
        let toggling = HubStore(defaults: defaults, makeAPI: { _ in togglingAPI })
        await toggling.connect(baseURL: "https://toggle.test")
        let togglingID = toggling.tasks[0].id
        await togglingAPI.configureToggle(hold: true)
        let pendingToggle = Task { await toggling.toggleTask(togglingID) }
        while !(await togglingAPI.startedToggle) { await Task.yield() }
        toggling.useLocalStorage()
        await togglingAPI.releaseTaskToggle()
        let lateReceipt = await pendingToggle.value
        try check(lateReceipt == nil && toggling.tasks.isEmpty, "A late completion cannot reintroduce an old-origin row")

        let conflictAPI = ControlledHub()
        let conflict = HubStore(defaults: defaults, makeAPI: { _ in conflictAPI })
        await conflict.connect(baseURL: "https://conflict.test")
        await conflictAPI.configure(createError: true)
        _ = await conflict.createTask(title: "생성 직후 수정")
        await conflictAPI.confirmCreatedElsewhere()
        let recovered = await conflict.createTask(title: "")
        try check(recovered == "생성 직후 수정" && !conflict.hasPendingTask && conflict.tasks.contains { $0.title == "Hub에서 바꾼 제목" && $0.isDone }, "Confirmed task ID resolves duplicate conflict without reverting remote edits")


    }

    @MainActor static func recoveryChecks() async throws {
        let suite = "MoonlightPetPreview.Recovery.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        var creations = 0, disconnects = 0
        let store = HubStore(defaults: defaults, makeAPI: { _ in creations += 1; return api })
        store.onConnectionChanged = { service, _ in if service == nil { disconnects += 1 } }
        await store.connect(baseURL: "https://recover.test", username: "operator", password: "test-only")
        await store.connect(baseURL: "https://RECOVER.test:443/", username: "operator", password: "")
        try check(creations == 1 && disconnects == 1 && store.taskReady, "Checking same origin must preserve authenticated transport and downstream sessions")
        let rejected = await store.connect(baseURL: "https://recover.test/dashboard")
        try check(rejected == nil && store.hasConnection && store.taskReady, "Rejected address must not be returned as an accepted browser destination")
        let accepted = await store.connect(baseURL: "https://RECOVER.test:443/")
        try check(accepted == "https://recover.test" && creations == 1, "Connection form must receive the actual canonical origin")
        let initialWeek = store.loadedCalendarWeek
        store.selectedDate = Calendar.current.date(byAdding: .day, value: 7, to: store.selectedDate)!
        await store.refresh()
        try check(store.loadedCalendarWeek != nil && store.loadedCalendarWeek != initialWeek, "Calendar refresh must track the week actually loaded")
        await store.saveMemo(body: "원본")
        await store.saveMemoAsNew(body: String(repeating: "가", count: 20_001))
        try check(store.savedMemoBody == "원본", "Invalid new memo must not detach existing remote binding")
        await store.saveMemo(body: "수정")
        let commands = await api.saves
        try check(commands.count == 2 && commands[0].entryId == commands[1].entryId, "Normal save after invalid new input must still update the same memo")
        await api.setMemoConflict(true)
        await store.saveMemo(body: "유실 응답 이후 로컬 입력")
        try check(!store.hasPendingMemo && store.canSaveMemoAsNew, "Confirmed data conflict must release pending retry and offer new-item recovery")
        let before = await api.saves.count
        await store.saveMemo(body: "유실 응답 이후 로컬 입력")
        let afterRetry = await api.saves.count
        try check(afterRetry == before, "Ordinary save must not replay a known-conflicting memo")
        let reopened = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopened.connect(baseURL: "https://recover.test")
        await reopened.saveMemo(body: "유실 응답 이후 로컬 입력")
        let afterRestart = await api.saves.count
        try check(afterRestart == before, "Conflict protection must survive restart")
        await api.setMemoConflict(false)
        await reopened.saveMemoAsNew(body: "사용자가 새 항목으로 선택")
        try check(reopened.savedMemoBody == "사용자가 새 항목으로 선택" && !reopened.hasPendingMemo, "Explicit new-item save must recover from conflict")
    }

    static func liveRead() async throws {
        let api = HubAPI(transport: try HubTransport(baseURL: URL(string: "http://127.0.0.1:3000")!))
        let tasks = try await api.tasks()
        var c = Calendar.current; c.firstWeekday = 2
        let start = c.dateInterval(of: .weekOfYear, for: Date())!.start
        let page = try await api.calendar(from: start, to: c.date(byAdding: .day, value: 7, to: start)!)
        print("Live read only: \(tasks.tasks.count) tasks, \(page.events.count) week events; partial=\(tasks.partial || page.partial)")
    }
}
