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
    func finish(_ reply: OfficeChatReply? = nil) {
        waiter?.resume(returning: reply ?? OfficeChatReply(answer: "검토한 답변", nextAction: "다음 단계 확인", contextNote: "입력 내용 기준", contextSource: "provided", logPersisted: false, runId: nil))
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
        store.agent = .umbreon
        try require(store.turns.count == 1 && store.draft == "질문 원문\n" && store.source == .memo, "same topic keeps history, draft and source when the owner changes")
        store.agent = .vaporeon
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
        try require(store.agent == .vaporeon && store.draft == "질문 원문\n", "in-flight owner change refused without losing draft")
        await api.finish()
        try require(await late.value != nil && store.turns.count == 2 && store.turns.last?.agent == .vaporeon, "refused switch keeps the immutable original request")
        let canceled = Task { await store.send(message: "기다림 중단") }
        while await api.commands.count < 4 { await Task.yield() }
        store.cancelWaiting()
        await api.finish()
        try require(await canceled.value == nil && !store.isSending, "cancel prevents late answer")
        store.agent = .vaporeon
        try require(store.turns.count == 2, "other conversation remains")
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
        try await topicChecks()
        print("PASS: Office chat store checks · topic isolation, selection guards, bounded source/history")
    }
    @MainActor static func topicChecks() async throws {
        let api = ChatGate(), store = OfficeChatStore()
        let origin = "https://topics.example"
        store.configure(service: api, origin: origin)
        let source = OfficeTopicSource(title: "알림 제목", detail: String(repeating: "원문 😀 ", count: 2000), date: Date(timeIntervalSince1970: 10), path: "/dashboard/revenue/inquiries?inquiry=one", isNoticeSummary: true)
        try require(store.selectTopic("notice:one", scope: .all, owner: .flareon, source: source), "notice opens without generating")
        try require(await api.commands.isEmpty, "opening a notice never invokes a model")
        let key = store.conversationKey
        store.draft = String(repeating: "가", count: 6000)
        _ = store.toggleReviewer(.vaporeon); _ = store.toggleReviewer(.umbreon)
        _ = store.selectAgent(.vaporeon)
        try require(store.agent == .vaporeon && Set(store.participants) == Set([.flareon, .vaporeon, .umbreon]), "changing lead to a participant keeps all selected perspectives")
        try require(!store.toggleReviewer(.eevee), "fourth participant refused")
        let pending = Task { await store.send(message: store.draft) }
        while await api.commands.isEmpty { await Task.yield() }
        store.scope = .personal
        try require(store.scope == .all && !store.selectTopic("other", scope: .personal, owner: .eevee) && store.isSending, "in-flight scope and topic switches refuse instead of cancel")
        let sent = await api.commands[0]
        try require(sent.message.utf16.count == 6000 && sent.history.first?.role == "user", "source never consumes full user-message budget or fabricates assistant context")
        try require(sent.history.first?.text.contains("상세 원문 미조회") == true && sent.history.first?.text.contains("일부만 전달") == true, "source summary discloses source and clipping")
        try require(store.topicSource == source, "full source remains in local memory")
        try sent.validate()
        let participants = sent.participants
        let speeches = ["position", "response"].flatMap { round in participants.map { agent in
            OfficeDiscussionTurn(ownerId: agent, round: round, position: agent == .umbreon ? "블래키 실제 쟁점: 효과 근거를 확인한다" : "실제 제공 자료를 검토한다", evidence: [], objection: "", revisionCondition: "자료가 추가될 때", changed: false, replyTo: round == "response" ? participants.filter { $0 != agent } : [], changeReason: round == "response" ? "추가 근거 없음" : "")
        } }
        let discussion = OfficeDiscussion(version: "2026-09-22.v1", settings: .init(profile: "balanced", challenge: 2, depth: 2, warmth: 2, convergence: 2, influence: Dictionary(uniqueKeysWithValues: participants.map { ($0.rawValue, 1) })), turns: speeches, modelCalls: 7)
        let council = OfficeCouncilResult(recommendation: "근거 확인 뒤 제안", evidence: ["입력 원문"], dissent: ["효과는 확인되지 않음"], discussion: discussion)
        await api.finish(.init(answer: "회의 종합", nextAction: "근거 확인", contextNote: "입력 기준", contextSource: "provided", logPersisted: false, runId: nil, council: council)); _ = await pending.value
        store.draft = "첫 안건의 다음 질문"
        _ = store.selectTopic("notice:two", scope: .all, owner: .eevee, source: .init(title: "두 번째", detail: "다른 원문", date: nil, path: nil, isNoticeSummary: true))
        try require(store.draft.isEmpty && store.turns.isEmpty && store.agent == .eevee, "new topic restores independent draft and history")
        store.draft = "두 번째 질문"
        _ = store.selectTopic("notice:one", scope: .all, owner: .eevee, source: source, draft: "덮어쓰기 금지")
        try require(store.draft == "첫 안건의 다음 질문" && store.turns.count == 1 && store.agent == .vaporeon, "reopening same notice preserves edits, turns, source and chosen owner")
        store.scope = .personal
        try require(store.draft.isEmpty && store.turns.isEmpty && store.topicSource == nil && store.reviewers.isEmpty, "changing scope cannot carry the prior business source")
        store.draft = "개인 질문"
        store.scope = .all
        try require(store.draft == "첫 안건의 다음 질문" && store.topicSource == source, "prior scope restores its own draft and source")
        let stale = Task { await store.send(message: store.draft) }
        while await api.commands.count < 2 { await Task.yield() }
        store.configure(service: api, origin: "https://different.example")
        try require(store.turns.isEmpty && store.draft.isEmpty && store.errorMessage?.contains("연결") == true, "connection change explains interruption and isolates private content")
        await api.finish()
        try require(await stale.value == nil, "old-origin completion cannot enter the new session")
        try require(!store.restoreConversation(key), "foreign-origin reply notice cannot reopen content")
        store.configure(service: api, origin: origin)
        try require(store.restoreConversation(key) && store.draft == "첫 안건의 다음 질문", "returning to original Hub restores interrupted draft")
        _ = store.continueWithAgent(.umbreon)
        try require(store.turns.count == 1 && store.draft == "첫 안건의 다음 질문" && store.participants.isEmpty, "role follow-up keeps topic and explicitly selects single owner")
        let follow = Task { await store.send(message: store.draft) }
        while await api.commands.count < 3 { await Task.yield() }
        let history = await api.commands[2].history
        try require(history.contains { $0.role == "assistant" && $0.text.contains("샤미드") && $0.text.contains("사실 인증 아님") }, "history attributes earlier answer to its actual author")
        try require(history.contains { $0.role == "assistant" && $0.text.contains("블래키 실제 쟁점") && $0.text.contains("효과는 확인되지 않음") }, "role follow-up preserves actual participant statement and dissent")
        await api.finish(); _ = await follow.value
        for index in 0..<6 {
            store.draft = String(repeating: "장문 맥락 😀 ", count: 100) + String(index)
            let attempt = Task { await store.send(message: store.draft) }
            while await api.commands.count < index + 4 { await Task.yield() }
            await api.finish(); _ = await attempt.value
        }
        let latest = await api.commands.last!
        try require(latest.history.count <= 8 && latest.history.first?.role == "user", "source plus recent exchanges remain bounded")
        try latest.validate()
        try require(try JSONEncoder().encode(latest).count < 90000, "complete request fits Hub byte budget")
    }

}
