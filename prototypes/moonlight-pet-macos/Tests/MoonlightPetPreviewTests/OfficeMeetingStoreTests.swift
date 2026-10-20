import Foundation
private func check(_ value: Bool, _ message: String) throws {
    if !value { throw NSError(domain: "MeetingStoreChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
private func detail(_ id: UUID, state: String = "ready", rounds: [[String: Any]] = [], revision: Int = 1, owner: String = "eevee") throws -> OfficeMeetingDetail {
    let row: [String: Any] = ["meetingId": id.uuidString, "title": "회의", "scope": "personal", "ownerId": owner, "reviewers": [], "mode": "chat", "revision": revision, "state": "open", "createdAt": "2026-10-04T00:00:00Z", "updatedAt": "2026-10-04T00:00:00Z", "sourceTask": NSNull()]
    return try JSONDecoder().decode(OfficeMeetingDetail.self, from: JSONSerialization.data(withJSONObject: ["status": state, "persisted": true, "meeting": row, "turns": rounds]))
}
private actor MeetingsGate: HubOfficeMeetingServing {
    let meetingID: UUID
    private var waiter: CheckedContinuation<OfficeMeetingDetail, Error>?
    private(set) var sentIDs: [UUID] = []
    private var completed: [UUID: [[String: Any]]] = [:]
    private var pending: (id: UUID, revision: Int, owner: String)?
    private var readOverride: OfficeMeetingDetail?
    private var holdReads = false
    private var readWaiter: CheckedContinuation<OfficeMeetingDetail, Error>?
    private(set) var isReading = false
    func overrideRead(_ detail: OfficeMeetingDetail?) { readOverride = detail }
    func holdRead() { holdReads = true }
    func recordedDetail(_ id: UUID, revision: Int) throws -> OfficeMeetingDetail { try detail(id, rounds: completed[id] ?? [], revision: revision, owner: owner) }
    func finishRead(_ detail: OfficeMeetingDetail) { readWaiter?.resume(returning: detail); readWaiter = nil; holdReads = false }

    private var failCreation = false
    private var owner = "eevee"
    func changeOwner(_ value: String) { owner = value }
    init(id: UUID) { meetingID = id }
    func chat(_ command: OfficeChatCommand) async throws -> OfficeChatReply { throw OfficeChatError.invalidInput }
    func officeMeetings(scope: OfficeChatScope) async throws -> [OfficeMeeting] {
        if scope == .classin { throw HubTransportError.offline }
        return [try detail(meetingID).meeting]
    }
    func officeMeeting(id: UUID) async throws -> OfficeMeetingDetail {
        if holdReads { isReading = true; defer { isReading = false }; return try await withCheckedThrowingContinuation { readWaiter = $0 } }
        if let readOverride { return readOverride }
        let rounds = completed[id] ?? []
        return try detail(id, rounds: rounds, revision: rounds.count + 1, owner: owner)
    }
    func failNextCreation() { failCreation = true }
    func createOfficeMeeting(id: UUID, title: String, scope: OfficeChatScope, owner: OfficeAgent, sourceTaskID: UUID?) async throws -> OfficeMeetingDetail {
        if failCreation { failCreation = false; throw HubTransportError.timeout }
        self.owner = owner.rawValue
        return try detail(id, owner: owner.rawValue)
    }
    func sendOfficeMeeting(id: UUID, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail {
        sentIDs.append(requestID); pending = (id, revision, owner)
        return try await withCheckedThrowingContinuation { waiter = $0 }
    }
    func finish(id: UUID, message: String) throws {
        let requestID = sentIDs.last!
        let captured = pending!
        var rounds = completed[id] ?? []
        rounds.removeAll { ($0["id"] as? String) == requestID.uuidString }
        rounds.append(["id": requestID.uuidString, "roundNumber": rounds.count + 1, "state": "generated", "request": ["message": message, "ownerId": captured.owner, "mode": "chat"], "result": ["answer": "저장된 답변", "nextAction": "다음 확인", "ownerId": captured.owner, "scope": "personal", "mode": "chat"]])
        completed[id] = rounds
        waiter?.resume(returning: try detail(id, state: "generated", rounds: rounds, revision: captured.revision + 1, owner: owner)); waiter = nil
    }
    func timeout() { waiter?.resume(throwing: HubTransportError.timeout); waiter = nil }
}
@main private enum MeetingStoreChecks {
    @MainActor static func main() async throws {
        let id = UUID(), api = MeetingsGate(id: UUID())
        let store = OfficeChatStore(durableMeetings: true)
        store.configure(service: api, origin: "https://one.example")
        await store.loadMeetings()
        try check(store.meetings.count == 1, "saved meetings listed")
        await store.resumeMeeting(id)
        store.draft = "질문 원문"
        let send = Task { await store.send(message: store.draft) }
        while await api.sentIDs.isEmpty { await Task.yield() }
        store.configure(service: api, origin: "https://one.example")
        try check(store.isSending, "same-connection refresh retains the pending durable round")
        try check(await store.send(message: "중복") == nil, "duplicate send blocked")
        store.draft += "\n"
        try await api.finish(id: id, message: "질문 원문")
        _ = await send.value
        try check(store.turns.count == 1 && store.draft == "질문 원문\n", "saved reply restores while changed draft remains")
        try check(store.meeting?.meetingId == id && store.meeting?.revision == 2, "same meeting and revision retained")
        store.draft = "주관 변경 중 초안"
        await api.changeOwner("umbreon")
        await store.resumeMeeting(id)
        try check(store.agent == .umbreon && store.draft == "주관 변경 중 초안", "same meeting draft survives Hub owner change")
        store.draft = "불확실한 질문"
        let failed = Task { await store.send(message: store.draft) }
        while await api.sentIDs.count < 2 { await Task.yield() }
        await api.timeout(); _ = await failed.value
        try check(store.meetingNeedsReload && store.draft == "불확실한 질문", "ambiguous request preserves draft and blocks generation")
        try check(await store.send(message: "불확실한 질문") == nil, "unknown request never gets a fresh request ID")
        await store.resumeMeeting(id)
        try check(store.meetingNeedsReload, "missing receipt is not proof of failed generation")
        store.startNewMeeting()
        store.draft = "새 회의 초안"
        await store.resumeMeeting(id)
        try check(store.draft == "불확실한 질문", "meeting drafts isolated")
        try await api.finish(id: id, message: "불확실한 질문")
        await store.reloadMeeting()
        try check(!store.meetingNeedsReload && store.draft.isEmpty, "authoritative late receipt resolves uncertainty without another model call")
        try check(await api.sentIDs.count == 2, "reload never generates")
        store.draft = "중단한 질문"
        let cancelled = Task { await store.send(message: store.draft) }
        while await api.sentIDs.count < 3 { await Task.yield() }
        store.cancelWaiting()
        try await api.finish(id: id, message: "중단한 질문")
        _ = await cancelled.value
        try check(store.meetingNeedsReload && store.draft == "중단한 질문", "cancel preserves input until receipt reload")
        await store.reloadMeeting()
        try check(!store.meetingNeedsReload && store.draft.isEmpty, "cancelled wait can recover saved answer")
        store.configure(service: api, origin: "https://two.example")
        try check(store.meeting == nil && store.turns.isEmpty && store.draft.isEmpty, "connection switch clears foreign meeting")
        store.draft = "새 안건"
        let created = Task { await store.send(message: store.draft) }
        while await api.sentIDs.count < 4 { await Task.yield() }
        guard let newID = store.meeting?.meetingId else { throw OfficeChatError.invalidResponse }
        try await api.finish(id: newID, message: "새 안건")
        _ = await created.value
        try check(store.draft.isEmpty && store.turns.count == 1, "first send creates and continues one durable meeting")
        store.startNewMeeting()
        try check(store.draft.isEmpty, "sent new-meeting draft does not reappear in another new meeting")
        let creationAPI = MeetingsGate(id: UUID())
        store.configure(service: creationAPI, origin: "https://three.example")
        store.draft = "만드는 중 보존할 초안"
        await creationAPI.failNextCreation()
        _ = await store.send(message: store.draft)
        try check(store.meetingNeedsReload && store.meeting == nil, "ambiguous creation remains recoverable")
        await store.reloadMeeting()
        try check(store.meeting != nil && store.draft == "만드는 중 보존할 초안" && !store.meetingNeedsReload, "creation recovery transfers the untouched draft to confirmed meeting")
        try check(await creationAPI.sentIDs.isEmpty, "creation recovery does not start a model round")
        await store.loadMeetings()
        try check(store.meetings.count == 1, "personal list loaded before lane switch")
        store.scope = .classin
        await store.loadMeetings()
        try check(store.meetings.isEmpty && store.errorMessage != nil, "failed company read cannot expose previous personal meetings")
        store.scope = .personal
        store.startNewMeeting()
        let sourceID = UUID()
        store.sourceTaskID = sourceID; store.draft = "가져온 할 일"
        store.agent = .sylveon
        try check(store.draft == "가져온 할 일" && store.sourceTaskID == sourceID, "choosing a new meeting owner retains imported task agenda")
        store.scope = .classin
        try check(store.sourceTaskID == nil, "task identity never crosses meeting lanes")
        store.scope = .personal
        try check(store.draft == "가져온 할 일" && store.sourceTaskID == sourceID, "returning to draft lane restores linked task identity")
        let robustID = UUID(), robustAPI = MeetingsGate(id: UUID())
        let robust = OfficeChatStore(durableMeetings: true)
        robust.configure(service: robustAPI, origin: "https://synthetic.example")
        await robust.resumeMeeting(robustID)
        robust.draft = "é"
        let unicodeSend = Task { await robust.send(message: robust.draft) }
        while await robustAPI.sentIDs.isEmpty { await Task.yield() }
        robust.draft = "e\u{301}"
        try await robustAPI.finish(id: robustID, message: "é")
        _ = await unicodeSend.value
        try check(robust.draft.utf8.elementsEqual("e\u{301}".utf8), "canonically equivalent edited draft is not erased")
        await robustAPI.overrideRead(try detail(robustID))
        await robust.reloadMeeting()
        try check(robust.turns.count == 1 && robust.meetingNeedsReload, "missing terminal turn preserves prior verified history")
        await robustAPI.overrideRead(nil)
        await robust.reloadMeeting()
        try check(!robust.meetingNeedsReload, "fresh complete history recovers after stale snapshot")
        robust.draft = "원래 요청"
        let mismatch = Task { await robust.send(message: robust.draft) }
        while await robustAPI.sentIDs.count < 2 { await Task.yield() }
        try await robustAPI.finish(id: robustID, message: "다른 요청")
        _ = await mismatch.value
        try check(robust.meetingNeedsReload && robust.draft == "원래 요청" && robust.turns.count == 1, "wrong request receipt neither applies nor releases pending")
        try await robustAPI.finish(id: robustID, message: "원래 요청")
        await robust.reloadMeeting()
        try check(!robust.meetingNeedsReload && robust.turns.count == 2 && robust.draft.isEmpty, "exact original receipt resolves pending")
        await robustAPI.holdRead()
        let cancelledRead = Task { await robust.reloadMeeting() }
        while !(await robustAPI.isReading) { await Task.yield() }
        cancelledRead.cancel()
        let lateRead = try await robustAPI.recordedDetail(robustID, revision: 99)
        await robustAPI.finishRead(lateRead)
        await cancelledRead.value
        try check(robust.meeting?.revision != 99 && robust.turns.count == 2, "cancelled caller cannot apply a late read")
        print("PASS: Office meeting store checks")
    }
}
