import Foundation
import Combine

struct OfficeChatTurn: Identifiable, Sendable {
    let id: UUID
    let conversation: OfficeConversationKey
    let agent: OfficeAgent
    let scope: OfficeChatScope
    let message: String
    let reply: OfficeChatReply
}

/// App-lifetime conversation memory, isolated by Hub origin, scope and topic.
@MainActor
final class OfficeChatStore: ObservableObject {
    @Published var agent: OfficeAgent = .eevee {
        didSet {
            guard agent != oldValue, !restoring else { return }
            if isSending { restoring = true; agent = oldValue; restoring = false; refuseSelection(); return }
            if let index = reviewers.firstIndex(of: agent) { reviewers[index] = oldValue }
            selectionRevision += 1; saveSession()
        }
    }
    @Published var scope: OfficeChatScope = .all {
        didSet {
            guard scope != oldValue, !restoring else { return }
            if isSending { restoring = true; scope = oldValue; restoring = false; refuseSelection(); return }
            selectionRevision += 1; restoreSession(defaultOwner: agent)
        }
    }
    @Published var draft = "" { didSet { draftRevision += 1; if !restoring { saveSession() } } }
    @Published var source: CouncilDraftSource = .text { didSet { if !restoring { saveSession() } } }
    @Published private(set) var topicID = "general"
    @Published private(set) var topicSource: OfficeTopicSource?
    @Published private(set) var followUp: OfficeSpeechReference?
    @Published private(set) var reviewers: [OfficeAgent] = []
    @Published private(set) var turns: [OfficeChatTurn] = []
    @Published private(set) var isSending = false
    @Published private(set) var pendingMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var hasConnection = false
    var onReply: ((OfficeChatTurn) -> Void)?
    private var service: (any HubOfficeServing)?
    private var origin: String?
    private var generation = 0
    private var selectionRevision = 0
    private var connectionInterruption: String?
    private var requestTask: Task<OfficeChatReply, Error>?
    private var draftRevision = 0
    private var restoring = false
    private struct Session {
        var owner: OfficeAgent
        var reviewers: [OfficeAgent] = []
        var turns: [OfficeChatTurn] = []
        var draft = ""
        var source: CouncilDraftSource = .text
        var topicSource: OfficeTopicSource?
        var followUp: OfficeSpeechReference?
    }
    private var sessions: [OfficeConversationKey: Session] = [:]
    var conversationKey: OfficeConversationKey { .init(origin: origin ?? "", scope: scope, topicID: topicID) }
    var participants: [OfficeAgent] { reviewers.isEmpty ? [] : [agent] + reviewers }
    var conversationTitle: String { reviewers.isEmpty ? "Office 대화" : "Office 회의실" }
    var followUpLabel: String? {
        guard let (_, speech) = followedSpeech else { return nil }
        return "\(speech.ownerId.title) \(speech.round == "position" ? "첫 의견" : "재검토")에 이어 묻기 · \(OfficeConversationText.prefix(speech.position, limit: 70))"
    }
    private var followedSpeech: (OfficeChatTurn, OfficeDiscussionTurn)? {
        guard let followUp, let turn = turns.first(where: { $0.id == followUp.turnID }),
              let speeches = turn.reply.council?.discussion.turns,
              speeches.indices.contains(followUp.speechIndex) else { return nil }
        return (turn, speeches[followUp.speechIndex])
    }

    func configure(service: (any HubOfficeServing)?, origin: String?) {
        // Re-checking the same connection must not discard a pending generation.
        if self.origin == origin, hasConnection == (service != nil) { self.service = service; return }
        if isSending { connectionInterruption = "Hub 연결이 바뀌어 답변 기다림을 중단했어요. 이전 Hub 대화와 입력은 앱 실행 중 보관돼요. 다시 보내면 새 요청입니다." }
        saveSession(); invalidateRequest()
        self.service = service; self.origin = origin; hasConnection = service != nil
        selectionRevision += 1; restoreSession(defaultOwner: agent)
        errorMessage = connectionInterruption
    }

