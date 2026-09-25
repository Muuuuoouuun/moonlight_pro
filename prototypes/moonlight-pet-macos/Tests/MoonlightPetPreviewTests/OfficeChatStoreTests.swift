import Foundation

private func require(_ value: Bool, _ message: String) throws {
    if !value { throw NSError(domain: "OfficeChatStoreChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
private actor ChatGate: HubOfficeServing {
    private var waiter: CheckedContinuation<OfficeChatReply, Error>?
    private(set) var commands: [OfficeChatCommand] = []
    func chat(_ command: OfficeChatCommand) async throws -> OfficeChatReply {
        commands.append(command)
        return try await withCheckedThrowingContinuation { waiter = $0 }
    }
    func finish() {
        waiter?.resume(returning: OfficeChatReply(answer: "검토한 답변", nextAction: "다음 단계 확인", contextNote: "입력 내용 기준", contextSource: "provided", logPersisted: false, runId: nil))
        waiter = nil
    }
    func fail() { waiter?.resume(throwing: HubTransportError.timeout); waiter = nil }
}
@main
private enum OfficeChatStoreChecks {
    @MainActor static func main() async throws {
        let api = ChatGate()
        let store = OfficeChatStore()
        store.configure(service: api, origin: "https://one.example")
        store.agent = .vaporeon
        store.scope = .personal
        store.draft = "질문 원문"; store.source = .memo
        let send = Task { await store.send(message: "질문 원문") }
        while await api.commands.isEmpty { await Task.yield() }
        try require(store.isSending && store.pendingMessage == "질문 원문", "pending question visible")
        let duplicate = await store.send(message: "중복 클릭")
        try require(duplicate == nil, "one request at a time")
        store.draft += "\n"
        await api.finish()
        try require(await send.value == "질문 원문", "receipt identifies sent snapshot")
        try require(store.turns.count == 1 && store.turns[0].agent == .vaporeon, "answer belongs to selected owner")
        try require(store.draft == "질문 원문\n", "whitespace edits made while waiting survive success")
        store.scope = .classin
        try require(store.turns.isEmpty && store.draft.isEmpty && store.source == .text, "scope history and drafts isolated")
        store.draft = "회사 질문"
        store.scope = .personal
        try require(store.turns.count == 1 && store.draft == "질문 원문\n" && store.source == .memo, "session and draft can resume in memory")
        let failed = Task { await store.send(message: "보존할 질문") }
        while await api.commands.count < 2 { await Task.yield() }
        await api.fail()
        try require(await failed.value == nil && store.errorMessage != nil, "timeout is not an answer or clear receipt")
        try require(store.turns.count == 1, "failure keeps completed turns")
        let late = Task { await store.send(message: "이전 담당 질문") }
        while await api.commands.count < 3 { await Task.yield() }
        store.agent = .eevee
        try require(store.draft.isEmpty, "owner drafts isolated")
        await api.finish()
        try require(await late.value == nil && store.turns.isEmpty, "late old-owner answer cannot enter new session")
        let canceled = Task { await store.send(message: "기다림 중단") }
        while await api.commands.count < 4 { await Task.yield() }
        store.cancelWaiting()
        await api.finish()
        try require(await canceled.value == nil && !store.isSending, "cancel prevents late answer")
        store.agent = .vaporeon
        try require(store.turns.count == 1, "other conversation remains")
        store.configure(service: api, origin: "https://two.example")
        try require(store.turns.isEmpty && store.draft.isEmpty, "origins do not mix histories or drafts")
        store.draft = "  보낼 질문  "
        let confirmed = Task { await store.send(message: "  보낼 질문  ") }
        while await api.commands.count < 5 { await Task.yield() }
        await api.finish()
        _ = await confirmed.value
        try require(store.draft.isEmpty, "unchanged submitted draft clears only after confirmed reply")
        store.draft = "대기열에서 바뀐 질문"
        store.sendDraft()
        store.scope = .classin
        await Task.yield()
        try require(await api.commands.count == 5, "queued send cannot drift to a newly selected recipient")
        try require(await store.send(message: String(repeating: "😀", count: 3001)) == nil, "UTF16 limit")
        store.configure(service: nil, origin: nil)
        let offline = await store.send(message: "연결 없는 질문")
        try require(!store.hasConnection && offline == nil, "offline does not send")
        print("PASS: Office chat store checks")
    }
}
