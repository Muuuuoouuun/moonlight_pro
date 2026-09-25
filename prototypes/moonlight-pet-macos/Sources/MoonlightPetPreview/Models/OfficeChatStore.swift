import Foundation
import Combine

struct OfficeChatTurn: Identifiable, Sendable {
    let id: UUID
    let agent: OfficeAgent
    let scope: OfficeChatScope
    let message: String
    let reply: OfficeChatReply
}

/// Conversation memory belongs to one Hub origin, owner and scope. No AI retry loop.
@MainActor
final class OfficeChatStore: ObservableObject {
    @Published var agent: OfficeAgent = .eevee { didSet { if agent != oldValue { selectSession() } } }
    @Published var scope: OfficeChatScope = .all { didSet { if scope != oldValue { selectSession() } } }
    @Published var draft = "" { didSet { drafts[key] = draft; draftRevision += 1 } }
    @Published var source: CouncilDraftSource = .text { didSet { sources[key] = source } }
    @Published private(set) var turns: [OfficeChatTurn] = []
    @Published private(set) var isSending = false
    @Published private(set) var pendingMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var hasConnection = false
    var onReply: ((OfficeChatTurn) -> Void)?
    private var service: (any HubOfficeServing)?
    private var origin: String?
    private var generation = 0
    private var requestTask: Task<OfficeChatReply, Error>?
    private struct SessionKey: Hashable { let origin: String; let agent: OfficeAgent; let scope: OfficeChatScope }
    private var sessions: [SessionKey: [OfficeChatTurn]] = [:]
    private var drafts: [SessionKey: String] = [:]
    private var sources: [SessionKey: CouncilDraftSource] = [:]
    private var draftRevision = 0
    private var key: SessionKey { SessionKey(origin: origin ?? "", agent: agent, scope: scope) }

    func configure(service: (any HubOfficeServing)?, origin: String?) {
        invalidateRequest()
        self.service = service; self.origin = origin; hasConnection = service != nil
        restoreSession()
        errorMessage = nil
    }
    func sendDraft() {
        let selected = key; let revision = draftRevision; let message = draft
        Task {
            // A selection or edit made before the task starts must not send to another recipient.
            guard key == selected, draftRevision == revision else { return }
            _ = await send(message: message)
        }
    }
    func send(message: String) async -> String? {
        guard !isSending, let service, origin != nil else { return nil }
        let key = self.key
        let value = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, message.utf16.count <= 6000 else {
            errorMessage = "질문은 1~6,000자까지 보낼 수 있어요. 입력은 그대로 보관돼요."
            return nil
        }
        var history = turns.suffix(4).flatMap {
            [OfficeChatHistory(role: "user", text: Self.prefix($0.message)),
             OfficeChatHistory(role: "assistant", text: Self.prefix($0.reply.answer))]
        }
        while !history.isEmpty {
            let data = try? JSONEncoder().encode(history)
            if let data, let json = String(data: data, encoding: .utf8), json.utf16.count <= 20_000 { break }
            history.removeFirst(min(2, history.count))
        }
        let command = OfficeChatCommand(ownerId: agent, scope: scope, message: value, history: history)
        let ticket = generation
        let revision = draftRevision
        isSending = true; pendingMessage = value; errorMessage = nil
        let task = Task { try await service.chat(command) }
        requestTask = task
        defer {
            if generation == ticket { isSending = false; pendingMessage = nil; requestTask = nil }
        }
        do {
            let reply = try await task.value
            guard ticket == generation, !task.isCancelled else { return nil }
            let turn = OfficeChatTurn(id: UUID(), agent: key.agent, scope: key.scope, message: value, reply: reply)
            turns.append(turn)
            // Keep the most recent conversations bounded while sending only four exchanges.
            turns = Array(turns.suffix(30))
            sessions[key] = turns
            if draftRevision == revision, draft == message { draft = ""; source = .text }
            onReply?(turn)
            return value
        } catch {
            guard ticket == generation else { return nil }
            if error is CancellationError { errorMessage = "기다림을 중단했어요. 입력은 그대로 보관돼요." }
            else if (error as? HubTransportError) == .timeout {
                errorMessage = "아직 답변을 받지 못했어요. 입력은 보관했으며 다시 보내면 새 요청으로 처리됩니다."
            } else {
                errorMessage = error.localizedDescription + " 입력은 그대로 보관돼요."
            }
            return nil
        }
    }
    func cancelWaiting() {
        guard isSending else { return }
        invalidateRequest()
        errorMessage = "기다림을 중단했어요. 다시 보내면 새 요청으로 처리됩니다."
    }
    func clearConversation() {
        guard !isSending else { return }
        sessions[key] = []
        turns = []; errorMessage = nil
    }
    private func selectSession() {
        invalidateRequest()
        restoreSession()
        errorMessage = nil
    }
    private func restoreSession() {
        turns = sessions[key] ?? []
        draft = drafts[key] ?? ""
        source = sources[key] ?? .text
    }
    private func invalidateRequest() {
        generation += 1
        requestTask?.cancel(); requestTask = nil
        isSending = false; pendingMessage = nil
    }
    private static func prefix(_ text: String) -> String {
        // Never cut a surrogate pair while honoring the server's UTF-16 budget.
        var result = ""; var count = 0
        for scalar in text.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars {
            let next = String(scalar).utf16.count
            if count + next > 2000 { break }
            result.unicodeScalars.append(scalar); count += next
        }
        return result
    }
}
