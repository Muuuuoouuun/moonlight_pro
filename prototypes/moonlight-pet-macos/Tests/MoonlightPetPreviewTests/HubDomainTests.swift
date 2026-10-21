import Foundation

private enum CheckFailure: Error { case failed(String) }
private func check(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw CheckFailure.failed(message) }
}

private actor ControlledHub: HubServing {
    var deletes: [UUID] = []
    var deletedIDs: Set<UUID> = []
    var deleteFailure: HubTransportError?
    var additionalTasks: [HubTask] = []
    var failedDeleteID: UUID?
    var heldDeleteID: UUID?
    func configureBatch(rows: [HubTask], failedID: UUID? = nil, heldID: UUID? = nil) {
        additionalTasks = rows; failedDeleteID = failedID; heldDeleteID = heldID
    }
    var commitsDeleteBeforeFailure = false
    var holdDelete = false
    var startedDelete = false
    var releaseDelete: CheckedContinuation<Void, Never>?
    func configureDelete(failure: HubTransportError? = nil, hold: Bool = false, commitsBeforeFailure: Bool = false) {
        deleteFailure = failure; holdDelete = hold; commitsDeleteBeforeFailure = commitsBeforeFailure
    }
    func releaseTaskDelete() { holdDelete = false; heldDeleteID = nil; releaseDelete?.resume(); releaseDelete = nil }
    var credentialFailure = false
    var disconnectCount = 0
    func setCredentialFailure(_ value: Bool) { credentialFailure = value }
    var anonymous = false
    func setAnonymous(_ value: Bool) { anonymous = value }
    var rejectsLogin = false
    func rejectLogin(_ value: Bool) { rejectsLogin = value }
    var rejectsReads = false
    func rejectReads(_ value: Bool) { rejectsReads = value }
    var rejectsWrites = false
    func rejectWrites(_ value: Bool) { rejectsWrites = value }
    var failsRead = false
    var failToggle = false
    var holdToggle = false
    var startedToggle = false
    var toggleWaiters: [UUID: CheckedContinuation<Void, Never>] = [:]
    var toggledIDs: [UUID] = []
    var extraTasks: [HubTask] = []
    var taskStates: [UUID: HubTask] = [:]
    var failedToggleIDs: Set<UUID> = []
    func addTask(_ task: HubTask) { extraTasks.append(task) }
    func failTaskToggle(_ id: UUID) { failedToggleIDs.insert(id) }
    func configureToggle(fails: Bool = false, hold: Bool = false) { failToggle = fails; holdToggle = hold }
    func releaseTaskToggle(_ id: UUID? = nil) {
        if let id { toggleWaiters.removeValue(forKey: id)?.resume(); return }
        holdToggle = false
        let waiting = toggleWaiters.values; toggleWaiters.removeAll()
        for waiter in waiting { waiter.resume() }
    }
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
    func allMutationsStarted() -> Bool { startedCreate && startedToggle && startedDelete }
    func holdTaskCreation() { holdCreate = true }
    func holdEvents() { holdCalendar = true; startedCalendar = false }
    func holdWritesAndCalendar() { holdCreate = true; holdCalendar = true }
    func releaseWrite() { holdCreate = false; releaseCreate?.resume(); releaseCreate = nil }
    func releaseEvents() { holdCalendar = false; releaseCalendar?.resume(); releaseCalendar = nil }
    func login(username: String, password: String) async throws {
        if rejectsLogin { throw HubTransportError.unauthorized }
    }
    func clearSession() async throws { anonymous = true }
    func disconnect() async { disconnectCount += 1 }
    func tasks() async throws -> HubTaskPage {
        if credentialFailure { throw HubTransportError.credentialStorage }
        if anonymous { throw HubTransportError.unauthorized }
        if rejectsReads { throw HubTransportError.unauthorized }
        let snapshot = ([row] + extraTasks + additionalTasks + (confirmedTask.map { [$0] } ?? []))
            .map { taskStates[$0.id] ?? $0 }.filter { !deletedIDs.contains($0.id) }
        if holdRead { startedRead = true; await withCheckedContinuation { releaseRead = $0 } }
        if failsRead { throw HubTransportError.offline }
        return HubTaskPage(tasks: snapshot, partial: partial)
    }
    func confirmCreatedElsewhere() {
        guard let command = creates.last else { return }
        confirmedTask = HubTask(id: UUID(uuidString: command.id)!, title: "Hub에서 바꾼 제목", status: "done", updatedAt: "2026-09-25T03:00:00Z")
        conflictCreateOnce = true
    }
    func release() { holdRead = false; releaseRead?.resume(); releaseRead = nil }
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage {
        if credentialFailure { throw HubTransportError.credentialStorage }
        if anonymous { throw HubTransportError.unauthorized }
        if rejectsReads { throw HubTransportError.unauthorized }
        if holdCalendar { startedCalendar = true; await withCheckedContinuation { releaseCalendar = $0 } }
        return HubCalendarPage(events: [], partial: partial)
    }
    func createTask(_ command: HubTaskCommand) async throws -> HubTask {
        creates.append(command)
        if rejectsWrites { throw HubTransportError.unauthorized }
        if holdCreate { startedCreate = true; await withCheckedContinuation { releaseCreate = $0 } }
        if conflictCreateOnce { conflictCreateOnce = false; throw HubTransportError.conflict }
        if failCreateOnce { failCreateOnce = false; throw HubTransportError.timeout }
        return HubTask(id: UUID(uuidString: command.id)!, title: command.title, status: "todo", updatedAt: "2026-09-25T01:00:00Z")
    }
    func setTask(_ task: HubTask, done: Bool) async throws -> HubTask {
        toggledIDs.append(task.id)
        if holdToggle { startedToggle = true; await withCheckedContinuation { toggleWaiters[task.id] = $0 } }
        if failToggle || failedToggleIDs.contains(task.id) { throw HubTransportError.conflict }
        let saved = HubTask(id: task.id, title: task.title, status: done ? "done" : "todo", updatedAt: "2026-09-25T02:00:00Z")
        taskStates[task.id] = saved
        return saved
    }
    func deleteTask(_ id: UUID) async throws {
        deletes.append(id)
        if holdDelete || heldDeleteID == id { startedDelete = true; await withCheckedContinuation { releaseDelete = $0 } }
        if failedDeleteID == id { throw HubTransportError.timeout }
        if commitsDeleteBeforeFailure { deletedIDs.insert(id) }
        if let deleteFailure { throw deleteFailure }
        deletedIDs.insert(id)
    }
    func memo(id: UUID) async throws -> HubMemoEntry {
        guard let savedMemo else { throw HubDataError.invalidResponse }
        return savedMemo
    }
    func saveMemo(_ command: HubMemoCommand) async throws -> HubMemoEntry {
        saves.append(command)
        if rejectsWrites { throw HubTransportError.unauthorized }
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
            try await sharedSessionReplacementChecks()
            try await progressiveLoadingChecks()
            try await taskResponsivenessChecks()
            try await concurrentTaskRecoveryChecks()
            try await toggleReservationOwnershipChecks()
            try await bulkDeleteReservationOwnershipChecks()
            try await loginChecks()
            try await anonymousMemoNoticeChecks()
            try await connectionRecoveryChecks()
            try await sessionExpiryChecks()
            try await recoveryChecks()
            try await storeChecks()
            try await taskDeletionChecks()
            try await mixedTaskMutationChecks()
            try await bulkDeletionChecks()
            try await pendingCreateBulkDeletionChecks()
            try await pendingCreateToggleChecks()
            try await captureChecks()
            let apiChecks = try await runHubAPIContractTests()
            if CommandLine.arguments.contains("--live-read") { try await liveRead() }
            print("PASS: Hub model/state checks, API contract checks (\(apiChecks))")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor static func taskResponsivenessChecks() async throws {
        let suite = "pet-task-response-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let second = HubTask(id: UUID(), title: "동시 저장 검사", status: "todo", updatedAt: "2026-09-25T00:00:00Z")
        await api.addTask(second)
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://response.test")
        let firstID = api.row.id
        await api.configureToggle(hold: true)
        let first = Task { await store.toggleTask(firstID) }
        while !(await api.startedToggle) { await Task.yield() }
        let otherRowsResponsive = store.canWriteTasks
        if !otherRowsResponsive {
            await api.releaseTaskToggle(); _ = await first.value
            try check(false, "A delayed check must not lock all other task rows or task creation")
        }
        let secondWrite = Task { await store.toggleTask(second.id) }
        let deadline = Date().addingTimeInterval(2)
        while await api.toggledIDs.count < 2 && Date() < deadline { await Task.yield() }
        let independentWrites = await api.toggledIDs.count == 2
        let duplicate = await store.toggleTask(firstID)
        let pendingIDs = store.savingTaskIDs
        await store.refresh()
        let noPrematureCompletion = store.tasks.allSatisfy { !$0.isDone }
        let created = await store.createTask(title: "체크 중 추가 검사")
        await api.releaseTaskToggle(firstID)
        let firstReceipt = await first.value
        let stillSaving = store.isSavingTask
        await api.releaseTaskToggle(); let secondReceipt = await secondWrite.value
        try check(independentWrites && duplicate == nil, "Different rows save concurrently; the same row is never submitted twice")
        try check(firstReceipt?.isDone == true && stillSaving && secondReceipt?.isDone == true && !store.isSavingTask,
                  "One receipt must not clear another row's pending state")
        try check([firstID, second.id].allSatisfy { id in store.tasks.contains { $0.id == id && $0.isDone } },
                  "Both confirmed receipts must remain visible")
        try check(pendingIDs == [firstID, second.id] && noPrematureCompletion,
                  "Pending rows are published immediately without claiming completion, even across refresh")
        try check(created != nil && store.tasks.contains { $0.title == created }, "Task creation stays available while checks save")
        print("PASS: delayed task writes, immediate pending state, concurrent creation, duplicate prevention and receipt ordering (6)")
    }

    @MainActor static func concurrentTaskRecoveryChecks() async throws {
        let suite = "pet-task-recovery-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let second = HubTask(id: UUID(), title: "실패 격리 검사", status: "todo", updatedAt: "2026-09-25T00:00:00Z")
        await api.addTask(second)
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://recovery.test")
        let firstID = api.row.id
        await api.failTaskToggle(firstID)
        await api.configureToggle(hold: true)
        let first = Task { await store.toggleTask(firstID) }
        let secondWrite = Task { await store.toggleTask(second.id) }
        let deadline = Date().addingTimeInterval(2)
        while await api.toggledIDs.count < 2 && Date() < deadline { await Task.yield() }
        await api.releaseTaskToggle(firstID)
        let rejected = await first.value
        let needsReconciliation = !store.taskReady && store.savingTaskIDs.contains(second.id)
        await api.releaseTaskToggle(); let accepted = await secondWrite.value
        let recoveryDeadline = Date().addingTimeInterval(2)
        while !store.taskReady && Date() < recoveryDeadline { await Task.yield() }
        try check(rejected == nil && accepted?.isDone == true && needsReconciliation,
                  "A failed check must not cancel another row or pretend the uncertain result is confirmed")
        try check(store.taskReady && store.canWriteTasks && !store.isSavingTask,
                  "Reconcile again after remaining writes so an overlapping read cannot leave the list locked")
        try check(store.tasks.contains { $0.id == firstID && !$0.isDone }
                  && store.tasks.contains { $0.id == second.id && $0.isDone } && store.errorMessage != nil,
                  "Recovery preserves the successful completion, restores the failed row and exposes the error")
        print("PASS: concurrent check failure, delayed reconciliation, successful receipt preservation (3)")
    }

    @MainActor static func toggleReservationOwnershipChecks() async throws {
        let suite = "pet-toggle-reservation-owner-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let other = HubTask(id: UUID(), title: "독립 체크", status: "todo", updatedAt: "2026-10-19T00:00:00Z")
        await api.addTask(other)
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://toggle-reservation-owner.test")
        let id = api.row.id
        await api.holdEvents()
        await api.configureToggle(fails: true)
        let oldWrite = Task { await store.toggleTask(id) }
        let recoveryDeadline = Date().addingTimeInterval(2)
        while Date() < recoveryDeadline {
            if await api.startedCalendar, store.taskReady, store.isRefreshing { break }
            await Task.yield()
        }
        let calendarHeld = await api.startedCalendar
        guard calendarHeld && store.taskReady && store.isRefreshing else {
            await api.releaseEvents(); _ = await oldWrite.value
            try check(false, "Failed toggle must restore task readiness while its calendar read remains held")
            return
        }
        let releasedForRecovery = !store.isTaskBusy(id) && store.canWriteTasks
        await api.configureToggle(hold: true)
        let newWrite = Task { await store.toggleTask(id) }
        let writeDeadline = Date().addingTimeInterval(2)
        while await api.toggledIDs.count < 2 && Date() < writeDeadline { await Task.yield() }
        let attemptsBeforeOldReturns = await api.toggledIDs
        let reservedBeforeOldReturns = store.savingTaskIDs == [id] && store.isTaskBusy(id)
        // Disarm future holds without releasing the new write. A forbidden
        // duplicate must report extra I/O rather than overwrite its continuation.
        await api.configureToggle()
        await api.releaseEvents()
        let oldReceipt = await oldWrite.value
        let reservedAfterOldReturns = store.savingTaskIDs == [id] && store.isTaskBusy(id)
        let duplicateToggle = await store.toggleTask(id)
        let duplicateDelete = await store.deleteTasks([id])
        let attemptsAfterDuplicates = await api.toggledIDs
        let deletesAfterDuplicates = await api.deletes
        let independentReceipt = await store.toggleTask(other.id)
        let reservedAfterIndependentWrite = store.savingTaskIDs == [id] && store.isTaskBusy(id)
        await api.releaseTaskToggle()
        let newReceipt = await newWrite.value
        let allAttempts = await api.toggledIDs
        // All held continuations are released and both spawned writes joined
        // before any throwing assertion, including when a duplicate escaped.
        try check(releasedForRecovery && attemptsBeforeOldReturns == [id, id] && reservedBeforeOldReturns,
                  "A newer same-ID toggle must reserve the recovered row before the old refresh returns")
        try check(oldReceipt == nil && reservedAfterOldReturns,
                  "The failed toggle's defer must leave the newer toggle's reservation intact")
        try check(duplicateToggle == nil && duplicateDelete.isEmpty,
                  "A third same-ID toggle or delete must remain blocked until the newer receipt")
        try check(attemptsAfterDuplicates == [id, id] && deletesAfterDuplicates.isEmpty,
                  "Blocked same-ID mutations must issue no additional transport requests")
        try check(independentReceipt?.isDone == true && reservedAfterIndependentWrite,
                  "An unrelated task must remain writable without releasing the held toggle")
        try check(newReceipt?.id == id && newReceipt?.isDone == true && allAttempts == [id, id, other.id],
                  "Only the newer toggle's own receipt must confirm the recovered task")
        try check(!store.isSavingTask && !store.isTaskBusy(id)
                  && store.tasks.contains { $0.id == id && $0.isDone },
                  "The newer toggle must release its reservation when its confirmed result arrives")
        print("PASS: toggle reservation ownership across failed-write refresh, duplicate refusal and independent writes (7)")
    }

    @MainActor static func bulkDeleteReservationOwnershipChecks() async throws {
        let suite = "pet-delete-reservation-owner-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let rows = (1...3).map { HubTask(id: UUID(), title: "삭제 예약 \($0)", status: "todo", updatedAt: "2026-10-19T00:00:00Z") }
        let ids = rows.map(\.id)
        await api.configureBatch(rows: rows, failedID: ids[1])
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://delete-reservation-owner.test")
        let otherID = api.row.id
        await api.holdEvents()
        let oldWrite = Task { await store.deleteTasks([ids[0], ids[1]]) }
        let recoveryDeadline = Date().addingTimeInterval(2)
        while Date() < recoveryDeadline {
            if await api.startedCalendar, store.taskReady, store.isRefreshing { break }
            await Task.yield()
        }
        let calendarHeld = await api.startedCalendar
        guard calendarHeld && store.taskReady && store.isRefreshing else {
            await api.releaseEvents(); _ = await oldWrite.value
            try check(false, "Failed bulk delete must restore task readiness while its calendar read remains held")
            return
        }
        let recoveredRemainingRows = store.deletingTaskIDs.isEmpty && store.canWriteTasks
            && !store.tasks.contains { $0.id == ids[0] }
            && store.tasks.contains { $0.id == ids[1] }
        await api.configureBatch(rows: rows)
        await api.configureDelete(hold: true)
        // Old [A, B] and new [B, C] overlap only at B. C must not hide B's
        // reservation loss by keeping the aggregate isSavingTask flag true.
        let newWrite = Task { await store.deleteTasks([ids[1], ids[2]]) }
        let writeDeadline = Date().addingTimeInterval(2)
        while await api.deletes.count < 3 && Date() < writeDeadline { await Task.yield() }
        let attemptsBeforeOldReturns = await api.deletes
        let reservedBeforeOldReturns = store.deletingTaskIDs == [ids[1], ids[2]]
        await api.configureDelete() // Keep the current waiter; do not hold forbidden probes.
        await api.releaseEvents()
        let oldReceipt = await oldWrite.value
        let reservedAfterOldReturns = store.deletingTaskIDs == [ids[1], ids[2]]
            && store.isTaskBusy(ids[1]) && store.isTaskBusy(ids[2])
        let duplicateDelete = await store.deleteTasks([ids[1], otherID])
        let duplicateToggle = await store.toggleTask(ids[1])
        let deletesAfterDuplicates = await api.deletes
        let togglesAfterDuplicates = await api.toggledIDs
        let independentReceipt = await store.toggleTask(otherID)
        let reservedAfterIndependentWrite = store.deletingTaskIDs == [ids[1], ids[2]]
        await api.releaseTaskDelete()
        let newReceipt = await newWrite.value
        let allDeletes = await api.deletes
        // Release and join both writes before assertions even if a duplicate
        // reached transport, so a failure cannot strand the original waiter.
        try check(recoveredRemainingRows && attemptsBeforeOldReturns == [ids[0], ids[1], ids[1]] && reservedBeforeOldReturns,
                  "A partially overlapping newer batch must reserve both targets during the old reconciliation")
        try check(oldReceipt == [ids[0]] && reservedAfterOldReturns,
                  "The failed batch's defer must preserve every reservation owned by the newer batch")
        try check(duplicateDelete.isEmpty && duplicateToggle == nil,
                  "An overlapping batch and same-ID toggle must remain blocked after old cleanup")
        try check(deletesAfterDuplicates == [ids[0], ids[1], ids[1]] && togglesAfterDuplicates.isEmpty,
                  "Rejected mutations must send no requests, including the unrelated target of an overlapping batch")
        try check(independentReceipt?.id == otherID && independentReceipt?.isDone == true && reservedAfterIndependentWrite,
                  "A separate unrelated write must remain available while both newer batch targets stay reserved")
        try check(newReceipt == [ids[1], ids[2]] && allDeletes == [ids[0], ids[1], ids[1], ids[2]],
                  "The newer batch alone must delete its targets in order after its own receipt is released")
        try check(!store.isSavingTask && !store.isTaskBusy(ids[1]) && !store.isTaskBusy(ids[2])
                  && store.tasks.count == 1 && store.tasks.first?.id == otherID && store.tasks.first?.isDone == true,
                  "Confirmed deletion must clear only the newer batch's reservations and retain the unrelated write")
        print("PASS: partial bulk delete reservation ownership, exact overlap exclusion and independent writes (7)")
    }

    @MainActor static func bulkDeletionChecks() async throws {
        let suite = "pet-bulk-delete-check-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let targets = (1...3).map { HubTask(id: UUID(), title: "선택 \($0)", status: "todo", updatedAt: "2026-10-17T00:00:00Z") }
        let ids = targets.map(\.id)

        let api = ControlledHub()
        await api.configureBatch(rows: targets, heldID: ids[1])
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://bulk-delete.test")
        let deleting = Task { await store.deleteTasks([ids[0], ids[0], ids[1], ids[2], UUID()]) }
        while !(await api.startedDelete) { await Task.yield() }
        try check(store.isSavingTask && store.canWriteTasks && !store.tasks.contains { $0.id == ids[0] }, "The batch keeps its IDs reserved across acknowledgements while other IDs stay writable")
        try check(store.tasks.contains { $0.id == ids[1] }, "An unconfirmed item must remain visible")
        let repeated = await store.deleteTasks(ids)
        try check(repeated.isEmpty, "Another batch cannot overtake an in-flight batch")
        await api.releaseTaskDelete()
        let removed = await deleting.value
        let attempts = await api.deletes
        try check(removed == Set(ids) && attempts == ids, "Batch deletion must deduplicate IDs and skip unknown rows")
        try check(store.tasks.count == 1 && store.taskReceipt?.contains("3") == true, "Only selected rows disappear and the receipt states the confirmed count")

        let failingAPI = ControlledHub()
        await failingAPI.configureBatch(rows: targets, failedID: ids[1])
        let failing = HubStore(defaults: defaults, makeAPI: { _ in failingAPI })
        await failing.connect(baseURL: "https://bulk-failure.test")
        let partial = await failing.deleteTasks(ids)
        let failedAttempts = await failingAPI.deletes
        try check(partial == [ids[0]] && failedAttempts == Array(ids.prefix(2)), "The first failure must stop later destructive requests and return confirmed IDs only")
        try check(failing.tasks.contains { $0.id == ids[1] } && failing.tasks.contains { $0.id == ids[2] }
                  && failing.errorMessage?.contains("1개") == true && !failing.isSavingTask, "A partial failure must preserve remaining rows and explain how many were deleted")

        let lateAPI = ControlledHub()
        await lateAPI.configureBatch(rows: targets, heldID: ids[1])
        let late = HubStore(defaults: defaults, makeAPI: { _ in lateAPI })
        await late.connect(baseURL: "https://bulk-late.test")
        let pending = Task { await late.deleteTasks(ids) }
        while !(await lateAPI.startedDelete) { await Task.yield() }
        late.useLocalStorage()
        await lateAPI.releaseTaskDelete()
        let staleResult = await pending.value
        let lateAttempts = await lateAPI.deletes
        try check(staleResult.isEmpty && lateAttempts == Array(ids.prefix(2)) && !late.isEnabled && late.tasks.isEmpty,
                  "Changing source must invalidate the batch result and stop all remaining requests")

        let staleAPI = ControlledHub()
        await staleAPI.configureBatch(rows: targets)
        let stale = HubStore(defaults: defaults, makeAPI: { _ in staleAPI })
        await stale.connect(baseURL: "https://bulk-stale.test")
        await staleAPI.configure(hold: true)
        let reading = Task { await stale.refresh() }
        while !(await staleAPI.startedRead) { await Task.yield() }
        let deleted = await stale.deleteTasks(ids)
        await staleAPI.release(); await reading.value
        try check(deleted == Set(ids) && stale.tasks.count == 1, "A stale refresh cannot resurrect any deleted batch item")
        print("PASS: Bulk task deletion ordering, partial failure, serialization and source isolation")
    }

    @MainActor static func pendingCreateBulkDeletionChecks() async throws {
        let suite = "pet-pending-create-bulk-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let origin = "https://pending-create-bulk.test"
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: origin)
        await api.configure(createError: true)
        let initialReceipt = await store.createTask(title: "삭제 전에 복구된 할 일")
        let commands = await api.creates
        try check(initialReceipt == nil && commands.count == 1 && store.hasPendingTask,
                  "A lost create receipt must retain its original command")
        let recoveredID = UUID(uuidString: commands[0].id)!
        await api.confirmCreatedElsewhere()
        await store.refresh()
        try check(store.hasPendingTask && store.tasks.contains { $0.id == recoveredID },
                  "The recovered row must coexist with its unconfirmed create command")

        let firstID = api.row.id
        await api.configureBatch(rows: [], heldID: firstID)
        let deleting = Task { await store.deleteTasks([firstID, recoveredID]) }
        let deadline = Date().addingTimeInterval(2)
        while !(await api.startedDelete) && Date() < deadline { await Task.yield() }
        let firstRequestHeld = await api.startedDelete
        let reservedIDs = store.deletingTaskIDs
        let retiredBeforeFirstReceipt = !store.hasPendingTask
        // A second store verifies the retirement was persisted while the first
        // request is still held, before the later recovered row is attempted.
        let reopenedDuringBatch = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopenedDuringBatch.connect(baseURL: origin)
        let persistedBeforeFirstReceipt = !reopenedDuringBatch.hasPendingTask
        let retryReceipt = await store.createTask(title: "")
        let commandsAfterRetry = await api.creates
        await api.releaseTaskDelete()
        let deleted = await deleting.value
        let attempts = await api.deletes
        // Every held continuation has been released before any assertion below.
        await store.refresh()
        let reopenedAfterBatch = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopenedAfterBatch.connect(baseURL: origin)

        try check(firstRequestHeld && reservedIDs == [firstID, recoveredID],
                  "The first delete must be held with both batch IDs reserved")
        try check(retiredBeforeFirstReceipt && persistedBeforeFirstReceipt,
                  "A selected recovered create must be retired durably before the batch's first await")
        try check(retryReceipt == nil && commandsAfterRetry == commands,
                  "An empty retry must not dispatch the selected task's old create during a bulk delete")
        try check(deleted == [firstID, recoveredID] && attempts == [firstID, recoveredID]
                  && !store.tasks.contains { $0.id == recoveredID } && !store.isSavingTask,
                  "The complete batch must delete the recovered task without resurrecting it on refresh")
        try check(!store.hasPendingTask && !reopenedAfterBatch.hasPendingTask
                  && !reopenedAfterBatch.tasks.contains { $0.id == recoveredID },
                  "Restart must retain neither the deleted task nor its retired create command")
        print("PASS: pending create retirement before bulk deletion, blocked retry and durable cleanup")
    }

    @MainActor static func pendingCreateToggleChecks() async throws {
        let suite = "pet-pending-create-toggle-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let origin = "https://pending-create-toggle.test"
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: origin)
        await api.configure(createError: true)
        let initialReceipt = await store.createTask(title: "체크 중인 복구 할 일")
        let commands = await api.creates
        try check(initialReceipt == nil && commands.count == 1 && store.hasPendingTask,
                  "A failed create must leave one retryable command")
        let recoveredID = UUID(uuidString: commands[0].id)!
        await api.confirmCreatedElsewhere()
        await store.refresh()
        try check(store.hasPendingTask && store.tasks.contains { $0.id == recoveredID && $0.isDone },
                  "The recovered completed row must still have its original pending create")

        await api.configureToggle(hold: true)
        let toggling = Task { await store.toggleTask(recoveredID) }
        let deadline = Date().addingTimeInterval(2)
        while !(await api.startedToggle) && Date() < deadline { await Task.yield() }
        let toggleHeld = await api.startedToggle
        let retryReceipt = await store.createTask(title: "")
        let commandsAfterRetry = await api.creates
        let pendingPreserved = store.hasPendingTask
        let reservationPreserved = store.savingTaskIDs == [recoveredID]
            && store.isTaskBusy(recoveredID) && !store.isCreatingTask
        let reopened = HubStore(defaults: defaults, makeAPI: { _ in api })
        await reopened.connect(baseURL: origin)
        let pendingPersisted = reopened.hasPendingTask
        await api.releaseTaskToggle()
        let saved = await toggling.value
        let toggledIDs = await api.toggledIDs
        // Every held continuation has been released before any assertion below.

        try check(toggleHeld && reservationPreserved,
                  "Retrying a pending create must not disturb the same task's active toggle reservation")
        try check(retryReceipt == nil && commandsAfterRetry == commands,
                  "A pending create for a toggling ID must be rejected before a second POST is sent")
        try check(pendingPreserved && pendingPersisted && store.hasPendingTask,
                  "Refusing a busy pending create must preserve its durable retry command")
        try check(saved?.id == recoveredID && saved?.isDone == false && toggledIDs == [recoveredID]
                  && store.tasks.contains { $0.id == recoveredID && !$0.isDone }
                  && !store.isSavingTask && !store.isTaskBusy(recoveredID),
                  "The original toggle alone must supply the final row and release its reservation")
        print("PASS: same-ID toggle blocks pending create retry without losing its command or receipt")
    }

    @MainActor static func taskDeletionChecks() async throws {
        let suite = "pet-task-delete-check-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://delete.test")
        let id = store.tasks[0].id
        await api.configureDelete(hold: true)
        let deleting = Task { await store.deleteTask(id) }
        while !(await api.startedDelete) { await Task.yield() }
        try check(store.isSavingTask && store.canWriteTasks && store.tasks.contains { $0.id == id }, "Keep the row until deletion is confirmed while other IDs remain writable")
        let repeated = await store.deleteTask(id)
        try check(!repeated, "Repeated delete while a command is pending must be refused")
        await api.releaseTaskDelete()
        let deleted = await deleting.value
        let calls = await api.deletes
        try check(deleted && store.tasks.isEmpty && !store.isSavingTask && calls == [id], "Confirmed deletion removes exactly the requested row")
        let missing = await store.deleteTask(UUID())
        try check(!missing, "An unknown task must not issue a delete")

        for failure in [HubTransportError.timeout, .offline, .unauthorized] {
            let failingAPI = ControlledHub()
            let failing = HubStore(defaults: defaults, makeAPI: { _ in failingAPI })
            await failing.connect(baseURL: "https://delete-failure.test")
            let row = failing.tasks[0]
            await failingAPI.configureDelete(failure: failure)
            let saved = await failing.deleteTask(row.id)
            let attempts = await failingAPI.deletes
            try check(!saved && failing.tasks == [row] && failing.errorMessage != nil && !failing.isSavingTask, "Failed deletion preserves the task and explains the error")
            try check(attempts == [row.id], "Failed deletion must not replay automatically")
            if failure == .unauthorized {
                try check(failing.needsLogin && !failing.canWriteTasks, "Rejected deletion must require login")
            }
        }

        let staleAPI = ControlledHub()
        let stale = HubStore(defaults: defaults, makeAPI: { _ in staleAPI })
        await stale.connect(baseURL: "https://delete-stale.test")
        let staleID = stale.tasks[0].id
        await staleAPI.configure(hold: true)
        let reading = Task { await stale.refresh() }
        while !(await staleAPI.startedRead) { await Task.yield() }
        let removed = await stale.deleteTask(staleID)
        await staleAPI.release(); await reading.value
        try check(removed && stale.tasks.isEmpty, "An older read must not resurrect a deleted task")

        let lateAPI = ControlledHub()
        let late = HubStore(defaults: defaults, makeAPI: { _ in lateAPI })
        await late.connect(baseURL: "https://delete-late.test")
        let lateID = late.tasks[0].id
        await lateAPI.configureDelete(hold: true)
        let pending = Task { await late.deleteTask(lateID) }
        while !(await lateAPI.startedDelete) { await Task.yield() }
        late.useLocalStorage()
        await lateAPI.releaseTaskDelete()
        let lateResult = await pending.value
        try check(!lateResult && !late.isEnabled && late.tasks.isEmpty && !late.isSavingTask, "A late delete receipt cannot modify the replacement connection")

        for failure: HubTransportError? in [nil, .timeout] {
            let recoveryAPI = ControlledHub()
            let recovery = HubStore(defaults: defaults, makeAPI: { _ in recoveryAPI })
            await recovery.connect(baseURL: "https://delete-create-recovery.test")
            await recoveryAPI.configure(createError: true)
            _ = await recovery.createTask(title: "응답이 누락된 할 일")
            await recoveryAPI.confirmCreatedElsewhere()
            await recovery.refresh()
            let recoveredID = (await recoveryAPI.creates)[0].id
            try check(recovery.hasPendingTask && recovery.tasks.contains { $0.id.uuidString.lowercased() == recoveredID }, "Lost create response must be recovered as a durable row")
            await recoveryAPI.configureDelete(failure: failure, commitsBeforeFailure: failure != nil)
            _ = await recovery.deleteTask(UUID(uuidString: recoveredID)!)
            try check(recovery.tasks.count == 1 && !recovery.tasks.contains { $0.id.uuidString.lowercased() == recoveredID }, "Confirmed deletion or readback after a lost response must remove only the target row")
            let reopened = HubStore(defaults: defaults, makeAPI: { _ in recoveryAPI })
            await reopened.connect(baseURL: "https://delete-create-recovery.test")
            try check(!recovery.hasPendingTask && !reopened.hasPendingTask, "Deletion must retire a matching recovered create so it cannot resurrect the task, including after restart or lost delete acknowledgement")
        }
        print("PASS: Task deletion acknowledgement, failures, serialization and stale-response checks")
    }

    @MainActor static func mixedTaskMutationChecks() async throws {
        let suite = "pet-mixed-mutations-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let other = HubTask(id: UUID(), title: "독립 체크", status: "todo", updatedAt: "2026-09-25T00:00:00Z")
        await api.addTask(other)
        var selectedAPI: any HubServing = api
        let store = HubStore(defaults: defaults, makeAPI: { _ in selectedAPI })
        await store.connect(baseURL: "https://mixed.test")
        let firstID = api.row.id
        await api.holdTaskCreation()
        await api.configureToggle(hold: true)
        await api.configureDelete(hold: true)
        let creation = Task { await store.createTask(title: "병렬 추가") }
        while !(await api.startedCreate) { await Task.yield() }
        let toggle = Task { await store.toggleTask(other.id) }
        while !(await api.startedToggle) { await Task.yield() }
        let deletion = Task { await store.deleteTask(firstID) }
        while !(await api.startedDelete) { await Task.yield() }
        let repeatedCreate = await store.createTask(title: "중복 추가")
        let repeatedDelete = await store.deleteTask(firstID)
        let deleteOfToggling = await store.deleteTask(other.id)
        let toggleOfDeleting = await store.toggleTask(firstID)
        try check(store.isCreatingTask && store.savingTaskIDs == [other.id] && store.deletingTaskIDs == [firstID],
                  "Creation, deletion and another ID's toggle run concurrently with independent state")
        try check(repeatedCreate == nil && !repeatedDelete && !deleteOfToggling && toggleOfDeleting == nil,
                  "A task ID is reserved across toggle/delete and creation is single flight")
        await api.releaseWrite(); _ = await creation.value
        await api.releaseTaskToggle(); _ = await toggle.value
        try check(store.isSavingTask && store.tasks.contains { $0.id == firstID },
                  "Other receipts cannot release the deletion reservation or remove its unconfirmed row")
        await api.releaseTaskDelete(); let deleted = await deletion.value
        try check(deleted && !store.isSavingTask && !store.tasks.contains { $0.id == firstID }
                  && store.tasks.contains { $0.id == other.id && $0.isDone }, "All three confirmed receipts survive")

        // An uncertain delete read must wait for the remaining toggle receipt.
        let failingAPI = ControlledHub()
        await failingAPI.addTask(other)
        let failing = HubStore(defaults: defaults, makeAPI: { _ in failingAPI })
        await failing.connect(baseURL: "https://mixed-failure.test")
        await failingAPI.configureToggle(hold: true)
        await failingAPI.configureDelete(failure: .timeout, hold: true)
        let survivor = Task { await failing.toggleTask(other.id) }
        while !(await failingAPI.startedToggle) { await Task.yield() }
        let uncertain = Task { await failing.deleteTask(failingAPI.row.id) }
        while !(await failingAPI.startedDelete) { await Task.yield() }
        await failingAPI.releaseTaskDelete(); _ = await uncertain.value
        try check(!failing.taskReady && failing.isSavingTask, "Uncertain deletion cannot be settled by an overlapping read")
        await failingAPI.releaseTaskToggle(); _ = await survivor.value
        let deadline = Date().addingTimeInterval(2)
        while !failing.taskReady && Date() < deadline { await Task.yield() }
        try check(failing.taskReady && !failing.isSavingTask && failing.errorMessage != nil
                  && failing.tasks.contains { $0.id == other.id && $0.isDone }, "Reconciliation preserves another successful write")

        // Same-origin login replacement invalidates every older receipt, including
        // defer cleanups, rather than just resetting a global saving flag.
        let lateAPI = ControlledHub()
        await lateAPI.addTask(other)
        selectedAPI = lateAPI
        await store.connect(baseURL: "https://mixed.test", forceReconnect: true)
        await lateAPI.holdTaskCreation()
        await lateAPI.configureToggle(hold: true)
        await lateAPI.configureDelete(hold: true)
        let lateCreate = Task { await store.createTask(title: "이전 세대 추가") }
        let lateToggle = Task { await store.toggleTask(other.id) }
        let lateDelete = Task { await store.deleteTask(lateAPI.row.id) }
        while !(await lateAPI.allMutationsStarted()) { await Task.yield() }
        let priorGeneration = store.connectionGeneration
        let replacement = ControlledHub()
        selectedAPI = replacement
        await store.connect(baseURL: "https://mixed.test", forceReconnect: true)
        await lateAPI.releaseWrite(); await lateAPI.releaseTaskToggle(); await lateAPI.releaseTaskDelete()
        let oldCreate = await lateCreate.value
        let oldToggle = await lateToggle.value
        let oldDelete = await lateDelete.value
        try check(store.connectionGeneration > priorGeneration && oldCreate == nil && oldToggle == nil && !oldDelete
                  && !store.isSavingTask && store.tasks == [replacement.row], "Late results and old cleanup cannot modify a replacement login")
        print("PASS: mixed create/delete/toggle, cross-operation ID exclusion, failure reconciliation and same-origin generation replacement")
    }

    // Regression: ISSUE-001 — an older read must not erase a newer unauthorized write.
    // Found by /qa on 2026-10-03; see docs/qa/widget-pet-connectivity-2026-10-03.md.
    @MainActor static func sessionExpiryChecks() async throws {
        for isMemo in [true, false] {
            let suite = "pet-session-expiry-check-" + UUID().uuidString
            let defaults = UserDefaults(suiteName: suite)!
            defer { defaults.removePersistentDomain(forName: suite) }
            let api = ControlledHub()
            let store = HubStore(defaults: defaults, makeAPI: { _ in api })
            await store.connect(baseURL: "https://expiry.test")
            await api.configure(hold: true)
            let refreshing = Task { await store.refresh() }
            while !(await api.startedRead) { await Task.yield() }
            await api.rejectWrites(true)
            if isMemo { _ = await store.saveMemo(body: "세션 만료 후 보존할 메모") }
            else { _ = await store.createTask(title: "세션 만료 후 보존할 할 일") }
            try check(store.needsLogin, "An unauthorized write must require login immediately")
            await api.release()
            await refreshing.value
            try check(store.needsLogin && !store.canWriteTasks && !store.canSaveMemo,
                      "An older successful read must not clear the newer login requirement")
            try check(isMemo ? store.hasPendingMemo : store.hasPendingTask,
                      "Session expiry must retain the unconfirmed write for recovery")
            await api.rejectWrites(false)
            await store.refresh()
            try check(!store.needsLogin && store.canSaveMemo && store.canWriteTasks,
                      "A fresh successful read must allow recovery after authentication")
        }
        print("PASS: Session expiry ordering checks (8)")
    }

    @MainActor static func sharedSessionReplacementChecks() async throws {
        let suite = "pet-shared-session-replacement-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let previous = ControlledHub()
        let current = ControlledHub()
        await previous.configure(hold: true)
        await current.rejectReads(true)
        var clients = 0
        let store = HubStore(defaults: defaults, makeAPI: { _ in
            clients += 1
            return clients == 1 ? previous : current
        })
        let oldRead = Task { await store.connect(baseURL: "https://shared.test") }
        while !(await previous.startedRead) { await Task.yield() }
        _ = await store.connect(baseURL: "https://shared.test", forceReconnect: true)
        let appliedLogout = store.needsLogin && !store.taskReady
        await previous.release()
        _ = await oldRead.value
        try check(appliedLogout, "Hub logout must apply without waiting for an old read")
        try check(store.needsLogin && !store.taskReady, "Late results from a previous session must not restore access")
        await current.rejectReads(false)
        _ = await store.connect(baseURL: "https://shared.test", forceReconnect: true)
        try check(store.taskReady && !store.needsLogin, "Hub re-login must recover the native connection")
        print("PASS: Shared session replacement, logout ordering and re-login (3)")
    }

    @MainActor static func progressiveLoadingChecks() async throws {
        for slowCalendar in [true, false] {
            let suite = "pet-progressive-read-" + UUID().uuidString
            let defaults = UserDefaults(suiteName: suite)!
            defer { defaults.removePersistentDomain(forName: suite) }
            let api = ControlledHub()
            if slowCalendar { await api.holdWritesAndCalendar() }
            else { await api.configure(hold: true) }
            let store = HubStore(defaults: defaults, makeAPI: { _ in api })
            let loading = Task { await store.connect(baseURL: "https://progress.test") }
            let deadline = Date().addingTimeInterval(2)
            while !(slowCalendar ? store.taskReady : store.calendarReady) && Date() < deadline { await Task.yield() }
            let readyBeforeOtherRead = slowCalendar ? store.taskReady && !store.calendarReady : store.calendarReady && !store.taskReady
            let canUseTasks = !slowCalendar || store.canWriteTasks
            if slowCalendar { await api.releaseEvents() } else { await api.release() }
            _ = await loading.value
            try check(readyBeforeOtherRead, "A fast read must render without waiting for the other surface")
            try check(canUseTasks, "A slow calendar must not block task input after connection")
            try check(store.taskReady && store.calendarReady, "Both snapshots must remain available when loading finishes")
        }
        print("PASS: Progressive loading and slow-source isolation (6)")
    }

    @MainActor static func loginChecks() async throws {
        let suite = "pet-login-check-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let api = ControlledHub()
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        let empty = await store.signIn(baseURL: "https://example.com", username: "", password: "")
        try check(!empty && !store.hasConnection, "Empty credentials must not dismiss the login form")
        await api.rejectLogin(true)
        let denied = await store.signIn(baseURL: "https://example.com", username: "operator", password: "test-only")
        try check(!denied && store.needsLogin, "Rejected login must remain on the form")
        await api.rejectLogin(false)
        let accepted = await store.signIn(baseURL: "https://example.com", username: "operator", password: "test-only")
        try check(accepted && !store.needsLogin && store.taskReady, "Accepted login returns to the content screen")
        // Data availability is shown by the content screen, independently of login.
        await api.configure(readError: true)
        let readFailure = await store.signIn(baseURL: "https://example.com", username: "operator", password: "test-only")
        try check(readFailure && !store.taskReady, "A task read error must not misrepresent accepted credentials")
    }

    @MainActor static func anonymousMemoNoticeChecks() async throws {
        let suite = "pet-anonymous-memo-check-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("보존할 메모 초안", forKey: "petPreview.memo")
        let api = ControlledHub()
        await api.setAnonymous(true)
        let store = HubStore(defaults: defaults, makeAPI: { _ in api })
        await store.connect(baseURL: "https://example.com")
        try check(store.needsLogin && !store.canSaveMemo, "Anonymous pet must block Hub save")
        try check(store.errorMessage?.contains("로그인") == true, "Memo must explain why Hub save is disabled")
        try check(defaults.string(forKey: "petPreview.memo") == "보존할 메모 초안", "Login failure must keep the local memo")
        await api.setAnonymous(false)
        await store.refresh()
        try check(!store.needsLogin && store.canSaveMemo && store.errorMessage == nil, "Recovered authentication must clear stale login notice")
        await api.setCredentialFailure(true)
        await store.refresh()
        try check(store.needsLogin && store.errorMessage?.contains("키체인") == true && !store.canSaveMemo, "Memo must show Keychain access failure")
        await api.setCredentialFailure(false)
        await store.refresh()
        try check(store.canSaveMemo && store.errorMessage == nil, "Recovered Keychain access clears its notice")
        await store.connect(baseURL: "https://other.example.com")
        let disconnected = await api.disconnectCount
        try check(disconnected == 1, "Changing origin must invalidate the old transport before replacement")
        let signedOut = await store.signOut()
        try check(signedOut && store.needsLogin && !store.canSaveMemo, "Signing out disables saving and automatic login")
        try check(defaults.string(forKey: "petPreview.memo") == "보존할 메모 초안", "Sign-out must preserve the draft")
    }

    @MainActor static func connectionRecoveryChecks() async throws {
        let suite = "pet-address-recovery-check-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let oldOrigin = "http://127.0.0.1:3000"
        defaults.set(oldOrigin, forKey: "petPreview.hubURL")
        let api = ControlledHub()
        var requestedOrigins: [String] = []
        let store = HubStore(defaults: defaults, makeAPI: { url in
            requestedOrigins.append(url.absoluteString)
            return api
        })
        await api.rejectLogin(true)
        let denied = await store.signIn(baseURL: "https://hub.test", username: "operator", password: "test-only")
        try check(!denied && defaults.string(forKey: "petPreview.hubURL") == oldOrigin,
                  "A failed login at a replacement address must preserve the saved address")
        try check(requestedOrigins == ["https://hub.test"], "Recovery credentials go to the explicitly submitted address")
        await api.rejectLogin(false)
        let accepted = await store.signIn(baseURL: " https://HUB.test:443/ ", username: "operator", password: "test-only")
        try check(accepted && defaults.string(forKey: "petPreview.hubURL") == "https://hub.test",
                  "An authenticated replacement address is saved in canonical form")
        let rejected = await store.signIn(baseURL: "https://hub.test/dashboard", username: "operator", password: "test-only")
        try check(!rejected && requestedOrigins.count == 2
                  && defaults.string(forKey: "petPreview.hubURL") == "https://hub.test",
                  "Recovery must retain origin validation without replacing a working address")

        await api.configure(hold: true)
        let first = Task { await store.signIn(baseURL: "https://slow.test", username: "operator", password: "test-only") }
        while !(await api.startedRead) { await Task.yield() }
        let overlapping = await store.signIn(baseURL: "https://other.test", username: "operator", password: "test-only")
        try check(!overlapping && requestedOrigins.last == "https://slow.test" && requestedOrigins.count == 3,
                  "A second submission cannot change the address during sign-in")
        await api.release()
        let finished = await first.value
        try check(finished && defaults.string(forKey: "petPreview.hubURL") == "https://slow.test",
                  "The first sign-in retains ownership of the saved address")
        print("PASS: Hub address recovery checks (6)")
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