    @discardableResult func selectAgent(_ agent: OfficeAgent) -> Bool {
        guard !isSending else { refuseSelection(); return false }
        self.agent = agent; errorMessage = nil; connectionInterruption = nil
        return true
    }
    @discardableResult func continueWithAgent(_ agent: OfficeAgent) -> Bool {
        guard selectAgent(agent) else { return false }
        reviewers = []; selectionRevision += 1; saveSession()
        return true
    }
    @discardableResult func continueDiscussion(turnID: UUID, speechIndex: Int) -> Bool {
        guard !isSending else { refuseSelection(); return false }
        guard let turn = turns.first(where: { $0.id == turnID }),
              let speeches = turn.reply.council?.discussion.turns,
              speeches.indices.contains(speechIndex) else { return false }
        guard continueWithAgent(speeches[speechIndex].ownerId) else { return false }
        followUp = OfficeSpeechReference(turnID: turnID, speechIndex: speechIndex)
        selectionRevision += 1; saveSession()
        return true
    }
    @discardableResult func toggleReviewer(_ reviewer: OfficeAgent) -> Bool {
        guard !isSending else { refuseSelection(); return false }
        guard reviewer != agent else { return false }
        if let index = reviewers.firstIndex(of: reviewer) { reviewers.remove(at: index) }
        else {
            guard reviewers.count < 2 else { errorMessage = "주관 외 관점은 두 명까지 선택할 수 있어요."; return false }
            reviewers.append(reviewer)
        }
        selectionRevision += 1; saveSession(); errorMessage = nil
        return true
    }
    @discardableResult func selectTopic(_ id: String, scope: OfficeChatScope, owner: OfficeAgent,
                                       source: OfficeTopicSource? = nil, draft: String = "",
                                       sourceKind: CouncilDraftSource = .text) -> Bool {
        guard !isSending else { refuseSelection(); return false }
        saveSession()
        restoring = true; topicID = id; self.scope = scope; restoring = false
        let key = conversationKey
        if sessions[key] == nil {
            sessions[key] = Session(owner: owner, draft: draft, source: sourceKind, topicSource: source)
        }
        selectionRevision += 1; restoreSession(defaultOwner: owner)
        errorMessage = nil
        return true
    }
    @discardableResult func restoreConversation(_ key: OfficeConversationKey) -> Bool {
        guard key.origin == origin, sessions[key] != nil else {
            errorMessage = "이 Hub에서 해당 대화를 찾을 수 없어요."; return false
        }
        return selectTopic(key.topicID, scope: key.scope, owner: agent)
    }
    func sendDraft() {
        let selected = conversationKey, selection = selectionRevision, revision = draftRevision, message = draft
        Task {
            guard conversationKey == selected, selectionRevision == selection, draftRevision == revision else { return }
            _ = await send(message: message)
        }
    }
    func send(message: String) async -> String? {
        guard !isSending, let service, origin != nil else { return nil }
        let key = conversationKey, owner = agent
        let value = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, message.utf16.count <= 6000 else {
            errorMessage = "질문은 1~6,000자까지 보낼 수 있어요. 입력은 그대로 보관돼요."; return nil
        }
        let command = OfficeChatCommand(ownerId: owner, scope: scope, message: value,
                                        history: boundedHistory(), participants: participants)
        do { try command.validate() } catch { errorMessage = error.localizedDescription; return nil }
        let ticket = generation, revision = draftRevision, sentFollowUp = followUp
        isSending = true; pendingMessage = value; errorMessage = nil; connectionInterruption = nil
        let task = Task { try await service.chat(command) }
        requestTask = task
        defer { if generation == ticket { isSending = false; pendingMessage = nil; requestTask = nil } }
        do {
            let reply = try await task.value
            guard ticket == generation, !task.isCancelled, key == conversationKey else { return nil }
            let turn = OfficeChatTurn(id: UUID(), conversation: key, agent: owner, scope: key.scope, message: value, reply: reply)
            turns = Array((turns + [turn]).suffix(30))
            if draftRevision == revision, draft == message { draft = "" }
            if followUp == sentFollowUp { followUp = nil }
            saveSession(); onReply?(turn)
            return value
        } catch {
            guard ticket == generation else { return nil }
            if error is CancellationError { errorMessage = "기다림을 중단했어요. 입력은 그대로 보관돼요." }
            else if (error as? HubTransportError) == .timeout {
                errorMessage = "아직 답변을 받지 못했어요. 입력은 보관했으며 다시 보내면 새 요청으로 처리됩니다."
            } else { errorMessage = error.localizedDescription + " 입력은 그대로 보관돼요." }
            return nil
        }
    }
    func cancelWaiting() {
        guard isSending else { return }
        invalidateRequest()
        errorMessage = "기다림을 중단했어요. 다시 보내면 새 요청으로 처리됩니다."
    }
    func clearConversation() {
        guard !isSending else { refuseSelection(); return }
        turns = []; followUp = nil; errorMessage = nil; saveSession()
    }
    private func boundedHistory() -> [OfficeChatHistory] {
        let summary = topicSource.map { OfficeChatHistory(role: "user", text: $0.boundedSummary(origin: origin)) }
        let anchored = followedSpeech
        let exchangeLimit = summary == nil ? 4 : 3
        var recent = Array(turns.filter { $0.id != anchored?.0.id }.suffix(exchangeLimit - (anchored == nil ? 0 : 1)))
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        while true {
            // Keep actual chronological exchanges, reserving the explicitly selected speech even when old.
            let selectedIDs = Set(recent.map(\.id) + (anchored.map { [$0.0.id] } ?? []))
            let exchanges = turns.filter { selectedIDs.contains($0.id) }
            let history = (summary.map { [$0] } ?? []) + exchanges.flatMap { turn in
                let answer: String
                if let (selected, speech) = anchored, selected.id == turn.id {
                    answer = focusedHistoryText(turn, speech: speech)
                } else { answer = historyText(turn, following: agent) }
                return [OfficeChatHistory(role: "user", text: OfficeConversationText.prefix(turn.message)),
                        OfficeChatHistory(role: "assistant", text: answer)]
            }
            if let data = try? encoder.encode(history), let json = String(data: data, encoding: .utf8), json.utf16.count <= 20_000 { return history }
            if !recent.isEmpty { recent.removeFirst(); continue }
            // JSON escaping can expand control characters sixfold. Preserve the full selected
            // position (wire limit 600), reducing surrounding excerpts instead of losing it.
            if let (turn, speech) = anchored {
                return (summary.map { [OfficeChatHistory(role: "user", text: OfficeConversationText.prefix($0.text, limit: 1000) + "\n[자료 일부만 전달]")] } ?? []) + [
                    OfficeChatHistory(role: "user", text: OfficeConversationText.prefix(turn.message, limit: 500)),
                    OfficeChatHistory(role: "assistant", text: focusedHistoryText(turn, speech: speech, surrounding: false))
                ]
            }
            return []
        }
    }
    private func focusedHistoryText(_ turn: OfficeChatTurn, speech: OfficeDiscussionTurn, surrounding: Bool = true) -> String {
        let selected = "이어 묻기로 선택한 실제 생성 발언 · \(speech.ownerId.title) · \(speech.round) (사실 인증 아님)\n\(speech.position)"
        let context = surrounding ? "\n" + historyText(turn, following: speech.ownerId) : ""
        return OfficeConversationText.prefix(selected + context, limit: 1950) + "\n[선택 발언과 이전 회의 일부 전달]"
    }
    private func historyText(_ turn: OfficeChatTurn, following owner: OfficeAgent) -> String {
        let header = "Office 생성 답변 · 주관 \(turn.agent.title) (사실 인증 아님)"
        guard let council = turn.reply.council else { return OfficeConversationText.prefix(header + "\n" + turn.reply.answer) }
        let preferred = council.discussion.turns.filter { $0.ownerId == owner }
        let other = council.discussion.turns.filter { $0.ownerId != owner }
        var lines = [header, "주관 종합: " + OfficeConversationText.prefix(turn.reply.answer, limit: 350),
                     "추천: " + OfficeConversationText.prefix(council.recommendation, limit: 200)]
        lines += council.dissent.prefix(3).map { "남은 이견: " + OfficeConversationText.prefix($0, limit: 150) }
        for speech in preferred + other {
            lines.append("실제 발언 · \(speech.ownerId.title) · \(speech.round): " + OfficeConversationText.prefix(speech.position, limit: preferred.contains(speech) ? 350 : 180))
        }
        let text = lines.joined(separator: "\n")
        return OfficeConversationText.prefix(text, limit: 1950) + (text.utf16.count > 1950 ? "\n[이전 회의 일부만 전달]" : "")
    }

    private func saveSession() {
        guard !restoring else { return }
        sessions[conversationKey] = Session(owner: agent, reviewers: reviewers, turns: turns, draft: draft, source: source, topicSource: topicSource, followUp: followUp)
    }
    private func restoreSession(defaultOwner: OfficeAgent) {
        let session = sessions[conversationKey] ?? Session(owner: defaultOwner)
        restoring = true
        agent = session.owner; reviewers = session.reviewers; turns = session.turns
        draft = session.draft; source = session.source; topicSource = session.topicSource; followUp = session.followUp
        restoring = false; errorMessage = nil
        saveSession()
    }
    private func refuseSelection() { errorMessage = "답변을 기다리는 중이에요. 담당·관점·범위·안건을 바꾸려면 먼저 기다림을 중단해 주세요." }
    private func invalidateRequest() {
        generation += 1; requestTask?.cancel(); requestTask = nil
        isSending = false; pendingMessage = nil
    }
}
